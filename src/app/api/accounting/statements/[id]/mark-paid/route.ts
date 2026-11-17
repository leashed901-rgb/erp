import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { tenantEntityId } from '@/lib/acctServer';

/* POST /api/accounting/statements/[id]/mark-paid
 * Settles every open invoice dated on or before the statement's
 * period end: one acct_ar_receipts row per invoice plus the invoice
 * update — the same writes the Document Engine receive endpoint
 * performs. Returns what was actually paid. */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = supabaseAdmin();
  const { data: stmt } = await sb
    .from('acct_customer_statements')
    .select('id, customer_id, period_end, status')
    .eq('id', id)
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .single();
  if (!stmt) {
    return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Statement not found', requestId: crypto.randomUUID() } }, { status: 404 });
  }
  if (stmt.status === 'void') {
    return NextResponse.json({ error: { code: 'CONFLICT', message: 'Statement is void', requestId: crypto.randomUUID() } }, { status: 409 });
  }

  const { data: bank } = await sb
    .from('acct_bank_accounts')
    .select('id')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('is_active', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .single();
  if (!bank) {
    return NextResponse.json({ error: { code: 'VALIDATION', message: 'No deposit account available', requestId: crypto.randomUUID() } }, { status: 400 });
  }
  const entityId = await tenantEntityId();

  const { data: invoices } = await sb
    .from('acct_ar_invoices')
    .select('id, invoice_number, total, amount_paid, amount_credited, status, entity_id, currency')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('customer_id', stmt.customer_id as string)
    .lte('invoice_date', stmt.period_end as string);

  let paidCount = 0;
  let paidTotal = 0;
  for (const inv of invoices || []) {
    if (['void', 'written_off', 'paid'].includes(String(inv.status))) continue;
    const open = Math.max(0, Number(inv.total || 0) - Number(inv.amount_paid || 0) - Number(inv.amount_credited || 0));
    if (open <= 0) continue;
    const { error: receiptErr } = await sb.from('acct_ar_receipts').insert({
      tenant_id: DEFAULT_TENANT_ID,
      entity_id: (inv.entity_id as string) || entityId,
      customer_id: stmt.customer_id as string,
      receipt_number: `RCP-${Date.now()}-${paidCount + 1}`,
      receipt_date: new Date().toISOString().slice(0, 10),
      currency: (inv.currency as string) || 'USD',
      amount: open,
      payment_method: 'cash',
      status: 'settled',
      deposit_account_id: bank.id as string,
      idempotency_key: crypto.randomUUID(),
      memo: `Statement payment for ${inv.invoice_number}`,
    });
    if (receiptErr) continue;
    const newPaid = Number(inv.amount_paid || 0) + open;
    const { error: updErr } = await sb
      .from('acct_ar_invoices')
      .update({
        amount_paid: newPaid,
        status: 'paid',
        paid_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', inv.id as string);
    if (updErr) continue;
    paidCount++;
    paidTotal += open;
  }

  return NextResponse.json({ data: { statementId: id, paidCount, paidTotal } });
}
