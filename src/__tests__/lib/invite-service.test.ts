import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetSystemConfigs = vi.fn();
const mockFindUniqueInviteCode = vi.fn();
const mockUpsertInviteCode = vi.fn();
const mockUpsertInviteBinding = vi.fn();
const mockFindUniqueInviteBinding = vi.fn();
const mockCreateInviteBinding = vi.fn();
const mockTransaction = vi.fn();
const mockBindInviteCodeByToken = vi.fn();

vi.mock('@/lib/system-config', () => ({
  getSystemConfigs: (...args: unknown[]) => mockGetSystemConfigs(...args),
}));

vi.mock('@/lib/sub2api/client', () => ({
  addBalance: vi.fn(),
  bindInviteCodeByToken: (...args: unknown[]) => mockBindInviteCodeByToken(...args),
  getInviteInfoByToken: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    inviteCode: {
      findUnique: (...args: unknown[]) => mockFindUniqueInviteCode(...args),
      upsert: (...args: unknown[]) => mockUpsertInviteCode(...args),
    },
    inviteBinding: {
      findUnique: (...args: unknown[]) => mockFindUniqueInviteBinding(...args),
      upsert: (...args: unknown[]) => mockUpsertInviteBinding(...args),
    },
    $transaction: (...args: unknown[]) => mockTransaction(...args),
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

    mockFindUniqueInviteBinding.mockReset();
    mockFindUniqueInviteCode.mockReset();
    mockCreateInviteBinding.mockReset();
    mockTransaction.mockReset();
    mockFindUniqueInviteCode.mockResolvedValue(null);
    mockUpsertInviteCode.mockResolvedValue({ id: 'code-1', userId: 99, code: 'ZXCV7788', active: true });
    mockUpsertInviteBinding.mockResolvedValue({ inviterUserId: 99, inviteCode: { code: 'ZXCV7788' } });
    mockBindInviteCodeByToken.mockResolvedValue({
      binding: {
        inviter_user_id: 99,
        inviter_code: 'ZXCV7788',
        bound_at: '2026-03-27T10:45:00.000Z',
      },
    });
  });

  it('creates mirrored binding after upstream bind succeeds', async () => {
    mockFindUniqueInviteCode.mockResolvedValue(null);
    mockCreateInviteBinding.mockResolvedValue({});
    mockTransaction.mockResolvedValue(undefined);

    const result = await bindInviteCodeForUser(7, 'zxcv7788', 'test-token');

    expect(result.inviterUserId).toBe(99);
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
