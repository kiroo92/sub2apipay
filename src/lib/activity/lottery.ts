import { randomInt } from 'crypto';
import { Prisma, type ActivityDrawRecord } from '@prisma/client';
import { prisma } from '@/lib/db';
import { getEnv } from '@/lib/config';
import { addBalance, getUserSubscriptions, listPaymentOrders } from '@/lib/sub2api/client';
import type { Sub2ApiPaymentOrder, Sub2ApiSubscription } from '@/lib/sub2api/types';

export const LOTTERY_ACTIVITY_KEY = 'recharge-lottery-2026-08';
export const LOTTERY_MAX_DRAWS = 3;
const SUB2API_TIMEZONE = 'Asia/Shanghai';
const HIGH_RECHARGE_THRESHOLD = 1000;
export const LOTTERY_GUARANTEE_START_AT = '2026-08-01T00:00:00+08:00';

export interface LotteryPrize {
  key: 'balance_2' | 'balance_5' | 'balance_10' | 'balance_20' | 'balance_50' | 'subscription_reset';
  name: string;
  amount: number;
  weight: number;
  manual: boolean;
}

export const LOTTERY_PRIZES: readonly LotteryPrize[] = [
  { key: 'balance_2', name: '¥2 余额', amount: 2, weight: 2000, manual: false },
  { key: 'balance_5', name: '¥5 余额', amount: 5, weight: 7500, manual: false },
  { key: 'balance_10', name: '¥10 余额', amount: 10, weight: 400, manual: false },
  { key: 'balance_20', name: '¥20 余额', amount: 20, weight: 89, manual: false },
  { key: 'balance_50', name: '¥50 余额', amount: 50, weight: 10, manual: false },
  { key: 'subscription_reset', name: '套餐重置券', amount: 0, weight: 1, manual: true },
];

export class ActivityError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode = 400,
  ) {
    super(message);
    this.name = 'ActivityError';
  }
}

export function calculateEarnedDraws(totalRechargeAmount: number): number {
  if (totalRechargeAmount >= 200) return 3;
  if (totalRechargeAmount >= 100) return 2;
  if (totalRechargeAmount >= 20) return 1;
  return 0;
}

function parsePaidAt(order: Sub2ApiPaymentOrder): Date | null {
  if (!order.paid_at) return null;
  const paidAt = new Date(order.paid_at);
  return Number.isNaN(paidAt.getTime()) ? null : paidAt;
}

export function filterValidRechargeOrders(
  orders: Sub2ApiPaymentOrder[],
  userId: number,
  startAt: Date,
  endAt: Date,
): Sub2ApiPaymentOrder[] {
  return orders.filter((order) => {
    const paidAt = parsePaidAt(order);
    return (
      Number(order.user_id) === userId &&
      order.status?.toUpperCase() === 'COMPLETED' &&
      order.order_type?.toLowerCase() === 'balance' &&
      Number(order.refund_amount) === 0 &&
      Number(order.amount) > 0 &&
      paidAt !== null &&
      paidAt >= startAt &&
      paidAt < endAt
    );
  });
}

export function buildEligiblePrizePool(hasActiveSubscription: boolean): LotteryPrize[] {
  const pool = LOTTERY_PRIZES.map((prize) => ({ ...prize }));
  if (hasActiveSubscription) return pool;
  const five = pool.find((prize) => prize.key === 'balance_5');
  if (five) five.weight += 1;
  return pool.filter((prize) => prize.key !== 'subscription_reset');
}

export function pickWeightedPrize(pool: LotteryPrize[], randomValue?: number): LotteryPrize {
  const totalWeight = pool.reduce((sum, prize) => sum + prize.weight, 0);
  if (totalWeight <= 0) throw new ActivityError('PRIZE_POOL_EMPTY', '奖池暂不可用', 500);
  let cursor = randomValue ?? randomInt(totalWeight);
  if (!Number.isInteger(cursor) || cursor < 0 || cursor >= totalWeight) {
    throw new ActivityError('INVALID_RANDOM_VALUE', '抽奖随机值无效', 500);
  }
  for (const prize of pool) {
    if (cursor < prize.weight) return prize;
    cursor -= prize.weight;
  }
  return pool[pool.length - 1];
}

export function shouldGuaranteeFifty(guaranteeRechargeAmount: number, priorPrizeKeys: string[]): boolean {
  return guaranteeRechargeAmount > HIGH_RECHARGE_THRESHOLD && !priorPrizeKeys.includes('balance_50');
}

function isActiveSubscription(subscription: Sub2ApiSubscription, now: Date): boolean {
  const startsAt = new Date(subscription.starts_at);
  const expiresAt = new Date(subscription.expires_at);
  return (
    subscription.status.toLowerCase() === 'active' &&
    !Number.isNaN(startsAt.getTime()) &&
    !Number.isNaN(expiresAt.getTime()) &&
    startsAt <= now &&
    expiresAt > now
  );
}

async function loadUserOrders(userId: number): Promise<Sub2ApiPaymentOrder[]> {
  const pageSize = 100;
  const orders: Sub2ApiPaymentOrder[] = [];
  let page = 1;
  let pages = 1;
  do {
    const result = await listPaymentOrders({
      page,
      page_size: pageSize,
      timezone: SUB2API_TIMEZONE,
      user_id: userId,
      status: 'COMPLETED',
      order_type: 'balance',
    });
    orders.push(...result.items);
    pages = Math.max(1, Math.ceil(result.total / Math.max(1, result.page_size)));
    page += 1;
  } while (page <= pages);
  return orders;
}

function getActivityWindow() {
  const env = getEnv();
  return { startAt: new Date(env.LOTTERY_START_AT), endAt: new Date(env.LOTTERY_END_AT) };
}

function sumOrderAmounts(orders: Sub2ApiPaymentOrder[]): number {
  return Number(orders.reduce((sum, order) => sum + Number(order.amount), 0).toFixed(2));
}

function serializeRecord(record: ActivityDrawRecord) {
  const prize = LOTTERY_PRIZES.find((item) => item.key === record.prizeKey);
  return {
    id: record.id,
    requestId: record.requestId,
    drawIndex: record.drawIndex,
    prize: {
      key: record.prizeKey,
      name: prize?.name ?? record.prizeKey,
      amount: Number(record.prizeAmount),
      manual: prize?.manual ?? false,
    },
    issueStatus: record.issueStatus,
    issuedAt: record.issuedAt,
    createdAt: record.createdAt,
  };
}

async function loadEligibility(userId: number, now = new Date()) {
  const { startAt, endAt } = getActivityWindow();
  const guaranteeStartAt = new Date(LOTTERY_GUARANTEE_START_AT);
  const [orders, subscriptions] = await Promise.all([loadUserOrders(userId), getUserSubscriptions(userId)]);
  const activityOrders = filterValidRechargeOrders(orders, userId, startAt, endAt);
  const guaranteeOrders = filterValidRechargeOrders(orders, userId, guaranteeStartAt, now);
  const totalRechargeAmount = sumOrderAmounts(activityOrders);
  return {
    startAt,
    endAt,
    active: now >= startAt && now < endAt,
    totalRechargeAmount,
    guaranteeRechargeAmount: sumOrderAmounts(guaranteeOrders),
    earnedDraws: calculateEarnedDraws(totalRechargeAmount),
    hasActiveSubscription: subscriptions.some((subscription) => isActiveSubscription(subscription, now)),
  };
}

export async function getLotteryActivityData(userId: number, now = new Date()) {
  const [eligibility, records] = await Promise.all([
    loadEligibility(userId, now),
    prisma.activityDrawRecord.findMany({
      where: { activityKey: LOTTERY_ACTIVITY_KEY, userId },
      orderBy: { drawIndex: 'asc' },
    }),
  ]);
  const env = getEnv();
  const usedDraws = records.length;
  return {
    activity: {
      key: LOTTERY_ACTIVITY_KEY,
      name: '充值幸运大转盘',
      startAt: eligibility.startAt,
      endAt: eligibility.endAt,
      prizes: LOTTERY_PRIZES.map(({ key, name, amount }) => ({ key, name, amount })),
      thresholds: [20, 100, 200],
      maxDraws: LOTTERY_MAX_DRAWS,
      adminContact: env.LOTTERY_ADMIN_CONTACT,
      voucherRedemptionDays: env.LOTTERY_VOUCHER_REDEMPTION_DAYS,
    },
    stats: {
      active: eligibility.active,
      totalRechargeAmount: eligibility.totalRechargeAmount,
      earnedDraws: eligibility.earnedDraws,
      usedDraws,
      availableDraws: eligibility.active ? Math.max(0, eligibility.earnedDraws - usedDraws) : 0,
      hasActiveSubscription: eligibility.hasActiveSubscription,
    },
    drawRecords: records.map(serializeRecord),
  };
}

async function issueBalance(record: ActivityDrawRecord): Promise<ActivityDrawRecord> {
  const prize = LOTTERY_PRIZES.find((item) => item.key === record.prizeKey);
  if (!prize || prize.manual) return record;
  try {
    await addBalance(
      record.userId,
      Number(record.prizeAmount),
      `${LOTTERY_ACTIVITY_KEY} draw #${record.drawIndex}`,
      `sub2apipay:activity:lottery:${record.id}`,
    );
    return await prisma.activityDrawRecord.update({
      where: { id: record.id },
      data: { issueStatus: 'ISSUED', issueError: null, issuedAt: record.issuedAt ?? new Date() },
    });
  } catch (error) {
    return await prisma.activityDrawRecord.update({
      where: { id: record.id },
      data: { issueStatus: 'ISSUE_FAILED', issueError: error instanceof Error ? error.message : String(error) },
    });
  }
}

export async function drawLotteryPrize(userId: number, requestId: string, now = new Date()) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)) {
    throw new ActivityError('INVALID_REQUEST_ID', '请求编号无效');
  }
  const existing = await prisma.activityDrawRecord.findUnique({
    where: { activityKey_userId_requestId: { activityKey: LOTTERY_ACTIVITY_KEY, userId, requestId } },
  });
  if (existing) return { ...serializeRecord(existing), replayed: true };

  const eligibility = await loadEligibility(userId, now);
  if (!eligibility.active) throw new ActivityError('ACTIVITY_INACTIVE', '活动当前未开放', 409);

  const transactionResult = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`${LOTTERY_ACTIVITY_KEY}:${userId}`}))`;
    const replay = await tx.activityDrawRecord.findUnique({
      where: {
        activityKey_userId_requestId: { activityKey: LOTTERY_ACTIVITY_KEY, userId, requestId },
      },
    });
    if (replay) return { record: replay, replayed: true };

    const records = await tx.activityDrawRecord.findMany({
      where: { activityKey: LOTTERY_ACTIVITY_KEY, userId },
      orderBy: { drawIndex: 'asc' },
    });
    if (records.length >= LOTTERY_MAX_DRAWS || records.length >= eligibility.earnedDraws) {
      throw new ActivityError('NO_DRAW_AVAILABLE', '暂无可用抽奖次数', 409);
    }

    const guaranteed = shouldGuaranteeFifty(
      eligibility.guaranteeRechargeAmount,
      records.map((record) => record.prizeKey),
    );
    const prize = guaranteed
      ? LOTTERY_PRIZES.find((item) => item.key === 'balance_50')!
      : pickWeightedPrize(buildEligiblePrizePool(eligibility.hasActiveSubscription));
    const record = await tx.activityDrawRecord.create({
      data: {
        activityKey: LOTTERY_ACTIVITY_KEY,
        userId,
        requestId,
        drawIndex: records.length + 1,
        prizeKey: prize.key,
        prizeAmount: new Prisma.Decimal(prize.amount.toFixed(2)),
        prizeReason: guaranteed ? 'HIGH_RECHARGE_GUARANTEE' : 'RANDOM',
        issueStatus: prize.manual ? 'MANUAL_PENDING' : 'PENDING',
      },
    });
    return { record, replayed: false };
  });

  let record = transactionResult.record;
  if (!transactionResult.replayed && record.issueStatus === 'PENDING') record = await issueBalance(record);
  return { ...serializeRecord(record), replayed: transactionResult.replayed };
}

export async function retryLotteryIssue(drawId: string) {
  const record = await prisma.activityDrawRecord.findFirst({
    where: { id: drawId, activityKey: LOTTERY_ACTIVITY_KEY, issueStatus: { in: ['PENDING', 'ISSUE_FAILED'] } },
  });
  if (!record) throw new ActivityError('DRAW_NOT_RETRYABLE', '该记录不可重试', 409);
  return serializeRecord(await issueBalance(record));
}

export async function markLotteryVoucherRedeemed(drawId: string, note: string) {
  const trimmedNote = note.trim();
  if (!trimmedNote) throw new ActivityError('ADMIN_NOTE_REQUIRED', '必须填写处理备注');
  const record = await prisma.activityDrawRecord.findFirst({
    where: {
      id: drawId,
      activityKey: LOTTERY_ACTIVITY_KEY,
      prizeKey: 'subscription_reset',
      issueStatus: 'MANUAL_PENDING',
    },
  });
  if (!record) throw new ActivityError('VOUCHER_NOT_REDEEMABLE', '该重置券不可兑换', 409);
  return serializeRecord(
    await prisma.activityDrawRecord.update({
      where: { id: record.id },
      data: { issueStatus: 'MANUAL_REDEEMED', adminNote: trimmedNote, issuedAt: new Date() },
    }),
  );
}
