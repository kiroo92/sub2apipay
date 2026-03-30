import { InviteRewardStatus, Prisma } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminToken, unauthorizedResponse } from '@/lib/admin-auth';
import { prisma } from '@/lib/db';
import { getUser, getInviteBindingsByUserId } from '@/lib/sub2api/client';

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
      { inviterUserId: userId },
      { inviteeUserId: userId },
      { order: { userId } },
    ],
  };

  const [
    user,
    upstreamBindings,
    receivedSummary,
    generatedForInviteesSummary,
    inviterSelfRewardSummary,
    recentRewards,
  ] = await Promise.all([
    getUser(userId).catch(() => null),
    getInviteBindingsByUserId(userId).catch(() => []),
    prisma.inviteRewardGrant.aggregate({
      where: { recipientUserId: userId, status: InviteRewardStatus.COMPLETED },
      _count: { _all: true },
      _sum: { amount: true },
    }),
    prisma.inviteRewardGrant.aggregate({
      where: {
        inviterUserId: userId,
        role: 'INVITEE',
        status: InviteRewardStatus.COMPLETED,
      },
      _count: { _all: true },
      _sum: { amount: true },
    }),
    prisma.inviteRewardGrant.aggregate({
      where: {
        inviterUserId: userId,
        role: 'INVITER',
        recipientUserId: userId,
        status: InviteRewardStatus.COMPLETED,
      },
      _count: { _all: true },
      _sum: { amount: true },
    }),
    prisma.inviteRewardGrant.findMany({
      where: involvementWhere,
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: {
        id: true,
        orderId: true,
        inviterUserId: true,
        inviteeUserId: true,
        inviteCode: true,
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
      },
    }),
  ]);

  const recentBindings = upstreamBindings
    .filter((binding) => binding.inviter_user_id === userId || binding.invitee_user_id === userId)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 100);

  const asInviterCount = upstreamBindings.filter((binding) => binding.inviter_user_id === userId).length;
  const asInviteeCount = upstreamBindings.filter((binding) => binding.invitee_user_id === userId).length;

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
      id: String(binding.id ?? `${binding.inviter_user_id}-${binding.invitee_user_id}`),
      inviterUserId: binding.inviter_user_id,
      inviteeUserId: binding.invitee_user_id,
      inviteCode: binding.invite_code,
      inviteCodeOwnerUserId: binding.invite_code_owner_user_id ?? null,
      createdAt: binding.created_at,
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
        inviterUserId: reward.inviterUserId,
        inviteeUserId: reward.inviteeUserId,
        inviteCode: reward.inviteCode,
      },
    })),
  });
}
