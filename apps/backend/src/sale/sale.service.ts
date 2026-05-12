import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Prisma, User } from "@prisma/client";
import { SaleStatusDto } from "./dto/sale-status.dto";
import { PurchaseRequestDto, PurchaseResponseDto } from "./dto/purchase.dto";
import { BusinessError } from "./errors/error";
import { SaleGateway } from "./sale.gateway";
import { PrismaService } from "src/db/prisma.service";
import { RedisService } from "src/cache/redis.service";
import { PurchaseEventsPublisher } from "src/mq/purchase-events.publisher";

const SALE_STATUS_CACHE_KEY = 'sale:status:current';

@Injectable()
export class SaleService {
  private readonly logger = new Logger(SaleService.name);
  private readonly cacheTtlMs: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly config: ConfigService,
    private readonly gateway: SaleGateway,
    private readonly purchaseEvents: PurchaseEventsPublisher,
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

    // Resolve the user OUTSIDE the transaction. Doing this inside $transaction
    // is dangerous: if two parallel callers both miss the SELECT and try to
    // INSERT, the loser's P2002 *poisons the transaction* — Postgres marks it
    // aborted (25P02) and any subsequent statement fails. By resolving the
    // user first, the purchase transaction starts with a known user.id and
    // can never hit that pathology. Orphan users (created but never purchased)
    // are harmless — the identity is just a buyer label.
    const user = await this.ensureUser(email);

    const { orderId, remainingStock } = await this.prisma.$transaction(async (tx) => {
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

      const newRemainingStock = Number(decrementedStock[0].remaining_stock);

      // create order
      try {
        const order = await tx.order.create({
          data: {
            user_id: user.id,
            sale_id: activeSale.id,
            idempotency_key: idempotencyKey,
          },
        });
        return { orderId: order.id, remainingStock: newRemainingStock };
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

    // Stock changed → invalidate cache, recompute fresh status, broadcast to client
    this.broadcastFreshStatus().catch((err) =>
      this.logger.warn(`Failed to broadcast sale status: ${err}`),
    );

    // Publish the confirmed-purchase event onto RabbitMQ. Fire-and-forget:
    // the user's HTTP response shouldn't wait for the broker to ack. Consumers
    // (audit log today, email/webhook in production) run asynchronously and
    // are decoupled from the synchronous purchase commit.
    this.purchaseEvents.publishPurchaseConfirmed({
      orderId,
      userId: user.id,
      email,
      saleId: activeSale.id,
      remainingStock,
      occurredAt: new Date().toISOString(),
    });

    return { orderId, status: 'CONFIRMED' };
  }

  // Find the user by email; create one if they don't exist yet. Lives OUTSIDE
  // the purchase transaction so the race-induced P2002 can't poison it.
  private async ensureUser(email: string): Promise<User> {
    const existing = await this.prisma.user.findFirst({ where: { email } });
    if (existing) return existing;

    try {
      return await this.prisma.user.create({ data: { email } });
    } catch (err) {
      // Race window: another concurrent caller created the same email between
      // our findFirst and create. Re-fetch the winner's row.
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        return this.prisma.user.findUniqueOrThrow({ where: { email } });
      }
      throw err;
    }
  }

  async broadcastFreshStatus(): Promise<void> {
    await this.redis.getClient().del(SALE_STATUS_CACHE_KEY);
    const fresh = await this.getStatus();
    this.gateway.emitStatus(fresh);
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
