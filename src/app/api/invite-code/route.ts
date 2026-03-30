import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserByToken } from '@/lib/sub2api/client';
import { getInviteInfoForUser } from '@/lib/invite/service';

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token')?.trim();
  if (!token) {
    return NextResponse.json({ error: '缺少 token' }, { status: 401 });
  }

  try {
    const user = await getCurrentUserByToken(token);
    const invite = await getInviteInfoForUser(user.id, token);

    return NextResponse.json({
      invite: {
        ...invite,
        userId: user.id,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Failed to get current user:')) {
      return NextResponse.json({ error: '无效的 token' }, { status: 401 });
    }

    console.error('Failed to get invite info:', error);
    return NextResponse.json({ error: '获取邀请信息失败' }, { status: 500 });
  }
}
