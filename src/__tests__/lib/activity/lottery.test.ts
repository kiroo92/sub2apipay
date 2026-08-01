import { beforeEach, describe, expect, it, vi } from 'vitest';

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
  buildEligiblePrizePool,
  calculateEarnedDraws,
  drawLotteryPrize,
  filterValidRechargeOrders,
  LOTTERY_GUARANTEE_START_AT,
  pickWeightedPrize,
  shouldGuaranteeFifty,
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
    [0, 0],
    [19.99, 0],
    [20, 1],
    [99.99, 1],
    [100, 2],
    [199.99, 2],
    [200, 3],
    [9999, 3],
  ])('maps recharge %d to %d earned draws', (amount, expected) => {
    expect(calculateEarnedDraws(amount)).toBe(expected);
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

  it('removes reset voucher for users without an active subscription and moves its weight to five yuan', () => {
    const pool = buildEligiblePrizePool(false);
    expect(pool.find((prize) => prize.key === 'subscription_reset')).toBeUndefined();
    expect(pool.find((prize) => prize.key === 'balance_5')?.weight).toBe(7501);
    expect(pool.reduce((sum, prize) => sum + prize.weight, 0)).toBe(10_000);
  });

  it('keeps the full prize pool for subscribed users', () => {
    const pool = buildEligiblePrizePool(true);
    expect(pool.find((prize) => prize.key === 'subscription_reset')?.weight).toBe(1);
    expect(pool.reduce((sum, prize) => sum + prize.weight, 0)).toBe(10_000);
  });

  it('selects prizes by integer weight boundaries', () => {
    const pool = buildEligiblePrizePool(true);
    expect(pickWeightedPrize(pool, 0).key).toBe('balance_2');
    expect(pickWeightedPrize(pool, 2_000).key).toBe('balance_5');
    expect(pickWeightedPrize(pool, 9_999).key).toBe('subscription_reset');
  });

  it('guarantees fifty only above 1000 and only before a previous fifty', () => {
    expect(shouldGuaranteeFifty(1000, [])).toBe(false);
    expect(shouldGuaranteeFifty(1000.01, [])).toBe(true);
    expect(shouldGuaranteeFifty(1200, ['balance_50'])).toBe(false);
  });

  it('starts the high-recharge guarantee window at August 1 in Shanghai', () => {
    expect(new Date(LOTTERY_GUARANTEE_START_AT).toISOString()).toBe('2026-07-31T16:00:00.000Z');
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
