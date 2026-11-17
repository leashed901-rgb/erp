import { NextResponse, NextRequest } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

/**
 * GET /api/budgets/[id]/vs-actual?from=&to= — budget vs actual (Batch I).
 * The engine compares the version's lines (periods overlapping the
 * range) against posted/reversed journal activity in the range, signed
 * by each account's normal balance. Only accounts with a budget or with
 * revenue/expense activity appear.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const q = new URL(req.url).searchParams;
  const from = q.get('from') || '';
  const to = q.get('to') || '';
  if (!from || !to) return err('VALIDATION', 'from and to are required (YYYY-MM-DD)', 400);
  if (from > to) return err('VALIDATION', 'from must be on or before to', 400);
  const sb = supabaseAdmin();
  const { data: version } = await sb.from('acct_budget_versions').select('id').eq('tenant_id', DEFAULT_TENANT_ID).eq('id', id).single();
  if (!version) return err('NOT_FOUND', 'Budget not found', 404);
  const { data, error } = await sb.rpc('acct_budget_vs_actual', { p_tenant_id: DEFAULT_TENANT_ID, p_budget_id: id, p_from: from, p_to: to });
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({
    data: ((data ?? []) as Record<string, unknown>[]).map((r) => ({
      accountId: r.account_id,
      code: r.code,
      name: r.name,
      accountType: r.account_type,
      budget: Number(r.budget || 0),
      actual: Number(r.actual || 0),
      variance: Number(r.variance || 0),
      variancePct: r.variance_pct == null ? null : Number(r.variance_pct),
    })),
    meta: { budgetId: id, from, to },
  });
}
