import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { shapeRow } from '../../route';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

/** POST /api/bank-transactions/[id]/create-transfer — Create ▸ Transfer.
 *  Moves the money to another bank account via acct_transfer_funds
 *  (posts both sides) and links this bank transaction to the transfer. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return err('VALIDATION', 'Invalid JSON', 400);
  }
  const toBankAccountId = body.to_bank_account_id as string | undefined;
  if (!toBankAccountId) return err('VALIDATION', 'to_bank_account_id is required', 400);
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
  if (toBankAccountId === row.bank_account_id) {
    return err('VALIDATION', 'Transfer to the same account', 400);
  }
  const { data: toAccount } = await sb
    .from('acct_bank_accounts')
    .select('id, name')
    .eq('id', toBankAccountId)
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .single();
  if (!toAccount) return err('NOT_FOUND', 'Destination bank account not found', 404);

  const amount = Math.abs(Number(row.amount));
  const { data: transferId, error } = await sb.rpc('acct_transfer_funds', {
    p_from_account_id: row.bank_account_id,
    p_to_account_id: toBankAccountId,
    p_date: row.transaction_date,
    p_amount: amount,
    p_memo: (body.memo as string) || null,
  });
  if (error) return err('VALIDATION', error.message, 400);

  const { data } = await sb
    .from('acct_bank_transactions')
    .update({
      transfer_bank_account_id: toBankAccountId,
      txn_type: 'transfer',
      matched_doc_type: 'transfer',
      matched_doc_id: transferId,
      match_status: 'matched',
      review_status: 'matched',
    })
    .eq('id', id)
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .select('id, bank_account_id, transaction_date, posted_date, amount, currency, description, payee, reference, match_status, matched_journal_line_id, review_status, txn_type, category_account_id, payee_vendor_id, payee_customer_id, transfer_bank_account_id, memo, suggested_rule_id, posted_journal_id, matched_doc_type, matched_doc_id, excluded_reason, created_at')
    .single();
  return NextResponse.json({
    data: shapeRow(data || { id, review_status: 'matched' }),
    meta: { transfer_id: transferId, to_account: toAccount.name },
    message: `Transferred $${amount.toFixed(2)} to ${toAccount.name}`,
  }, { status: 201 });
}
