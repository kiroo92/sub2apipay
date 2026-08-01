import { NextRequest, NextResponse } from 'next/server';
import { ActivityError, drawLotteryPrize } from '@/lib/activity/lottery';
import { getCurrentUserByToken } from '@/lib/sub2api/client';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const token = typeof body?.token === 'string' ? body.token.trim() : '';
    const requestId = typeof body?.requestId === 'string' ? body.requestId.trim() : '';
    if (!token || !requestId) {
      return NextResponse.json({ error: '请求参数不完整', code: 'INVALID_PARAMETERS' }, { status: 400 });
    }
    const user = await getCurrentUserByToken(token);
    return NextResponse.json(await drawLotteryPrize(user.id, requestId));
  } catch (error) {
    if (error instanceof ActivityError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.statusCode });
    }
    console.error('Draw lottery prize failed:', error);
    return NextResponse.json({ error: '抽奖请求处理失败', code: 'DRAW_FAILED' }, { status: 502 });
  }
}
