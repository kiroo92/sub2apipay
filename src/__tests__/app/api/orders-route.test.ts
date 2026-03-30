import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mockGetCurrentUserByToken = vi.fn();
const mockGetEnabledPaymentTypes = vi.fn();
const mockCreateOrder = vi.fn();

vi.mock('@/lib/sub2api/client', () => ({
  getCurrentUserByToken: (...args: unknown[]) => mockGetCurrentUserByToken(...args),
}));

vi.mock('@/lib/payment/resolve-enabled-types', () => ({
  getEnabledPaymentTypes: (...args: unknown[]) => mockGetEnabledPaymentTypes(...args),
}));

vi.mock('@/lib/order/service', () => ({
  createOrder: (...args: unknown[]) => mockCreateOrder(...args),
}));

vi.mock('@/lib/config', () => ({
  getEnv: () => ({
    MIN_RECHARGE_AMOUNT: 1,
    MAX_RECHARGE_AMOUNT: 1000,
    BALANCE_CNY_PER_USD: 0.4,
    MIN_BALANCE_TOPUP_AMOUNT: 5,
    MAX_BALANCE_TOPUP_AMOUNT: 1000,
  }),
}));

import { POST } from '@/app/api/orders/route';

describe('POST /api/orders', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCurrentUserByToken.mockResolvedValue({ id: 12 });
    mockGetEnabledPaymentTypes.mockResolvedValue(['balance', 'alipay']);
    mockCreateOrder.mockResolvedValue({
      orderId: 'ORD-test',
      amount: 88,
      payAmount: 88,
      feeRate: 0,
      status: 'PENDING',
      paymentType: 'alipay',
      userName: 'demo',
      userBalance: 0,
      expiresAt: new Date('2026-03-23T00:00:00.000Z'),
      statusAccessToken: 'token',
    });
  });

  it('rejects subscription orders that try to use balance as the payment method', async () => {
    const request = new NextRequest('https://pay.example.com/api/orders', {
      method: 'POST',
      body: JSON.stringify({
        token: 'test-token',
        amount: 88,
        payment_type: 'balance',
        order_type: 'subscription',
        plan_id: 'plan_123',
      }),
      headers: {
        'content-type': 'application/json',
      },
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('套餐需直接支付购买，账户余额不可用于兑换套餐');
    expect(mockCreateOrder).not.toHaveBeenCalled();
  });

  it('rejects non-integer balance top-up amounts', async () => {
    const request = new NextRequest('https://pay.example.com/api/orders', {
      method: 'POST',
      body: JSON.stringify({
        token: 'test-token',
        amount: 5.2,
        payment_type: 'alipay',
      }),
      headers: {
        'content-type': 'application/json',
      },
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('余额充值额度仅支持整数美元');
    expect(mockCreateOrder).not.toHaveBeenCalled();
  });

  it('rejects balance top-up amounts below the minimum', async () => {
    const request = new NextRequest('https://pay.example.com/api/orders', {
      method: 'POST',
      body: JSON.stringify({
        token: 'test-token',
        amount: 4,
        payment_type: 'alipay',
      }),
      headers: {
        'content-type': 'application/json',
      },
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('余额充值额度需在 5$ - 1000$ 之间');
    expect(mockCreateOrder).not.toHaveBeenCalled();
  });
});
