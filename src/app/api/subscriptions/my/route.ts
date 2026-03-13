import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserByToken, getUserSubscriptions } from '@/lib/sub2api/client';

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token')?.trim();
  if (!token) {
    return NextResponse.json({ error: '缺少 token' }, { status: 401 });
  }

  let userId: number;
  try {
    const user = await getCurrentUserByToken(token);
    userId = user.id;
  } catch {
    return NextResponse.json({ error: '无效的 token' }, { status: 401 });
  }

  try {
    const subscriptions = await getUserSubscriptions(userId);
    return NextResponse.json({ subscriptions });
  } catch (error) {
    console.error('Failed to get user subscriptions:', error);
    return NextResponse.json({ error: '获取订阅信息失败' }, { status: 500 });
  }
}
