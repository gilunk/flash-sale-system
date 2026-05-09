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
      imageUrl: null,
    },
  });

  const startsAt = new Date(Date.now() - 60_000);
  const endsAt = new Date(Date.now() + 60 * 60_000);
  const totalStock = 10;

  await prisma.sale.upsert({
    where: { id: 'seed-sale' },
    update: {
      startsAt,
      endsAt,
      totalStock,
      remainingStock: totalStock,
    },
    create: {
      id: 'seed-sale',
      productId: product.id,
      startsAt,
      endsAt,
      totalStock,
      remainingStock: totalStock,
    },
  });

  // eslint-disable-next-line no-console
  console.log(`Seeded sale 'seed-sale' with stock=${totalStock}, window now → +60min`);
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
