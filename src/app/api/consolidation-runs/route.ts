import { NextResponse, NextRequest } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

/**
 * GET /api/consolidation-runs — consolidation runs (Batch I).
 * POST — record a run (group + period + reporting currency). A draft
 * run is executed by POST /api/consolidation-runs/[id]/run, which
 * aggregates the members' trial balances, posts the delta as one
 * adjusting journal, and flips the run to completed. fx / elimination
 * figures stay as the user recorded them (judgment inputs, not
 * engine-computed lines).
 */
export async function GET(req: NextRequest) {
  const groupId = new URL(req.url).searchParams.get('groupId');
  let query = supabaseAdmin().from('acct_consolidation_runs').select('*').eq('tenant_id', DEFAULT_TENANT_ID).order('created_at', { ascending: false }).limit(200);
  if (groupId) query = query.eq('consolidation_group_id', groupId);
  const { data, error } = await query;
  if (error) return err('INTERNAL', error.message, 500);
  const groupIds = [...new Set(((data ?? []) as { consolidation_group_id: string }[]).map((r) => r.consolidation_group_id))] as string[];
  const periodIds = [...new Set(((data ?? []) as { period_id: string }[]).map((r) => r.period_id))] as string[];
  const sb = supabaseAdmin();
  const [{ data: groups }, { data: periods }] = await Promise.all([
    groupIds.length ? sb.from('acct_consolidation_groups').select('id, code, name').in('id', groupIds) : Promise.resolve({ data: [] }),
    periodIds.length ? sb.from('acct_periods').select('id, name').in('id', periodIds) : Promise.resolve({ data: [] }),
  ]);
  const groupById = new Map(((groups ?? []) as Record<string, unknown>[]).map((g) => [g.id, `${g.code} — ${g.name}`]));
  const periodById = new Map(((periods ?? []) as Record<string, unknown>[]).map((p) => [p.id, p.name]));
  return NextResponse.json({
    data: ((data ?? []) as Record<string, unknown>[]).map((r) => ({
      id: r.id,
      groupId: r.consolidation_group_id,
      group: (groupById.get(r.consolidation_group_id as string) as string) || '—',
      periodId: r.period_id,
      period: (periodById.get(r.period_id as string) as string) || '—',
      status: r.status,
      reportingCurrency: r.reporting_currency,
      fxAdjustment: r.fx_adjustment == null ? null : Number(r.fx_adjustment),
      eliminationAmount: r.elimination_amount == null ? null : Number(r.elimination_amount),
      journalId: r.journal_id,
    })),
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const groupId = String(body.groupId || '');
  const periodId = String(body.periodId || '');
  const reportingCurrency = String(body.reportingCurrency || 'USD').toUpperCase().slice(0, 3);
  if (!groupId) return err('VALIDATION', 'groupId is required', 400);
  if (!periodId) return err('VALIDATION', 'periodId is required', 400);
  const sb = supabaseAdmin();
  const [{ data: group }, { data: period }] = await Promise.all([
    sb.from('acct_consolidation_groups').select('id').eq('tenant_id', DEFAULT_TENANT_ID).eq('id', groupId).single(),
    sb.from('acct_periods').select('id').eq('id', periodId).single(),
  ]);
  if (!group) return err('VALIDATION', 'Unknown consolidation group', 400);
  if (!period) return err('VALIDATION', 'Unknown period', 400);
  const { data, error } = await sb.from('acct_consolidation_runs').insert({
    tenant_id: DEFAULT_TENANT_ID,
    consolidation_group_id: groupId,
    period_id: periodId,
    status: 'draft',
    reporting_currency: reportingCurrency,
    fx_adjustment: body.fxAdjustment == null ? null : Number(body.fxAdjustment),
    elimination_amount: body.eliminationAmount == null ? null : Number(body.eliminationAmount),
    journal_id: body.journalId ? String(body.journalId) : null,
  }).select().single();
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: { id: data.id, groupId: data.consolidation_group_id, periodId: data.period_id, status: data.status, reportingCurrency: data.reporting_currency } }, { status: 201 });
}
