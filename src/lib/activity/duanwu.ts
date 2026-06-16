import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { addBalance } from '@/lib/sub2api/client';
import { ORDER_STATUS } from '@/lib/constants';
import { pickLocaleText, type Locale } from '@/lib/locale';

export const DUANWU_ACTIVITY_KEY = 'duanwu-2026';
export const DUANWU_MIN_TOTAL_AMOUNT = 66.66;
export const DUANWU_START_AT = new Date('2026-05-31T16:00:00.000Z');
export const DUANWU_END_AT = new Date('2026-06-30T16:00:00.000Z');
const DUANWU_HIGH_TIER_FLOOR_AMOUNT = 200;
const DUANWU_FIRST_PRIZE_MAX_WINNERS = 3;

export interface DuanwuPrize {
  key: 'third' | 'second' | 'first';
  name: string;
  amount: number;
  weight: number;
}

export const DUANWU_PRIZES: DuanwuPrize[] = [
  { key: 'third', name: '三等奖', amount: 6.66, weight: 960 },
  { key: 'second', name: '二等奖', amount: 26.66, weight: 30 },
  { key: 'first', name: '一等奖', amount: 66.66, weight: 10 },
];

type RechargeOrder = {
  id: string;
  amount: Prisma.Decimal;
  createdAt: Date;
  paidAt: Date | null;
  paymentType: string;
  status: string;
};

function msg(locale: Locale, zh: string, en: string) {
  return pickLocaleText(locale, zh, en);
}

function toNumber(value: Prisma.Decimal | number | null | undefined): number {
  return Number(value ?? 0);
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

async function loadRechargeOrders(userId: number): Promise<RechargeOrder[]> {
  return prisma.order.findMany({
    where: {
      userId,
      orderType: 'balance',
      status: { in: [ORDER_STATUS.PAID, ORDER_STATUS.RECHARGING, ORDER_STATUS.COMPLETED] },
      paidAt: {
        not: null,
        gte: DUANWU_START_AT,
        lt: DUANWU_END_AT,
      },
    },
    orderBy: [{ paidAt: 'desc' }, { createdAt: 'desc' }],
    select: {
      id: true,
      amount: true,
      createdAt: true,
      paidAt: true,
      paymentType: true,
      status: true,
    },
  });
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

  const totalRechargeAmount = orders.reduce((sum, order) => sum + toNumber(order.amount), 0);
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
      amount: toNumber(order.amount),
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
          prizeAmount: toNumber(record.prizeAmount),
          issueStatus: record.issueStatus,
          issueError: record.issueError,
          createdAt: record.createdAt,
          issuedAt: record.issuedAt,
          rechargeOrderCount: record.rechargeOrderCount,
          totalRechargeAmount: toNumber(record.totalRechargeAmount),
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
  const basePool = hasHighTierFloor
    ? DUANWU_PRIZES.filter((prize) => prize.key !== 'third')
    : DUANWU_PRIZES;

  const firstPrize = DUANWU_PRIZES.find((prize) => prize.key === 'first');
  if (!firstPrize) {
    throw new ActivityError('PRIZE_NOT_FOUND', '一等奖配置不存在', 500);
  }

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
      if (fallbackPool.length === 0) {
        throw new ActivityError('DRAW_FAILED', '无可用奖品名额', 500);
      }
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
  const totalRechargeAmount = orders.reduce((sum, order) => sum + toNumber(order.amount), 0);

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
      amount: toNumber(record.prizeAmount),
    },
    issueStatus: record.issueStatus,
    issuedAt: record.issuedAt,
    alreadyDrawn: !!existingRecord,
    reissue,
  };
}
