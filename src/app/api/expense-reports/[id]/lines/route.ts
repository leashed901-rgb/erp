import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

/**
 * GET /api/expense-reports/[id]/lines — itemised lines of an expense
 * report (Batch F: acct_expense_lines). The report itself is Batch I
 * (acct_expense_reports) — today the tenant has 0 reports, so this
 * reads empty; the route exists so the lines table is reachable and
 * the report screen can consume it without inventing a shape later.
 * 404 when the report does not exist.
 * POST — add a line (draft reports only); the report total is
 * recomputed from its lines after every add/delete. DELETE ?lineId= —
 * remove a line (draft only).
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data: report } = await supabaseAdmin()
    .from('acct_expense_reports')
    .select('id')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('id', id)
    .maybeSingle();
  if (!report) return err('NOT_FOUND', 'Expense report not found', 404);
  const { data, error } = await supabaseAdmin()
    .from('acct_expense_lines')
    .select('*')
    .eq('expense_report_id', id)
    .order('expense_date', { ascending: true });
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({
    data: ((data ?? []) as Record<string, unknown>[]).map((l) => ({
      id: l.id,
      expenseReportId: l.expense_report_id,
      expenseDate: l.expense_date,
      merchant: l.merchant,
      description: l.description,
      amount: l.amount,
      taxAmount: l.tax_amount,
      expenseAccountId: l.expense_account_id,
      receiptUri: l.receipt_uri,
      receiptHash: l.receipt_hash,
    })),
  });
}

async function recomputeTotal(reportId: string) {
  const { data: lines } = await supabaseAdmin().from('acct_expense_lines').select('amount').eq('expense_report_id', reportId);
  const total = ((lines ?? []) as { amount: number }[]).reduce((s, l) => s + Number(l.amount || 0), 0);
  await supabaseAdmin().from('acct_expense_reports').update({ total_amount: total }).eq('tenant_id', DEFAULT_TENANT_ID).eq('id', reportId);
  return total;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const expenseDate = String(body.expenseDate || '').slice(0, 10);
  const description = String(body.description || '').trim();
  const amount = Number(body.amount);
  const taxAmount = Number(body.taxAmount || 0);
  const expenseAccountId = String(body.expenseAccountId || '');
  if (!expenseDate) return err('VALIDATION', 'expenseDate is required', 400);
  if (!description) return err('VALIDATION', 'description is required', 400);
  if (!Number.isFinite(amount) || amount <= 0) return err('VALIDATION', 'amount must be positive', 400);
  if (!expenseAccountId) return err('VALIDATION', 'expenseAccountId is required', 400);
  const sb = supabaseAdmin();
  const { data: report } = await sb.from('acct_expense_reports').select('id, status').eq('tenant_id', DEFAULT_TENANT_ID).eq('id', id).single();
  if (!report) return err('NOT_FOUND', 'Expense report not found', 404);
  if (report.status !== 'draft') return err('VALIDATION', `Only draft reports take new lines (status is ${report.status})`, 400);
  const { data: account } = await sb.from('acct_chart_of_accounts').select('id').eq('tenant_id', DEFAULT_TENANT_ID).eq('id', expenseAccountId).single();
  if (!account) return err('VALIDATION', 'Unknown expense account', 400);
  const { data, error } = await sb.from('acct_expense_lines').insert({
    expense_report_id: id,
    expense_date: expenseDate,
    merchant: body.merchant ? String(body.merchant) : null,
    description,
    amount,
    tax_amount: taxAmount,
    expense_account_id: expenseAccountId,
    receipt_uri: body.receiptUri ? String(body.receiptUri) : null,
    receipt_hash: body.receiptHash ? String(body.receiptHash) : null,
    dimensions: {},
  }).select().single();
  if (error) return err('INTERNAL', error.message, 500);
  const total = await recomputeTotal(id);
  return NextResponse.json({ data: { id: data.id, expenseDate: data.expense_date, description: data.description, amount: Number(data.amount || 0), totalAmount: total } }, { status: 201 });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const lineId = new URL(req.url).searchParams.get('lineId');
  if (!lineId) return err('VALIDATION', 'lineId is required', 400);
  const sb = supabaseAdmin();
  const { data: report } = await sb.from('acct_expense_reports').select('id, status').eq('tenant_id', DEFAULT_TENANT_ID).eq('id', id).single();
  if (!report) return err('NOT_FOUND', 'Expense report not found', 404);
  if (report.status !== 'draft') return err('VALIDATION', `Only draft reports lose lines (status is ${report.status})`, 400);
  const { error } = await sb.from('acct_expense_lines').delete().eq('id', lineId).eq('expense_report_id', id);
  if (error) return err('INTERNAL', error.message, 500);
  const total = await recomputeTotal(id);
  return NextResponse.json({ data: { deleted: true, totalAmount: total } });
}
