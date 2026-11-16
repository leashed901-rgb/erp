import { NextResponse, NextRequest } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

/**
 * POST /api/budgets/[id]/lines — add one line (Batch I).
 * A line is one account in one accounting period. Locked / archived
 * versions refuse new lines (the numbers are frozen once approved
 * through to lock). DELETE ?lineId= — remove a line, same guard.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const periodId = String(body.periodId || '');
  const accountId = String(body.accountId || '');
  const amount = Number(body.amount);
  const dimensions = (body.dimensions && typeof body.dimensions === 'object' ? body.dimensions : {}) as Record<string, unknown>;
  const notes = body.notes ? String(body.notes) : null;
  if (!periodId) return err('VALIDATION', 'periodId is required', 400);
  if (!accountId) return err('VALIDATION', 'accountId is required', 400);
  if (!Number.isFinite(amount)) return err('VALIDATION', 'amount is required', 400);
  const sb = supabaseAdmin();
  const { data: version, error: vErr } = await sb.from('acct_budget_versions').select('id, status, tenant_id').eq('tenant_id', DEFAULT_TENANT_ID).eq('id', id).single();
  if (vErr || !version) return err('NOT_FOUND', 'Budget not found', 404);
  if (['locked', 'archived'].includes(String(version.status))) return err('VALIDATION', `A ${version.status} budget cannot take new lines`, 400);
  const { data: period } = await sb.from('acct_periods').select('id').eq('id', periodId).single();
  if (!period) return err('VALIDATION', 'Unknown period', 400);
  const { data: account } = await sb.from('acct_chart_of_accounts').select('id').eq('tenant_id', DEFAULT_TENANT_ID).eq('id', accountId).single();
  if (!account) return err('VALIDATION', 'Unknown account', 400);
  const { data, error } = await sb.from('acct_budget_lines').insert({
    budget_id: id,
    period_id: periodId,
    account_id: accountId,
    amount,
    dimensions,
    notes,
  }).select().single();
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: { id: data.id, budgetId: data.budget_id, periodId: data.period_id, accountId: data.account_id, amount: Number(data.amount || 0) } }, { status: 201 });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const lineId = new URL(req.url).searchParams.get('lineId');
  if (!lineId) return err('VALIDATION', 'lineId is required', 400);
  const sb = supabaseAdmin();
  const { data: version } = await sb.from('acct_budget_versions').select('id, status').eq('tenant_id', DEFAULT_TENANT_ID).eq('id', id).single();
  if (!version) return err('NOT_FOUND', 'Budget not found', 404);
  if (['locked', 'archived'].includes(String(version.status))) return err('VALIDATION', `A ${version.status} budget cannot lose lines`, 400);
  const { error } = await sb.from('acct_budget_lines').delete().eq('id', lineId).eq('budget_id', id);
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: { deleted: true } });
}
