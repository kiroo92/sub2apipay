import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  listPaymentOrders: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ prisma: { activityDrawRecord: { findUnique: mocks.findUnique } } }));
vi.mock('@/lib/sub2api/client', () => ({
  addBalance: vi.fn(),
  getUserSubscriptions: vi.fn(),
  getUserUsageStats: vi.fn(),
  listPaymentOrders: mocks.listPaymentOrders,
  listSubscriptionPlans: vi.fn(),
}));
import {
  buildEligiblePrizePool,
  calculateEarnedCards,
  countUsedCards,
  drawLotteryPrize,
  filterValidOrders,
  isGiftMonthPlan,
  LOTTERY_POOL_SIZE,
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

describe('lottery rules', () => {
  beforeEach(() => vi.clearAllMocks());
  it.each([
    [{ monthlyPurchases: 0, packageUsageAmount: 2399.99, balanceUsageAmount: 1999.99 }, 0],
    [{ monthlyPurchases: 1, packageUsageAmount: 2400, balanceUsageAmount: 2000 }, 3],
    [{ monthlyPurchases: 4, packageUsageAmount: 7200, balanceUsageAmount: 6000 }, 10],
    [{ monthlyPurchases: 20, packageUsageAmount: 24_000, balanceUsageAmount: 20_000 }, 40],
  ])('calculates repeatable cards without a maximum', (input, expected) => {
    expect(calculateEarnedCards(input).total).toBe(expected);
  });

  it('keeps the configured inventory fixed and does not consume a card for redraws', () => {
    expect(LOTTERY_PRIZES.reduce((sum, prize) => sum + prize.initialStock, 0)).toBe(LOTTERY_POOL_SIZE);
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
      filterValidOrders(
        orders,
        7,
        'balance',
        new Date('2026-08-01T00:00:00.000Z'),
        new Date('2026-09-01T00:00:00.000Z'),
      ).map((order) => order.id),
    ).toEqual(['order-1']);
  });

  it('recognizes named 30-day month cards', () => {
    expect(
      isGiftMonthPlan({
        id: 1,
        group_id: 2,
        name: 'Codex 轻享月卡',
        product_name: '',
        validity_days: 30,
        validity_unit: 'day',
      }),
    ).toBe(true);
    expect(
      isGiftMonthPlan({
        id: 2,
        group_id: 3,
        name: '普通季卡',
        product_name: '',
        validity_days: 90,
        validity_unit: 'day',
      }),
    ).toBe(false);
  });

  it('removes reset prizes for users without an active subscription', () => {
    const pool = buildEligiblePrizePool({ hasActiveSubscription: false, priorPrizeKeys: [] });
    expect(pool.find((prize) => prize.key === 'quota_reset')).toBeUndefined();
    expect(pool.reduce((sum, prize) => sum + prize.initialStock, 0)).toBe(9_990);
  });

  it('removes every grand prize after the user has won one', () => {
    const pool = buildEligiblePrizePool({ hasActiveSubscription: true, priorPrizeKeys: ['balance_240'] });
    expect(pool.find((prize) => prize.key === 'balance_240')).toBeUndefined();
    expect(pool.find((prize) => prize.key === 'quota_reset')).toBeUndefined();
  });

  it('removes prizes whose global inventory is exhausted', () => {
    const pool = buildEligiblePrizePool({
      hasActiveSubscription: true,
      priorPrizeKeys: [],
      awardedByPrize: { balance_240: 100, quota_reset: 10 },
    });
    expect(pool.find((prize) => prize.key === 'balance_240')).toBeUndefined();
    expect(pool.find((prize) => prize.key === 'quota_reset')).toBeUndefined();
  });

  it('selects prizes by integer weight boundaries', () => {
    const pool = buildEligiblePrizePool({ hasActiveSubscription: true, priorPrizeKeys: [] });
    expect(pickWeightedPrize(pool, 0).key).toBe('balance_30');
    expect(pickWeightedPrize(pool, 4_800).key).toBe('balance_60');
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
