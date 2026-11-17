import { NextResponse, NextRequest } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

/**
 * GET /api/expense-reports — expense reports (Batch I).
 * Each row carries its line count + employee name. POST — create a
 * draft (employee + date + currency; the number comes from
 * acct_next_number 'expense_report' / 'EXP-', total starts at 0 and
 * is recomputed from lines).
 */
export async function GET() {
  const sb = supabaseAdmin();
  const { data: reports, error } = await sb.from('acct_expense_reports').select('*').eq('tenant_id', DEFAULT_TENANT_ID).order('report_date', { ascending: false });
  if (error) return err('INTERNAL', error.message, 500);
  const ids = ((reports ?? []) as { id: string }[]).map((r) => r.id);
  const employeeIds = [...new Set(((reports ?? []) as { employee_id: string | null }[]).map((r) => r.employee_id).filter(Boolean))] as string[];
  const counts = new Map<string, number>();
  if (ids.length) {
    for (let i = 0; i < ids.length; i += 100) {
      const { data: lines } = await sb.from('acct_expense_lines').select('expense_report_id').in('expense_report_id', ids.slice(i, i + 100));
      for (const l of (lines ?? []) as { expense_report_id: string }[]) counts.set(l.expense_report_id, (counts.get(l.expense_report_id) || 0) + 1);
    }
  }
  const [{ data: employees }] = await Promise.all([
    employeeIds.length ? sb.from('acct_employees').select('id, first_name, last_name').in('id', employeeIds) : Promise.resolve({ data: [] }),
  ]);
  const employeeById = new Map(((employees ?? []) as Record<string, unknown>[]).map((e) => [e.id, `${e.first_name || ''} ${e.last_name || ''}`.trim()]));
  return NextResponse.json({
    data: ((reports ?? []) as Record<string, unknown>[]).map((r) => ({
      id: r.id,
      employeeId: r.employee_id,
      employee: (employeeById.get(r.employee_id as string) as string) || '—',
      reportNumber: r.report_number,
      reportDate: r.report_date,
      currency: r.currency,
      totalAmount: Number(r.total_amount || 0),
      status: r.status,
      submittedAt: r.submitted_at,
      approvedAt: r.approved_at,
      postedJournalId: r.posted_journal_id,
      lineCount: counts.get(r.id as string) || 0,
    })),
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const reportDate = String(body.reportDate || '').slice(0, 10);
  const currency = String(body.currency || 'USD').toUpperCase().slice(0, 3);
  const employeeId = body.employeeId ? String(body.employeeId) : null;
  if (!reportDate) return err('VALIDATION', 'reportDate is required', 400);
  const sb = supabaseAdmin();
  const { data: entityId, error: entityErr } = await sb.rpc('acct_default_entity', { p_tenant_id: DEFAULT_TENANT_ID });
  if (entityErr || !entityId) return err('INTERNAL', 'Could not resolve the default entity', 500);
  if (employeeId) {
    const { data: emp } = await sb.from('acct_employees').select('id').eq('tenant_id', DEFAULT_TENANT_ID).eq('id', employeeId).single();
    if (!emp) return err('VALIDATION', 'Unknown employee', 400);
  }
  const { data: number, error: numErr } = await sb.rpc('acct_next_number', { p_tenant_id: DEFAULT_TENANT_ID, p_entity_id: entityId, p_doc_type: 'expense_report', p_default_prefix: 'EXP-' });
  if (numErr) return err('INTERNAL', numErr.message, 500);
  const { data, error } = await sb.from('acct_expense_reports').insert({
    tenant_id: DEFAULT_TENANT_ID,
    entity_id: entityId,
    employee_id: employeeId,
    report_number: number,
    report_date: reportDate,
    currency,
    total_amount: 0,
    status: 'draft',
  }).select().single();
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: { id: data.id, reportNumber: data.report_number, reportDate: data.report_date, currency: data.currency, totalAmount: 0, status: data.status } }, { status: 201 });
}
