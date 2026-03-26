import { InviteRewardStatus, Prisma } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminToken, unauthorizedResponse } from '@/lib/admin-auth';
import { prisma } from '@/lib/db';
import { getUser } from '@/lib/sub2api/client';

function toNumber(value: Prisma.Decimal | null | undefined): number {
  return value ? Number(value.toString()) : 0;
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ userId: string }> },
) {
  if (!(await verifyAdminToken(request))) return unauthorizedResponse(request);

  const { userId: userIdRaw } = await context.params;
  const userId = Number(userIdRaw);
  if (!Number.isInteger(userId) || userId <= 0) {
    return NextResponse.json({ error: '无效的用户 ID' }, { status: 400 });
  }

  const involvementWhere: Prisma.InviteRewardGrantWhereInput = {
    OR: [
      { recipientUserId: userId },
      { binding: { inviterUserId: userId } },
      { binding: { inviteeUserId: userId } },
      { order: { userId } },
    ],
  };

  const [
    user,
    asInviterCount,
    asInviteeCount,
    receivedSummary,
    generatedForInviteesSummary,
    inviterSelfRewardSummary,
    recentBindings,
    recentRewards,
  ] = await Promise.all([
    getUser(userId).catch(() => null),
    prisma.inviteBinding.count({ where: { inviterUserId: userId } }),
    prisma.inviteBinding.count({ where: { inviteeUserId: userId } }),
    prisma.inviteRewardGrant.aggregate({
      where: { recipientUserId: userId, status: InviteRewardStatus.COMPLETED },
      _count: { _all: true },
      _sum: { amount: true },
    }),
    prisma.inviteRewardGrant.aggregate({
      where: {
        binding: { inviterUserId: userId },
        role: 'INVITEE',
        status: InviteRewardStatus.COMPLETED,
      },
      _count: { _all: true },
      _sum: { amount: true },
    }),
    prisma.inviteRewardGrant.aggregate({
      where: {
        binding: { inviterUserId: userId },
        role: 'INVITER',
        recipientUserId: userId,
        status: InviteRewardStatus.COMPLETED,
      },
      _count: { _all: true },
      _sum: { amount: true },
    }),
    prisma.inviteBinding.findMany({
      where: {
        OR: [{ inviterUserId: userId }, { inviteeUserId: userId }],
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        inviterUserId: true,
        inviteeUserId: true,
        createdAt: true,
        inviteCode: {
          select: {
            code: true,
            userId: true,
          },
        },
      },
    }),
    prisma.inviteRewardGrant.findMany({
      where: involvementWhere,
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: {
        id: true,
        orderId: true,
        recipientUserId: true,
        role: true,
        amount: true,
        status: true,
        failedReason: true,
        processingAt: true,
        completedAt: true,
        createdAt: true,
        order: {
          select: {
            orderType: true,
            userId: true,
            paymentType: true,
            amount: true,
            creditAmount: true,
            status: true,
            paidAt: true,
            completedAt: true,
          },
        },
        binding: {
          select: {
            inviterUserId: true,
            inviteeUserId: true,
            inviteCode: {
              select: {
                code: true,
              },
            },
          },
        },
      },
    }),
  ]);

  return NextResponse.json({
    userId,
    user: user
      ? {
          id: user.id,
          username: user.username ?? null,
          email: user.email ?? null,
          notes: user.notes ?? null,
          displayName: user.username ?? null,
          status: user.status ?? null,
          balance: typeof user.balance === 'number' ? user.balance : null,
        }
      : null,
    summary: {
      asInviterCount,
      asInviteeCount,
      receivedRewardCount: receivedSummary._count._all,
      receivedRewardAmount: toNumber(receivedSummary._sum.amount),
      generatedInviteeRewardCount: generatedForInviteesSummary._count._all,
      generatedInviteeRewardAmount: toNumber(generatedForInviteesSummary._sum.amount),
      inviterSelfRewardCount: inviterSelfRewardSummary._count._all,
      inviterSelfRewardAmount: toNumber(inviterSelfRewardSummary._sum.amount),
    },
    bindings: recentBindings.map((binding) => ({
      id: binding.id,
      inviterUserId: binding.inviterUserId,
      inviteeUserId: binding.inviteeUserId,
      inviteCode: binding.inviteCode.code,
      inviteCodeOwnerUserId: binding.inviteCode.userId,
      createdAt: binding.createdAt,
    })),
    rewards: recentRewards.map((reward) => ({
      id: reward.id,
      orderId: reward.orderId,
      recipientUserId: reward.recipientUserId,
      role: reward.role,
      amount: toNumber(reward.amount),
      status: reward.status,
      failedReason: reward.failedReason,
      processingAt: reward.processingAt,
      completedAt: reward.completedAt,
      createdAt: reward.createdAt,
      order: {
        orderType: reward.order.orderType,
        userId: reward.order.userId,
        paymentType: reward.order.paymentType,
        amount: toNumber(reward.order.amount),
        creditAmount: toNumber(reward.order.creditAmount),
        status: reward.order.status,
        paidAt: reward.order.paidAt,
        completedAt: reward.order.completedAt,
      },
      binding: {
        inviterUserId: reward.binding.inviterUserId,
        inviteeUserId: reward.binding.inviteeUserId,
        inviteCode: reward.binding.inviteCode.code,
      },
    })),
  });
}
