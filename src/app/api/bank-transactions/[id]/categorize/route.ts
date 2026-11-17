import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { shapeRow } from '../../route';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

/** POST /api/bank-transactions/[id]/categorize — the Categorize action.
 *  Runs acct_accept_bank_transaction with the picked category: it posts
 *  the journal (bank GL + category) and marks the transaction posted.
 *  The row leaves the For review queue for real. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return err('VALIDATION', 'Invalid JSON', 400);
  }
  const categoryAccountId = body.category_account_id as string | undefined;
  if (!categoryAccountId) return err('VALIDATION', 'category_account_id is required', 400);

  const { data: row } = await supabaseAdmin()
    .from('acct_bank_transactions')
    .select('id, review_status')
    .eq('id', id)
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .single();
  if (!row) return err('NOT_FOUND', 'Bank transaction not found', 404);
  if (row.review_status === 'posted') {
    return err('VALIDATION', 'This transaction is already posted to the books', 400);
  }
  if (row.review_status === 'excluded') {
    return err('VALIDATION', 'This transaction is excluded — undo the exclusion first', 400);
  }

  const override: Record<string, unknown> = { category_account_id: categoryAccountId };
  if (body.txn_type) override.txn_type = body.txn_type;
  if (body.memo) override.memo = body.memo;
  if (body.payee_vendor_id) override.payee_vendor_id = body.payee_vendor_id;
  if (body.payee_customer_id) override.payee_customer_id = body.payee_customer_id;
  if (body.transfer_bank_account_id) override.transfer_bank_account_id = body.transfer_bank_account_id;
  if (body.splits) override.splits = body.splits;

  const { data: journalId, error } = await supabaseAdmin().rpc('acct_accept_bank_transaction', {
    p_bank_txn_id: id,
    p_override: override,
  });
  if (error) return err('VALIDATION', error.message, 400);

  const { data } = await supabaseAdmin()
    .from('acct_bank_transactions')
    .select('id, bank_account_id, transaction_date, posted_date, amount, currency, description, payee, reference, match_status, matched_journal_line_id, review_status, txn_type, category_account_id, payee_vendor_id, payee_customer_id, transfer_bank_account_id, memo, suggested_rule_id, posted_journal_id, matched_doc_type, matched_doc_id, excluded_reason, created_at')
    .eq('id', id)
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .single();
  return NextResponse.json({
    data: shapeRow(data || { id, review_status: 'posted' }),
    meta: { journal_entry_id: journalId },
    message: 'Categorized — posted to the books',
  }, { status: 201 });
}
