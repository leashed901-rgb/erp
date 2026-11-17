import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { toAdAudience } from '@/lib/adDto';

/* Audience update (doc 22 → ad_audiences): name, size/reach, and the
   criteria jsonb (kind, source, networks, rules, status, lastSync). */

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const patch: Record<string, unknown> = {};
  if (typeof body.name === 'string' && body.name.trim()) patch.name = body.name.trim();
  if (body.criteria !== undefined) patch.criteria = body.criteria;
  if (body.size !== undefined) patch.size = typeof body.size === 'number' ? body.size : null;
  if (body.reach !== undefined) patch.reach = typeof body.reach === 'number' ? body.reach : null;
  if (!Object.keys(patch).length) return err('VALIDATION', 'nothing to update', 400);
  const { data: org } = await supabaseAdmin()
    .from('organizations')
    .select('id')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .limit(1)
    .maybeSingle();
  if (!org) return err('NOT_FOUND', 'Audience not found', 404);
  const { data, error } = await supabaseAdmin()
    .from('ad_audiences')
    .update(patch)
    .eq('organization_id', org.id as string)
    .eq('id', id)
    .select('*')
    .maybeSingle();
  if (error) return err('INTERNAL', error.message, 500);
  if (!data) return err('NOT_FOUND', 'Audience not found', 404);
  return NextResponse.json({ data: toAdAudience(data as Record<string, unknown>) });
}
