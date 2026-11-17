import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { toPromotion } from '@/lib/marketingTypes';
import { promotionInsert } from '../route';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const sb = supabaseAdmin();
  const { data: current } = await sb
    .from('commerce_promotions')
    .select('*')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('id', id)
    .maybeSingle();
  if (!current) return err('NOT_FOUND', 'Promotion not found', 404);

  /* Partial updates: lifecycle actions (pause/expire/draft) touch
     single fields; a full drawer save replaces the editable shape. */
  const patch: Record<string, unknown> = {};
  if (body.full === true) {
    Object.assign(patch, promotionInsert({ ...(current as Record<string, unknown>), ...body }));
    delete patch.tenant_id;
  } else {
    if (typeof body.active === 'boolean') patch.active = body.active;
    if (typeof body.endAt === 'string') patch.end_at = body.endAt;
    if (body.draft === true || body.draft === false) {
      const rules = { ...((current.rules as Record<string, unknown>) || {}), status: body.draft ? 'draft' : 'live' };
      patch.rules = rules;
    }
  }
  if (!Object.keys(patch).length) return err('VALIDATION', 'nothing to update', 400);
  const { data, error } = await sb
    .from('commerce_promotions')
    .update(patch)
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('id', id)
    .select('*')
    .single();
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: toPromotion(data as Record<string, unknown>) });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const sb = supabaseAdmin();
  const { error } = await sb.from('commerce_promotions').delete().eq('tenant_id', DEFAULT_TENANT_ID).eq('id', id);
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: { id, deleted: true } });
}
