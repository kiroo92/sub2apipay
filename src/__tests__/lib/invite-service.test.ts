import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetSystemConfigs = vi.fn();
const mockFindUniqueInviteCode = vi.fn();
const mockFindUniqueInviteBinding = vi.fn();
const mockCreateInviteBinding = vi.fn();
const mockTransaction = vi.fn();

vi.mock('@/lib/system-config', () => ({
  getSystemConfigs: (...args: unknown[]) => mockGetSystemConfigs(...args),
}));

vi.mock('@/lib/sub2api/client', () => ({
  addBalance: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    inviteCode: {
      findUnique: (...args: unknown[]) => mockFindUniqueInviteCode(...args),
    },
    inviteBinding: {
      findUnique: (...args: unknown[]) => mockFindUniqueInviteBinding(...args),
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

    mockTransaction.mockImplementation(async (callback: (tx: any) => Promise<unknown>) => {
      const tx = {
        inviteBinding: {
          findUnique: mockFindUniqueInviteBinding,
          create: mockCreateInviteBinding,
        },
        inviteCode: {
          findUnique: mockFindUniqueInviteCode,
        },
      };
      return callback(tx);
    });

    mockCreateInviteBinding.mockResolvedValue({
      inviterUserId: 99,
      inviteeUserId: 7,
      createdAt: new Date('2026-03-27T10:45:00.000Z'),
      inviteCode: { code: 'ZXCV7788' },
    });
  });

  it('creates binding when no existing or reverse binding exists', async () => {
    mockFindUniqueInviteBinding
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    mockFindUniqueInviteCode.mockResolvedValue({ userId: 99, active: true, id: 'code-1' });

    const result = await bindInviteCodeForUser(7, 'zxcv7788');

    expect(result.inviterUserId).toBe(99);
    expect(mockCreateInviteBinding).toHaveBeenCalledWith({
      data: {
        inviterUserId: 99,
        inviteeUserId: 7,
        inviteCodeId: 'code-1',
      },
      include: {
        inviteCode: {
          select: {
            code: true,
          },
        },
      },
    });
  });

  it('rejects mutual binding when target user is already bound by current user', async () => {
    mockFindUniqueInviteBinding
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ inviterUserId: 7 });
    mockFindUniqueInviteCode.mockResolvedValue({ userId: 99, active: true, id: 'code-1' });

    await expect(bindInviteCodeForUser(7, 'zxcv7788')).rejects.toMatchObject({
      code: 'MUTUAL_BIND_FORBIDDEN',
      statusCode: 409,
    } satisfies Partial<InviteError>);

    expect(mockCreateInviteBinding).not.toHaveBeenCalled();
  });
});
