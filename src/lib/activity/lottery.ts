import { randomInt } from 'crypto';
import { Prisma, type ActivityDrawRecord } from '@prisma/client';
import { prisma } from '@/lib/db';
import { getEnv } from '@/lib/config';
import {
  addBalance,
  getUserSubscriptions,
  getUserUsageStats,
  listPaymentOrders,
  listSubscriptionPlans,
} from '@/lib/sub2api/client';
import type { Sub2ApiPaymentOrder, Sub2ApiSubscription, Sub2ApiSubscriptionPlan } from '@/lib/sub2api/types';

export const LOTTERY_ACTIVITY_KEY = 'recharge-lottery-2026-08';
export const PACKAGE_USAGE_PER_CARD = 2400;
export const BALANCE_USAGE_PER_CARD = 2000;
export const LOTTERY_POOL_SIZE = 10_000;
const SUB2API_TIMEZONE = 'Asia/Shanghai';
const MONTH_CARD_KEYWORDS = ['轻享', '尊享'];

export type LotteryPrizeKey = 'balance_30' | 'balance_60' | 'balance_120' | 'balance_240' | 'redraw' | 'quota_reset';

export interface LotteryPrize {
  key: LotteryPrizeKey;
  name: string;
  amount: number;
  initialStock: number;
  manual: boolean;
  redraw: boolean;
  grand: boolean;
}

export const LOTTERY_PRIZES: readonly LotteryPrize[] = [
  { key: 'balance_30', name: '$30 额度', amount: 30, initialStock: 4_800, manual: false, redraw: false, grand: false },
  { key: 'balance_60', name: '$60 额度', amount: 60, initialStock: 3_000, manual: false, redraw: false, grand: false },
  {
    key: 'balance_120',
    name: '$120 额度',
    amount: 120,
    initialStock: 1_500,
    manual: false,
    redraw: false,
    grand: false,
  },
  {
    key: 'balance_240',
    name: '$240 额度',
    amount: 240,
    initialStock: 100,
    manual: false,
    redraw: false,
    grand: true,
  },
  { key: 'redraw', name: '再摇一次', amount: 0, initialStock: 590, manual: false, redraw: true, grand: false },
  { key: 'quota_reset', name: '免费重置额度', amount: 0, initialStock: 10, manual: true, redraw: false, grand: true },
];

const LEGACY_PRIZE_NAMES: Record<string, string> = {
  balance_2: '¥2 余额',
  balance_5: '¥5 余额',
  balance_10: '¥10 余额',
  balance_20: '¥20 余额',
  balance_50: '¥50 余额',
  subscription_reset: '套餐重置券',
};

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

export interface EarnedCardBreakdown {
  monthlyPurchases: number;
  packageUsageAmount: number;
  balanceUsageAmount: number;
}

export function calculateEarnedCards(input: EarnedCardBreakdown) {
  const monthlyCards = Math.max(0, Math.floor(input.monthlyPurchases));
  const packageCards = Math.max(0, Math.floor((input.packageUsageAmount + Number.EPSILON) / PACKAGE_USAGE_PER_CARD));
  const balanceCards = Math.max(0, Math.floor((input.balanceUsageAmount + Number.EPSILON) / BALANCE_USAGE_PER_CARD));
  return { monthlyCards, packageCards, balanceCards, total: monthlyCards + packageCards + balanceCards };
}

function parsePaidAt(order: Sub2ApiPaymentOrder): Date | null {
  if (!order.paid_at) return null;
  const paidAt = new Date(order.paid_at);
  return Number.isNaN(paidAt.getTime()) ? null : paidAt;
}

export function filterValidOrders(
  orders: Sub2ApiPaymentOrder[],
  userId: number,
  orderType: 'balance' | 'subscription',
  startAt: Date,
  endAt: Date,
): Sub2ApiPaymentOrder[] {
  return orders.filter((order) => {
    const paidAt = parsePaidAt(order);
    return (
      Number(order.user_id) === userId &&
      order.status?.toUpperCase() === 'COMPLETED' &&
      order.order_type?.toLowerCase() === orderType &&
      Number(order.refund_amount) === 0 &&
      Number(order.amount) > 0 &&
      paidAt !== null &&
      paidAt >= startAt &&
      paidAt < endAt
    );
  });
}

export function isGiftMonthPlan(plan: Sub2ApiSubscriptionPlan): boolean {
  const searchableName = `${plan.name} ${plan.product_name ?? ''}`.toLowerCase();
  const matchesName = MONTH_CARD_KEYWORDS.some((keyword) => searchableName.includes(keyword.toLowerCase()));
  const unit = plan.validity_unit.toLowerCase();
  const isMonthDuration =
    (unit === 'month' && plan.validity_days === 1) ||
    (unit === 'day' && plan.validity_days >= 28 && plan.validity_days <= 31);
  return matchesName && isMonthDuration;
}

export function buildEligiblePrizePool(input: {
  hasActiveSubscription: boolean;
  priorPrizeKeys: string[];
  awardedByPrize?: Readonly<Record<string, number>>;
}): LotteryPrize[] {
  const hasGrandPrize = input.priorPrizeKeys.some(
    (key) => LOTTERY_PRIZES.some((prize) => prize.key === key && prize.grand) || key === 'balance_50',
  );
  return LOTTERY_PRIZES.flatMap((prize) => {
    if (prize.key === 'quota_reset' && !input.hasActiveSubscription) return [];
    if (prize.grand && hasGrandPrize) return [];
    const remaining = Math.max(0, prize.initialStock - (input.awardedByPrize?.[prize.key] ?? 0));
    return remaining > 0 ? [{ ...prize, initialStock: remaining }] : [];
  });
}

export function pickWeightedPrize(pool: LotteryPrize[], randomValue?: number): LotteryPrize {
  const totalWeight = pool.reduce((sum, prize) => sum + prize.initialStock, 0);
  if (totalWeight <= 0) throw new ActivityError('PRIZE_POOL_EMPTY', '奖池已发放完毕', 409);
  let cursor = randomValue ?? randomInt(totalWeight);
  if (!Number.isInteger(cursor) || cursor < 0 || cursor >= totalWeight) {
    throw new ActivityError('INVALID_RANDOM_VALUE', '抽奖随机值无效', 500);
  }
  for (const prize of pool) {
    if (cursor < prize.initialStock) return prize;
    cursor -= prize.initialStock;
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

function formatDateInShanghai(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: SUB2API_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
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
      grand: prize?.grand ?? record.prizeKey === 'balance_50',
    },
    issueStatus: record.issueStatus,
    issuedAt: record.issuedAt,
    createdAt: record.createdAt,
  };
}

async function loadEligibility(userId: number, now = new Date()) {
  const { startAt, endAt } = getActivityWindow();
  const [orders, subscriptions, plans] = await Promise.all([
    loadUserOrders(userId),
    getUserSubscriptions(userId),
    listSubscriptionPlans(),
  ]);
  const monthPlans = plans.filter(isGiftMonthPlan);
  const monthPlanIds = new Set(monthPlans.map((plan) => plan.id));
  const monthGroupIds = [...new Set(monthPlans.map((plan) => plan.group_id).filter((id) => id > 0))];
  const subscriptionOrders = filterValidOrders(orders, userId, 'subscription', startAt, endAt);
  const monthlyPurchases = subscriptionOrders.filter(
    (order) => order.plan_id != null && monthPlanIds.has(order.plan_id),
  ).length;
  const startDate = formatDateInShanghai(startAt);
  const endDate = formatDateInShanghai(new Date(endAt.getTime() - 1));
  const [allPackageUsage, balanceUsage, ...monthGroupUsage] = await Promise.all([
    getUserUsageStats({
      user_id: userId,
      billing_type: 1,
      start_date: startDate,
      end_date: endDate,
      timezone: SUB2API_TIMEZONE,
    }),
    getUserUsageStats({
      user_id: userId,
      billing_type: 0,
      start_date: startDate,
      end_date: endDate,
      timezone: SUB2API_TIMEZONE,
    }),
    ...monthGroupIds.map((groupId) =>
      getUserUsageStats({
        user_id: userId,
        group_id: groupId,
        billing_type: 1,
        start_date: startDate,
        end_date: endDate,
        timezone: SUB2API_TIMEZONE,
      }),
    ),
  ]);
  const monthCardUsage = monthGroupUsage.reduce((sum, stats) => sum + stats.total_cost, 0);
  const packageUsageAmount = Number(Math.max(0, allPackageUsage.total_cost - monthCardUsage).toFixed(4));
  const balanceUsageAmount = Number(Math.max(0, balanceUsage.total_actual_cost).toFixed(4));
  const cards = calculateEarnedCards({ monthlyPurchases, packageUsageAmount, balanceUsageAmount });
  return {
    startAt,
    endAt,
    active: now >= startAt && now < endAt,
    hasActiveSubscription: subscriptions.some((subscription) => isActiveSubscription(subscription, now)),
    monthlyPurchases,
    packageUsageAmount,
    balanceUsageAmount,
    ...cards,
  };
}

export function countUsedCards(prizeKeys: string[]): number {
  return prizeKeys.filter((prizeKey) => prizeKey !== 'redraw').length;
}

function consumedCardCount(records: ActivityDrawRecord[]): number {
  return countUsedCards(records.map((record) => record.prizeKey));
}

async function loadPoolStats() {
  const awarded = await prisma.activityDrawRecord.groupBy({
    by: ['prizeKey'],
    where: { activityKey: LOTTERY_ACTIVITY_KEY, prizeKey: { in: LOTTERY_PRIZES.map((prize) => prize.key) } },
    _count: { _all: true },
  });
  const awardedByPrize = Object.fromEntries(awarded.map((item) => [item.prizeKey, item._count._all]));
  const awardedCount = LOTTERY_PRIZES.reduce((sum, prize) => sum + (awardedByPrize[prize.key] ?? 0), 0);
  return {
    initial: LOTTERY_POOL_SIZE,
    awarded: awardedCount,
    remaining: Math.max(0, LOTTERY_POOL_SIZE - awardedCount),
  };
}

export async function getLotteryActivityData(userId: number, now = new Date()) {
  const [eligibility, records, pool] = await Promise.all([
    loadEligibility(userId, now),
    prisma.activityDrawRecord.findMany({
      where: { activityKey: LOTTERY_ACTIVITY_KEY, userId },
      orderBy: { drawIndex: 'asc' },
    }),
    loadPoolStats(),
  ]);
  const env = getEnv();
  const usedCards = consumedCardCount(records);
  return {
    activity: {
      key: LOTTERY_ACTIVITY_KEY,
      name: '疯狂摇摇摇',
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
      packageUsagePerCard: PACKAGE_USAGE_PER_CARD,
      balanceUsagePerCard: BALANCE_USAGE_PER_CARD,
      adminContact: env.LOTTERY_ADMIN_CONTACT,
      voucherRedemptionDays: env.LOTTERY_VOUCHER_REDEMPTION_DAYS,
    },
    stats: {
      active: eligibility.active,
      earnedCards: eligibility.total,
      usedCards,
      availableCards: eligibility.active ? Math.max(0, eligibility.total - usedCards) : 0,
      hasActiveSubscription: eligibility.hasActiveSubscription,
      monthlyPurchases: eligibility.monthlyPurchases,
      monthlyCards: eligibility.monthlyCards,
      packageUsageAmount: eligibility.packageUsageAmount,
      packageCards: eligibility.packageCards,
      balanceUsageAmount: eligibility.balanceUsageAmount,
      balanceCards: eligibility.balanceCards,
    },
    pool,
    drawRecords: records.map(serializeRecord),
  };
}

async function issueBalance(record: ActivityDrawRecord): Promise<ActivityDrawRecord> {
  const prize = LOTTERY_PRIZES.find((item) => item.key === record.prizeKey);
  if (!prize || prize.manual || prize.redraw) return record;
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
    if (consumedCardCount(records) >= eligibility.total) {
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
