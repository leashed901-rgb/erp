import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { toAdCreative } from '@/lib/adDto';

/* Creative update (doc 22 → ad_creatives): name, status, headline,
   body, cta, link, dimensions. */

const CREATIVE_STATUSES = ['active', 'paused', 'archived'];

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const patch: Record<string, unknown> = {};
  if (typeof body.name === 'string' && body.name.trim()) patch.name = body.name.trim();
  if (typeof body.status === 'string' && body.status) {
    if (!CREATIVE_STATUSES.includes(body.status)) return err('VALIDATION', `status must be one of ${CREATIVE_STATUSES.join(', ')}`, 400);
    patch.status = body.status;
  }
  if (body.headline !== undefined) patch.headline = body.headline ? String(body.headline) : null;
  if (body.body !== undefined) patch.body = body.body ? String(body.body) : null;
  if (body.cta !== undefined) patch.cta = body.cta ? String(body.cta) : null;
  if (body.clickUrl !== undefined) patch.link_url = body.clickUrl ? String(body.clickUrl) : null;
  if (body.imageUrl !== undefined) patch.image_url = body.imageUrl ? String(body.imageUrl) : null;
  if (body.width !== undefined) patch.width = typeof body.width === 'number' ? body.width : null;
  if (body.height !== undefined) patch.height = typeof body.height === 'number' ? body.height : null;
  if (!Object.keys(patch).length) return err('VALIDATION', 'nothing to update', 400);
  const { data, error } = await supabaseAdmin()
    .from('ad_creatives')
    .update(patch)
    .eq('id', id)
    .select('*')
    .maybeSingle();
  if (error) return err('INTERNAL', error.message, 500);
  if (!data) return err('NOT_FOUND', 'Creative not found', 404);
  return NextResponse.json({ data: toAdCreative(data as Record<string, unknown>) });
}
