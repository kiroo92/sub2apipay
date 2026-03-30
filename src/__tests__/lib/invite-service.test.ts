import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetSystemConfigs = vi.fn();
const mockGetInviteBindingsByUserId = vi.fn();
const mockBindInviteCodeByToken = vi.fn();

vi.mock('@/lib/system-config', () => ({
  getSystemConfigs: (...args: unknown[]) => mockGetSystemConfigs(...args),
}));

vi.mock('@/lib/sub2api/client', () => ({
  addBalance: vi.fn(),
  bindInviteCodeByToken: (...args: unknown[]) => mockBindInviteCodeByToken(...args),
  getInviteBindingsByUserId: (...args: unknown[]) => mockGetInviteBindingsByUserId(...args),
  getInviteInfoByToken: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    inviteCode: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
    inviteBinding: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

import { InviteError, bindInviteCodeForUser } from '@/lib/invite/service';

describe('bindInviteCodeForUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSystemConfigs.mockResolvedValue({
      INVITE_PROGRAM_ENABLED: 'true',
      INVITE_BINDING_ENABLED: 'true',
      INVITE_REWARD_ENABLED: 'false',
    });

    mockGetInviteBindingsByUserId.mockReset();
    mockBindInviteCodeByToken.mockReset();
    mockBindInviteCodeByToken.mockResolvedValue({
      binding: {
        inviter_user_id: 99,
        inviter_code: 'ZXCV7788',
        bound_at: '2026-03-27T10:45:00.000Z',
      },
    });
  });

  it('returns upstream binding after bind succeeds', async () => {
    const result = await bindInviteCodeForUser(7, 'zxcv7788', 'test-token');

    expect(result.inviterUserId).toBe(99);
    expect(result.inviteCode.code).toBe('ZXCV7788');
    expect(mockBindInviteCodeByToken).toHaveBeenCalledWith('test-token', 'ZXCV7788');
  });

  it('maps upstream mutual bind error', async () => {
    const error = Object.assign(new Error('mutual bind'), { code: 'REFERRAL_MUTUAL_BIND_FORBIDDEN', status: 409 });
    mockBindInviteCodeByToken.mockRejectedValue(error);

    await expect(bindInviteCodeForUser(7, 'zxcv7788', 'test-token')).rejects.toMatchObject({
      code: 'MUTUAL_BIND_FORBIDDEN',
      statusCode: 409,
    } satisfies Partial<InviteError>);
  });
});
