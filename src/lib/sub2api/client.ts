import { getEnv } from '@/lib/config';
import { getSystemConfig } from '@/lib/system-config';
import type {
  Sub2ApiUser,
  Sub2ApiRedeemCode,
  Sub2ApiGroup,
  Sub2ApiSubscription,
  Sub2ApiPaymentOrder,
} from './types';

const DEFAULT_TIMEOUT_MS = 10_000;
const RECHARGE_TIMEOUT_MS = 30_000;
const RECHARGE_MAX_ATTEMPTS = 2;

function toNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function toNullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function normalizePaymentOrder(raw: Record<string, unknown>): Sub2ApiPaymentOrder {
  return {
    id: (raw.id as string | number | undefined) ?? String(raw.order_id ?? ''),
    user_id: toNumber(raw.user_id ?? raw.userId ?? (raw.user as { id?: number } | undefined)?.id),
    user_name: toNullableString(raw.user_name ?? raw.userName ?? (raw.user as { username?: string } | undefined)?.username),
    user_email: toNullableString(raw.user_email ?? raw.userEmail ?? (raw.user as { email?: string } | undefined)?.email),
    user_notes: toNullableString(raw.user_notes ?? raw.userNotes ?? (raw.user as { notes?: string } | undefined)?.notes),
    amount: toNumber(raw.amount ?? raw.actual_amount ?? raw.pay_amount ?? raw.recharge_amount ?? raw.total_amount),
    status: toNullableString(raw.status),
    payment_type: toNullableString(raw.payment_type ?? raw.paymentType ?? raw.channel),
    created_at: toNullableString(raw.created_at ?? raw.createdAt),
    paid_at: toNullableString(raw.paid_at ?? raw.paidAt ?? raw.payment_at ?? raw.paymentAt ?? raw.completed_at),
  };
}

async function getHeaders(idempotencyKey?: string): Promise<Record<string, string>> {
  const dbValue = await getSystemConfig('SUB2API_ADMIN_API_KEY');
  const apiKey = dbValue?.trim() || getEnv().SUB2API_ADMIN_API_KEY;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-api-key': apiKey,
  };
  if (idempotencyKey) {
    headers['Idempotency-Key'] = idempotencyKey;
  }
  return headers;
}

function isRetryableFetchError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return error.name === 'TimeoutError' || error.name === 'AbortError' || error.name === 'TypeError';
}

export async function getCurrentUserByToken(token: string): Promise<Sub2ApiUser> {
  const env = getEnv();
  const response = await fetch(`${env.SUB2API_BASE_URL}/api/v1/auth/me`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`Failed to get current user: ${response.status}`);
  }

  const data = await response.json();
  return data.data as Sub2ApiUser;
}

export async function getUser(userId: number): Promise<Sub2ApiUser> {
  const env = getEnv();
  const response = await fetch(`${env.SUB2API_BASE_URL}/api/v1/admin/users/${userId}`, {
    headers: await getHeaders(),
    signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
  });

  if (!response.ok) {
    if (response.status === 404) throw new Error('USER_NOT_FOUND');
    throw new Error(`Failed to get user: ${response.status}`);
  }

  const data = await response.json();
  return data.data as Sub2ApiUser;
}

export async function listPaymentOrders(params?: {
  page?: number;
  page_size?: number;
  timezone?: string;
  keyword?: string;
}): Promise<{ items: Sub2ApiPaymentOrder[]; total: number; page: number; page_size: number }> {
  const env = getEnv();
  const qs = new URLSearchParams();
  qs.set('page', String(params?.page ?? 1));
  qs.set('page_size', String(params?.page_size ?? 100));
  if (params?.timezone) qs.set('timezone', params.timezone);
  if (params?.keyword) qs.set('keyword', params.keyword);

  const response = await fetch(`${env.SUB2API_BASE_URL}/api/v1/admin/payment/orders?${qs.toString()}`, {
    headers: await getHeaders(),
    signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`Failed to list payment orders: ${response.status}`);
  }

  const payload = await response.json();
  const data = payload.data ?? payload;
  const paginated = data?.items ? data : data?.data?.items ? data.data : data;
  const itemsRaw = Array.isArray(paginated?.items) ? paginated.items : [];

  return {
    items: itemsRaw.map((item: Record<string, unknown>) => normalizePaymentOrder(item)),
    total: Number(paginated?.total ?? itemsRaw.length ?? 0),
    page: Number(paginated?.page ?? params?.page ?? 1),
    page_size: Number(paginated?.page_size ?? params?.page_size ?? itemsRaw.length ?? 0),
  };
}

export async function createAndRedeem(
  code: string,
  value: number,
  userId: number,
  notes: string,
  options?: { type?: 'balance' | 'subscription'; groupId?: number; validityDays?: number },
): Promise<Sub2ApiRedeemCode> {
  const env = getEnv();
  const url = `${env.SUB2API_BASE_URL}/api/v1/admin/redeem-codes/create-and-redeem`;
  const body = JSON.stringify({
    code,
    type: options?.type ?? 'balance',
    value,
    user_id: userId,
    notes,
    ...(options?.type === 'subscription' && {
      group_id: options.groupId,
      validity_days: options.validityDays,
    }),
  });

  let lastError: unknown;

  for (let attempt = 1; attempt <= RECHARGE_MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: await getHeaders(`sub2apipay:recharge:${code}`),
        body,
        signal: AbortSignal.timeout(RECHARGE_TIMEOUT_MS),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`Recharge failed (${response.status}): ${JSON.stringify(errorData)}`);
      }

      const data = await response.json();
      return data.redeem_code as Sub2ApiRedeemCode;
    } catch (error) {
      lastError = error;
      if (attempt >= RECHARGE_MAX_ATTEMPTS || !isRetryableFetchError(error)) {
        throw error;
      }
      console.warn(`Sub2API createAndRedeem attempt ${attempt} timed out, retrying...`);
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Recharge failed');
}

// ── 分组 API ──

export async function getAllGroups(): Promise<Sub2ApiGroup[]> {
  const env = getEnv();
  const response = await fetch(`${env.SUB2API_BASE_URL}/api/v1/admin/groups/all`, {
    headers: await getHeaders(),
    signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`Failed to get groups: ${response.status}`);
  }

  const data = await response.json();
  return (data.data ?? []) as Sub2ApiGroup[];
}

export async function getGroup(groupId: number): Promise<Sub2ApiGroup | null> {
  const env = getEnv();
  const response = await fetch(`${env.SUB2API_BASE_URL}/api/v1/admin/groups/${groupId}`, {
    headers: await getHeaders(),
    signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
  });

  if (!response.ok) {
    if (response.status === 404) return null;
    throw new Error(`Failed to get group ${groupId}: ${response.status}`);
  }

  const data = await response.json();
  return data.data as Sub2ApiGroup;
}

// ── 订阅 API ──

export async function assignSubscription(
  userId: number,
  groupId: number,
  validityDays: number,
  notes?: string,
  idempotencyKey?: string,
): Promise<Sub2ApiSubscription> {
  const env = getEnv();
  const response = await fetch(`${env.SUB2API_BASE_URL}/api/v1/admin/subscriptions/assign`, {
    method: 'POST',
    headers: await getHeaders(idempotencyKey),
    body: JSON.stringify({
      user_id: userId,
      group_id: groupId,
      validity_days: validityDays,
      notes: notes || `Sub2ApiPay subscription order`,
    }),
    signal: AbortSignal.timeout(RECHARGE_TIMEOUT_MS),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(`Assign subscription failed (${response.status}): ${JSON.stringify(errorData)}`);
  }

  const data = await response.json();
  return data.data as Sub2ApiSubscription;
}

export async function getUserSubscriptions(userId: number): Promise<Sub2ApiSubscription[]> {
  const env = getEnv();
  const response = await fetch(`${env.SUB2API_BASE_URL}/api/v1/admin/users/${userId}/subscriptions`, {
    headers: await getHeaders(),
    signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
  });

  if (!response.ok) {
    if (response.status === 404) return [];
    throw new Error(`Failed to get user subscriptions: ${response.status}`);
  }

  const data = await response.json();
  return (data.data ?? []) as Sub2ApiSubscription[];
}

export async function extendSubscription(subscriptionId: number, days: number, idempotencyKey?: string): Promise<void> {
  const env = getEnv();
  const response = await fetch(`${env.SUB2API_BASE_URL}/api/v1/admin/subscriptions/${subscriptionId}/extend`, {
    method: 'POST',
    headers: await getHeaders(idempotencyKey),
    body: JSON.stringify({ days }),
    signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(`Extend subscription failed (${response.status}): ${JSON.stringify(errorData)}`);
  }
}

// ── 余额 API ──

export async function subtractBalance(
  userId: number,
  amount: number,
  notes: string,
  idempotencyKey: string,
): Promise<void> {
  const env = getEnv();
  const response = await fetch(`${env.SUB2API_BASE_URL}/api/v1/admin/users/${userId}/balance`, {
    method: 'POST',
    headers: await getHeaders(idempotencyKey),
    body: JSON.stringify({
      operation: 'subtract',
      balance: amount,
      notes,
    }),
    signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(`Subtract balance failed (${response.status}): ${JSON.stringify(errorData)}`);
  }
}

// ── 用户搜索 API ──

export async function searchUsers(
  keyword: string,
): Promise<{ id: number; email: string; username: string; notes?: string }[]> {
  const env = getEnv();
  const response = await fetch(
    `${env.SUB2API_BASE_URL}/api/v1/admin/users?search=${encodeURIComponent(keyword)}&page=1&page_size=30`,
    {
      headers: await getHeaders(),
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
    },
  );

  if (!response.ok) {
    throw new Error(`Failed to search users: ${response.status}`);
  }

  const data = await response.json();
  const paginated = data.data ?? {};
  return (paginated.items ?? []) as { id: number; email: string; username: string; notes?: string }[];
}

export async function listSubscriptions(params?: {
  user_id?: number;
  group_id?: number;
  status?: string;
  page?: number;
  page_size?: number;
}): Promise<{ subscriptions: Sub2ApiSubscription[]; total: number; page: number; page_size: number }> {
  const env = getEnv();
  const qs = new URLSearchParams();
  if (params?.user_id != null) qs.set('user_id', String(params.user_id));
  if (params?.group_id != null) qs.set('group_id', String(params.group_id));
  if (params?.status) qs.set('status', params.status);
  if (params?.page != null) qs.set('page', String(params.page));
  if (params?.page_size != null) qs.set('page_size', String(params.page_size));

  const response = await fetch(`${env.SUB2API_BASE_URL}/api/v1/admin/subscriptions?${qs}`, {
    headers: await getHeaders(),
    signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`Failed to list subscriptions: ${response.status}`);
  }

  const data = await response.json();
  const paginated = data.data ?? {};
  return {
    subscriptions: (paginated.items ?? []) as Sub2ApiSubscription[],
    total: paginated.total ?? 0,
    page: paginated.page ?? 1,
    page_size: paginated.page_size ?? 50,
  };
}

export async function addBalance(userId: number, amount: number, notes: string, idempotencyKey: string): Promise<void> {
  const env = getEnv();
  const response = await fetch(`${env.SUB2API_BASE_URL}/api/v1/admin/users/${userId}/balance`, {
    method: 'POST',
    headers: await getHeaders(idempotencyKey),
    body: JSON.stringify({
      operation: 'add',
      balance: amount,
      notes,
    }),
    signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(`Add balance failed (${response.status}): ${JSON.stringify(errorData)}`);
  }
}
