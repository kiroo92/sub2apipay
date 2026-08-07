import { randomInt } from 'crypto';
import { Prisma, type ActivityDrawRecord } from '@prisma/client';
import { prisma } from '@/lib/db';
import { getEnv } from '@/lib/config';
import { addBalance, getUserSubscriptions, listPaymentOrders } from '@/lib/sub2api/client';
import type { Sub2ApiPaymentOrder, Sub2ApiSubscription } from '@/lib/sub2api/types';

export const LOTTERY_ACTIVITY_KEY = 'recharge-lottery-2026-08';
export const LOTTERY_FIRST_CARD_RECHARGE = 20;
export const LOTTERY_ADDITIONAL_CARD_RECHARGE = 100;
const SUB2API_TIMEZONE = 'Asia/Shanghai';

export type LotteryPrizeKey = 'balance_2' | 'balance_5' | 'balance_10' | 'balance_20' | 'balance_50' | 'quota_reset';

export interface LotteryPrize {
  key: LotteryPrizeKey;
  name: string;
  amount: number;
  initialStock: number | null;
  weight: number;
  manual: boolean;
  redraw: boolean;
  grand: boolean;
}

export const LOTTERY_PRIZES: readonly LotteryPrize[] = [
  {
    key: 'balance_2',
    name: '$2 额度',
    amount: 2,
    initialStock: null,
    weight: 5_910,
    manual: false,
    redraw: false,
    grand: false,
  },
  {
    key: 'balance_5',
    name: '$5 额度',
    amount: 5,
    initialStock: null,
    weight: 3_000,
    manual: false,
    redraw: false,
    grand: false,
  },
  {
    key: 'balance_10',
    name: '$10 额度',
    amount: 10,
    initialStock: null,
    weight: 1_000,
    manual: false,
    redraw: false,
    grand: false,
  },
  {
    key: 'balance_20',
    name: '$20 额度',
    amount: 20,
    initialStock: null,
    weight: 80,
    manual: false,
    redraw: false,
    grand: false,
  },
  {
    key: 'balance_50',
    name: '$50 额度',
    amount: 50,
    initialStock: 5,
    weight: 5,
    manual: false,
    redraw: false,
    grand: true,
  },
  {
    key: 'quota_reset',
    name: '订阅重置卡',
    amount: 0,
    initialStock: 5,
    weight: 5,
    manual: true,
    redraw: false,
    grand: true,
  },
];

const LEGACY_PRIZE_NAMES: Record<string, string> = {
  balance_30: '$30 额度',
  balance_60: '$60 额度',
  balance_120: '$120 额度',
  balance_240: '$240 额度',
  redraw: '再摇一次',
  subscription_reset: '套餐重置券',
};

const LEGACY_GRAND_PRIZE_KEYS = new Set(['balance_50', 'balance_240', 'quota_reset', 'subscription_reset']);

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

export function calculateEarnedCards(totalRechargeAmount: number): number {
  if (!Number.isFinite(totalRechargeAmount) || totalRechargeAmount < LOTTERY_FIRST_CARD_RECHARGE) return 0;
  return (
    1 +
    Math.floor((totalRechargeAmount - LOTTERY_FIRST_CARD_RECHARGE + Number.EPSILON) / LOTTERY_ADDITIONAL_CARD_RECHARGE)
  );
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

export function buildEligiblePrizePool(input: {
  hasActiveSubscription: boolean;
  priorPrizeKeys: string[];
  awardedByPrize?: Readonly<Record<string, number>>;
}): LotteryPrize[] {
  const hasGrandPrize = input.priorPrizeKeys.some(
    (key) => LOTTERY_PRIZES.some((prize) => prize.key === key && prize.grand) || LEGACY_GRAND_PRIZE_KEYS.has(key),
  );
  return LOTTERY_PRIZES.flatMap((prize) => {
    if (prize.key === 'quota_reset' && !input.hasActiveSubscription) return [];
    if (prize.grand && hasGrandPrize) return [];
    const awarded = input.awardedByPrize?.[prize.key] ?? 0;
    if (prize.initialStock !== null) {
      const remaining = Math.max(0, prize.initialStock - awarded);
      return remaining > 0 ? [{ ...prize, initialStock: remaining, weight: remaining }] : [];
    }
    return [{ ...prize }];
  });
}

export function pickWeightedPrize(pool: LotteryPrize[], randomValue?: number): LotteryPrize {
  const totalWeight = pool.reduce((sum, prize) => sum + prize.weight, 0);
  if (totalWeight <= 0) throw new ActivityError('PRIZE_POOL_EMPTY', '奖池已发放完毕', 409);
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
      name: prize?.name ?? LEGACY_PRIZE_NAMES[record.prizeKey] ?? record.prizeKey,
      amount: Number(record.prizeAmount),
      manual: prize?.manual ?? record.prizeKey === 'subscription_reset',
      redraw: prize?.redraw ?? false,
      grand: prize?.grand ?? LEGACY_GRAND_PRIZE_KEYS.has(record.prizeKey),
    },
    issueStatus: record.issueStatus,
    issuedAt: record.issuedAt,
    createdAt: record.createdAt,
  };
}

async function loadEligibility(userId: number, now = new Date()) {
  const { startAt, endAt } = getActivityWindow();
  const [orders, subscriptions] = await Promise.all([loadUserOrders(userId), getUserSubscriptions(userId)]);
  const totalRechargeAmount = sumOrderAmounts(filterValidRechargeOrders(orders, userId, startAt, endAt));
  return {
    startAt,
    endAt,
    active: now >= startAt && now < endAt,
    hasActiveSubscription: subscriptions.some((subscription) => isActiveSubscription(subscription, now)),
    totalRechargeAmount,
    earnedCards: calculateEarnedCards(totalRechargeAmount),
  };
}

export function countUsedCards(prizeKeys: string[]): number {
  return prizeKeys.filter((prizeKey) => prizeKey !== 'redraw').length;
}

function consumedCardCount(records: ActivityDrawRecord[]): number {
  return countUsedCards(records.map((record) => record.prizeKey));
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
  const usedCards = consumedCardCount(records);
  return {
    activity: {
      key: LOTTERY_ACTIVITY_KEY,
      name: '充值幸运大转盘',
      startAt: eligibility.startAt,
      endAt: eligibility.endAt,
      prizes: LOTTERY_PRIZES.map(({ key, name, amount, manual, redraw, grand }) => ({
        key,
        name,
        amount,
        manual,
        redraw,
        grand,
      })),
      firstCardRecharge: LOTTERY_FIRST_CARD_RECHARGE,
      additionalCardRecharge: LOTTERY_ADDITIONAL_CARD_RECHARGE,
      adminContact: env.LOTTERY_ADMIN_CONTACT,
      voucherRedemptionDays: env.LOTTERY_VOUCHER_REDEMPTION_DAYS,
    },
    stats: {
      active: eligibility.active,
      totalRechargeAmount: eligibility.totalRechargeAmount,
      earnedCards: eligibility.earnedCards,
      usedCards,
      availableCards: eligibility.active ? Math.max(0, eligibility.earnedCards - usedCards) : 0,
      hasActiveSubscription: eligibility.hasActiveSubscription,
    },
    drawRecords: records.map(serializeRecord),
  };
}

async function issueBalance(record: ActivityDrawRecord): Promise<ActivityDrawRecord> {
  const prize = LOTTERY_PRIZES.find((item) => item.key === record.prizeKey);
  if (prize?.manual || prize?.redraw || !record.prizeKey.startsWith('balance_') || Number(record.prizeAmount) <= 0) {
    return record;
  }
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
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`${LOTTERY_ACTIVITY_KEY}:pool`}))`;
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`${LOTTERY_ACTIVITY_KEY}:${userId}`}))`;
    const replay = await tx.activityDrawRecord.findUnique({
      where: {
        activityKey_userId_requestId: { activityKey: LOTTERY_ACTIVITY_KEY, userId, requestId },
      },
    });
    if (replay) return { record: replay, replayed: true };

    const [records, awarded] = await Promise.all([
      tx.activityDrawRecord.findMany({
        where: { activityKey: LOTTERY_ACTIVITY_KEY, userId },
        orderBy: { drawIndex: 'asc' },
      }),
      tx.activityDrawRecord.groupBy({
        by: ['prizeKey'],
        where: { activityKey: LOTTERY_ACTIVITY_KEY, prizeKey: { in: LOTTERY_PRIZES.map((prize) => prize.key) } },
        _count: { _all: true },
      }),
    ]);
    if (consumedCardCount(records) >= eligibility.earnedCards) {
      throw new ActivityError('NO_CARD_AVAILABLE', '暂无可用摇摇卡', 409);
    }

    const awardedByPrize = Object.fromEntries(awarded.map((item) => [item.prizeKey, item._count._all]));
    const prize = pickWeightedPrize(
      buildEligiblePrizePool({
        hasActiveSubscription: eligibility.hasActiveSubscription,
        priorPrizeKeys: records.map((record) => record.prizeKey),
        awardedByPrize,
      }),
    );
    const immediate = prize.redraw;
    const record = await tx.activityDrawRecord.create({
      data: {
        activityKey: LOTTERY_ACTIVITY_KEY,
        userId,
        requestId,
        drawIndex: (records.at(-1)?.drawIndex ?? 0) + 1,
        prizeKey: prize.key,
        prizeAmount: new Prisma.Decimal(prize.amount.toFixed(2)),
        prizeReason: 'RANDOM',
        issueStatus: prize.manual ? 'MANUAL_PENDING' : immediate ? 'ISSUED' : 'PENDING',
        issuedAt: immediate ? new Date() : null,
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
      prizeKey: { in: ['quota_reset', 'subscription_reset'] },
      issueStatus: 'MANUAL_PENDING',
    },
  });
  if (!record) throw new ActivityError('VOUCHER_NOT_REDEEMABLE', '该重置奖励不可兑换', 409);
  return serializeRecord(
    await prisma.activityDrawRecord.update({
      where: { id: record.id },
      data: { issueStatus: 'MANUAL_REDEEMED', adminNote: trimmedNote, issuedAt: new Date() },
    }),
  );
}
