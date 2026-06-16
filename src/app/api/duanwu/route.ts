import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserByToken } from '@/lib/sub2api/client';
import { getDuanwuActivityData, ActivityError } from '@/lib/activity/duanwu';
import { resolveLocale } from '@/lib/locale';

export async function GET(request: NextRequest) {
  const locale = resolveLocale(request.nextUrl.searchParams.get('lang'));
  const token = request.nextUrl.searchParams.get('token')?.trim();
  if (!token) {
    return NextResponse.json(
      { error: locale === 'en' ? 'Missing token parameter' : '缺少 token 参数' },
      { status: 401 },
    );
  }

  try {
    const user = await getCurrentUserByToken(token);
    const data = await getDuanwuActivityData(user.id);
    return NextResponse.json({
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        balance: user.balance,
      },
      ...data,
    });
  } catch (error) {
    if (error instanceof ActivityError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.statusCode });
    }
    console.error('Get duanwu activity failed:', error);
    return NextResponse.json(
      { error: locale === 'en' ? 'Failed to load activity data' : '加载活动数据失败' },
      { status: 500 },
    );
  }
}
