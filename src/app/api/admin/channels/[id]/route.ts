import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminToken, unauthorizedResponse } from '@/lib/admin-auth';
import { prisma } from '@/lib/db';

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await verifyAdminToken(request))) return unauthorizedResponse(request);

  try {
    const { id } = await params;
    const body = await request.json();

    const existing = await prisma.channel.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: '渠道不存在' }, { status: 404 });
    }

    // 如果更新了 group_id，检查唯一性
    if (body.group_id !== undefined && Number(body.group_id) !== existing.groupId) {
      const conflict = await prisma.channel.findUnique({
        where: { groupId: Number(body.group_id) },
      });
      if (conflict) {
        return NextResponse.json(
          { error: `分组 ID ${body.group_id} 已被渠道「${conflict.name}」使用` },
          { status: 409 },
        );
      }
    }

    const data: Record<string, unknown> = {};
    if (body.group_id !== undefined) data.groupId = Number(body.group_id);
    if (body.name !== undefined) data.name = body.name;
    if (body.platform !== undefined) data.platform = body.platform;
    if (body.rate_multiplier !== undefined) data.rateMultiplier = body.rate_multiplier;
    if (body.description !== undefined) data.description = body.description;
    if (body.models !== undefined) data.models = body.models;
    if (body.features !== undefined) data.features = body.features;
    if (body.sort_order !== undefined) data.sortOrder = body.sort_order;
    if (body.enabled !== undefined) data.enabled = body.enabled;

    const channel = await prisma.channel.update({
      where: { id },
      data,
    });

    return NextResponse.json({
      ...channel,
      rateMultiplier: Number(channel.rateMultiplier),
    });
  } catch (error) {
    console.error('Failed to update channel:', error);
    return NextResponse.json({ error: '更新渠道失败' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await verifyAdminToken(request))) return unauthorizedResponse(request);

  try {
    const { id } = await params;

    const existing = await prisma.channel.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: '渠道不存在' }, { status: 404 });
    }

    await prisma.channel.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete channel:', error);
    return NextResponse.json({ error: '删除渠道失败' }, { status: 500 });
  }
}
