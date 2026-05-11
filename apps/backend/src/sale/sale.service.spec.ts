import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { RedisService } from '../cache/redis.service';
import { PrismaService } from '../db/prisma.service';
import { BusinessError } from './errors/error';
import { SaleGateway } from './sale.gateway';
import { SaleService } from './sale.service';

// Helpers ---------------------------------------------------------------

function makeSale(overrides: Partial<{
  id: string;
  starts_at: Date;
  ends_at: Date;
  total_stock: number;
  remaining_stock: number;
  product: { id: string; name: string; image_url: string | null };
}> = {}) {
  return {
    id: 'sale-1',
    starts_at: new Date(Date.now() - 60_000),
    ends_at: new Date(Date.now() + 60_000),
    total_stock: 50,
    remaining_stock: 50,
    product: { id: 'product-1', name: 'Sneaker', image_url: null },
    ...overrides,
  };
}

function p2002(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError(
    'Unique constraint failed',
    { code: 'P2002', clientVersion: 'test' },
  );
}

// Tests -----------------------------------------------------------------

describe('SaleService', () => {
  let service: SaleService;
  let prisma: any;
  let redis: any;
  let gateway: any;

  beforeEach(async () => {
    prisma = {
      sale: { findFirst: jest.fn(), findUniqueOrThrow: jest.fn() },
      order: { findUnique: jest.fn(), create: jest.fn() },
      user: { upsert: jest.fn() },
      $transaction: jest.fn(),
      $queryRaw: jest.fn(),
    };
    redis = {
      getJSON: jest.fn(),
      setJSON: jest.fn(),
      getClient: jest.fn().mockReturnValue({
        del: jest.fn().mockResolvedValue(1),
      }),
    };
    gateway = { emitStatus: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        SaleService,
        { provide: PrismaService, useValue: prisma },
        { provide: RedisService, useValue: redis },
        { provide: ConfigService, useValue: { get: () => '1000' } },
        { provide: SaleGateway, useValue: gateway },
      ],
    }).compile();

    service = module.get(SaleService);
  });

  describe('getStatus', () => {
    it('returns the cached value when present, no DB hit', async () => {
      const cached = { saleId: 'cached', state: 'ACTIVE' };
      redis.getJSON.mockResolvedValue(cached);

      const result = await service.getStatus();

      expect(result).toBe(cached);
      expect(prisma.sale.findFirst).not.toHaveBeenCalled();
    });

    it('throws when no sale exists in the DB', async () => {
      redis.getJSON.mockResolvedValue(null);
      prisma.sale.findFirst.mockResolvedValue(null);

      await expect(service.getStatus()).rejects.toThrow(/No flash sale/i);
    });

    it('derives ACTIVE when in window and stock > 0; populates the cache', async () => {
      redis.getJSON.mockResolvedValue(null);
      prisma.sale.findFirst.mockResolvedValue(makeSale({ remaining_stock: 7 }));

      const dto = await service.getStatus();

      expect(dto.state).toBe('ACTIVE');
      expect(dto.remainingStock).toBe(7);
      expect(redis.setJSON).toHaveBeenCalledWith(
        'sale:status:current',
        dto,
        1000,
      );
    });

    it.each([
      ['PENDING', { startOffset: +60_000, endOffset: +120_000, stock: 5 }],
      ['ENDED', { startOffset: -120_000, endOffset: -60_000, stock: 5 }],
      ['SOLD_OUT', { startOffset: -60_000, endOffset: +60_000, stock: 0 }],
    ])('derives %s state from window + stock', async (expected, opts) => {
      redis.getJSON.mockResolvedValue(null);
      prisma.sale.findFirst.mockResolvedValue(
        makeSale({
          starts_at: new Date(Date.now() + opts.startOffset),
          ends_at: new Date(Date.now() + opts.endOffset),
          remaining_stock: opts.stock,
        }),
      );

      const dto = await service.getStatus();

      expect(dto.state).toBe(expected);
    });
  });

  describe('purchase', () => {
    const body = { email: 'alice@test.com', sale_id: 'sale-1' };
    const idemKey = 'idem-1';

    it('returns the original order on idempotency replay (same email)', async () => {
      prisma.order.findUnique.mockResolvedValue({
        id: 'order-existing',
        sale_id: 'sale-1',
        user: { email: 'alice@test.com' },
      });

      const result = await service.purchase(body, idemKey);

      expect(result).toEqual({ orderId: 'order-existing', status: 'CONFIRMED' });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('rejects when idempotency key is reused with a different email', async () => {
      prisma.order.findUnique.mockResolvedValue({
        id: 'order-existing',
        sale_id: 'sale-1',
        user: { email: 'someone-else@test.com' },
      });

      await expect(service.purchase(body, idemKey)).rejects.toThrow(/different email/i);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('throws ServiceUnavailable when the sale id is not found', async () => {
      prisma.order.findUnique.mockResolvedValue(null);
      prisma.sale.findFirst.mockResolvedValue(null);

      await expect(service.purchase(body, idemKey)).rejects.toThrow(/no flash sale/i);
    });

    it('happy path: decrements stock, inserts order, broadcasts fresh status', async () => {
      prisma.order.findUnique.mockResolvedValue(null);
      prisma.sale.findFirst.mockResolvedValueOnce(makeSale());

      // Set up the transaction stub. The callback receives a fake `tx`
      // that mirrors the Prisma surface SaleService uses.
      prisma.$transaction.mockImplementation(async (callback: any) => {
        const tx = {
          user: { upsert: jest.fn().mockResolvedValue({ id: 'user-1' }) },
          $queryRaw: jest.fn().mockResolvedValue([{ remaining_stock: 49 }]),
          sale: { findUniqueOrThrow: jest.fn() },
          order: { create: jest.fn().mockResolvedValue({ id: 'order-new' }) },
        };
        return callback(tx);
      });

      // For the post-commit broadcastFreshStatus(): stub getStatus's DB read.
      prisma.sale.findFirst.mockResolvedValue(makeSale({ remaining_stock: 49 }));
      redis.getJSON.mockResolvedValue(null);

      const result = await service.purchase(body, idemKey);

      expect(result).toEqual({ orderId: 'order-new', status: 'CONFIRMED' });

      // The post-commit broadcast is fire-and-forget — flush microtasks.
      await new Promise((r) => setImmediate(r));
      expect(gateway.emitStatus).toHaveBeenCalledTimes(1);
      expect(gateway.emitStatus.mock.calls[0][0].remainingStock).toBe(49);
    });

    it.each([
      ['SALE_NOT_STARTED', { startOffset: +60_000, endOffset: +120_000 }],
      ['SALE_ENDED', { startOffset: -120_000, endOffset: -60_000 }],
      ['SOLD_OUT', { startOffset: -60_000, endOffset: +60_000 }],
    ])('throws BusinessError(%s) when the decrement returns 0 rows', async (code, opts) => {
      prisma.order.findUnique.mockResolvedValue(null);
      prisma.sale.findFirst.mockResolvedValue(makeSale());

      const failingSale = makeSale({
        starts_at: new Date(Date.now() + opts.startOffset),
        ends_at: new Date(Date.now() + opts.endOffset),
        remaining_stock: 0,
      });

      prisma.$transaction.mockImplementation(async (callback: any) => {
        const tx = {
          user: { upsert: jest.fn().mockResolvedValue({ id: 'user-1' }) },
          $queryRaw: jest.fn().mockResolvedValue([]), // empty = "couldn't decrement"
          sale: { findUniqueOrThrow: jest.fn().mockResolvedValue(failingSale) },
          order: { create: jest.fn() },
        };
        return callback(tx);
      });

      await expect(service.purchase(body, idemKey)).rejects.toMatchObject({
        code,
      } as BusinessError);
      expect(gateway.emitStatus).not.toHaveBeenCalled();
    });

    it('throws BusinessError(ALREADY_PURCHASED) on unique-violation P2002', async () => {
      prisma.order.findUnique.mockResolvedValue(null);
      prisma.sale.findFirst.mockResolvedValue(makeSale());

      prisma.$transaction.mockImplementation(async (callback: any) => {
        const tx = {
          user: { upsert: jest.fn().mockResolvedValue({ id: 'user-1' }) },
          $queryRaw: jest.fn().mockResolvedValue([{ remaining_stock: 49 }]),
          sale: { findUniqueOrThrow: jest.fn() },
          order: { create: jest.fn().mockRejectedValue(p2002()) },
        };
        return callback(tx);
      });

      await expect(service.purchase(body, idemKey)).rejects.toMatchObject({
        code: 'ALREADY_PURCHASED',
      } as BusinessError);
      expect(gateway.emitStatus).not.toHaveBeenCalled();
    });

    it('rethrows non-P2002 errors without converting to a BusinessError', async () => {
      prisma.order.findUnique.mockResolvedValue(null);
      prisma.sale.findFirst.mockResolvedValue(makeSale());

      const dbErr = new Error('connection lost');

      prisma.$transaction.mockImplementation(async (callback: any) => {
        const tx = {
          user: { upsert: jest.fn().mockResolvedValue({ id: 'user-1' }) },
          $queryRaw: jest.fn().mockResolvedValue([{ remaining_stock: 49 }]),
          sale: { findUniqueOrThrow: jest.fn() },
          order: { create: jest.fn().mockRejectedValue(dbErr) },
        };
        return callback(tx);
      });

      await expect(service.purchase(body, idemKey)).rejects.toBe(dbErr);
    });
  });
});
