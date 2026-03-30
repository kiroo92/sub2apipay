import { Prisma } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUserByToken, getInviteBindingsByUserId } from '@/lib/sub2api/client';

const VALID_PAGE_SIZES = [10, 20, 50];

function toNumber(value: Prisma.Decimal | null | undefined): number {
  return value ? Number(value.toString()) : 0;
}

function resolvePage(raw: string | null, fallback: number = 1): number {
  const value = Number(raw || String(fallback));
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function resolvePageSize(raw: string | null, fallback: number = 10): number {
  const value = Number(raw || String(fallback));
  return VALID_PAGE_SIZES.includes(value) ? value : fallback;
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const token = searchParams.get('token')?.trim();
  if (!token) {
    return NextResponse.json({ error: '缺少 token' }, { status: 401 });
  }

  const bindingsPage = resolvePage(searchParams.get('bindings_page'));
  const bindingsPageSize = resolvePageSize(searchParams.get('bindings_page_size'));
  const rewardsPage = resolvePage(searchParams.get('rewards_page'));
  const rewardsPageSize = resolvePageSize(searchParams.get('rewards_page_size'));

  let user;
  try {
    user = await getCurrentUserByToken(token);
  } catch {
    return NextResponse.json({ error: '无效的 token' }, { status: 401 });
  }

  try {
    const rewardsWhere: Prisma.InviteRewardGrantWhereInput = {
      OR: [
        { recipientUserId: user.id },
        { inviterUserId: user.id },
        { inviteeUserId: user.id },
        { order: { userId: user.id } },
      ],
    };

    const [upstreamBindings, rewardsTotal, rewards, rewardSummary, completedRewardSummary] = await Promise.all([
      getInviteBindingsByUserId(user.id),
      prisma.inviteRewardGrant.count({ where: rewardsWhere }),
      prisma.inviteRewardGrant.findMany({
        where: rewardsWhere,
        orderBy: { createdAt: 'desc' },
        skip: (rewardsPage - 1) * rewardsPageSize,
        take: rewardsPageSize,
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
      prisma.inviteRewardGrant.aggregate({
        where: rewardsWhere,
        _count: { _all: true },
        _sum: { amount: true },
      }),
      prisma.inviteRewardGrant.aggregate({
        where: { ...rewardsWhere, status: 'COMPLETED' },
        _count: { _all: true },
        _sum: { amount: true },
      }),
    ]);

    const allBindings = upstreamBindings
      .filter((binding) => binding.inviter_user_id === user.id || binding.invitee_user_id === user.id)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    const bindingsTotal = allBindings.length;
    const bindings = allBindings.slice((bindingsPage - 1) * bindingsPageSize, bindingsPage * bindingsPageSize);
    const asInviterCount = allBindings.filter((binding) => binding.inviter_user_id === user.id).length;
    const asInviteeCount = allBindings.filter((binding) => binding.invitee_user_id === user.id).length;

    return NextResponse.json({
      userId: user.id,
      summary: {
        asInviterCount,
        asInviteeCount,
        bindingCount: bindingsTotal,
        rewardCount: rewardSummary._count._all,
        rewardAmount: toNumber(rewardSummary._sum.amount),
        completedRewardCount: completedRewardSummary._count._all,
        completedRewardAmount: toNumber(completedRewardSummary._sum.amount),
      },
      bindings: bindings.map((binding) => ({
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
      bindings_pagination: {
        page: bindingsPage,
        page_size: bindingsPageSize,
        total: bindingsTotal,
        total_pages: Math.max(1, Math.ceil(bindingsTotal / bindingsPageSize)),
      },
      rewards_pagination: {
        page: rewardsPage,
        page_size: rewardsPageSize,
        total: rewardsTotal,
        total_pages: Math.max(1, Math.ceil(rewardsTotal / rewardsPageSize)),
      },
    });
  } catch (error) {
    console.error('Failed to get invite activity:', error);
    return NextResponse.json({ error: '获取邀请记录失败' }, { status: 500 });
  }
}
