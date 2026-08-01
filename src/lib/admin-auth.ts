import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getEnv } from '@/lib/config';
import { resolveLocale } from '@/lib/locale';

export async function verifyAdminToken(request: NextRequest): Promise<boolean> {
  const authorization = request.headers.get('authorization');
  const token = authorization?.startsWith('Bearer ')
    ? authorization.slice(7).trim()
    : request.nextUrl.searchParams.get('token')?.trim();
  if (!token) return false;
  const expected = Buffer.from(getEnv().ADMIN_TOKEN);
  const received = Buffer.from(token);
  return expected.length === received.length && crypto.timingSafeEqual(expected, received);
}

export function unauthorizedResponse(request?: NextRequest) {
  const locale = resolveLocale(request?.nextUrl.searchParams.get('lang'));
  return NextResponse.json({ error: locale === 'en' ? 'Unauthorized' : '未授权' }, { status: 401 });
}
