import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/** POST /api/v1/documents/[id]/receive?type=invoice
 *  Records a payment against an invoice. Creates an acct_ar_receipts row
 *  and updates the invoice's amount_paid + status (open_balance is a
 *  generated column — it recomputes from amount_paid).
 *  Tries the take_payment / create_receipt RPC first.
 *
 *  A payment never depends on a bank account existing: the deposit
 *  account resolves caller-provided → tenant's first bank account →
 *  the platform's Undeposited Funds system register
 *  (acct_system_register, backed by GL 1100). Money received but not
 *  yet deposited lands there until it is deposited — recording a
 *  payment is a fact about the customer, not about a bank account. */
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

  // Resolve the deposit account BEFORE the RPC: take_payment stores it
  // on the receipt row (NOT NULL), so it needs a real id either way.
  // Caller-provided → tenant's first bank account → Undeposited Funds
  // system register (created on demand by acct_system_register).
  let effectiveDepositAccountId = depositAccountId;
  if (!effectiveDepositAccountId) {
    const { data: bankAccounts } = await supabaseAdmin()
      .from('acct_bank_accounts')
      .select('id')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .eq('is_active', true)
      .order('created_at', { ascending: true })
      .limit(1);
    effectiveDepositAccountId = bankAccounts?.[0]?.id as string | undefined;
  }
  if (!effectiveDepositAccountId) {
    let entityId = invoice.entity_id as string | undefined;
    if (!entityId) {
      const { data: entity } = await supabaseAdmin().rpc('acct_default_entity', { p_tenant_id: DEFAULT_TENANT_ID });
      entityId = entity as string | undefined;
    }
    const { data: registerId, error: registerErr } = await supabaseAdmin().rpc('acct_system_register', {
      p_tenant_id: DEFAULT_TENANT_ID,
      p_entity_id: entityId,
      p_kind: 'undeposited_funds',
    });
    if (registerErr || !registerId) {
      return NextResponse.json({ error: { code: 'INTERNAL', message: `Could not resolve a deposit account: ${registerErr?.message || 'no register returned'}`, requestId: crypto.randomUUID() } }, { status: 500 });
    }
    effectiveDepositAccountId = String(registerId);
  }

  // Try the registry RPC first — take_payment posts the receipt AND the
  // journal in one call. It requires a posted invoice, so drafts fall
  // through to the direct path below.
  const { data: rpcResult, error: rpcError } = await supabaseAdmin().rpc('take_payment', {
    p_tenant_id: DEFAULT_TENANT_ID,
    p_payment_date: new Date().toISOString().slice(0, 10),
    p_customer_id: String(invoice.customer_id),
    p_amount: amount,
    p_method: method,
    p_deposit_account_id: effectiveDepositAccountId,
    p_invoice_ids: [String(id)],
    p_reference: reference || null,
    p_notes: `Payment for ${invoice.invoice_number}`,
  });
  if (!rpcError && rpcResult) {
    return NextResponse.json({
      data: { id: rpcResult },
      meta: { invoice_id: id, invoice_number: invoice.invoice_number },
      message: `Payment of $${amount.toFixed(2)} recorded`,
    }, { status: 201 });
  }

  // RPC rejected the row (invoice not posted yet, or no grant) — record
  // the receipt directly with the resolved deposit account.
  // record the receipt directly, as before. entity_id comes from the
  // invoice — acct_ar_receipts requires it (NOT NULL, no default).
  const receiptNumber = `RCP-${Date.now()}`;
  const { data: receipt, error: receiptErr } = await supabaseAdmin()
    .from('acct_ar_receipts')
    .insert({
      tenant_id: DEFAULT_TENANT_ID,
      entity_id: invoice.entity_id,
      customer_id: invoice.customer_id,
      receipt_number: receiptNumber,
      receipt_date: new Date().toISOString().slice(0, 10),
      currency: invoice.currency || 'USD',
      amount,
      payment_method: method,
      status: 'settled',
      deposit_account_id: effectiveDepositAccountId,
      reference: reference || null,
      idempotency_key: body.idempotency_key || crypto.randomUUID(),
      memo: `Payment for ${invoice.invoice_number}`,
    })
    .select('*')
    .single();
  if (receiptErr) {
    return NextResponse.json({ error: { code: 'INTERNAL', message: receiptErr.message, requestId: crypto.randomUUID() } }, { status: 500 });
  }

  // Record the receipt → invoice link. acct_ar_receipts has no invoice_id
  // column, so acct_ar_receipt_applications is the ONLY place this payment
  // is tied to the invoice it paid. Without this row the receipt is
  // orphaned — the invoice drawer would show money with no source.
  const { error: appErr } = await supabaseAdmin()
    .from('acct_ar_receipt_applications')
    .insert({
      tenant_id: DEFAULT_TENANT_ID,
      receipt_id: receipt.id,
      invoice_id: id,
      applied_amount: amount,
      as_deposit: false,
    });
  if (appErr) {
    return NextResponse.json(
      {
        error: {
          code: 'INTERNAL',
          message: `Payment recorded (receipt ${receipt.receipt_number}) and invoice updated, but the receipt application could not be recorded: ${appErr.message}`,
          requestId: crypto.randomUUID(),
        },
        meta: { invoice_id: id, invoice_number: invoice.invoice_number, receipt_id: receipt.id },
      },
      { status: 500 },
    );
  }

  // Post the receipt to the GL. A receipt with no journal is money the
  // books never saw — the customer statement reads posted AR journal
  // lines, so an unposted receipt makes statements understate payments.
  // take_payment would have posted this, but it has no EXECUTE grant, so
  // the direct path posts via acct_post_entry: debit the deposit
  // account's GL, credit AR with the customer on the line (AR is a
  // control account — the RPC requires it). Idempotency keyed on the
  // receipt so a retry never double-posts.
  const { data: bankAcct } = await supabaseAdmin()
    .from('acct_bank_accounts')
    .select('gl_account_id')
    .eq('id', effectiveDepositAccountId)
    .maybeSingle();
  const { data: arAccountId } = await supabaseAdmin().rpc('acct_role_account', {
    p_tenant_id: DEFAULT_TENANT_ID,
    p_entity_id: invoice.entity_id,
    p_role: 'accounts_receivable',
  });
  let journalId: string | null = null;
  let journalErr: { message: string } | null = null;
  if (!bankAcct?.gl_account_id || !arAccountId) {
    journalErr = { message: 'Could not resolve the deposit or AR account for the receipt journal' };
  } else {
    const { data: posted, error: postErr } = await supabaseAdmin().rpc('acct_post_entry', {
      p_tenant_id: DEFAULT_TENANT_ID,
      p_entity_id: invoice.entity_id,
      p_entry_date: new Date().toISOString().slice(0, 10),
      p_lines: [
        { account_id: bankAcct.gl_account_id, debit: amount, description: `Payment for ${invoice.invoice_number}` },
        { account_id: arAccountId, credit: amount, customer_id: String(invoice.customer_id), description: `Payment for ${invoice.invoice_number}` },
      ],
      p_source: 'customer_receipt',
      p_reference: reference || receipt.receipt_number,
      p_memo: `Payment for ${invoice.invoice_number}`,
      p_idempotency_key: `receipt-${receipt.id}`,
      p_source_doc_type: 'receipt',
      p_source_doc_id: receipt.id,
    });
    if (postErr) journalErr = postErr;
    else journalId = String(posted);
  }
  if (journalId) {
    await supabaseAdmin().from('acct_ar_receipts').update({ posted_journal_id: journalId }).eq('id', receipt.id);
  }

  // Update the invoice. open_balance is GENERATED ALWAYS AS
  // (total - amount_paid - amount_credited) — writing it 400s the
  // whole update, so only amount_paid / status / paid_at are set.
  // Status 'partially_paid' matches take_payment's canonical value.
  const newAmountPaid = Number(invoice.amount_paid || 0) + amount;
  const newOpenBalance = Number(invoice.total) - newAmountPaid;
  const newStatus = newOpenBalance <= 0 ? 'paid' : 'partially_paid';
  const { error: updateErr } = await supabaseAdmin()
    .from('acct_ar_invoices')
    .update({
      amount_paid: newAmountPaid,
      status: newStatus,
      paid_at: newOpenBalance <= 0 ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (updateErr) {
    // The receipt is recorded, but the invoice was not updated — the
    // caller must know, or the invoice looks unpaid forever.
    return NextResponse.json(
      {
        error: {
          code: 'INTERNAL',
          message: `Payment recorded (receipt ${receipt.receipt_number}) but the invoice could not be updated: ${updateErr.message}`,
          requestId: crypto.randomUUID(),
        },
        meta: { invoice_id: id, invoice_number: invoice.invoice_number, receipt_id: receipt.id },
      },
      { status: 500 },
    );
  }

  if (journalErr) {
    // Receipt + application + invoice are recorded, but the GL journal
    // did not post — the books understate the payment until it is fixed.
    return NextResponse.json(
      {
        error: {
          code: 'INTERNAL',
          message: `Payment recorded (receipt ${receipt.receipt_number}) and invoice updated, but the receipt journal did not post: ${journalErr.message}`,
          requestId: crypto.randomUUID(),
        },
        meta: { invoice_id: id, invoice_number: invoice.invoice_number, receipt_id: receipt.id },
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    data: receipt,
    meta: {
      invoice_id: id,
      invoice_number: invoice.invoice_number,
      new_amount_paid: newAmountPaid,
      new_open_balance: Math.max(0, newOpenBalance),
      new_status: newStatus,
      journal_id: journalId,
    },
    message: `Payment of $${amount.toFixed(2)} recorded`,
  }, { status: 201 });
}
