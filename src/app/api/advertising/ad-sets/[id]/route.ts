import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { toAdSet } from '@/lib/adDto';

/* Ad set update (doc 22 → ad_campaign_groups): name + status. */

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const patch: Record<string, unknown> = {};
  if (typeof body.name === 'string' && body.name.trim()) patch.name = body.name.trim();
  // Same CHECK as the create route: only active/paused/archived.
  if (typeof body.status === 'string' && body.status) {
    if (!['active', 'paused', 'archived'].includes(body.status)) {
      return err('VALIDATION', 'status must be one of: active, paused, archived', 400);
    }
    patch.status = body.status;
  }
  if (!Object.keys(patch).length) return err('VALIDATION', 'nothing to update', 400);
  const { data, error } = await supabaseAdmin()
    .from('ad_campaign_groups')
    .update(patch)
    .eq('id', id)
    .select('*')
    .maybeSingle();
  if (error) return err('INTERNAL', error.message, 500);
  if (!data) return err('NOT_FOUND', 'Ad set not found', 404);
  return NextResponse.json({ data: toAdSet(data as Record<string, unknown>) });
}
