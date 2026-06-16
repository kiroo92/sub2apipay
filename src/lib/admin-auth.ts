import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { getEnv } from '@/lib/config';
import { resolveLocale } from '@/lib/locale';

export async function verifyAdminToken(request: NextRequest): Promise<boolean> {
  let token: string | null = null;
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) token = authHeader.slice(7).trim();
  if (!token) token = request.nextUrl.searchParams.get('token');
  if (!token) return false;

  const expected = Buffer.from(getEnv().ADMIN_TOKEN);
  const received = Buffer.from(token);
  if (expected.length !== received.length) return false;
  return crypto.timingSafeEqual(expected, received);
}

export function unauthorizedResponse(request?: NextRequest) {
  const locale = resolveLocale(request?.nextUrl.searchParams.get('lang'));
  return NextResponse.json({ error: locale === 'en' ? 'Unauthorized' : '未授权' }, { status: 401 });
}
