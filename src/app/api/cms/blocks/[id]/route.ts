import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { toContentBlock } from '@/lib/cmsTypes';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const sb = supabaseAdmin();
  const { data, error } = await sb.from('cms_content_blocks').select('*').eq('tenant_id', DEFAULT_TENANT_ID).eq('id', id).maybeSingle();
  if (error) return err('INTERNAL', error.message, 500);
  if (!data) return err('NOT_FOUND', 'Block not found', 404);
  return NextResponse.json({ data: toContentBlock(data as Record<string, unknown>) });
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const patch: Record<string, unknown> = {};
  if (body.props && typeof body.props === 'object') patch.props = body.props;
  if (typeof body.status === 'string') patch.status = body.status;
  if (typeof body.sortOrder === 'number') patch.sort_order = body.sortOrder;
  if (typeof body.slotId === 'string') patch.slot_id = body.slotId;
  if (!Object.keys(patch).length) return err('VALIDATION', 'nothing to update', 400);
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('cms_content_blocks')
    .update(patch)
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('id', id)
    .select('*')
    .maybeSingle();
  if (error) return err('INTERNAL', error.message, 500);
  if (!data) return err('NOT_FOUND', 'Block not found', 404);
  return NextResponse.json({ data: toContentBlock(data as Record<string, unknown>) });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const sb = supabaseAdmin();
  const { error } = await sb.from('cms_content_blocks').delete().eq('tenant_id', DEFAULT_TENANT_ID).eq('id', id);
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: { id, deleted: true } });
}
