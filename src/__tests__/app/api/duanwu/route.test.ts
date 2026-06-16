import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mockGetCurrentUserByToken = vi.fn();
const mockGetDuanwuActivityData = vi.fn();
const mockDrawDuanwuPrize = vi.fn();

vi.mock('@/lib/sub2api/client', () => ({
  getCurrentUserByToken: (...args: unknown[]) => mockGetCurrentUserByToken(...args),
}));

vi.mock('@/lib/activity/duanwu', async () => {
  return {
    ActivityError: class ActivityError extends Error {
      code: string;
      statusCode: number;

      constructor(code: string, message: string, statusCode = 400) {
        super(message);
        this.code = code;
        this.statusCode = statusCode;
      }
    },
    getDuanwuActivityData: (...args: unknown[]) => mockGetDuanwuActivityData(...args),
    drawDuanwuPrize: (...args: unknown[]) => mockDrawDuanwuPrize(...args),
  };
});

import { GET } from '@/app/api/duanwu/route';
import { POST } from '@/app/api/duanwu/draw/route';

describe('/api/duanwu', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCurrentUserByToken.mockResolvedValue({
      id: 1,
      username: 'tester',
      email: 'test@example.com',
      balance: 100,
    });
  });

  it('returns 401 without token', async () => {
    const res = await GET(new NextRequest('https://pay.example.com/api/duanwu'));
    expect(res.status).toBe(401);
  });

  it('returns activity data for authenticated user', async () => {
    mockGetDuanwuActivityData.mockResolvedValue({
      activity: {
        key: 'duanwu-2026',
        name: '端午充值抽奖',
        minTotalAmount: 66.66,
        startAt: new Date('2026-05-31T16:00:00.000Z'),
        endAt: new Date('2026-06-30T16:00:00.000Z'),
        prizes: [],
      },
      orders: [],
      drawRecord: null,
      stats: { paidRechargeCount: 0, totalRechargeAmount: 0, eligible: false, hasDrawn: false, canDraw: false },
    });

    const res = await GET(new NextRequest('https://pay.example.com/api/duanwu?token=test-token'));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.user.id).toBe(1);
    expect(data.activity.key).toBe('duanwu-2026');
  });

  it('draw route validates request and returns prize', async () => {
    mockDrawDuanwuPrize.mockResolvedValue({
      prize: { key: 'comfort', name: '安慰奖', amount: 1.66 },
      issueStatus: 'ISSUED',
      issuedAt: new Date('2026-06-16T00:00:01Z'),
      alreadyDrawn: false,
      reissue: false,
    });

    const req = new NextRequest('https://pay.example.com/api/duanwu/draw', {
      method: 'POST',
      body: JSON.stringify({ token: 'test-token' }),
      headers: { 'Content-Type': 'application/json' },
    });

    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.prize.amount).toBe(1.66);
  });
});
