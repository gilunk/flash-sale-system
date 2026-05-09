import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const product = await prisma.product.upsert({
    where: { id: 'seed-product' },
    update: {},
    create: {
      id: 'seed-product',
      name: 'Limited Edition Sneaker',
      description: 'A test product for the flash sale.',
      image_url: null,
    },
  });

  const starts_at = new Date(Date.now() - 60_000);
  const ends_at = new Date(Date.now() + 60 * 60_000);
  const total_stock = 50;

  await prisma.sale.upsert({
    where: { id: 'seed-sale' },
    update: {
      starts_at,
      ends_at,
      total_stock,
      remaining_stock: total_stock,
    },
    create: {
      id: 'seed-sale',
      product_id: product.id,
      starts_at,
      ends_at,
      total_stock,
      remaining_stock: total_stock,
    },
  });

  // eslint-disable-next-line no-console
  console.log(`Seeded sale 'seed-sale' with stock=${total_stock}, window now → +60min`);
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
