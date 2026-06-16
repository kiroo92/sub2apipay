import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockRecordFindUnique = vi.fn();
const mockRecordCreate = vi.fn();
const mockRecordUpdate = vi.fn();
const mockAddBalance = vi.fn();
const mockListPaymentOrders = vi.fn();

vi.mock('@prisma/client', () => ({
  Prisma: {
    Decimal: class Decimal {
      value: string;

      constructor(value: string) {
        this.value = value;
      }
    },
    PrismaClientKnownRequestError: class PrismaClientKnownRequestError extends Error {
      code: string;

      constructor(message: string, options: { code: string }) {
        super(message);
        this.code = options.code;
      }
    },
  },
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    activityDrawRecord: {
      findUnique: (...args: unknown[]) => mockRecordFindUnique(...args),
      create: (...args: unknown[]) => mockRecordCreate(...args),
      update: (...args: unknown[]) => mockRecordUpdate(...args),
    },
  },
}));

vi.mock('@/lib/sub2api/client', () => ({
  addBalance: (...args: unknown[]) => mockAddBalance(...args),
  listPaymentOrders: (...args: unknown[]) => mockListPaymentOrders(...args),
}));

import { ActivityError, drawDuanwuPrize, getDuanwuActivityData } from '@/lib/activity/duanwu';
import { Prisma } from '@prisma/client';

function createKnownRequestError(message: string, code = 'P2002') {
  return new (Prisma.PrismaClientKnownRequestError as new (message: string, options: { code: string }) => Error)(
    message,
    { code },
  );
}

function mockOrders(items: Array<Record<string, unknown>>) {
  mockListPaymentOrders.mockResolvedValue({
    items,
    total: items.length,
    page: 1,
    page_size: 100,
  });
}

describe('duanwu activity service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('counts only june 2026 paid recharge orders from sub2api payment api', async () => {
    mockOrders([
      {
        id: 'order-1',
        user_id: 1,
        user_name: 'user1',
        amount: 40,
        payment_type: 'alipay',
        status: 'paid',
        paid_at: '2026-06-02T00:01:00.000Z',
      },
      {
        id: 'order-2',
        user_id: 1,
        user_name: 'user1',
        amount: 30,
        payment_type: 'wxpay',
        status: 'paid',
        paid_at: '2026-06-10T00:01:00.000Z',
      },
      {
        id: 'order-3',
        user_id: 2,
        user_name: 'user2',
        amount: 999,
        payment_type: 'wxpay',
        status: 'paid',
        paid_at: '2026-06-10T00:01:00.000Z',
      },
    ]);
    mockRecordFindUnique.mockResolvedValue(null);

    const result = await getDuanwuActivityData(1);

    expect(result.stats.paidRechargeCount).toBe(2);
    expect(result.stats.totalRechargeAmount).toBe(70);
    expect(result.stats.eligible).toBe(true);
    expect(result.stats.canDraw).toBe(true);
  });

  it('creates one draw record per user and issues prize', async () => {
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.05);
    mockOrders([
      {
        id: 'order-1',
        user_id: 1,
        user_name: 'user1',
        amount: 66.66,
        payment_type: 'alipay',
        status: 'paid',
        paid_at: '2026-06-05T00:01:00.000Z',
      },
    ]);
    mockRecordFindUnique.mockResolvedValueOnce(null);
    mockRecordCreate.mockResolvedValue({
      id: 'draw-1',
      prizeKey: 'third',
      prizeName: '三等奖',
      prizeAmount: 6.66,
      issueStatus: 'PENDING',
      issuedAt: null,
      createdAt: new Date('2026-06-16T00:00:00Z'),
    });
    mockAddBalance.mockResolvedValue(undefined);
    mockRecordUpdate.mockResolvedValue({
      id: 'draw-1',
      prizeKey: 'third',
      prizeName: '三等奖',
      prizeAmount: 6.66,
      issueStatus: 'ISSUED',
      issuedAt: new Date('2026-06-16T00:00:01Z'),
      createdAt: new Date('2026-06-16T00:00:00Z'),
    });

    const result = await drawDuanwuPrize(1, 'zh');

    expect(mockRecordCreate).toHaveBeenCalledTimes(1);
    expect(mockAddBalance).toHaveBeenCalledTimes(1);
    expect(result.prize.name).toBe('三等奖');
    expect(result.alreadyDrawn).toBe(false);
    randomSpy.mockRestore();
  });

  it('reuses existing draw record and does not redraw', async () => {
    mockOrders([
      {
        id: 'order-1',
        user_id: 1,
        user_name: 'user1',
        amount: 80,
        payment_type: 'alipay',
        status: 'paid',
        paid_at: '2026-06-05T00:01:00.000Z',
      },
    ]);
    mockRecordFindUnique.mockResolvedValue({
      id: 'draw-1',
      prizeKey: 'second',
      prizeName: '二等奖',
      prizeAmount: 26.66,
      issueStatus: 'ISSUED',
      issuedAt: new Date('2026-06-16T00:00:01Z'),
      createdAt: new Date('2026-06-16T00:00:00Z'),
    });

    const result = await drawDuanwuPrize(1, 'zh');

    expect(mockRecordCreate).not.toHaveBeenCalled();
    expect(mockAddBalance).not.toHaveBeenCalled();
    expect(result.prize.amount).toBe(26.66);
    expect(result.alreadyDrawn).toBe(true);
  });

  it('guarantees at least second prize when june total is 200 or more', async () => {
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.99);
    mockOrders([
      {
        id: 'order-1',
        user_id: 1,
        user_name: 'user1',
        amount: 200,
        payment_type: 'alipay',
        status: 'paid',
        paid_at: '2026-06-05T00:01:00.000Z',
      },
    ]);
    mockRecordFindUnique.mockResolvedValueOnce(null);
    mockRecordCreate.mockResolvedValue({
      id: 'draw-2',
      prizeKey: 'second',
      prizeName: '二等奖',
      prizeAmount: 26.66,
      issueStatus: 'PENDING',
      issuedAt: null,
      createdAt: new Date('2026-06-16T00:00:00Z'),
    });
    mockAddBalance.mockResolvedValue(undefined);
    mockRecordUpdate.mockResolvedValue({
      id: 'draw-2',
      prizeKey: 'second',
      prizeName: '二等奖',
      prizeAmount: 26.66,
      issueStatus: 'ISSUED',
      issuedAt: new Date('2026-06-16T00:00:01Z'),
      createdAt: new Date('2026-06-16T00:00:00Z'),
    });

    const result = await drawDuanwuPrize(1, 'zh');
    expect(result.prize.key).toBe('second');
    randomSpy.mockRestore();
  });

  it('falls back when first prize slots are full', async () => {
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.999);
    mockOrders([
      {
        id: 'order-1',
        user_id: 1,
        user_name: 'user1',
        amount: 100,
        payment_type: 'alipay',
        status: 'paid',
        paid_at: '2026-06-05T00:01:00.000Z',
      },
    ]);
    mockRecordFindUnique.mockResolvedValueOnce(null);
    mockRecordCreate
      .mockRejectedValueOnce(createKnownRequestError('slot 1 full'))
      .mockRejectedValueOnce(createKnownRequestError('slot 2 full'))
      .mockRejectedValueOnce(createKnownRequestError('slot 3 full'))
      .mockResolvedValueOnce({
        id: 'draw-3',
        prizeKey: 'third',
        prizeName: '三等奖',
        prizeAmount: 6.66,
        issueStatus: 'PENDING',
        issuedAt: null,
        createdAt: new Date('2026-06-16T00:00:00Z'),
      });
    mockAddBalance.mockResolvedValue(undefined);
    mockRecordUpdate.mockResolvedValue({
      id: 'draw-3',
      prizeKey: 'third',
      prizeName: '三等奖',
      prizeAmount: 6.66,
      issueStatus: 'ISSUED',
      issuedAt: new Date('2026-06-16T00:00:01Z'),
      createdAt: new Date('2026-06-16T00:00:00Z'),
    });

    const result = await drawDuanwuPrize(1, 'zh');
    expect(result.prize.key).toBe('third');
    randomSpy.mockRestore();
  });

  it('rejects when june total recharge is below threshold', async () => {
    mockOrders([
      {
        id: 'order-1',
        user_id: 1,
        user_name: 'user1',
        amount: 20,
        payment_type: 'alipay',
        status: 'paid',
        paid_at: '2026-06-05T00:01:00.000Z',
      },
    ]);
    mockRecordFindUnique.mockResolvedValue(null);

    await expect(drawDuanwuPrize(1, 'zh')).rejects.toMatchObject({
      code: 'TOTAL_NOT_ELIGIBLE',
    } satisfies Partial<ActivityError>);
  });
});
