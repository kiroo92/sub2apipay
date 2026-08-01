import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { getCurrentUserByToken, getLotteryActivityData, drawLotteryPrize } = vi.hoisted(() => ({
  getCurrentUserByToken: vi.fn(),
  getLotteryActivityData: vi.fn(),
  drawLotteryPrize: vi.fn(),
}));

vi.mock('@/lib/sub2api/client', () => ({ getCurrentUserByToken }));
vi.mock('@/lib/activity/lottery', () => ({
  ActivityError: class ActivityError extends Error {
    constructor(
      public code: string,
      message: string,
      public statusCode = 400,
    ) {
      super(message);
    }
  },
  getLotteryActivityData,
  drawLotteryPrize,
}));

import { GET } from '@/app/api/lottery/route';
import { POST } from '@/app/api/lottery/draw/route';

describe('lottery API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUserByToken.mockResolvedValue({ id: 9, username: 'tester', balance: 20 });
  });

  it('requires a token for activity data', async () => {
    const response = await GET(new NextRequest('https://activity.example.com/api/lottery'));
    expect(response.status).toBe(401);
  });

  it('returns live activity data for the authenticated user', async () => {
    getLotteryActivityData.mockResolvedValue({ stats: { availableDraws: 2 }, drawRecords: [] });
    const response = await GET(new NextRequest('https://activity.example.com/api/lottery?token=TOKEN'));
    expect(response.status).toBe(200);
    expect((await response.json()).stats.availableDraws).toBe(2);
  });

  it('requires both token and request ID for a draw', async () => {
    const response = await POST(
      new NextRequest('https://activity.example.com/api/lottery/draw', {
        method: 'POST',
        body: JSON.stringify({ token: 'TOKEN' }),
      }),
    );
    expect(response.status).toBe(400);
  });

  it('passes authenticated draws to the domain service', async () => {
    drawLotteryPrize.mockResolvedValue({ id: 'draw-1', prize: { key: 'balance_5', amount: 5 } });
    const requestId = '123e4567-e89b-42d3-a456-426614174000';
    const response = await POST(
      new NextRequest('https://activity.example.com/api/lottery/draw', {
        method: 'POST',
        body: JSON.stringify({ token: 'TOKEN', requestId }),
      }),
    );
    expect(response.status).toBe(200);
    expect(drawLotteryPrize).toHaveBeenCalledWith(9, requestId);
  });
});
