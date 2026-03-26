import { randomBytes } from 'crypto';
import { InviteRewardRole, InviteRewardStatus, Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { addBalance } from '@/lib/sub2api/client';
import { getSystemConfigs } from '@/lib/system-config';

const INVITE_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const INVITE_CODE_LENGTH = 8;
const MAX_GENERATE_CODE_ATTEMPTS = 12;
const ENABLED_VALUES = new Set(['1', 'true', 'yes', 'on']);

export interface InviteFeatureFlags {
  programEnabled: boolean;
  bindingEnabled: boolean;
  rewardEnabled: boolean;
}

export interface InviteInfo {
  flags: InviteFeatureFlags;
  inviteCode: string | null;
  binding: {
    inviterUserId: number;
    inviterCode: string;
    boundAt: Date;
  } | null;
  canBind: boolean;
}

export class InviteError extends Error {
  code: string;
  statusCode: number;

  constructor(code: string, message: string, statusCode: number = 400) {
    super(message);
    this.name = 'InviteError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

function isEnabled(value?: string): boolean {
  if (!value) return false;
  return ENABLED_VALUES.has(value.trim().toLowerCase());
}

function normalizeInviteCode(code: string): string {
  return code
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

function generateInviteCodeCandidate(): string {
  const bytes = randomBytes(INVITE_CODE_LENGTH);
  let code = '';
  for (let i = 0; i < INVITE_CODE_LENGTH; i += 1) {
    code += INVITE_CODE_ALPHABET[bytes[i] % INVITE_CODE_ALPHABET.length];
  }
  return code;
}

function isUniqueConstraintError(error: unknown, target?: string | string[]): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
    return false;
  }

  if (!target) return true;

  const candidates = Array.isArray(target) ? target : [target];
  const metaTarget = error.meta?.target;
  if (Array.isArray(metaTarget)) {
    return candidates.some((item) => metaTarget.includes(item));
  }

  return typeof metaTarget === 'string' && candidates.some((item) => metaTarget.includes(item));
}

function decimalToNumber(value: Prisma.Decimal | null | undefined): number {
  return value ? Number(value.toString()) : 0;
}

function normalizeRewardPercent(value?: string): number {
  if (!value) return 0;
  const percent = Number(value);
  if (!Number.isFinite(percent) || percent <= 0) return 0;
  return Math.round(percent * 100) / 100;
}

function calcRewardByPercent(baseAmount: number, percent: number): number {
  if (!Number.isFinite(baseAmount) || baseAmount <= 0 || !Number.isFinite(percent) || percent <= 0) return 0;
  return Math.round(baseAmount * percent) / 100;
}

function buildRewardIdempotencyKey(orderId: string, role: InviteRewardRole): string {
  return `sub2apipay:invite-reward:${orderId}:${role.toLowerCase()}`;
}

export async function getInviteFeatureFlags(): Promise<InviteFeatureFlags> {
  const configs = await getSystemConfigs(['INVITE_PROGRAM_ENABLED', 'INVITE_BINDING_ENABLED', 'INVITE_REWARD_ENABLED']);
  const programEnabled = isEnabled(configs.INVITE_PROGRAM_ENABLED);

  return {
    programEnabled,
    bindingEnabled: programEnabled && isEnabled(configs.INVITE_BINDING_ENABLED),
    rewardEnabled: programEnabled && isEnabled(configs.INVITE_REWARD_ENABLED),
  };
}

async function createInviteCode(tx: Prisma.TransactionClient, userId: number) {
  for (let attempt = 0; attempt < MAX_GENERATE_CODE_ATTEMPTS; attempt += 1) {
    try {
      return await tx.inviteCode.create({
        data: {
          userId,
          code: generateInviteCodeCandidate(),
        },
      });
    } catch (error) {
      if (isUniqueConstraintError(error, ['userId', 'user_id'])) {
        return tx.inviteCode.findUniqueOrThrow({ where: { userId } });
      }
      if (isUniqueConstraintError(error, 'code')) {
        continue;
      }
      throw error;
    }
  }

  throw new InviteError('INVITE_CODE_GENERATION_FAILED', '邀请码生成失败，请稍后重试', 500);
}

export async function ensureInviteCodeForUser(userId: number) {
  const existing = await prisma.inviteCode.findUnique({ where: { userId } });
  if (existing) return existing;

  return prisma.$transaction((tx) => createInviteCode(tx, userId));
}

export async function getInviteInfoForUser(userId: number): Promise<InviteInfo> {
  const [flags, existingCode, binding] = await Promise.all([
    getInviteFeatureFlags(),
    prisma.inviteCode.findUnique({ where: { userId } }),
    prisma.inviteBinding.findUnique({
      where: { inviteeUserId: userId },
      include: {
        inviteCode: {
          select: {
            code: true,
          },
        },
      },
    }),
  ]);

  const inviteCode = existingCode ?? (flags.programEnabled ? await ensureInviteCodeForUser(userId) : null);

  return {
    flags,
    inviteCode: inviteCode?.code ?? null,
    binding: binding
      ? {
          inviterUserId: binding.inviterUserId,
          inviterCode: binding.inviteCode.code,
          boundAt: binding.createdAt,
        }
      : null,
    canBind: flags.bindingEnabled && !binding,
  };
}

export async function bindInviteCodeForUser(userId: number, rawInviteCode: string) {
  const flags = await getInviteFeatureFlags();
  if (!flags.programEnabled || !flags.bindingEnabled) {
    throw new InviteError('INVITE_BINDING_DISABLED', '邀请码绑定暂未开启', 403);
  }

  const inviteCode = normalizeInviteCode(rawInviteCode);
  if (inviteCode.length < 4) {
    throw new InviteError('INVALID_INVITE_CODE', '邀请码格式不正确', 400);
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const existingBinding = await tx.inviteBinding.findUnique({
        where: { inviteeUserId: userId },
        include: {
          inviteCode: {
            select: {
              code: true,
            },
          },
        },
      });
      if (existingBinding) {
        throw new InviteError('ALREADY_BOUND', '当前账号已绑定邀请人，不能重复绑定', 409);
      }

      const inviterCode = await tx.inviteCode.findUnique({ where: { code: inviteCode } });
      if (!inviterCode || !inviterCode.active) {
        throw new InviteError('INVITE_CODE_NOT_FOUND', '邀请码不存在或已失效', 404);
      }
      if (inviterCode.userId === userId) {
        throw new InviteError('SELF_BIND_FORBIDDEN', '不能绑定自己的邀请码', 400);
      }

      return tx.inviteBinding.create({
        data: {
          inviterUserId: inviterCode.userId,
          inviteeUserId: userId,
          inviteCodeId: inviterCode.id,
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
  } catch (error) {
    if (error instanceof InviteError) throw error;
    if (isUniqueConstraintError(error, ['inviteeUserId', 'invitee_user_id'])) {
      throw new InviteError('ALREADY_BOUND', '当前账号已绑定邀请人，不能重复绑定', 409);
    }
    throw error;
  }
}

async function prepareInviteRewardGrants(orderId: string) {
  const [flags, balanceRewardConfigs] = await Promise.all([
    getInviteFeatureFlags(),
    getSystemConfigs(['INVITE_BALANCE_INVITER_REWARD_PERCENT', 'INVITE_BALANCE_INVITEE_REWARD_PERCENT']),
  ]);
  if (!flags.programEnabled || !flags.rewardEnabled) {
    return { reason: 'reward_disabled', grants: [] as Awaited<ReturnType<typeof prisma.inviteRewardGrant.findMany>> };
  }

  const balanceInviterPercent = normalizeRewardPercent(balanceRewardConfigs.INVITE_BALANCE_INVITER_REWARD_PERCENT);
  const balanceInviteePercent = normalizeRewardPercent(balanceRewardConfigs.INVITE_BALANCE_INVITEE_REWARD_PERCENT);

  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        userId: true,
        status: true,
        orderType: true,
        planId: true,
        paidAt: true,
        completedAt: true,
        creditAmount: true,
      },
    });

    if (!order || order.status !== 'COMPLETED' || (order.orderType !== 'subscription' && order.orderType !== 'balance')) {
      return {
        reason: 'order_not_eligible',
        grants: [] as Awaited<ReturnType<typeof prisma.inviteRewardGrant.findMany>>,
      };
    }

    const binding = await tx.inviteBinding.findUnique({ where: { inviteeUserId: order.userId } });
    if (!binding) {
      return { reason: 'user_not_bound', grants: [] as Awaited<ReturnType<typeof prisma.inviteRewardGrant.findMany>> };
    }
    if (order.paidAt && binding.createdAt > order.paidAt) {
      return {
        reason: 'binding_after_payment',
        grants: [] as Awaited<ReturnType<typeof prisma.inviteRewardGrant.findMany>>,
      };
    }

    let inviterAmount = 0;
    let inviteeAmount = 0;

    if (order.orderType === 'subscription') {
      if (!order.planId) {
        return {
          reason: 'order_not_eligible',
          grants: [] as Awaited<ReturnType<typeof prisma.inviteRewardGrant.findMany>>,
        };
      }

      const plan = await tx.subscriptionPlan.findUnique({
        where: { id: order.planId },
        select: {
          inviteRewardEnabled: true,
          inviterRewardAmount: true,
          inviteeRewardAmount: true,
        },
      });

      if (!plan || !plan.inviteRewardEnabled) {
        return {
          reason: 'plan_reward_disabled',
          grants: [] as Awaited<ReturnType<typeof prisma.inviteRewardGrant.findMany>>,
        };
      }

      inviterAmount = decimalToNumber(plan.inviterRewardAmount);
      inviteeAmount = decimalToNumber(plan.inviteeRewardAmount);
    } else {
      const baseCreditAmount = decimalToNumber(order.creditAmount) || 0;
      inviterAmount = calcRewardByPercent(baseCreditAmount, balanceInviterPercent);
      inviteeAmount = calcRewardByPercent(baseCreditAmount, balanceInviteePercent);

      if (inviterAmount <= 0 && inviteeAmount <= 0) {
        return {
          reason: 'balance_reward_disabled',
          grants: [] as Awaited<ReturnType<typeof prisma.inviteRewardGrant.findMany>>,
        };
      }
    }

    const rewardSpecs = [
      {
        role: InviteRewardRole.INVITER,
        recipientUserId: binding.inviterUserId,
        amount: inviterAmount,
      },
      {
        role: InviteRewardRole.INVITEE,
        recipientUserId: binding.inviteeUserId,
        amount: inviteeAmount,
      },
    ].filter((item) => item.amount > 0);

    if (rewardSpecs.length === 0) {
      return {
        reason: 'empty_reward_amount',
        grants: [] as Awaited<ReturnType<typeof prisma.inviteRewardGrant.findMany>>,
      };
    }

    const existing = await tx.inviteRewardGrant.findMany({ where: { orderId } });
    const existingRoles = new Set(existing.map((grant) => grant.role));

    for (const spec of rewardSpecs) {
      if (existingRoles.has(spec.role)) continue;

      await tx.inviteRewardGrant.create({
        data: {
          orderId,
          bindingId: binding.id,
          recipientUserId: spec.recipientUserId,
          role: spec.role,
          amount: new Prisma.Decimal(spec.amount.toFixed(2)),
          idempotencyKey: buildRewardIdempotencyKey(orderId, spec.role),
        },
      });
    }

    return {
      reason: null,
      grants: await tx.inviteRewardGrant.findMany({
        where: { orderId },
        orderBy: { createdAt: 'asc' },
      }),
    };
  });
}

export async function processInviteRewardsForOrder(orderId: string): Promise<void> {
  const prepared = await prepareInviteRewardGrants(orderId);
  if (prepared.grants.length === 0) {
    return;
  }

  for (const grant of prepared.grants) {
    if (grant.status === InviteRewardStatus.COMPLETED) {
      continue;
    }

    const lockResult = await prisma.inviteRewardGrant.updateMany({
      where: {
        id: grant.id,
        status: { in: [InviteRewardStatus.PENDING, InviteRewardStatus.FAILED] },
      },
      data: {
        status: InviteRewardStatus.PROCESSING,
        processingAt: new Date(),
        failedReason: null,
      },
    });

    if (lockResult.count === 0) {
      continue;
    }

    try {
      const amount = decimalToNumber(grant.amount);
      await addBalance(
        grant.recipientUserId,
        amount,
        `sub2apipay invite reward ${grant.role.toLowerCase()} order:${orderId}`,
        grant.idempotencyKey,
      );

      await prisma.inviteRewardGrant.update({
        where: { id: grant.id },
        data: {
          status: InviteRewardStatus.COMPLETED,
          completedAt: new Date(),
          failedReason: null,
        },
      });

      await prisma.auditLog.create({
        data: {
          orderId,
          action: 'INVITE_REWARD_GRANTED',
          detail: JSON.stringify({
            grantId: grant.id,
            role: grant.role,
            recipientUserId: grant.recipientUserId,
            amount,
          }),
          operator: 'system',
        },
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);

      await prisma.inviteRewardGrant.update({
        where: { id: grant.id },
        data: {
          status: InviteRewardStatus.FAILED,
          failedReason: reason,
        },
      });

      await prisma.auditLog.create({
        data: {
          orderId,
          action: 'INVITE_REWARD_FAILED',
          detail: JSON.stringify({
            grantId: grant.id,
            role: grant.role,
            recipientUserId: grant.recipientUserId,
            amount: decimalToNumber(grant.amount),
            reason,
          }),
          operator: 'system',
        },
      });
    }
  }

  const unfinished = await prisma.inviteRewardGrant.count({
    where: {
      orderId,
      status: {
        in: [InviteRewardStatus.PENDING, InviteRewardStatus.PROCESSING, InviteRewardStatus.FAILED],
      },
    },
  });

  if (unfinished > 0) {
    throw new InviteError('INVITE_REWARD_GRANT_FAILED', '邀请奖励发放未全部成功', 500);
  }
}
