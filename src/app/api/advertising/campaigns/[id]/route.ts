import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { toAdCampaign } from '@/lib/adDto';

/* Campaign update (doc 22): status lifecycle draft → scheduled →
   preflight → approved → active → paused → ended, plus name, dates
   and budgets. */

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

const STATUSES = ['draft', 'scheduled', 'preflight', 'approved', 'active', 'paused', 'ended'];

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const patch: Record<string, unknown> = {};
  if (typeof body.name === 'string' && body.name.trim()) patch.name = body.name.trim();
  if (typeof body.status === 'string') {
    if (!STATUSES.includes(body.status)) return err('VALIDATION', `status must be one of ${STATUSES.join(', ')}`, 400);
    patch.status = body.status;
  }
  if (body.startsAt !== undefined) patch.starts_at = body.startsAt ? String(body.startsAt) : null;
  if (body.endsAt !== undefined) patch.ends_at = body.endsAt ? String(body.endsAt) : null;
  if (body.dailyBudget !== undefined) patch.daily_budget_cents = typeof body.dailyBudget === 'number' ? Math.round(body.dailyBudget * 100) : null;
  if (body.lifetimeBudget !== undefined) patch.lifetime_budget_cents = typeof body.lifetimeBudget === 'number' ? Math.round(body.lifetimeBudget * 100) : null;
  if (typeof body.deliveryType === 'string') patch.delivery_type = body.deliveryType;
  if (!Object.keys(patch).length) return err('VALIDATION', 'nothing to update', 400);
  const { data, error } = await supabaseAdmin()
    .from('ad_campaigns')
    .update(patch)
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('id', id)
    .select('*')
    .maybeSingle();
  if (error) return err('INTERNAL', error.message, 500);
  if (!data) return err('NOT_FOUND', 'Campaign not found', 404);
  return NextResponse.json({ data: toAdCampaign(data as Record<string, unknown>) });
}
