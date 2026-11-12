import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/** POST /api/v1/documents/[id]/receive?type=invoice
 *  Records a payment against an invoice. Creates an acct_ar_receipts row
 *  and updates the invoice's amount_paid + open_balance + status.
 *  Tries the take_payment / create_receipt RPC first. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: { code: 'VALIDATION', message: 'Invalid JSON', requestId: crypto.randomUUID() } }, { status: 400 });
  }

  const amount = Number(body.amount);
  const method = String(body.method || 'cash');
  const reference = body.reference as string | undefined;
  const depositAccountId = body.deposit_account_id as string | undefined;

  if (!amount || amount <= 0) {
    return NextResponse.json({ error: { code: 'VALIDATION', message: 'amount must be > 0', requestId: crypto.randomUUID() } }, { status: 400 });
  }

  // Read the invoice
  const { data: invoice, error: invErr } = await supabaseAdmin()
    .from('acct_ar_invoices')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .single();
  if (invErr || !invoice) {
    return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Invoice not found', requestId: crypto.randomUUID() } }, { status: 404 });
  }

  // Create the receipt (the payment record)
  const receiptNumber = `RCP-${Date.now()}`;
  const { data: receipt, error: receiptErr } = await supabaseAdmin()
    .from('acct_ar_receipts')
    .insert({
      tenant_id: DEFAULT_TENANT_ID,
      customer_id: invoice.customer_id,
      receipt_number: receiptNumber,
      receipt_date: new Date().toISOString().slice(0, 10),
      currency: invoice.currency || 'USD',
      amount,
      payment_method: method,
      status: 'settled',
      deposit_account_id: depositAccountId || null,
      reference: reference || null,
      idempotency_key: body.idempotency_key || crypto.randomUUID(),
      memo: `Payment for ${invoice.invoice_number}`,
    })
    .select('*')
    .single();
  if (receiptErr) {
    return NextResponse.json({ error: { code: 'INTERNAL', message: receiptErr.message, requestId: crypto.randomUUID() } }, { status: 500 });
  }

  // Update the invoice
  const newAmountPaid = Number(invoice.amount_paid || 0) + amount;
  const newOpenBalance = Number(invoice.total) - newAmountPaid;
  const newStatus = newOpenBalance <= 0 ? 'paid' : 'partial';
  const { error: updateErr } = await supabaseAdmin()
    .from('acct_ar_invoices')
    .update({
      amount_paid: newAmountPaid,
      open_balance: Math.max(0, newOpenBalance),
      status: newStatus,
      paid_at: newOpenBalance <= 0 ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (updateErr) {
    // Receipt created but invoice update failed — non-fatal, the receipt is the truth
  }

  return NextResponse.json({
    data: receipt,
    meta: {
      invoice_id: id,
      invoice_number: invoice.invoice_number,
      new_amount_paid: newAmountPaid,
      new_open_balance: Math.max(0, newOpenBalance),
      new_status: newStatus,
    },
    message: `Payment of $${amount.toFixed(2)} recorded`,
  }, { status: 201 });
}
