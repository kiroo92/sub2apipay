import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { verifyAdminToken, unauthorizedResponse } from '@/lib/admin-auth';
import {
  DUANWU_ACTIVITY_KEY,
  DUANWU_MIN_TOTAL_AMOUNT,
  DUANWU_START_AT,
  DUANWU_END_AT,
  loadAllDuanwuRechargeOrders,
} from '@/lib/activity/duanwu';

export async function GET(request: NextRequest) {
  if (!(await verifyAdminToken(request))) return unauthorizedResponse(request);

  const searchParams = request.nextUrl.searchParams;
  const page = Math.max(1, Number(searchParams.get('page') || '1'));
  const pageSize = Math.min(100, Math.max(1, Number(searchParams.get('page_size') || '20')));
  const prizeKey = searchParams.get('prizeKey')?.trim();
  const issueStatus = searchParams.get('issueStatus')?.trim();
  const rawKeyword = searchParams.get('keyword')?.trim() || '';
  const keyword = rawKeyword.toLowerCase();

  const [allRechargeOrders, recordCount, prizeGroups, issueGroups] = await Promise.all([
    rawKeyword
      ? loadAllDuanwuRechargeOrders(rawKeyword)
      : loadAllDuanwuRechargeOrders(),
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
  ]);

  const rechargeMap = new Map<
    number,
    {
      userId: number;
      userName: string | null;
      userEmail: string | null;
      userNotes: string | null;
      rechargeOrderCount: number;
      totalRechargeAmount: number;
    }
  >();

  for (const order of allRechargeOrders) {
    const current = rechargeMap.get(order.userId) ?? {
      userId: order.userId,
      userName: order.userName,
      userEmail: order.userEmail,
      userNotes: order.userNotes,
      rechargeOrderCount: 0,
      totalRechargeAmount: 0,
    };
    current.rechargeOrderCount += 1;
    current.totalRechargeAmount += order.amount;
    if (!current.userName && order.userName) current.userName = order.userName;
    if (!current.userEmail && order.userEmail) current.userEmail = order.userEmail;
    if (!current.userNotes && order.userNotes) current.userNotes = order.userNotes;
    rechargeMap.set(order.userId, current);
  }

  const qualifiedUsers = [...rechargeMap.values()].filter((item) => item.totalRechargeAmount >= DUANWU_MIN_TOTAL_AMOUNT).length;

  const recordWhere = {
    activityKey: DUANWU_ACTIVITY_KEY,
    ...(prizeKey ? { prizeKey } : {}),
    ...(issueStatus ? { issueStatus: issueStatus as 'PENDING' | 'ISSUED' | 'ISSUE_FAILED' } : {}),
  };

  const allRecords = await prisma.activityDrawRecord.findMany({
    where: recordWhere,
    orderBy: { createdAt: 'desc' },
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
  });

  const enrichedRecords = allRecords
    .map((record) => {
      const recharge = rechargeMap.get(record.userId);
      return {
        id: record.id,
        userId: record.userId,
        userName: recharge?.userName ?? null,
        userEmail: recharge?.userEmail ?? null,
        userNotes: recharge?.userNotes ?? null,
        rechargeOrderCount: recharge?.rechargeOrderCount ?? record.rechargeOrderCount,
        totalRechargeAmount: recharge?.totalRechargeAmount ?? Number(record.totalRechargeAmount),
        prizeKey: record.prizeKey,
        prizeName: record.prizeName,
        prizeAmount: Number(record.prizeAmount),
        issueStatus: record.issueStatus,
        issueError: record.issueError,
        issuedAt: record.issuedAt,
        createdAt: record.createdAt,
      };
    })
    .filter((record) => {
      if (!keyword) return true;
      return String(record.userId).includes(keyword) || record.prizeName.toLowerCase().includes(keyword);
    });

  const pagedRecords = enrichedRecords.slice((page - 1) * pageSize, page * pageSize);

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
      issuedRewardAmount: prizeGroups.reduce((sum, group) => sum + Number(group._sum.prizeAmount ?? 0), 0),
      participantRechargeAmount: [...rechargeMap.values()].reduce((sum, item) => sum + item.totalRechargeAmount, 0),
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
    records: pagedRecords,
    total: enrichedRecords.length,
    page,
    page_size: pageSize,
    total_pages: Math.ceil(enrichedRecords.length / pageSize),
  });
}
