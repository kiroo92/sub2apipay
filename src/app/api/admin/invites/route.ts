import { InviteRewardStatus, Prisma } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminToken, unauthorizedResponse } from '@/lib/admin-auth';
import { prisma } from '@/lib/db';
import { listInviteBindings } from '@/lib/sub2api/client';

const ORDER_TYPES = new Set(['balance', 'subscription']);

function toNumber(value: Prisma.Decimal | null | undefined): number {
  return value ? Number(value.toString()) : 0;
}

export async function GET(request: NextRequest) {
  if (!(await verifyAdminToken(request))) return unauthorizedResponse(request);

  const searchParams = request.nextUrl.searchParams;
  const userIdRaw = searchParams.get('user_id')?.trim() || '';
  const inviteCode = searchParams.get('invite_code')?.trim().toUpperCase() || '';
  const orderTypeRaw = searchParams.get('order_type')?.trim() || '';
  const rewardStatusRaw = searchParams.get('reward_status')?.trim() || '';

  const userId = Number(userIdRaw);
  const hasUserId = Number.isInteger(userId) && userId > 0;
  const orderType = ORDER_TYPES.has(orderTypeRaw) ? orderTypeRaw : '';
  const rewardStatus = rewardStatusRaw in InviteRewardStatus ? (rewardStatusRaw as InviteRewardStatus) : undefined;

  const rewardWhere: Prisma.InviteRewardGrantWhereInput = {};
  if (hasUserId) {
    rewardWhere.OR = [
      { recipientUserId: userId },
      { inviterUserId: userId },
      { inviteeUserId: userId },
      { order: { userId } },
    ];
  }
  if (inviteCode) {
    rewardWhere.inviteCode = {
      contains: inviteCode,
      mode: 'insensitive',
    };
  }
  if (orderType) {
    rewardWhere.order = { is: { orderType } };
  }
  if (rewardStatus) {
    rewardWhere.status = rewardStatus;
  }

  const [bindingPage, rewardSummary, completedRewardSummary, failedRewardCount, pendingRewardCount, rewards] =
    await Promise.all([
      listInviteBindings({
        user_id: hasUserId ? userId : undefined,
        invite_code: inviteCode || undefined,
        page: 1,
        page_size: 100,
      }),
      prisma.inviteRewardGrant.aggregate({
        where: rewardWhere,
        _count: { _all: true },
        _sum: { amount: true },
      }),
      prisma.inviteRewardGrant.aggregate({
        where: { ...rewardWhere, status: InviteRewardStatus.COMPLETED },
        _count: { _all: true },
        _sum: { amount: true },
      }),
      prisma.inviteRewardGrant.count({
        where: { ...rewardWhere, status: InviteRewardStatus.FAILED },
      }),
      prisma.inviteRewardGrant.count({
        where: { ...rewardWhere, status: InviteRewardStatus.PENDING },
      }),
      prisma.inviteRewardGrant.findMany({
        where: rewardWhere,
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

  return NextResponse.json({
    filters: {
      userId: hasUserId ? userId : null,
      inviteCode: inviteCode || null,
      orderType: orderType || null,
      rewardStatus: rewardStatus ?? null,
    },
    summary: {
      bindingCount: bindingPage.total,
      rewardCount: rewardSummary._count._all,
      rewardAmount: toNumber(rewardSummary._sum.amount),
      completedRewardCount: completedRewardSummary._count._all,
      completedRewardAmount: toNumber(completedRewardSummary._sum.amount),
      failedRewardCount,
      pendingRewardCount,
    },
    bindings: bindingPage.items.map((binding) => ({
      id: String(binding.id ?? `${binding.inviter_user_id}-${binding.invitee_user_id}`),
      inviterUserId: binding.inviter_user_id,
      inviteeUserId: binding.invitee_user_id,
      inviteCode: binding.invite_code,
      inviteCodeOwnerUserId: binding.invite_code_owner_user_id ?? null,
      createdAt: binding.created_at,
    })),
    rewards: rewards.map((reward) => ({
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
