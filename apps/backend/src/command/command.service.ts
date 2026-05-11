import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from 'src/db/prisma.service';
import { SaleService } from 'src/sale/sale.service';

@Injectable()
export class CommandService {
  private readonly logger = new Logger(CommandService.name);
  private productName: string;

  constructor(
    private prisma: PrismaService,
    private saleService: SaleService,
  ) {
    this.productName = 'Limited Edition Sneaker'
  }

  async insertFlashSale(qty: number) {
    const existingProduct = await this.prisma.product.findFirst({
      where: { name: this.productName },
    });
  
    const product =
      existingProduct ??
      (await this.prisma.product.create({
        data: {
          name: this.productName,
          description: 'Premium Sneakers made from Japan',
          image_url: 'https://picsum.photos/seed/sneaker/800/600',
        },
      }));
  
    const starts_at = new Date(Date.now() - 60_000);
    const ends_at = new Date(Date.now() + 60 * 60_000);
    const total_stock = qty;
  
    const existingSale = await this.prisma.sale.findFirst({
      where: { product_id: product.id },
      orderBy: { created_at: 'desc' },
    });
  
    const isExpired = existingSale ? existingSale.ends_at.getTime() < Date.now() : false;
    
    // If existing and not expired then just restart the existing sale with updated stock
    const sale =
      existingSale && !isExpired
        ? await this.prisma.sale.update({
            where: { id: existingSale.id },
            data: { starts_at, ends_at, total_stock, remaining_stock: total_stock },
          })
        : await this.prisma.sale.create({
            data: {
              product_id: product.id,
              starts_at,
              ends_at,
              total_stock,
              remaining_stock: total_stock,
            },
          });

    // Update immediately to the socket client
    this.saleService
      .broadcastFreshStatus()
      .catch((err) =>
        this.logger.warn(`Failed to broadcast sale status after insert: ${err}`),
      );

    return `Inserted sale with product=${product.id} sale=${sale.id} stock=${total_stock}, window now → +60min`
  }
}
