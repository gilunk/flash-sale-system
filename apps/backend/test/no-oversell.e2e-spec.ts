import { INestApplication, ValidationPipe } from '@nestjs/common';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../src/app.module';
import { BusinessErrorFilter } from '../src/common/filters/business-error.filter';
import { PrismaService } from '../src/db/prisma.service';

// Headline correctness proof. If overselling is possible under concurrent
// load, this is the test that would catch it.

// Tiny fetch wrapper that mirrors the bits supertest gave us — `status` plus
// a parsed `body` — without pulling in a dep. Real HTTP via Node's built-in
// fetch; the app is bound on a real port via app.listen(0) below.
type ApiResponse<T = any> = { status: number; body: T };

async function purchase(
  baseUrl: string,
  options: { email: string; saleId: string; idempotencyKey?: string },
): Promise<ApiResponse> {
  const res = await fetch(`${baseUrl}/api/sale/purchase`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': options.idempotencyKey ?? randomUUID(),
    },
    body: JSON.stringify({ email: options.email, sale_id: options.saleId }),
  });
  // We always try to parse JSON; the API returns JSON for 201, 409, and 400.
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

describe('Concurrency: no overselling (real Postgres, real HTTP)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let baseUrl: string;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = module.createNestApplication();
    // Match production wiring so behavior matches what users actually hit.
    app.setGlobalPrefix('api');
    app.useGlobalFilters(new BusinessErrorFilter());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

    // Connect the RabbitMQ consumer just like main.ts. Without this, the app
    // would still publish purchase.confirmed events but no @EventPattern
    // handler would fire — the queue would back up. Using a dedicated test
    // queue (RABBITMQ_PURCHASE_QUEUE in .env.test) keeps dev traffic separate.
    app.connectMicroservice<MicroserviceOptions>({
      transport: Transport.RMQ,
      options: {
        urls: [
          process.env.RABBITMQ_URL ?? 'amqp://flashsale:flashsale@localhost:5672',
        ],
        queue: process.env.RABBITMQ_PURCHASE_QUEUE ?? 'purchase.events.test',
        queueOptions: { durable: true },
        noAck: false,
      },
    });

    await app.startAllMicroservices();
    // Bind to a real ephemeral port. We use native fetch from the test to hit
    // this real listener — same code path real users hit, and Node's HTTP
    // server handles concurrent sockets cleanly (the in-memory injection mode
    // we used to rely on via supertest drops connections under high load).
    await app.listen(0);
    baseUrl = await app.getUrl();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    // Let any fire-and-forget post-purchase work (cache refresh, WS broadcast,
    // RMQ publish) drain so cleanup doesn't deadlock against in-flight Prisma
    // transactions still holding row locks from the previous test.
    await new Promise((r) => setTimeout(r, 200));

    // Single-transaction deleteMany array. FK ordering is enforced by array
    // order; DELETEs take row locks (not exclusive table locks like TRUNCATE),
    // so they coexist with the connection-pool's slow drain after a high-
    // concurrency test.
    await prisma.$transaction([
      prisma.order.deleteMany({}),
      prisma.sale.deleteMany({}),
      prisma.user.deleteMany({}),
      prisma.product.deleteMany({}),
    ]);
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
    // 100 attempts (10× stock) is enough to exercise the SOLD_OUT path without
    // saturating Prisma's connection pool, which can otherwise cause TRUNCATE
    // in the next test's beforeEach to deadlock against lingering locks.
    const ATTEMPTS = 100;

    const sale = await seedSale(STOCK);

    const responses = await Promise.all(
      Array.from({ length: ATTEMPTS }, (_, i) =>
        purchase(baseUrl, {
          email: `buyer${i}@test.com`,
          saleId: sale.id,
        }),
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
        purchase(baseUrl, {
          email: 'spammer@test.com',
          saleId: sale.id,
          // distinct keys, same email — forces the user_sale unique index
          // to be the gate, not idempotency replay.
        }),
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
        purchase(baseUrl, {
          email: 'replay@test.com',
          saleId: sale.id,
          idempotencyKey: idemKey,
        }),
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

    const res = await purchase(baseUrl, {
      email: 'early@test.com',
      saleId: sale.id,
    });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('SALE_NOT_STARTED');

    const after = await prisma.sale.findUniqueOrThrow({ where: { id: sale.id } });
    expect(after.remaining_stock).toBe(10); // untouched
  });
});
