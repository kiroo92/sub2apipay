import { NextRequest, NextResponse } from 'next/server';
import { ActivityError, getLotteryActivityData } from '@/lib/activity/lottery';
import { getCurrentUserByToken } from '@/lib/sub2api/client';

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token')?.trim();
  if (!token) return NextResponse.json({ error: '缺少 token 参数', code: 'TOKEN_REQUIRED' }, { status: 401 });
  try {
    const user = await getCurrentUserByToken(token);
    const data = await getLotteryActivityData(user.id);
    return NextResponse.json({ user: { id: user.id, username: user.username, balance: user.balance }, ...data });
  } catch (error) {
    if (error instanceof ActivityError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.statusCode });
    }
    console.error('Load lottery activity failed:', error);
    return NextResponse.json({ error: '活动数据刷新失败', code: 'SUB2API_UNAVAILABLE' }, { status: 502 });
  }
}
