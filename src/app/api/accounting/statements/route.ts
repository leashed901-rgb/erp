import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/* Customer statements over acct_customer_statements.
 *
 * The platform's generate_customer_statement RPC is unusable — it
 * inserts into the RETIRED customer_statements view — and
 * acct_customer_statement() reads a journal ledger that carries no
 * per-customer AR lines in this tenant. So generation is computed
 * here from the AR documents themselves (the same basis as the
 * reports' AR aging): invoices, receipts and credit memos.
 * Sending DOES use the platform: acct_send_statement enqueues the
 * email and stamps the statement. */

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

interface StatementRowDb {
  id: string;
  customer_id: string;
  statement_number: string;
  period_start: string;
  period_end: string;
  opening_balance: number;
  charges_total: number;
  payments_total: number;
  credits_total: number;
  closing_balance: number;
  status: string;
  sent_at: string | null;
  generated_at: string | null;
  reminder_count: number;
  created_at: string;
}

export function toStatementDto(r: StatementRowDb, customer?: { name: string; email: string | null }) {
  return {
    id: r.id,
    number: r.statement_number,
    customerId: r.customer_id,
    customerName: customer?.name || 'Customer',
    email: customer?.email || null,
    periodStart: r.period_start,
    periodEnd: r.period_end,
    opening: Number(r.opening_balance || 0),
    charges: Number(r.charges_total || 0),
    payments: Number(r.payments_total || 0),
    credits: Number(r.credits_total || 0),
    closing: Number(r.closing_balance || 0),
    status: r.status,
    sentAt: r.sent_at,
    generatedAt: r.generated_at,
    reminderCount: r.reminder_count || 0,
    createdAt: r.created_at,
  };
}

async function customerMap(sb: ReturnType<typeof supabaseAdmin>, ids: string[]) {
  const map = new Map<string, { name: string; email: string | null }>();
  if (!ids.length) return map;
  const { data } = await sb
    .from('crm_customers')
    .select('id, first_name, last_name, company_name, email')
    .in('id', ids);
  for (const c of data || []) {
    const name = (c.company_name as string) || [c.first_name, c.last_name].filter(Boolean).join(' ') || 'Customer';
    map.set(c.id as string, { name, email: (c.email as string) || null });
  }
  return map;
}

const openOf = (inv: Record<string, unknown>) =>
  ['void', 'written_off'].includes(String(inv.status))
    ? 0
    : Math.max(0, Number(inv.total || 0) - Number(inv.amount_paid || 0) - Number(inv.amount_credited || 0));

/** GET /api/accounting/statements — list (void excluded unless asked) */
export async function GET(req: NextRequest) {
  const sb = supabaseAdmin();
  const includeVoid = req.nextUrl.searchParams.get('includeVoid') === '1';
  let query = sb
    .from('acct_customer_statements')
    .select('*')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .order('period_end', { ascending: false })
    .limit(200);
  if (!includeVoid) query = query.neq('status', 'void');
  const { data, error } = await query;
  if (error) return err('INTERNAL', error.message, 500);
  const rows = (data || []) as StatementRowDb[];
  const customers = await customerMap(sb, [...new Set(rows.map(r => r.customer_id))]);
  return NextResponse.json({ data: rows.map(r => toStatementDto(r, customers.get(r.customer_id))) });
}

/** POST /api/accounting/statements — generate from AR documents.
 *  Body: { customerId, periodStart, periodEnd, draft? } */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const customerId = typeof body.customerId === 'string' ? body.customerId : '';
  const periodStart = typeof body.periodStart === 'string' ? body.periodStart : '';
  const periodEnd = typeof body.periodEnd === 'string' ? body.periodEnd : '';
  if (!customerId || !periodStart || !periodEnd) return err('VALIDATION', 'customerId, periodStart and periodEnd are required', 400);
  if (periodEnd < periodStart) return err('VALIDATION', 'periodEnd must be on or after periodStart', 400);

  const sb = supabaseAdmin();
  const [{ data: invoices }, { data: receipts }, { data: memos }, { count }] = await Promise.all([
    sb.from('acct_ar_invoices').select('id, invoice_date, due_date, total, amount_paid, amount_credited, status')
      .eq('tenant_id', DEFAULT_TENANT_ID).eq('customer_id', customerId),
    sb.from('acct_ar_receipts').select('id, receipt_date, amount, status')
      .eq('tenant_id', DEFAULT_TENANT_ID).eq('customer_id', customerId),
    sb.from('acct_ar_credit_memos').select('id, credit_memo_date, total, status')
      .eq('tenant_id', DEFAULT_TENANT_ID).eq('customer_id', customerId),
    sb.from('acct_customer_statements').select('id', { count: 'exact', head: true }).eq('tenant_id', DEFAULT_TENANT_ID),
  ]);

  const invs = (invoices || []) as Record<string, unknown>[];
  const opening = invs
    .filter(i => String(i.invoice_date) < periodStart)
    .reduce((s, i) => s + openOf(i), 0);
  const inPeriod = invs.filter(i => String(i.invoice_date) >= periodStart && String(i.invoice_date) <= periodEnd);
  const charges = inPeriod.reduce((s, i) => s + (['void', 'written_off'].includes(String(i.status)) ? 0 : Number(i.total || 0)), 0);
  const closing = invs
    .filter(i => String(i.invoice_date) <= periodEnd)
    .reduce((s, i) => s + openOf(i), 0);
  const payments = ((receipts || []) as Record<string, unknown>[])
    .filter(r => String(r.status) === 'settled' && String(r.receipt_date) >= periodStart && String(r.receipt_date) <= periodEnd)
    .reduce((s, r) => s + Number(r.amount || 0), 0);
  const credits = ((memos || []) as Record<string, unknown>[])
    .filter(m => String(m.credit_memo_date) >= periodStart && String(m.credit_memo_date) <= periodEnd && String(m.status) !== 'void')
    .reduce((s, m) => s + Number(m.total || 0), 0);

  // Aging of the closing balance by due date at period end
  const end = new Date(periodEnd + 'T00:00:00');
  const aging = { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, over90: 0 };
  for (const i of invs) {
    if (String(i.invoice_date) > periodEnd) continue;
    const open = openOf(i);
    if (!open) continue;
    const due = new Date(String(i.due_date || i.invoice_date) + 'T00:00:00');
    const days = Math.floor((end.getTime() - due.getTime()) / 86400000);
    if (days <= 0) aging.current += open;
    else if (days <= 30) aging.d1_30 += open;
    else if (days <= 60) aging.d31_60 += open;
    else if (days <= 90) aging.d61_90 += open;
    else aging.over90 += open;
  }

  const number = `ST-${1001 + (count || 0)}`;
  const { data, error } = await sb
    .from('acct_customer_statements')
    .insert({
      tenant_id: DEFAULT_TENANT_ID,
      customer_id: customerId,
      statement_number: number,
      period_start: periodStart,
      period_end: periodEnd,
      opening_balance: opening,
      charges_total: charges,
      payments_total: payments,
      credits_total: credits,
      closing_balance: closing,
      aging_current: aging.current,
      aging_1_30: aging.d1_30,
      aging_31_60: aging.d31_60,
      aging_61_90: aging.d61_90,
      aging_over_90: aging.over90,
      status: body.draft ? 'draft' : 'generated',
      generated_at: new Date().toISOString(),
    })
    .select('*')
    .single();
  if (error) return err('INTERNAL', error.message, 500);
  const customers = await customerMap(sb, [customerId]);
  return NextResponse.json({ data: toStatementDto(data as StatementRowDb, customers.get(customerId)) }, { status: 201 });
}
