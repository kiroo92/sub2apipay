import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { bindInviteCodeForUser, InviteError } from '@/lib/invite/service';
import { getCurrentUserByToken } from '@/lib/sub2api/client';

const bindInviteCodeSchema = z.object({
  token: z.string().min(1),
  invite_code: z.string().min(1),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = bindInviteCodeSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: '请求参数不合法', detail: parsed.error.flatten() }, { status: 400 });
    }

    const user = await getCurrentUserByToken(parsed.data.token.trim());
    const binding = await bindInviteCodeForUser(user.id, parsed.data.invite_code, parsed.data.token.trim());

    return NextResponse.json(
      {
        success: true,
        binding: {
          inviterUserId: binding.inviterUserId,
          inviterCode: binding.inviteCode.code,
          boundAt: binding.createdAt,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof InviteError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.statusCode });
    }
    if (error instanceof Error && error.message.startsWith('Failed to get current user:')) {
      return NextResponse.json({ error: '无效的 token', code: 'INVALID_TOKEN' }, { status: 401 });
    }

    console.error('Failed to bind invite code:', error);
    return NextResponse.json({ error: '绑定邀请码失败' }, { status: 500 });
  }
}
