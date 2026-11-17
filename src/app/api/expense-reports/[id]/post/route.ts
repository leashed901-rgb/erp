import { NextResponse, NextRequest } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

/**
 * POST /api/expense-reports/[id]/post — post an approved report (Batch I).
 * No engine RPC exists for this lifecycle, so the route posts the
 * journal itself via acct_post_entry, the same primitive the Batch H
 * lease payments use: Dr each line's expense account, Cr the
 * accrued_liabilities role account (the reimbursement is owed, not
 * yet paid — paying it is the normal spend flow). Only approved
 * reports post, and only once.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const sb = supabaseAdmin();
  const { data: report, error } = await sb.from('acct_expense_reports').select('*').eq('tenant_id', DEFAULT_TENANT_ID).eq('id', id).single();
  if (error || !report) return err('NOT_FOUND', 'Expense report not found', 404);
  if (report.status !== 'approved') return err('VALIDATION', `Only an approved report can be posted (status is ${report.status})`, 400);
  if (report.posted_journal_id) return err('VALIDATION', 'Report is already posted', 400);
  const { data: lines } = await sb.from('acct_expense_lines').select('*').eq('expense_report_id', id).order('expense_date', { ascending: true });
  const total = ((lines ?? []) as { amount: number }[]).reduce((s, l) => s + Number(l.amount || 0), 0);
  if (((lines ?? []).length === 0) || total <= 0) return err('VALIDATION', 'Nothing to post — the report has no lines', 400);
  const { data: entityId } = await sb.rpc('acct_default_entity', { p_tenant_id: DEFAULT_TENANT_ID });
  const { data: accruedId, error: roleErr } = await sb.rpc('acct_role_account', { p_tenant_id: DEFAULT_TENANT_ID, p_entity_id: entityId, p_role: 'accrued_liabilities' });
  if (roleErr || !accruedId) return err('INTERNAL', 'No accrued-liabilities account is assigned for this entity', 500);
  const jeLines = [
    ...((lines ?? []) as Record<string, unknown>[]).map((l) => ({
      account_id: l.expense_account_id,
      debit: Number(l.amount || 0),
      credit: 0,
      description: String(l.description || '').slice(0, 200),
    })),
    { account_id: accruedId, debit: 0, credit: total, description: `Expense report ${report.report_number}` },
  ];
  const { data: journalId, error: postErr } = await sb.rpc('acct_post_entry', {
    p_tenant_id: DEFAULT_TENANT_ID,
    p_entity_id: entityId,
    p_entry_date: String(report.report_date),
    p_lines: jeLines,
    p_source: 'expense',
    p_reference: String(report.report_number),
    p_memo: `Expense report ${report.report_number}`,
    p_idempotency_key: `expense-report-${id}`,
    p_source_doc_type: 'expense_report',
    p_source_doc_id: id,
  });
  if (postErr) return err('INTERNAL', postErr.message, 500);
  const { data: updated } = await sb.from('acct_expense_reports').update({ status: 'posted', posted_journal_id: journalId }).eq('tenant_id', DEFAULT_TENANT_ID).eq('id', id).select().single();
  return NextResponse.json({ data: { id: updated?.id || id, status: 'posted', postedJournalId: journalId, total } });
}
