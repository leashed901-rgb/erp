import { NextResponse, NextRequest } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

/**
 * GET /api/budgets — budget versions (Batch I).
 * Each version carries its line count + total so the list reads as a
 * register. POST — create a version (name + fiscal year + currency;
 * scenario defaults to 'budget', version_no to 1, status to 'draft').
 */
export async function GET() {
  const { data: versions, error: vErr } = await supabaseAdmin().from('acct_budget_versions').select('*').eq('tenant_id', DEFAULT_TENANT_ID).order('fiscal_year', { ascending: false }).order('version_no', { ascending: false });
  if (vErr) return err('INTERNAL', vErr.message, 500);
  // acct_budget_lines has NO tenant_id column — scope by the version ids
  // just read (chunked .in() <=100 ids; a .in() with 400+ silently fails).
  const ids = ((versions ?? []) as { id: string }[]).map((v) => v.id);
  const byBudget = new Map<string, { count: number; total: number }>();
  for (let i = 0; i < ids.length; i += 100) {
    const { data: lines, error: lErr } = await supabaseAdmin().from('acct_budget_lines').select('budget_id, amount').in('budget_id', ids.slice(i, i + 100));
    if (lErr) return err('INTERNAL', lErr.message, 500);
    for (const l of (lines ?? []) as { budget_id: string; amount: number }[]) {
      const cur = byBudget.get(l.budget_id) || { count: 0, total: 0 };
      cur.count += 1;
      cur.total += Number(l.amount || 0);
      byBudget.set(l.budget_id, cur);
    }
  }
  return NextResponse.json({
    data: ((versions ?? []) as Record<string, unknown>[]).map((v) => {
      const agg = byBudget.get(v.id as string) || { count: 0, total: 0 };
      return {
        id: v.id,
        name: v.name,
        fiscalYear: v.fiscal_year,
        versionNo: v.version_no,
        scenario: v.scenario,
        status: v.status,
        currency: v.currency,
        approvedBy: v.approved_by,
        approvedAt: v.approved_at,
        lineCount: agg.count,
        total: agg.total,
      };
    }),
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const name = String(body.name || '').trim();
  const fiscalYear = Number(body.fiscalYear);
  const currency = String(body.currency || 'USD').toUpperCase().slice(0, 3);
  const scenario = String(body.scenario || 'budget').trim() || 'budget';
  if (!name) return err('VALIDATION', 'Name is required', 400);
  if (!Number.isInteger(fiscalYear) || fiscalYear < 2000 || fiscalYear > 2100) return err('VALIDATION', 'Fiscal year is required (e.g. 2026)', 400);
  const sb = supabaseAdmin();
  const { data: entityId, error: entityErr } = await sb.rpc('acct_default_entity', { p_tenant_id: DEFAULT_TENANT_ID });
  if (entityErr || !entityId) return err('INTERNAL', 'Could not resolve the default entity', 500);
  const { data, error } = await sb.from('acct_budget_versions').insert({
    tenant_id: DEFAULT_TENANT_ID,
    entity_id: entityId,
    name,
    fiscal_year: fiscalYear,
    scenario,
    currency,
  }).select().single();
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: { id: data.id, name: data.name, fiscalYear: data.fiscal_year, versionNo: data.version_no, scenario: data.scenario, status: data.status, currency: data.currency } }, { status: 201 });
}
