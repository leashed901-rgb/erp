import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { shapeRow } from '../../route';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

/** POST /api/bank-transactions/[id]/create-bill-payment — Create ▸ Bill
 *  payment. Pays the picked open bill from this bank account via
 *  acct_pay_bills, then links the bank transaction to that payment. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return err('VALIDATION', 'Invalid JSON', 400);
  }
  const billId = body.bill_id as string | undefined;
  if (!billId) return err('VALIDATION', 'bill_id is required', 400);
  const sb = supabaseAdmin();
  const { data: row } = await sb
    .from('acct_bank_transactions')
    .select('id, bank_account_id, transaction_date, amount, review_status, posted_journal_id')
    .eq('id', id)
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .single();
  if (!row) return err('NOT_FOUND', 'Bank transaction not found', 404);
  if (row.review_status === 'posted' || row.posted_journal_id) {
    return err('VALIDATION', 'This transaction is already posted to the books', 400);
  }
  if (row.review_status === 'excluded') {
    return err('VALIDATION', 'This transaction is excluded — undo the exclusion first', 400);
  }
  const { data: bill } = await sb
    .from('acct_ap_bills')
    .select('id, vendor_id, open_balance, status')
    .eq('id', billId)
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .single();
  if (!bill) return err('NOT_FOUND', 'Bill not found', 404);
  const amount = body.amount !== undefined ? Number(body.amount) : Math.abs(Number(row.amount));
  if (!amount || amount <= 0) return err('VALIDATION', 'amount must be > 0', 400);
  if (amount > Number(bill.open_balance) + 0.005) {
    return err('VALIDATION', `Payment $${amount.toFixed(2)} exceeds the bill's open balance $${Number(bill.open_balance).toFixed(2)}`, 400);
  }

  const { data: paid, error } = await sb.rpc('acct_pay_bills', {
    p_bank_account_id: row.bank_account_id,
    p_payment_date: row.transaction_date,
    p_items: [{ bill_id: billId, amount }],
    p_method: (body.method as string) || 'bank',
    p_memo: (body.memo as string) || null,
  });
  if (error) return err('VALIDATION', error.message, 400);
  const payment = (paid || [])[0];
  if (!payment) return err('INTERNAL', 'acct_pay_bills returned no payment', 500);

  // Link the bank transaction to the payment's journal (bank GL line).
  const { data: bankAccount } = await sb
    .from('acct_bank_accounts')
    .select('gl_account_id')
    .eq('id', row.bank_account_id)
    .single();
  let bankLineId: string | null = null;
  if (payment.journal_entry_id && bankAccount) {
    const { data: lines } = await sb
      .from('acct_journal_lines')
      .select('id')
      .eq('journal_entry_id', payment.journal_entry_id)
      .eq('account_id', bankAccount.gl_account_id)
      .limit(1);
    bankLineId = lines?.[0]?.id || null;
    if (bankLineId) {
      await sb
        .from('acct_journal_lines')
        .update({ cleared_status: 'cleared', cleared_at: new Date().toISOString() })
        .eq('id', bankLineId);
    }
  }
  const { data } = await sb
    .from('acct_bank_transactions')
    .update({
      matched_doc_type: 'bill_payment',
      matched_doc_id: payment.payment_id,
      matched_journal_line_id: bankLineId,
      match_status: 'matched',
      review_status: 'matched',
    })
    .eq('id', id)
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .select('id, bank_account_id, transaction_date, posted_date, amount, currency, description, payee, reference, match_status, matched_journal_line_id, review_status, txn_type, category_account_id, payee_vendor_id, payee_customer_id, transfer_bank_account_id, memo, suggested_rule_id, posted_journal_id, matched_doc_type, matched_doc_id, excluded_reason, created_at')
    .single();
  return NextResponse.json({
    data: shapeRow(data || { id, review_status: 'matched' }),
    meta: { payment_id: payment.payment_id, journal_entry_id: payment.journal_entry_id },
    message: `Bill paid — $${amount.toFixed(2)}`,
  }, { status: 201 });
}
