export interface InviteBindingInfo {
  inviterUserId: number;
  inviteCode: string;
  boundAt: string;
}

export interface InviteSummary {
  programEnabled: boolean;
  bindingEnabled: boolean;
  rewardEnabled: boolean;
  ownInviteCode: string | null;
  binding: InviteBindingInfo | null;
}

function toBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
  }
  return false;
}

function normalizeBinding(raw: unknown): InviteBindingInfo | null {
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as Record<string, unknown>;
  const inviterUserId = Number(data.inviterUserId);
  if (!Number.isFinite(inviterUserId) || inviterUserId <= 0) return null;

  const inviteCode =
    (typeof data.inviteCode === 'string' && data.inviteCode.trim()) ||
    (typeof data.inviterCode === 'string' && data.inviterCode.trim()) ||
    '';

  return {
    inviterUserId,
    inviteCode,
    boundAt: typeof data.boundAt === 'string' ? data.boundAt : new Date().toISOString(),
  };
}

export function normalizeInviteSummary(raw: unknown): InviteSummary | null {
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as Record<string, unknown>;
  const flags = (data.flags && typeof data.flags === 'object' ? data.flags : null) as Record<string, unknown> | null;

  const programEnabled = toBoolean(data.programEnabled ?? flags?.programEnabled);
  const bindingEnabled = toBoolean(data.bindingEnabled ?? flags?.bindingEnabled ?? data.canBind);
  const rewardEnabled = toBoolean(data.rewardEnabled ?? flags?.rewardEnabled);
  const ownInviteCode =
    (typeof data.ownInviteCode === 'string' && data.ownInviteCode.trim()) ||
    (typeof data.inviteCode === 'string' && data.inviteCode.trim()) ||
    null;

  return {
    programEnabled,
    bindingEnabled,
    rewardEnabled,
    ownInviteCode,
    binding: normalizeBinding(data.binding),
  };
}

async function parseJsonSafe(response: Response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function extractErrorMessage(payload: unknown, fallback: string): string {
  if (payload && typeof payload === 'object') {
    const data = payload as Record<string, unknown>;
    if (typeof data.error === 'string' && data.error.trim()) return data.error;
    if (typeof data.message === 'string' && data.message.trim()) return data.message;
    if (typeof data.code === 'string' && data.code.trim()) return data.code;
  }
  return fallback;
}

export async function fetchInviteSummaryCompat(token: string, userId?: number | null): Promise<InviteSummary | null> {
  if (!token) return null;

  if (userId && Number.isFinite(userId) && userId > 0) {
    const userRes = await fetch(
      `/api/user?user_id=${encodeURIComponent(String(userId))}&token=${encodeURIComponent(token)}`,
    );
    if (userRes.ok) {
      const userData = await parseJsonSafe(userRes);
      const normalized = normalizeInviteSummary(
        userData && typeof userData === 'object' ? (userData as Record<string, unknown>).invite : null,
      );
      if (normalized) return normalized;
    }
  }

  const legacyRes = await fetch(`/api/invite-code?token=${encodeURIComponent(token)}`);
  if (!legacyRes.ok) return null;
  const legacyData = await parseJsonSafe(legacyRes);
  return normalizeInviteSummary(
    legacyData && typeof legacyData === 'object'
      ? ((legacyData as Record<string, unknown>).invite ?? legacyData)
      : null,
  );
}

export async function bindInviteCodeCompat(token: string, inviteCode: string): Promise<InviteBindingInfo> {
  const body = JSON.stringify({ token, invite_code: inviteCode });
  const routes = ['/api/invite/bind', '/api/invite-code/bind'];

  const lastError = 'Failed to bind invite code';

  for (const route of routes) {
    const response = await fetch(route, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });

    if (response.status === 404 || response.status === 405) {
      continue;
    }

    const payload = await parseJsonSafe(response);

    if (!response.ok) {
      throw new Error(extractErrorMessage(payload, lastError));
    }

    const binding = normalizeBinding(
      payload && typeof payload === 'object' ? (payload as Record<string, unknown>).binding : null,
    );

    if (!binding) {
      throw new Error('Invite binding succeeded but returned an invalid payload');
    }

    return binding;
  }

  throw new Error(lastError);
}
