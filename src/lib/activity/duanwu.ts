import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { addBalance, listPaymentOrders } from '@/lib/sub2api/client';
import { pickLocaleText, type Locale } from '@/lib/locale';
import type { Sub2ApiPaymentOrder } from '@/lib/sub2api/types';

export const DUANWU_ACTIVITY_KEY = 'duanwu-2026';
export const DUANWU_MIN_TOTAL_AMOUNT = 66.66;
export const DUANWU_START_AT = new Date('2026-05-31T16:00:00.000Z');
export const DUANWU_END_AT = new Date('2026-06-30T16:00:00.000Z');
const DUANWU_MID_TIER_FLOOR_AMOUNT = 100;
const DUANWU_HIGH_TIER_FLOOR_AMOUNT = 200;
const DUANWU_FIRST_PRIZE_MAX_WINNERS = 3;
const SUB2API_TIMEZONE = 'Asia/Shanghai';

export interface DuanwuPrize {
  key: 'third' | 'fourth' | 'second' | 'first';
  name: string;
  amount: number;
  weight: number;
}

export const DUANWU_PRIZES: DuanwuPrize[] = [
  { key: 'third', name: '三等奖', amount: 16.66, weight: 120 },
  { key: 'fourth', name: '四等奖', amount: 6.66, weight: 840 },
  { key: 'second', name: '二等奖', amount: 26.66, weight: 30 },
  { key: 'first', name: '一等奖', amount: 66.66, weight: 10 },
];

export interface RechargeOrder {
  id: string;
  userId: number;
  userName: string | null;
  userEmail: string | null;
  userNotes: string | null;
  amount: number;
  createdAt: Date | null;
  paidAt: Date | null;
  paymentType: string;
  status: string;
}

function msg(locale: Locale, zh: string, en: string) {
  return pickLocaleText(locale, zh, en);
}

function pickPrizeFromPool(pool: DuanwuPrize[], randomValue = Math.random()): DuanwuPrize {
  const total = pool.reduce((sum, prize) => sum + prize.weight, 0);
  let cursor = randomValue * total;
  for (const prize of pool) {
    cursor -= prize.weight;
    if (cursor < 0) return prize;
  }
  return pool[0];
}

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeRechargeOrder(raw: Sub2ApiPaymentOrder): RechargeOrder | null {
  const userId = Number(raw.user_id);
  if (!Number.isFinite(userId) || userId <= 0) return null;

  return {
    id: String(raw.id),
    userId,
    userName: raw.user_name ?? null,
    userEmail: raw.user_email ?? null,
    userNotes: raw.user_notes ?? null,
    amount: Number(raw.amount ?? 0),
    createdAt: parseDate(raw.created_at ?? null),
    paidAt: parseDate(raw.paid_at ?? null),
    paymentType: raw.payment_type ?? '',
    status: raw.status ?? '',
  };
}

function isPaidRechargeOrder(order: RechargeOrder): boolean {
  return order.amount > 0 && order.paidAt !== null;
}

async function fetchAllPaymentOrders(keyword?: string): Promise<RechargeOrder[]> {
  const pageSize = 100;
  let page = 1;
  const items: RechargeOrder[] = [];
  let totalPages = 1;

  do {
    const result = await listPaymentOrders({
      page,
      page_size: pageSize,
      timezone: SUB2API_TIMEZONE,
      keyword,
    });
    const normalized = result.items.map(normalizeRechargeOrder).filter(Boolean) as RechargeOrder[];
    items.push(...normalized.filter(isPaidRechargeOrder));
    totalPages = Math.max(1, result.total ? Math.ceil(result.total / result.page_size) : page);
    page += 1;
  } while (page <= totalPages);

  return items;
}

export async function loadRechargeOrders(userId: number): Promise<RechargeOrder[]> {
  const orders = await fetchAllPaymentOrders();
  return orders
    .filter((order) => order.userId === userId && order.paidAt && order.paidAt >= DUANWU_START_AT && order.paidAt < DUANWU_END_AT)
    .sort((a, b) => (b.paidAt?.getTime() ?? 0) - (a.paidAt?.getTime() ?? 0));
}

export async function loadAllDuanwuRechargeOrders(keyword?: string): Promise<RechargeOrder[]> {
  const orders = await fetchAllPaymentOrders(keyword);
  return orders.filter((order) => order.paidAt && order.paidAt >= DUANWU_START_AT && order.paidAt < DUANWU_END_AT);
}

export class ActivityError extends Error {
  code: string;
  statusCode: number;

  constructor(code: string, message: string, statusCode = 400) {
    super(message);
    this.name = 'ActivityError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

export async function getDuanwuActivityData(userId: number) {
  const [orders, record] = await Promise.all([
    loadRechargeOrders(userId),
    prisma.activityDrawRecord.findUnique({
      where: { activityKey_userId: { activityKey: DUANWU_ACTIVITY_KEY, userId } },
      select: {
        id: true,
        prizeKey: true,
        prizeName: true,
        prizeAmount: true,
        issueStatus: true,
        issueError: true,
        createdAt: true,
        issuedAt: true,
        rechargeOrderCount: true,
        totalRechargeAmount: true,
      },
    }),
  ]);

  const totalRechargeAmount = orders.reduce((sum, order) => sum + order.amount, 0);
  const eligible = totalRechargeAmount >= DUANWU_MIN_TOTAL_AMOUNT;

  return {
    activity: {
      key: DUANWU_ACTIVITY_KEY,
      name: '端午充值抽奖',
      minTotalAmount: DUANWU_MIN_TOTAL_AMOUNT,
      startAt: DUANWU_START_AT,
      endAt: DUANWU_END_AT,
      prizes: DUANWU_PRIZES.map((prize) => ({
        key: prize.key,
        name: prize.name,
        amount: prize.amount,
      })),
    },
    orders: orders.map((order) => ({
      id: order.id,
      amount: order.amount,
      createdAt: order.createdAt,
      paidAt: order.paidAt,
      paymentType: order.paymentType,
      status: order.status,
    })),
    drawRecord: record
      ? {
          id: record.id,
          prizeKey: record.prizeKey,
          prizeName: record.prizeName,
          prizeAmount: Number(record.prizeAmount),
          issueStatus: record.issueStatus,
          issueError: record.issueError,
          createdAt: record.createdAt,
          issuedAt: record.issuedAt,
          rechargeOrderCount: record.rechargeOrderCount,
          totalRechargeAmount: Number(record.totalRechargeAmount),
        }
      : null,
    stats: {
      paidRechargeCount: orders.length,
      totalRechargeAmount,
      eligible,
      hasDrawn: !!record,
      canDraw: eligible && (!record || record.issueStatus !== 'ISSUED'),
      canRetryIssue: record?.issueStatus === 'ISSUE_FAILED',
    },
  };
}

async function issuePrize(recordId: string, userId: number, prize: DuanwuPrize): Promise<void> {
  const notes = `sub2apipay ${DUANWU_ACTIVITY_KEY} user draw ${prize.name}`;
  const idempotencyKey = `sub2apipay:activity:${DUANWU_ACTIVITY_KEY}:${recordId}`;
  await addBalance(userId, prize.amount, notes, idempotencyKey);
}

async function assignPrizeForUser(userId: number, orders: RechargeOrder[], totalRechargeAmount: number): Promise<{
  record: Awaited<ReturnType<typeof prisma.activityDrawRecord.create>>;
}> {
  const hasHighTierFloor = totalRechargeAmount >= DUANWU_HIGH_TIER_FLOOR_AMOUNT;
  const hasMidTierFloor = totalRechargeAmount >= DUANWU_MID_TIER_FLOOR_AMOUNT;
  const basePool = hasHighTierFloor
    ? DUANWU_PRIZES.filter((prize) => prize.key === 'second' || prize.key === 'first')
    : hasMidTierFloor
      ? DUANWU_PRIZES.filter((prize) => prize.key !== 'third')
      : DUANWU_PRIZES;

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const pickedPrize = pickPrizeFromPool(basePool);
    const candidateSlots =
      pickedPrize.key === 'first'
        ? Array.from({ length: DUANWU_FIRST_PRIZE_MAX_WINNERS }, (_, index) => index + 1)
        : [null];

    for (const prizeSlot of candidateSlots) {
      try {
        const record = await prisma.activityDrawRecord.create({
          data: {
            activityKey: DUANWU_ACTIVITY_KEY,
            userId,
            rechargeOrderCount: orders.length,
            totalRechargeAmount: new Prisma.Decimal(totalRechargeAmount.toFixed(2)),
            prizeKey: pickedPrize.key,
            prizeSlot,
            prizeName: pickedPrize.name,
            prizeAmount: new Prisma.Decimal(pickedPrize.amount.toFixed(2)),
          },
        });
        return { record };
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
          throw error;
        }
      }
    }

    if (pickedPrize.key === 'first') {
      const fallbackPool = basePool.filter((prize) => prize.key !== 'first');
      if (fallbackPool.length === 0) throw new ActivityError('DRAW_FAILED', '无可用奖品名额', 500);
      const fallbackPrize = pickPrizeFromPool(fallbackPool);
      const record = await prisma.activityDrawRecord.create({
        data: {
          activityKey: DUANWU_ACTIVITY_KEY,
          userId,
          rechargeOrderCount: orders.length,
          totalRechargeAmount: new Prisma.Decimal(totalRechargeAmount.toFixed(2)),
          prizeKey: fallbackPrize.key,
          prizeSlot: null,
          prizeName: fallbackPrize.name,
          prizeAmount: new Prisma.Decimal(fallbackPrize.amount.toFixed(2)),
        },
      });
      return { record };
    }
  }

  throw new ActivityError('DRAW_FAILED', '抽奖名额分配失败', 500);
}

export async function drawDuanwuPrize(userId: number, locale: Locale = 'zh') {
  const orders = await loadRechargeOrders(userId);
  const totalRechargeAmount = orders.reduce((sum, order) => sum + order.amount, 0);

  if (totalRechargeAmount < DUANWU_MIN_TOTAL_AMOUNT) {
    throw new ActivityError(
      'TOTAL_NOT_ELIGIBLE',
      msg(
        locale,
        `2026 年 6 月累计充值未满 ${DUANWU_MIN_TOTAL_AMOUNT}，暂不可参与抽奖`,
        `June 2026 total recharge is below ${DUANWU_MIN_TOTAL_AMOUNT}, not eligible yet`,
      ),
      400,
    );
  }

  const existingRecord = await prisma.activityDrawRecord.findUnique({
    where: { activityKey_userId: { activityKey: DUANWU_ACTIVITY_KEY, userId } },
  });
  let record = existingRecord;
  const reissue = !!existingRecord && existingRecord.issueStatus !== 'ISSUED';

  if (!record) {
    try {
      record = (await assignPrizeForUser(userId, orders, totalRechargeAmount)).record;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        record = await prisma.activityDrawRecord.findUnique({
          where: { activityKey_userId: { activityKey: DUANWU_ACTIVITY_KEY, userId } },
        });
      } else {
        throw error;
      }
    }
  }

  if (!record) {
    throw new ActivityError('DRAW_FAILED', msg(locale, '创建抽奖记录失败', 'Failed to create draw record'), 500);
  }

  const finalRecord = record;
  const prize = DUANWU_PRIZES.find((item) => item.key === finalRecord.prizeKey);
  if (!prize) {
    throw new ActivityError('PRIZE_NOT_FOUND', msg(locale, '奖品配置不存在', 'Prize config not found'), 500);
  }

  if (finalRecord.issueStatus !== 'ISSUED') {
    try {
      await issuePrize(finalRecord.id, userId, prize);
    } catch (error) {
      const issueError = error instanceof Error ? error.message : String(error);
      await prisma.activityDrawRecord.update({
        where: { id: finalRecord.id },
        data: {
          issueStatus: 'ISSUE_FAILED',
          issueError,
        },
      });
      throw new ActivityError(
        'ISSUE_FAILED',
        msg(locale, '抽奖成功，但奖励发放失败，请稍后重试', 'Prize draw succeeded but reward issuing failed, please retry later'),
        502,
      );
    }

    record = await prisma.activityDrawRecord.update({
      where: { id: finalRecord.id },
      data: {
        issueStatus: 'ISSUED',
        issueError: null,
        issuedAt: finalRecord.issuedAt ?? new Date(),
      },
    });
  } else {
    record = finalRecord;
  }

  return {
    prize: {
      key: record.prizeKey,
      name: record.prizeName,
      amount: Number(record.prizeAmount),
    },
    issueStatus: record.issueStatus,
    issuedAt: record.issuedAt,
    alreadyDrawn: !!existingRecord,
    reissue,
  };
}
