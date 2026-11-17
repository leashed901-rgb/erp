import type { SupabaseClient } from '@supabase/supabase-js';
import { DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import type { CustomerStatement, StatementLine } from '@/lib/arApLinkTypes';

/**
 * Statement generation (doc 28 Batch E). The engine's
 * acct_customer_statement RPC returns the activity lines for a period
 * but does NOT insert a statement row — the row is built here from the
 * RPC lines + the open-invoice aging, and stored in
 * acct_customer_statements. Batches reuse the same helper.
 */
export async function generateStatement(
  sb: SupabaseClient,
  customerId: string,
  from: string,
  to: string,
  batchId?: string,
): Promise<{ statement: CustomerStatement; lines: StatementLine[] }> {
  const { data: linesData, error: rpcErr } = await sb.rpc('acct_customer_statement', {
    p_tenant: DEFAULT_TENANT_ID,
    p_customer: customerId,
    p_from: from,
    p_to: to,
  });
  if (rpcErr) throw new Error(rpcErr.message);
  const lines: StatementLine[] = (linesData || []).map((l: Record<string, unknown>) => ({
    lineDate: String(l.line_date || ''),
    docType: String(l.doc_type || ''),
    docNumber: String(l.doc_number || ''),
    description: String(l.description || ''),
    charges: Number(l.charges || 0),
    payments: Number(l.payments || 0),
    balance: Number(l.balance || 0),
  }));

  // Opening balance: open invoices dated before the period.
  const { data: prior } = await sb
    .from('acct_ar_invoices')
    .select('total,amount_paid,amount_credited')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('customer_id', customerId)
    .lt('invoice_date', from)
    .not('status', 'in', '("void","draft","written_off")');
  const opening = (prior || []).reduce(
    (s, r) => s + (Number(r.total || 0) - Number(r.amount_paid || 0) - Number(r.amount_credited || 0)), 0);

  // Period activity from the RPC lines.
  const charges = lines.reduce((s, l) => s + l.charges, 0);
  const payments = lines.reduce((s, l) => s + l.payments, 0);
  // Credit memos in the period ride as negative charges in the RPC lines
  // only when they are invoice-linked; count standalone memos separately.
  const { data: memos } = await sb
    .from('acct_ar_credit_memos')
    .select('total')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('customer_id', customerId)
    .gte('memo_date', from)
    .lte('memo_date', to)
    .eq('status', 'posted');
  const credits = (memos || []).reduce((s, m) => s + Number(m.total || 0), 0);
  const closing = opening + charges - payments - credits;

  // Aging buckets from currently open invoices, by due date.
  const today = new Date().toISOString().slice(0, 10);
  const { data: open } = await sb
    .from('acct_ar_invoices')
    .select('total,amount_paid,amount_credited,due_date')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('customer_id', customerId)
    .not('status', 'in', '("void","draft","written_off","paid")');
  const buckets = { current: 0, d130: 0, d3160: 0, d6190: 0, over90: 0 };
  (open || []).forEach((r) => {
    const bal = Number(r.total || 0) - Number(r.amount_paid || 0) - Number(r.amount_credited || 0);
    if (bal <= 0) return;
    const due = String(r.due_date || today);
    const days = Math.floor((new Date(today).getTime() - new Date(due).getTime()) / 86400000);
    if (days <= 0) buckets.current += bal;
    else if (days <= 30) buckets.d130 += bal;
    else if (days <= 60) buckets.d3160 += bal;
    else if (days <= 90) buckets.d6190 += bal;
    else buckets.over90 += bal;
  });

  const day = new Date().toISOString().slice(0, 10).replaceAll('-', '');
  const { count } = await sb
    .from('acct_customer_statements')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .like('statement_number', `STMT-${day}-%`);
  const statementNumber = `STMT-${day}-${String((count || 0) + 1).padStart(3, '0')}`;

  const { data: row, error } = await sb.from('acct_customer_statements').insert({
    tenant_id: DEFAULT_TENANT_ID,
    customer_id: customerId,
    statement_number: statementNumber,
    period_start: from,
    period_end: to,
    opening_balance: opening,
    charges_total: charges,
    payments_total: payments,
    credits_total: credits,
    closing_balance: closing,
    aging_current: buckets.current,
    aging_1_30: buckets.d130,
    aging_31_60: buckets.d3160,
    aging_61_90: buckets.d6190,
    aging_over_90: buckets.over90,
    status: 'draft',
    batch_id: batchId || null,
  }).select('*').single();
  if (error) throw new Error(error.message);

  return { statement: toStatementDto(row), lines };
}

export function toStatementDto(r: Record<string, unknown>): CustomerStatement {
  return {
    id: String(r.id),
    customerId: String(r.customer_id || ''),
    customerName: '',
    statementNumber: String(r.statement_number || ''),
    periodStart: String(r.period_start || ''),
    periodEnd: String(r.period_end || ''),
    openingBalance: Number(r.opening_balance || 0),
    chargesTotal: Number(r.charges_total || 0),
    paymentsTotal: Number(r.payments_total || 0),
    creditsTotal: Number(r.credits_total || 0),
    closingBalance: Number(r.closing_balance || 0),
    agingCurrent: Number(r.aging_current || 0),
    aging130: Number(r.aging_1_30 || 0),
    aging3160: Number(r.aging_31_60 || 0),
    aging6190: Number(r.aging_61_90 || 0),
    agingOver90: Number(r.aging_over_90 || 0),
    status: String(r.status || ''),
    documentUrl: (r.document_url as string) || null,
    sentAt: (r.sent_at as string) || null,
    generatedAt: String(r.generated_at || r.created_at || ''),
    reminderCount: Number(r.reminder_count || 0),
    lastReminderAt: (r.last_reminder_at as string) || null,
    batchId: (r.batch_id as string) || null,
  };
}
