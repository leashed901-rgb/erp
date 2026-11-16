import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/** POST /api/v1/documents/[id]/mark-paid?type=invoice
 *  Registry action `invoice.mark_paid` → RPC `acct_mark_invoice_paid`.
 *  Body: { date?, method?, reference?, amount?, deposit_bank_account_id? }
 *  Falls back to the receive path (direct receipt + balance update) if the
 *  RPC rejects the row (e.g. invoice not posted yet). */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const type = searchParams.get('type');
  if (type !== 'Invoice' && type !== 'invoice') {
    return NextResponse.json({ error: { code: 'VALIDATION', message: 'mark-paid applies to Invoice documents', requestId: crypto.randomUUID() } }, { status: 400 });
  }

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* empty body is fine */ }

  const { data: rpcResult, error: rpcError } = await supabaseAdmin().rpc('acct_mark_invoice_paid', {
    p_invoice_id: id,
    p_date: (body.date as string) || new Date().toISOString().slice(0, 10),
    p_method: (body.method as string) || 'cash',
    p_deposit_bank_account_id: (body.deposit_bank_account_id as string) || null,
    p_reference: (body.reference as string) || null,
    p_amount: body.amount != null ? Number(body.amount) : null,
  });
  if (!rpcError && rpcResult) {
    return NextResponse.json({ data: { id, receipt_id: rpcResult }, message: 'Invoice marked paid' });
  }

  // RPC rejected — record the payment directly so a draft/unposted invoice
  // can still be flipped to paid by hand.
  const amount = Number(body.amount);
  if (!amount || amount <= 0) {
    return NextResponse.json({ error: { code: 'VALIDATION', message: rpcError?.message || 'amount must be > 0 to mark paid', requestId: crypto.randomUUID() } }, { status: 400 });
  }
  const { data: invoice, error: invErr } = await supabaseAdmin()
    .from('acct_ar_invoices')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .single();
  if (invErr || !invoice) {
    return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Invoice not found', requestId: crypto.randomUUID() } }, { status: 404 });
  }
  const newAmountPaid = Number(invoice.amount_paid || 0) + amount;
  const newStatus = Number(invoice.total) - newAmountPaid <= 0 ? 'paid' : 'partial';
  const { data, error } = await supabaseAdmin()
    .from('acct_ar_invoices')
    .update({
      amount_paid: newAmountPaid,
      status: newStatus,
      paid_at: newStatus === 'paid' ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select('*')
    .single();
  if (error) {
    return NextResponse.json({ error: { code: 'INTERNAL', message: error.message, requestId: crypto.randomUUID() } }, { status: 500 });
  }
  return NextResponse.json({ data, message: 'Invoice marked paid (direct update)' });
}
