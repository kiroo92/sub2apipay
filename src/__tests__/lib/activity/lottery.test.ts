import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma, type ActivityDrawRecord } from '@prisma/client';

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  listPaymentOrders: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ prisma: { activityDrawRecord: { findUnique: mocks.findUnique } } }));
vi.mock('@/lib/sub2api/client', () => ({
  addBalance: vi.fn(),
  getUserSubscriptions: vi.fn(),
  listPaymentOrders: mocks.listPaymentOrders,
}));
import {
  aggregateLotteryUsers,
  buildEligiblePrizePool,
  calculateEarnedCards,
  countUsedCards,
  drawLotteryPrize,
  filterValidRechargeOrders,
  LOTTERY_ADDITIONAL_CARD_RECHARGE,
  LOTTERY_FIRST_CARD_RECHARGE,
  LOTTERY_PRIZES,
  pickWeightedPrize,
} from '@/lib/activity/lottery';
import type { Sub2ApiPaymentOrder } from '@/lib/sub2api/types';

const baseOrder: Sub2ApiPaymentOrder = {
  id: 'order-1',
  user_id: 7,
  amount: 100,
  status: 'COMPLETED',
  order_type: 'balance',
  payment_type: 'alipay',
  refund_amount: 0,
  created_at: '2026-08-02T00:00:00.000Z',
  paid_at: '2026-08-02T00:00:00.000Z',
};

function makeDrawRecord(overrides: Partial<ActivityDrawRecord> = {}): ActivityDrawRecord {
  return {
    id: 'draw-1',
    activityKey: 'recharge-lottery-2026-08',
    userId: 7,
    requestId: '123e4567-e89b-42d3-a456-426614174000',
    drawIndex: 1,
    prizeKey: 'balance_5',
    prizeAmount: new Prisma.Decimal('5'),
    prizeReason: 'RANDOM',
    issueStatus: 'ISSUED',
    issueError: null,
    issuedAt: new Date('2026-08-08T00:00:00.000Z'),
    adminNote: null,
    createdAt: new Date('2026-08-08T00:00:00.000Z'),
    updatedAt: new Date('2026-08-08T00:00:00.000Z'),
    ...overrides,
  };
}

describe('lottery rules', () => {
  beforeEach(() => vi.clearAllMocks());
  it.each([
    [19.99, 0],
    [20, 1],
    [119.99, 1],
    [120, 2],
    [219.99, 2],
    [220, 3],
    [20_000, 200],
  ])('calculates recharge card tiers for %s', (amount, expected) => {
    expect(calculateEarnedCards(amount)).toBe(expected);
  });

  it('exposes the first and repeat recharge thresholds', () => {
    expect(LOTTERY_FIRST_CARD_RECHARGE).toBe(20);
    expect(LOTTERY_ADDITIONAL_CARD_RECHARGE).toBe(100);
  });

  it('keeps regular prizes unlimited and does not consume a card for legacy redraws', () => {
    expect(
      LOTTERY_PRIZES.filter((prize) => prize.key.startsWith('balance_') && prize.amount <= 20).every(
        (prize) => prize.initialStock === null,
      ),
    ).toBe(true);
    expect(LOTTERY_PRIZES.find((prize) => prize.key === 'balance_50')?.initialStock).toBe(5);
    expect(LOTTERY_PRIZES.find((prize) => prize.key === 'quota_reset')?.initialStock).toBe(5);
    expect(countUsedCards(['balance_30', 'redraw', 'balance_60', 'redraw'])).toBe(2);
  });

  it('accepts only completed, unrefunded balance orders in the requested window', () => {
    const orders: Sub2ApiPaymentOrder[] = [
      baseOrder,
      { ...baseOrder, id: 'refunded', refund_amount: 1 },
      { ...baseOrder, id: 'paid', status: 'PAID' },
      { ...baseOrder, id: 'subscription', order_type: 'subscription' },
      { ...baseOrder, id: 'outside', paid_at: '2026-09-01T00:00:00.000Z' },
    ];

    expect(
      filterValidRechargeOrders(
        orders,
        7,
        new Date('2026-08-01T00:00:00.000Z'),
        new Date('2026-09-01T00:00:00.000Z'),
      ).map((order) => order.id),
    ).toEqual(['order-1']);
  });

  it('aggregates recharge users, unused cards, and legacy draw records', () => {
    const users = aggregateLotteryUsers({
      startAt: new Date('2026-08-07T00:00:00.000Z'),
      endAt: new Date('2026-09-01T00:00:00.000Z'),
      active: true,
      orders: [
        {
          ...baseOrder,
          user_id: 7,
          user_email: 'seven@example.com',
          amount: 120,
          paid_at: '2026-08-07T01:00:00.000Z',
        },
        {
          ...baseOrder,
          id: 'order-2',
          user_id: 8,
          user_email: 'eight@example.com',
          amount: 20,
          paid_at: '2026-08-07T02:00:00.000Z',
        },
        {
          ...baseOrder,
          id: 'outside-window',
          user_id: 8,
          amount: 1000,
          paid_at: '2026-08-02T00:00:00.000Z',
        },
      ],
      records: [
        makeDrawRecord(),
        makeDrawRecord({
          id: 'draw-2',
          requestId: '123e4567-e89b-42d3-a456-426614174001',
          drawIndex: 2,
          prizeKey: 'balance_240',
          prizeAmount: new Prisma.Decimal('240'),
        }),
      ],
    });

    expect(users.map((user) => user.userId)).toEqual([7, 8]);
    expect(users[0]).toMatchObject({
      email: 'seven@example.com',
      totalRechargeAmount: 120,
      earnedCards: 2,
      usedCards: 2,
      availableCards: 0,
    });
    expect(users[0].records[1].prize.name).toBe('$240 额度');
    expect(users[1]).toMatchObject({
      email: 'eight@example.com',
      totalRechargeAmount: 20,
      earnedCards: 1,
      usedCards: 0,
      availableCards: 1,
      records: [],
    });
  });

  it('removes reset prizes for users without an active subscription', () => {
    const pool = buildEligiblePrizePool({ hasActiveSubscription: false, priorPrizeKeys: [] });
    expect(pool.find((prize) => prize.key === 'quota_reset')).toBeUndefined();
    expect(pool.reduce((sum, prize) => sum + prize.weight, 0)).toBe(9_995);
  });

  it('limits the first draw to the $2 and $5 prizes', () => {
    const pool = buildEligiblePrizePool({
      hasActiveSubscription: true,
      priorPrizeKeys: [],
      firstDrawOnly: true,
    });
    expect(pool.map((prize) => prize.key)).toEqual(['balance_2', 'balance_5']);
    expect(pickWeightedPrize(pool, 0).key).toBe('balance_2');
    expect(pickWeightedPrize(pool, 5_910).key).toBe('balance_5');
  });

  it('removes every grand prize after the user has won one', () => {
    const pool = buildEligiblePrizePool({ hasActiveSubscription: true, priorPrizeKeys: ['balance_240'] });
    expect(pool.find((prize) => prize.key === 'balance_50')).toBeUndefined();
    expect(pool.find((prize) => prize.key === 'quota_reset')).toBeUndefined();
  });

  it('removes prizes whose global inventory is exhausted', () => {
    const pool = buildEligiblePrizePool({
      hasActiveSubscription: true,
      priorPrizeKeys: [],
      awardedByPrize: { balance_50: 5, quota_reset: 5 },
    });
    expect(pool.find((prize) => prize.key === 'balance_50')).toBeUndefined();
    expect(pool.find((prize) => prize.key === 'quota_reset')).toBeUndefined();
    expect(pool.find((prize) => prize.key === 'balance_20')).toBeDefined();
  });

  it('selects prizes by integer weight boundaries', () => {
    const pool = buildEligiblePrizePool({ hasActiveSubscription: true, priorPrizeKeys: [] });
    expect(pickWeightedPrize(pool, 0).key).toBe('balance_2');
    expect(pickWeightedPrize(pool, 5_910).key).toBe('balance_5');
    expect(pickWeightedPrize(pool, 8_910).key).toBe('balance_10');
    expect(pickWeightedPrize(pool, 9_910).key).toBe('balance_20');
    expect(pickWeightedPrize(pool, 9_990).key).toBe('balance_50');
    expect(pickWeightedPrize(pool, 9_995).key).toBe('quota_reset');
    expect(pickWeightedPrize(pool, 9_999).key).toBe('quota_reset');
  });

  it('returns the original result for a replay without querying eligibility again', async () => {
    mocks.findUnique.mockResolvedValue({
      id: 'draw-1',
      activityKey: 'recharge-lottery-2026-08',
      userId: 7,
      requestId: '123e4567-e89b-42d3-a456-426614174000',
      drawIndex: 1,
      prizeKey: 'balance_5',
      prizeAmount: 5,
      prizeReason: 'RANDOM',
      issueStatus: 'ISSUED',
      issueError: null,
      issuedAt: new Date(),
      adminNote: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const result = await drawLotteryPrize(7, '123e4567-e89b-42d3-a456-426614174000', new Date('2030-01-01'));
    expect(result.replayed).toBe(true);
    expect(result.prize.amount).toBe(5);
    expect(mocks.listPaymentOrders).not.toHaveBeenCalled();
  });
});
