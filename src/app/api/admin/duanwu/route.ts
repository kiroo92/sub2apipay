import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { verifyAdminToken, unauthorizedResponse } from '@/lib/admin-auth';
import { DUANWU_ACTIVITY_KEY, DUANWU_MIN_TOTAL_AMOUNT, DUANWU_START_AT, DUANWU_END_AT } from '@/lib/activity/duanwu';
import { ORDER_STATUS } from '@/lib/constants';

export async function GET(request: NextRequest) {
  if (!(await verifyAdminToken(request))) return unauthorizedResponse(request);

  const searchParams = request.nextUrl.searchParams;
  const page = Math.max(1, Number(searchParams.get('page') || '1'));
  const pageSize = Math.min(100, Math.max(1, Number(searchParams.get('page_size') || '20')));
  const prizeKey = searchParams.get('prizeKey')?.trim();
  const issueStatus = searchParams.get('issueStatus')?.trim();
  const keyword = searchParams.get('keyword')?.trim();

  const rechargeWhere: Prisma.OrderWhereInput = {
    orderType: 'balance',
    status: { in: [ORDER_STATUS.PAID, ORDER_STATUS.RECHARGING, ORDER_STATUS.COMPLETED] },
    paidAt: { gte: DUANWU_START_AT, lt: DUANWU_END_AT },
  };

  const where: Prisma.ActivityDrawRecordWhereInput = {
    activityKey: DUANWU_ACTIVITY_KEY,
  };
  if (prizeKey) where.prizeKey = prizeKey;
  if (issueStatus) where.issueStatus = issueStatus as 'PENDING' | 'ISSUED' | 'ISSUE_FAILED';
  if (keyword) {
    const maybeUserId = Number(keyword);
    where.OR = [
      Number.isFinite(maybeUserId) ? { userId: maybeUserId } : undefined,
      { prizeName: { contains: keyword, mode: 'insensitive' } },
    ].filter(Boolean) as Prisma.ActivityDrawRecordWhereInput[];
  }

  const [summaryAgg, recordCount, prizeGroups, issueGroups, records, total, qualifiedUsersAgg] = await Promise.all([
    prisma.activityDrawRecord.aggregate({
      where: { activityKey: DUANWU_ACTIVITY_KEY },
      _sum: { prizeAmount: true, totalRechargeAmount: true },
      _count: { _all: true },
    }),
    prisma.activityDrawRecord.count({ where: { activityKey: DUANWU_ACTIVITY_KEY } }),
    prisma.activityDrawRecord.groupBy({
      by: ['prizeKey', 'prizeName'],
      where: { activityKey: DUANWU_ACTIVITY_KEY },
      _count: { _all: true },
      _sum: { prizeAmount: true },
    }),
    prisma.activityDrawRecord.groupBy({
      by: ['issueStatus'],
      where: { activityKey: DUANWU_ACTIVITY_KEY },
      _count: { _all: true },
    }),
    prisma.activityDrawRecord.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        userId: true,
        rechargeOrderCount: true,
        totalRechargeAmount: true,
        prizeKey: true,
        prizeName: true,
        prizeAmount: true,
        issueStatus: true,
        issueError: true,
        issuedAt: true,
        createdAt: true,
      },
    }),
    prisma.activityDrawRecord.count({ where }),
    prisma.order.groupBy({
      by: ['userId'],
      where: rechargeWhere,
      _sum: { amount: true },
    }),
  ]);

  const qualifiedUsers = qualifiedUsersAgg.filter((row) => Number(row._sum.amount ?? 0) >= DUANWU_MIN_TOTAL_AMOUNT).length;
  const userIds = [...new Set(records.map((item) => item.userId))];
  const userOrdersAgg = await prisma.order.groupBy({
    by: ['userId'],
    where: userIds.length > 0 ? { ...rechargeWhere, userId: { in: userIds } } : { ...rechargeWhere, userId: -1 },
    _sum: { amount: true },
    _count: { _all: true },
  });
  const userInfo = await prisma.order.findMany({
    where: userIds.length > 0 ? { userId: { in: userIds } } : { userId: -1 },
    orderBy: { createdAt: 'desc' },
    distinct: ['userId'],
    select: {
      userId: true,
      userName: true,
      userEmail: true,
      userNotes: true,
    },
  });

  const userMetaMap = new Map(
    userInfo.map((item) => [
      item.userId,
      {
        userName: item.userName,
        userEmail: item.userEmail,
        userNotes: item.userNotes,
      },
    ]),
  );
  const orderAggMap = new Map(
    userOrdersAgg.map((item) => [
      item.userId,
      {
        totalRechargeAmount: Number(item._sum.amount ?? 0),
        rechargeOrderCount: item._count._all,
      },
    ]),
  );

  return NextResponse.json({
    activity: {
      key: DUANWU_ACTIVITY_KEY,
      startAt: DUANWU_START_AT,
      endAt: DUANWU_END_AT,
      minTotalAmount: DUANWU_MIN_TOTAL_AMOUNT,
    },
    summary: {
      participantCount: recordCount,
      qualifiedUserCount: qualifiedUsers,
      issuedRewardAmount: Number(summaryAgg._sum.prizeAmount ?? 0),
      participantRechargeAmount: Number(summaryAgg._sum.totalRechargeAmount ?? 0),
    },
    prizeStats: prizeGroups.map((group) => ({
      prizeKey: group.prizeKey,
      prizeName: group.prizeName,
      count: group._count._all,
      totalAmount: Number(group._sum.prizeAmount ?? 0),
    })),
    issueStats: issueGroups.map((group) => ({
      issueStatus: group.issueStatus,
      count: group._count._all,
    })),
    records: records.map((record) => {
      const userMeta = userMetaMap.get(record.userId);
      const orderAgg = orderAggMap.get(record.userId);
      return {
        id: record.id,
        userId: record.userId,
        userName: userMeta?.userName ?? null,
        userEmail: userMeta?.userEmail ?? null,
        userNotes: userMeta?.userNotes ?? null,
        rechargeOrderCount: orderAgg?.rechargeOrderCount ?? record.rechargeOrderCount,
        totalRechargeAmount: orderAgg?.totalRechargeAmount ?? Number(record.totalRechargeAmount),
        prizeKey: record.prizeKey,
        prizeName: record.prizeName,
        prizeAmount: Number(record.prizeAmount),
        issueStatus: record.issueStatus,
        issueError: record.issueError,
        issuedAt: record.issuedAt,
        createdAt: record.createdAt,
      };
    }),
    total,
    page,
    page_size: pageSize,
    total_pages: Math.ceil(total / pageSize),
  });
}
