import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { BusinessErrorFilter } from '../src/common/filters/business-error.filter';
import { PrismaService } from '../src/db/prisma.service';

// Headline correctness proof. If overselling is possible under concurrent
// load, this is the test that would catch it.

describe('Concurrency: no overselling (real Postgres, real HTTP)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = module.createNestApplication();
    // Match production wiring so behavior matches what users actually hit.
    app.setGlobalPrefix('api');
    app.useGlobalFilters(new BusinessErrorFilter());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    // Single-statement TRUNCATE CASCADE is atomic and handles FK ordering
    // automatically — safer than chained deleteMany() calls when the previous
    // test may have left rows in flight.
    await prisma.$executeRawUnsafe(
      'TRUNCATE TABLE "orders", "sales", "users", "products" RESTART IDENTITY CASCADE',
    );
  });

  async function seedSale(stock: number) {
    const product = await prisma.product.create({
      data: { name: 'Test product' },
    });
    return prisma.sale.create({
      data: {
        product_id: product.id,
        starts_at: new Date(Date.now() - 60_000),
        ends_at: new Date(Date.now() + 60 * 60_000),
        total_stock: stock,
        remaining_stock: stock,
      },
    });
  }

  it('serves exactly N orders for stock=N when ATTEMPTS > N', async () => {
    const STOCK = 10;
    const ATTEMPTS = 200;

    const sale = await seedSale(STOCK);

    const responses = await Promise.all(
      Array.from({ length: ATTEMPTS }, (_, i) =>
        request(app.getHttpServer())
          .post('/api/sale/purchase')
          .set('Idempotency-Key', randomUUID())
          .send({ email: `buyer${i}@test.com`, sale_id: sale.id }),
      ),
    );

    const succeeded = responses.filter((r) => r.status === 201).length;
    const conflicts = responses.filter((r) => r.status === 409).length;
    const other = responses.filter((r) => r.status !== 201 && r.status !== 409);

    expect(other).toEqual([]);
    expect(succeeded).toBe(STOCK);
    expect(succeeded + conflicts).toBe(ATTEMPTS);

    // Belt and suspenders: DB must reflect reality.
    const orderCount = await prisma.order.count();
    const after = await prisma.sale.findUniqueOrThrow({ where: { id: sale.id } });
    expect(orderCount).toBe(STOCK);
    expect(after.remaining_stock).toBe(0);

    // The remaining 409s must all carry the SOLD_OUT discriminator.
    const soldOut = responses.filter(
      (r) => r.status === 409 && r.body?.error === 'SOLD_OUT',
    ).length;
    expect(soldOut).toBe(ATTEMPTS - STOCK);
  });

  it('one user firing 100 concurrent purchases gets exactly 1 order', async () => {
    const sale = await seedSale(100);

    const responses = await Promise.all(
      Array.from({ length: 100 }, () =>
        request(app.getHttpServer())
          .post('/api/sale/purchase')
          .set('Idempotency-Key', randomUUID()) // distinct keys, same email
          .send({ email: 'spammer@test.com', sale_id: sale.id }),
      ),
    );

    const succeeded = responses.filter((r) => r.status === 201);
    const alreadyPurchased = responses.filter(
      (r) => r.status === 409 && r.body?.error === 'ALREADY_PURCHASED',
    );

    expect(succeeded).toHaveLength(1);
    expect(alreadyPurchased.length).toBeGreaterThan(0);
    expect(succeeded.length + alreadyPurchased.length).toBe(100);

    // Stock decremented exactly once.
    const after = await prisma.sale.findUniqueOrThrow({ where: { id: sale.id } });
    expect(after.remaining_stock).toBe(99);
    expect(await prisma.order.count()).toBe(1);
  });

  it('100 concurrent calls with the SAME idempotency key produce 1 order, all returning the same orderId', async () => {
    const sale = await seedSale(100);
    const idemKey = randomUUID();

    const responses = await Promise.all(
      Array.from({ length: 100 }, () =>
        request(app.getHttpServer())
          .post('/api/sale/purchase')
          .set('Idempotency-Key', idemKey)
          .send({ email: 'replay@test.com', sale_id: sale.id }),
      ),
    );

    // We expect a mix of 201 (one wins the race + creates the row) and either
    // 201 (later requests find the existing row via the replay short-circuit)
    // OR 409 ALREADY_PURCHASED (same user-sale unique caught the race). Both
    // are acceptable; what matters is exactly one DB row, and any successful
    // response references that one orderId.
    const orderIds = new Set(
      responses
        .filter((r) => r.status === 201)
        .map((r) => r.body.orderId),
    );

    expect(orderIds.size).toBe(1);
    expect(await prisma.order.count()).toBe(1);

    const after = await prisma.sale.findUniqueOrThrow({ where: { id: sale.id } });
    expect(after.remaining_stock).toBe(99);
  });

  it('purchases inside a not-yet-started window get SALE_NOT_STARTED', async () => {
    const product = await prisma.product.create({ data: { name: 'P' } });
    const sale = await prisma.sale.create({
      data: {
        product_id: product.id,
        starts_at: new Date(Date.now() + 60_000), // future
        ends_at: new Date(Date.now() + 120_000),
        total_stock: 10,
        remaining_stock: 10,
      },
    });

    const res = await request(app.getHttpServer())
      .post('/api/sale/purchase')
      .set('Idempotency-Key', randomUUID())
      .send({ email: 'early@test.com', sale_id: sale.id });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('SALE_NOT_STARTED');

    const after = await prisma.sale.findUniqueOrThrow({ where: { id: sale.id } });
    expect(after.remaining_stock).toBe(10); // untouched
  });
});
