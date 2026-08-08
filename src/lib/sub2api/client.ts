import { getEnv } from '@/lib/config';
import type { Sub2ApiPaymentOrder, Sub2ApiSubscription, Sub2ApiUser } from './types';

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

function getHeaders(idempotencyKey?: string): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-api-key': getEnv().SUB2API_ADMIN_API_KEY,
  };
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
  return headers;
}

function isRetryableFetchError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return error.name === 'TimeoutError' || error.name === 'AbortError' || error.name === 'TypeError';
}

function normalizePaymentOrder(raw: Record<string, unknown>): Sub2ApiPaymentOrder {
  return {
    id: (raw.id as string | number | undefined) ?? String(raw.order_id ?? ''),
    user_id: toNumber(raw.user_id ?? raw.userId ?? (raw.user as { id?: number } | undefined)?.id),
    user_name: toNullableString(
      raw.user_name ?? raw.userName ?? (raw.user as { username?: string } | undefined)?.username,
    ),
    user_email: toNullableString(
      raw.user_email ?? raw.userEmail ?? raw.email ?? (raw.user as { email?: string } | undefined)?.email,
    ),
    user_notes: toNullableString(
      raw.user_notes ?? raw.userNotes ?? (raw.user as { notes?: string } | undefined)?.notes,
    ),
    amount: toNumber(raw.amount ?? raw.actual_amount ?? raw.pay_amount ?? raw.recharge_amount ?? raw.total_amount),
    status: toNullableString(raw.status),
    order_type: toNullableString(raw.order_type ?? raw.orderType),
    payment_type: toNullableString(raw.payment_type ?? raw.paymentType ?? raw.channel),
    refund_amount: toNumber(raw.refund_amount ?? raw.refundAmount),
    created_at: toNullableString(raw.created_at ?? raw.createdAt),
    paid_at: toNullableString(raw.paid_at ?? raw.paidAt ?? raw.payment_at ?? raw.paymentAt ?? raw.completed_at),
  };
}

export async function getCurrentUserByToken(token: string): Promise<Sub2ApiUser> {
  const env = getEnv();
  const response = await fetch(`${env.SUB2API_BASE_URL}/api/v1/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`Failed to get current user: ${response.status}`);
  }

  const data = await response.json();
  return data.data as Sub2ApiUser;
}

export async function listPaymentOrders(params?: {
  page?: number;
  page_size?: number;
  timezone?: string;
  keyword?: string;
  user_id?: number;
  status?: string;
  order_type?: string;
}): Promise<{ items: Sub2ApiPaymentOrder[]; total: number; page: number; page_size: number; pages?: number }> {
  const env = getEnv();
  const qs = new URLSearchParams();
  qs.set('page', String(params?.page ?? 1));
  qs.set('page_size', String(params?.page_size ?? 100));
  if (params?.timezone) qs.set('timezone', params.timezone);
  if (params?.keyword) qs.set('keyword', params.keyword);
  if (params?.user_id != null) qs.set('user_id', String(params.user_id));
  if (params?.status) qs.set('status', params.status);
  if (params?.order_type) qs.set('order_type', params.order_type);

  const response = await fetch(`${env.SUB2API_BASE_URL}/api/v1/admin/payment/orders?${qs.toString()}`, {
    headers: getHeaders(),
    signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`Failed to list payment orders: ${response.status}`);
  }

  const payload = await response.json();
  const candidates = [payload?.data?.data, payload?.data, payload].filter(
    (candidate) => candidate && Array.isArray(candidate.items),
  );
  const paginated = candidates[0] ?? {};
  const itemsRaw = Array.isArray(paginated?.items) ? paginated.items : [];

  return {
    items: itemsRaw.map((item: Record<string, unknown>) => normalizePaymentOrder(item)),
    total: Number(paginated?.total ?? itemsRaw.length ?? 0),
    page: Number(paginated?.page ?? params?.page ?? 1),
    page_size: Number(paginated?.page_size ?? params?.page_size ?? itemsRaw.length ?? 0),
    pages: Number(paginated?.pages ?? paginated?.total_pages ?? 0) || undefined,
  };
}

export async function getUserSubscriptions(userId: number): Promise<Sub2ApiSubscription[]> {
  const env = getEnv();
  const response = await fetch(`${env.SUB2API_BASE_URL}/api/v1/admin/users/${userId}/subscriptions`, {
    headers: getHeaders(),
    signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
  });

  if (response.status === 404) return [];
  if (!response.ok) throw new Error(`Failed to get user subscriptions: ${response.status}`);

  const payload = await response.json();
  const data = payload.data ?? payload;
  const items = Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : [];
  return items as Sub2ApiSubscription[];
}

export async function addBalance(userId: number, amount: number, notes: string, idempotencyKey: string): Promise<void> {
  const env = getEnv();
  const body = JSON.stringify({
    operation: 'add',
    balance: amount,
    notes,
  });

  let lastError: unknown;
  for (let attempt = 1; attempt <= RECHARGE_MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(`${env.SUB2API_BASE_URL}/api/v1/admin/users/${userId}/balance`, {
        method: 'POST',
        headers: getHeaders(idempotencyKey),
        body,
        signal: AbortSignal.timeout(RECHARGE_TIMEOUT_MS),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`Add balance failed (${response.status}): ${JSON.stringify(errorData)}`);
      }
      return;
    } catch (error) {
      lastError = error;
      if (attempt >= RECHARGE_MAX_ATTEMPTS || !isRetryableFetchError(error)) throw error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Add balance failed');
}
