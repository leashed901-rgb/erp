import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { toPopup } from '@/lib/cmsTypes';

/* Popup detail actions (doc 25) beside the list/create in
   ../route.ts. */

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

const FIELDS: Record<string, string> = {
  name: 'name', headline: 'headline', body: 'body', imageUrl: 'image_url',
  mobileImageUrl: 'mobile_image_url', ctaLabel: 'cta_label', ctaUrl: 'cta_url',
  collectEmail: 'collect_email', triggerType: 'trigger_type', triggerValue: 'trigger_value',
  frequency: 'frequency', isActive: 'is_active', startsAt: 'starts_at', endsAt: 'ends_at',
};

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const sb = supabaseAdmin();
  const { data, error } = await sb.from('cms_popups').select('*').eq('tenant_id', DEFAULT_TENANT_ID).eq('id', id).maybeSingle();
  if (error) return err('INTERNAL', error.message, 500);
  if (!data) return err('NOT_FOUND', 'Popup not found', 404);
  return NextResponse.json({ data: toPopup(data as Record<string, unknown>) });
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const patch: Record<string, unknown> = {};
  for (const [camel, col] of Object.entries(FIELDS)) {
    if (body[camel] !== undefined) patch[col] = body[camel];
  }
  if (Array.isArray(body.targetPages)) patch.target_pages = body.targetPages;
  if (!Object.keys(patch).length) return err('VALIDATION', 'nothing to update', 400);
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('cms_popups')
    .update(patch)
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('id', id)
    .select('*')
    .maybeSingle();
  if (error) return err('INTERNAL', error.message, 500);
  if (!data) return err('NOT_FOUND', 'Popup not found', 404);
  return NextResponse.json({ data: toPopup(data as Record<string, unknown>) });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const sb = supabaseAdmin();
  const { error } = await sb.from('cms_popups').delete().eq('tenant_id', DEFAULT_TENANT_ID).eq('id', id);
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: { id, deleted: true } });
}
