import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { toAdAdvertiser } from '@/lib/adDto';

/* Advertiser update (doc 22 → ad_advertisers): display name + status. */

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const patch: Record<string, unknown> = {};
  if (typeof body.displayName === 'string' && body.displayName.trim()) patch.display_name = body.displayName.trim();
  if (typeof body.status === 'string' && body.status) patch.status = body.status;
  if (!Object.keys(patch).length) return err('VALIDATION', 'nothing to update', 400);
  const { data, error } = await supabaseAdmin()
    .from('ad_advertisers')
    .update(patch)
    .eq('id', id)
    .select('*')
    .maybeSingle();
  if (error) return err('INTERNAL', error.message, 500);
  if (!data) return err('NOT_FOUND', 'Advertiser not found', 404);
  return NextResponse.json({ data: toAdAdvertiser(data as Record<string, unknown>) });
}
