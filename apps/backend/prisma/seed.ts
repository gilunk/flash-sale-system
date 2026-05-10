import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const PRODUCT_NAME = 'Limited Edition Sneaker';

async function main() {
  const existingProduct = await prisma.product.findFirst({
    where: { name: PRODUCT_NAME },
  });

  const product =
    existingProduct ??
    (await prisma.product.create({
      data: {
        name: PRODUCT_NAME,
        description: 'Premium Sneakers made from Japan',
        image_url: 'https://picsum.photos/seed/sneaker/800/600',
      },
    }));

  const starts_at = new Date(Date.now() - 60_000);
  const ends_at = new Date(Date.now() + 60 * 60_000);
  const total_stock = 50;

  const existingSale = await prisma.sale.findFirst({
    where: { product_id: product.id },
    orderBy: { created_at: 'desc' },
  });

  const isExpired = existingSale ? existingSale.ends_at.getTime() < Date.now() : false;

  const sale =
    existingSale && !isExpired
      ? await prisma.sale.update({
          where: { id: existingSale.id },
          data: { starts_at, ends_at, total_stock, remaining_stock: total_stock },
        })
      : await prisma.sale.create({
          data: {
            product_id: product.id,
            starts_at,
            ends_at,
            total_stock,
            remaining_stock: total_stock,
          },
        });

  // eslint-disable-next-line no-console
  console.log(
    `Seeded product=${product.id} sale=${sale.id} stock=${total_stock}, window now → +60min`,
  );
}

main()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
