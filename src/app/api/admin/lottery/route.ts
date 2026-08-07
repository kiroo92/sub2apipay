import { NextRequest, NextResponse } from 'next/server';
import type { ActivityRewardStatus } from '@prisma/client';
import { prisma } from '@/lib/db';
import { verifyAdminToken, unauthorizedResponse } from '@/lib/admin-auth';
import {
  ActivityError,
  LOTTERY_ACTIVITY_KEY,
  LOTTERY_PRIZES,
  markLotteryVoucherRedeemed,
  retryLotteryIssue,
} from '@/lib/activity/lottery';

export async function GET(request: NextRequest) {
  if (!(await verifyAdminToken(request))) return unauthorizedResponse(request);
  const page = Math.max(1, Number(request.nextUrl.searchParams.get('page') || 1));
  const pageSize = Math.min(100, Math.max(1, Number(request.nextUrl.searchParams.get('page_size') || 20)));
  const requestedStatus = request.nextUrl.searchParams.get('issueStatus')?.trim() as ActivityRewardStatus | undefined;
  const statuses: ActivityRewardStatus[] = ['PENDING', 'ISSUED', 'ISSUE_FAILED', 'MANUAL_PENDING', 'MANUAL_REDEEMED'];
  const issueStatus = requestedStatus && statuses.includes(requestedStatus) ? requestedStatus : undefined;
  const where = { activityKey: LOTTERY_ACTIVITY_KEY, ...(issueStatus ? { issueStatus } : {}) };
  const [records, total, prizeGroups, issueStats, grandPrizeUsers, issuedTotals] = await Promise.all([
    prisma.activityDrawRecord.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.activityDrawRecord.count({ where }),
    prisma.activityDrawRecord.groupBy({
      by: ['prizeKey'],
      where: { activityKey: LOTTERY_ACTIVITY_KEY },
      _count: { _all: true },
      _sum: { prizeAmount: true },
    }),
    prisma.activityDrawRecord.groupBy({
      by: ['issueStatus'],
      where: { activityKey: LOTTERY_ACTIVITY_KEY },
      _count: { _all: true },
    }),
    prisma.activityDrawRecord.findMany({
      where: { activityKey: LOTTERY_ACTIVITY_KEY, prizeKey: { in: ['balance_240', 'quota_reset', 'balance_50'] } },
      select: { userId: true },
      distinct: ['userId'],
    }),
    prisma.activityDrawRecord.aggregate({
      where: { activityKey: LOTTERY_ACTIVITY_KEY, issueStatus: 'ISSUED' },
      _sum: { prizeAmount: true },
    }),
  ]);
  const groupedByPrize = Object.fromEntries(prizeGroups.map((item) => [item.prizeKey, item]));
  return NextResponse.json({
    summary: {
      totalDraws: prizeGroups.reduce((sum, item) => sum + item._count._all, 0),
      issuedAmount: Number(issuedTotals._sum.prizeAmount ?? 0),
      grandPrizeUsers: grandPrizeUsers.length,
    },
    prizeStats: LOTTERY_PRIZES.map((prize) => {
      const item = groupedByPrize[prize.key];
      const count = item?._count._all ?? 0;
      return {
        prizeKey: prize.key,
        count,
        totalAmount: Number(item?._sum.prizeAmount ?? 0),
        initialStock: prize.initialStock,
        remainingStock: prize.initialStock === null ? null : Math.max(0, prize.initialStock - count),
      };
    }),
    issueStats: issueStats.map((item) => ({ issueStatus: item.issueStatus, count: item._count._all })),
    records: records.map((record) => ({ ...record, prizeAmount: Number(record.prizeAmount), issueError: undefined })),
    page,
    page_size: pageSize,
    total,
    total_pages: Math.ceil(total / pageSize),
  });
}

export async function POST(request: NextRequest) {
  if (!(await verifyAdminToken(request))) return unauthorizedResponse(request);
  try {
    const body = await request.json();
    const drawId = typeof body?.drawId === 'string' ? body.drawId.trim() : '';
    if (!drawId) throw new ActivityError('DRAW_ID_REQUIRED', '缺少抽奖记录编号');
    if (body.action === 'retry_issue') return NextResponse.json(await retryLotteryIssue(drawId));
    if (body.action === 'mark_redeemed')
      return NextResponse.json(await markLotteryVoucherRedeemed(drawId, String(body.note ?? '')));
    throw new ActivityError('INVALID_ACTION', '不支持的管理操作');
  } catch (error) {
    if (error instanceof ActivityError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.statusCode });
    }
    console.error('Lottery admin action failed:', error);
    return NextResponse.json({ error: '管理操作失败', code: 'ADMIN_ACTION_FAILED' }, { status: 500 });
  }
}
