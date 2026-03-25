import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mockGetCurrentUserByToken = vi.fn();
const mockGetInviteInfoForUser = vi.fn();
const mockBindInviteCodeForUser = vi.fn();

vi.mock('@/lib/sub2api/client', () => ({
  getCurrentUserByToken: (...args: unknown[]) => mockGetCurrentUserByToken(...args),
}));

vi.mock('@/lib/invite/service', () => ({
  InviteError: class InviteError extends Error {
    code: string;
    statusCode: number;

    constructor(code: string, message: string, statusCode: number) {
      super(message);
      this.code = code;
      this.statusCode = statusCode;
    }
  },
  getInviteInfoForUser: (...args: unknown[]) => mockGetInviteInfoForUser(...args),
  bindInviteCodeForUser: (...args: unknown[]) => mockBindInviteCodeForUser(...args),
}));

import { GET } from '@/app/api/invite-code/route';
import { POST } from '@/app/api/invite-code/bind/route';

describe('invite code routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCurrentUserByToken.mockResolvedValue({ id: 7 });
    mockGetInviteInfoForUser.mockResolvedValue({
      flags: {
        programEnabled: true,
        bindingEnabled: true,
        rewardEnabled: true,
      },
      inviteCode: 'ABCD1234',
      binding: null,
      canBind: true,
    });
    mockBindInviteCodeForUser.mockResolvedValue({
      inviterUserId: 99,
      inviteCode: { code: 'ZXCV7788' },
      createdAt: new Date('2026-03-25T09:30:00.000Z'),
    });
  });

  it('returns current user invite info', async () => {
    const request = new NextRequest('https://pay.example.com/api/invite-code?token=test-token');

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(mockGetCurrentUserByToken).toHaveBeenCalledWith('test-token');
    expect(mockGetInviteInfoForUser).toHaveBeenCalledWith(7);
    expect(data.invite.userId).toBe(7);
    expect(data.invite.inviteCode).toBe('ABCD1234');
  });

  it('binds invite code for current user', async () => {
    const request = new NextRequest('https://pay.example.com/api/invite-code/bind', {
      method: 'POST',
      body: JSON.stringify({
        token: 'test-token',
        invite_code: 'zxcv7788',
      }),
      headers: {
        'content-type': 'application/json',
      },
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(mockGetCurrentUserByToken).toHaveBeenCalledWith('test-token');
    expect(mockBindInviteCodeForUser).toHaveBeenCalledWith(7, 'zxcv7788');
    expect(data.binding.inviterUserId).toBe(99);
    expect(data.binding.inviterCode).toBe('ZXCV7788');
  });

  it('rejects invalid bind payload', async () => {
    const request = new NextRequest('https://pay.example.com/api/invite-code/bind', {
      method: 'POST',
      body: JSON.stringify({
        token: '',
        invite_code: '',
      }),
      headers: {
        'content-type': 'application/json',
      },
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
    expect(mockBindInviteCodeForUser).not.toHaveBeenCalled();
  });
});
