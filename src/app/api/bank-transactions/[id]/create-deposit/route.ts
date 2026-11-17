import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { shapeRow } from '../../route';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

/** POST /api/bank-transactions/[id]/create-deposit — Create ▸ Deposit.
 *  Groups this money-in transaction (and any picked receipts) into a
 *  bank deposit via acct_make_deposit, then links the bank transaction
 *  to the deposit. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return err('VALIDATION', 'Invalid JSON', 400);
  }
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
  if (Number(row.amount) <= 0) {
    return err('VALIDATION', 'A deposit comes from money in — this transaction is money out', 400);
  }
  const accountId = body.account_id as string | undefined;
  const receiptIds = (body.receipt_ids as string[] | undefined) || [];
  if (!accountId && receiptIds.length === 0) {
    return err('VALIDATION', 'Pick an account (or receipts) for the deposit', 400);
  }
  const amount = Math.abs(Number(row.amount));
  const otherLines = accountId
    ? [{ account_id: accountId, amount, description: (body.memo as string) || 'Deposit', received_from: (body.received_from as string) || null }]
    : [];

  const { data: depositId, error } = await sb.rpc('acct_make_deposit', {
    p_bank_account_id: row.bank_account_id,
    p_date: row.transaction_date,
    p_receipt_ids: receiptIds,
    p_other_lines: otherLines,
    p_memo: (body.memo as string) || null,
  });
  if (error) return err('VALIDATION', error.message, 400);

  const { data } = await sb
    .from('acct_bank_transactions')
    .update({
      matched_doc_type: 'deposit',
      matched_doc_id: depositId,
      match_status: 'matched',
      review_status: 'matched',
    })
    .eq('id', id)
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .select('id, bank_account_id, transaction_date, posted_date, amount, currency, description, payee, reference, match_status, matched_journal_line_id, review_status, txn_type, category_account_id, payee_vendor_id, payee_customer_id, transfer_bank_account_id, memo, suggested_rule_id, posted_journal_id, matched_doc_type, matched_doc_id, excluded_reason, created_at')
    .single();
  return NextResponse.json({
    data: shapeRow(data || { id, review_status: 'matched' }),
    meta: { deposit_id: depositId },
    message: `Deposit recorded — $${amount.toFixed(2)}`,
  }, { status: 201 });
}
