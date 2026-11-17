import { NextResponse, NextRequest } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

/**
 * GET /api/expense-reports/[id] — report + lines (Batch I).
 * PATCH — status transitions only (no engine RPC exists for this
 * lifecycle; the route enforces the order): draft → pending_approval
 * (submit, needs ≥1 line), pending_approval → approved | rejected,
 * draft | approved → void. Posted reports are terminal — voiding one
 * would need a journal reversal, which this route does not invent.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = supabaseAdmin();
  const { data: report, error } = await sb.from('acct_expense_reports').select('*').eq('tenant_id', DEFAULT_TENANT_ID).eq('id', id).single();
  if (error || !report) return err('NOT_FOUND', 'Expense report not found', 404);
  const [{ data: lines }, { data: employee }] = await Promise.all([
    sb.from('acct_expense_lines').select('*').eq('expense_report_id', id).order('expense_date', { ascending: true }),
    report.employee_id ? sb.from('acct_employees').select('id, first_name, last_name').eq('id', report.employee_id).single() : Promise.resolve({ data: null }),
  ]);
  const accountIds = [...new Set(((lines ?? []) as { expense_account_id: string }[]).map((l) => l.expense_account_id))];
  const { data: accounts } = accountIds.length
    ? await sb.from('acct_chart_of_accounts').select('id, code, name').in('id', accountIds)
    : { data: [] };
  const accountById = new Map(((accounts ?? []) as Record<string, unknown>[]).map((a) => [a.id, a]));
  return NextResponse.json({
    data: {
      id: report.id,
      employeeId: report.employee_id,
      employee: employee ? `${employee.first_name || ''} ${employee.last_name || ''}`.trim() : '—',
      reportNumber: report.report_number,
      reportDate: report.report_date,
      currency: report.currency,
      totalAmount: Number(report.total_amount || 0),
      status: report.status,
      submittedAt: report.submitted_at,
      approvedAt: report.approved_at,
      postedJournalId: report.posted_journal_id,
      lines: ((lines ?? []) as Record<string, unknown>[]).map((l) => {
        const a = accountById.get(l.expense_account_id as string) as Record<string, unknown> | undefined;
        return {
          id: l.id,
          expenseDate: l.expense_date,
          merchant: l.merchant,
          description: l.description,
          amount: Number(l.amount || 0),
          taxAmount: Number(l.tax_amount || 0),
          expenseAccountId: l.expense_account_id,
          account: a ? `${a.code} · ${a.name}` : '—',
        };
      }),
    },
  });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const action = String(body.action || '');
  const sb = supabaseAdmin();
  const { data: report, error } = await sb.from('acct_expense_reports').select('*').eq('tenant_id', DEFAULT_TENANT_ID).eq('id', id).single();
  if (error || !report) return err('NOT_FOUND', 'Expense report not found', 404);
  const status = String(report.status);
  const patch: Record<string, unknown> = {};
  if (action === 'submit') {
    if (status !== 'draft') return err('VALIDATION', `Only a draft can be submitted (status is ${status})`, 400);
    const { count } = await sb.from('acct_expense_lines').select('id', { count: 'exact', head: true }).eq('expense_report_id', id);
    if ((count || 0) === 0) return err('VALIDATION', 'A report with no lines cannot be submitted', 400);
    if (Number(report.total_amount || 0) <= 0) return err('VALIDATION', 'A report totalling zero cannot be submitted', 400);
    patch.status = 'pending_approval';
    patch.submitted_at = new Date().toISOString();
  } else if (action === 'approve') {
    if (status !== 'pending_approval') return err('VALIDATION', `Only a submitted report can be approved (status is ${status})`, 400);
    patch.status = 'approved';
    patch.approved_at = new Date().toISOString();
  } else if (action === 'reject') {
    if (status !== 'pending_approval') return err('VALIDATION', `Only a submitted report can be rejected (status is ${status})`, 400);
    patch.status = 'rejected';
  } else if (action === 'void') {
    if (status === 'posted') return err('VALIDATION', 'A posted report cannot be voided — reverse its journal instead', 400);
    if (!['draft', 'approved', 'rejected'].includes(status)) return err('VALIDATION', `A ${status} report cannot be voided`, 400);
    patch.status = 'void';
  } else {
    return err('VALIDATION', 'action must be submit | approve | reject | void', 400);
  }
  const { data, error: uErr } = await sb.from('acct_expense_reports').update(patch).eq('tenant_id', DEFAULT_TENANT_ID).eq('id', id).select().single();
  if (uErr || !data) return err('INTERNAL', uErr?.message || 'Update failed', 500);
  return NextResponse.json({ data: { id: data.id, status: data.status, submittedAt: data.submitted_at, approvedAt: data.approved_at } });
}
