import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { toBanner } from '@/lib/cmsTypes';

/* Banner detail actions (doc 25) — the drawer's save/toggle/delete
   beside the list/create in ../route.ts. */

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

const FIELDS: Record<string, string> = {
  name: 'name', bannerType: 'banner_type', headline: 'headline', subheadline: 'subheadline',
  body: 'body', imageUrl: 'image_url', mobileImageUrl: 'mobile_image_url', ctaLabel: 'cta_label',
  ctaUrl: 'cta_url', backgroundColor: 'background_color', textColor: 'text_color',
  placement: 'placement', sortOrder: 'sort_order', isActive: 'is_active',
  startsAt: 'starts_at', endsAt: 'ends_at', dismissible: 'dismissible',
};

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const sb = supabaseAdmin();
  const { data, error } = await sb.from('cms_banners').select('*').eq('tenant_id', DEFAULT_TENANT_ID).eq('id', id).maybeSingle();
  if (error) return err('INTERNAL', error.message, 500);
  if (!data) return err('NOT_FOUND', 'Banner not found', 404);
  return NextResponse.json({ data: toBanner(data as Record<string, unknown>) });
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const patch: Record<string, unknown> = {};
  for (const [camel, col] of Object.entries(FIELDS)) {
    if (body[camel] !== undefined) patch[col] = body[camel];
  }
  if (!Object.keys(patch).length) return err('VALIDATION', 'nothing to update', 400);
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('cms_banners')
    .update(patch)
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('id', id)
    .select('*')
    .maybeSingle();
  if (error) return err('INTERNAL', error.message, 500);
  if (!data) return err('NOT_FOUND', 'Banner not found', 404);
  return NextResponse.json({ data: toBanner(data as Record<string, unknown>) });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const sb = supabaseAdmin();
  const { error } = await sb.from('cms_banners').delete().eq('tenant_id', DEFAULT_TENANT_ID).eq('id', id);
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: { id, deleted: true } });
}
