import { NextResponse, NextRequest } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

const STATUSES = ['draft', 'under_review', 'approved', 'active', 'locked', 'archived', 'rejected'];

/**
 * GET /api/budgets/[id] — version + its lines (Batch I).
 * Lines join periods (name) and the chart (code · name). PATCH — status
 * only, from the engine's vocabulary; approving records approved_by/at.
 * Locked / archived versions refuse line edits (enforced in the lines
 * route, not here — status itself is always settable by the user).
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = supabaseAdmin();
  const [{ data: version, error: vErr }, { data: lines, error: lErr }] = await Promise.all([
    sb.from('acct_budget_versions').select('*').eq('tenant_id', DEFAULT_TENANT_ID).eq('id', id).single(),
    sb.from('acct_budget_lines').select('*').eq('budget_id', id),
  ]);
  if (vErr || !version) return err('NOT_FOUND', 'Budget not found', 404);
  if (lErr) return err('INTERNAL', lErr.message, 500);
  const periodIds = [...new Set(((lines ?? []) as { period_id: string }[]).map((l) => l.period_id))];
  const accountIds = [...new Set(((lines ?? []) as { account_id: string }[]).map((l) => l.account_id))];
  const [{ data: periods }, { data: accounts }] = await Promise.all([
    periodIds.length ? sb.from('acct_periods').select('id, name, start_date, end_date').in('id', periodIds) : Promise.resolve({ data: [] }),
    accountIds.length ? sb.from('acct_chart_of_accounts').select('id, code, name').in('id', accountIds) : Promise.resolve({ data: [] }),
  ]);
  const periodById = new Map(((periods ?? []) as Record<string, unknown>[]).map((p) => [p.id, p]));
  const accountById = new Map(((accounts ?? []) as Record<string, unknown>[]).map((a) => [a.id, a]));
  const rows = ((lines ?? []) as Record<string, unknown>[]).map((l) => {
    const p = periodById.get(l.period_id as string) as Record<string, unknown> | undefined;
    const a = accountById.get(l.account_id as string) as Record<string, unknown> | undefined;
    return {
      id: l.id,
      budgetId: l.budget_id,
      periodId: l.period_id,
      periodName: p ? String(p.name) : '—',
      periodStart: p ? p.start_date : null,
      accountId: l.account_id,
      account: a ? `${a.code} · ${a.name}` : '—',
      amount: Number(l.amount || 0),
      dimensions: l.dimensions || {},
      notes: l.notes,
    };
  });
  rows.sort((a, b) => String(a.periodStart || '').localeCompare(String(b.periodStart || '')) || String(a.account).localeCompare(String(b.account)));
  return NextResponse.json({
    data: {
      id: version.id,
      name: version.name,
      fiscalYear: version.fiscal_year,
      versionNo: version.version_no,
      scenario: version.scenario,
      status: version.status,
      currency: version.currency,
      approvedBy: version.approved_by,
      approvedAt: version.approved_at,
      lines: rows,
      total: rows.reduce((s, r) => s + r.amount, 0),
    },
  });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const status = String(body.status || '');
  if (!STATUSES.includes(status)) return err('VALIDATION', `status must be one of ${STATUSES.join(', ')}`, 400);
  const sb = supabaseAdmin();
  const patch: Record<string, unknown> = { status };
  if (status === 'approved') {
    patch.approved_at = new Date().toISOString();
  }
  const { data, error } = await sb.from('acct_budget_versions').update(patch).eq('tenant_id', DEFAULT_TENANT_ID).eq('id', id).select().single();
  if (error || !data) return err('NOT_FOUND', 'Budget not found', 404);
  return NextResponse.json({ data: { id: data.id, status: data.status, approvedAt: data.approved_at } });
}
