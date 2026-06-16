import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserByToken } from '@/lib/sub2api/client';
import { drawDuanwuPrize, ActivityError } from '@/lib/activity/duanwu';
import { resolveLocale } from '@/lib/locale';

export async function POST(request: NextRequest) {
  const locale = resolveLocale(request.nextUrl.searchParams.get('lang'));

  try {
    const body = await request.json();
    const token = typeof body?.token === 'string' ? body.token.trim() : '';
    if (!token) {
      return NextResponse.json(
        {
          error: locale === 'en' ? 'Invalid parameters' : '参数错误',
        },
        { status: 400 },
      );
    }

    const user = await getCurrentUserByToken(token);
    const result = await drawDuanwuPrize(user.id, locale);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ActivityError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.statusCode });
    }
    console.error('Draw duanwu prize failed:', error);
    return NextResponse.json(
      { error: locale === 'en' ? 'Failed to draw prize' : '抽奖失败' },
      { status: 500 },
    );
  }
}
