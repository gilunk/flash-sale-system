import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Prisma } from "@prisma/client";
import { SaleStatusDto } from "./dto/sale-status.dto";
import { PurchaseRequestDto, PurchaseResponseDto } from "./dto/purchase.dto";
import { BusinessError } from "./errors/error";
import { PrismaService } from "src/db/prisma.service";
import { RedisService } from "src/cache/redis.service";

const SALE_STATUS_CACHE_KEY = 'sale:status:current';

@Injectable()
export class SaleService {
  private readonly logger = new Logger(SaleService.name);
  private readonly cacheTtlMs: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly config: ConfigService,
  ) {
    this.cacheTtlMs = Number(this.config.get<string>('SALE_CACHE_TTL_MS') ?? 1000);
  }

  async getStatus(): Promise<SaleStatusDto> {
    const cached = await this.redis.getJSON<SaleStatusDto>(SALE_STATUS_CACHE_KEY);
    if (cached) return cached;

    const sale = await this.prisma.sale.findFirst({
      orderBy: [{ starts_at: 'desc' }, { created_at: 'desc' }],
      include: { product: true },
    });

    if (!sale) {
      throw new NotFoundException('No flash sale at the moment.');
    }

    const dto: SaleStatusDto = {
      saleId: sale.id,
      productId: sale.product.id,
      productName: sale.product.name,
      productImageUrl: sale.product.image_url ?? null,
      startsAt: sale.starts_at.toISOString(),
      endsAt: sale.ends_at.toISOString(),
      totalStock: sale.total_stock,
      remainingStock: sale.remaining_stock,
      state: this.deriveState(sale.starts_at, sale.ends_at, sale.remaining_stock),
    };

    await this.redis.setJSON(SALE_STATUS_CACHE_KEY, dto, this.cacheTtlMs);
    return dto;
  }

  async purchase(body: PurchaseRequestDto, idempotencyKey: string): Promise<PurchaseResponseDto> {
    const { email, sale_id } = body;

    const replay = await this.prisma.order.findUnique({
      where: { idempotency_key: idempotencyKey },
      include: { user: true },
    });

    if (replay) {
      if (replay.user.email !== email) {
        throw new BadRequestException(
          'Idempotency-Key has already been used with a different email.',
        );
      }

      return { orderId: replay.id, status: 'CONFIRMED' };
    }

    const activeSale = await this.prisma.sale.findFirst({
      where: { id: sale_id }
    });

    if (!activeSale) {
      throw new ServiceUnavailableException('No flash sale at the moment.');
    }

    const orderId = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.upsert({
        where: { email },
        create: { email },
        update: {},
      });

      // To handle overselling
      const decrementedStock = await tx.$queryRaw<Array<{ remaining_stock: number }>>`
        UPDATE sales
           SET remaining_stock = remaining_stock - 1, updated_at = NOW()
         WHERE id = ${activeSale.id}
           AND remaining_stock > 0
           AND NOW() BETWEEN starts_at AND ends_at
        RETURNING remaining_stock;
      `;

      if (decrementedStock.length === 0) {
        // throw errors based on condition
        const sale = await tx.sale.findUniqueOrThrow({ where: { id: activeSale.id } });
        const now = Date.now();
        if (now < sale.starts_at.getTime()) throw new BusinessError('SALE_NOT_STARTED');
        if (now > sale.ends_at.getTime()) throw new BusinessError('SALE_ENDED');
        throw new BusinessError('SOLD_OUT');
      }

      // create order
      try {
        const order = await tx.order.create({
          data: {
            user_id: user.id,
            sale_id: activeSale.id,
            idempotency_key: idempotencyKey,
          },
        });
        return order.id;
      } catch (err) {
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002'
        ) {
          throw new BusinessError('ALREADY_PURCHASED');
        }
        throw err;
      }
    });

    // Invalidate sale cache after ordering
    this.redis
      .getClient()
      .del(SALE_STATUS_CACHE_KEY)
      .catch((err) =>
        this.logger.warn(`Failed to invalidate sale status cache: ${err}`),
      );

    return { orderId, status: 'CONFIRMED' };
  }

  private deriveState(
    startsAt: Date,
    endsAt: Date,
    remainingStock: number,
  ): SaleStatusDto['state'] {
    const now = Date.now();
    if (now < startsAt.getTime()) return 'PENDING';
    if (now > endsAt.getTime()) return 'ENDED';
    if (remainingStock <= 0) return 'SOLD_OUT';
    return 'ACTIVE';
  }
}
