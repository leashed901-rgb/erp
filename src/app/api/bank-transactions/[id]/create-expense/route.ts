import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { shapeRow } from '../../route';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

async function getRow(id: string) {
  const { data } = await supabaseAdmin()
    .from('acct_bank_transactions')
    .select('id, bank_account_id, transaction_date, amount, description, payee, review_status, posted_journal_id')
    .eq('id', id)
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .single();
  return data;
}

/** POST /api/bank-transactions/[id]/create-expense — Create ▸ Expense.
 *  Creates the expense record (acct_spend_transactions + line) and posts
 *  the bank transaction to the books with it, so the expense, the
 *  journal, and the bank row all point at each other. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return err('VALIDATION', 'Invalid JSON', 400);
  }
  const accountId = body.account_id as string | undefined;
  if (!accountId) return err('VALIDATION', 'account_id (expense account) is required', 400);
  const row = await getRow(id);
  if (!row) return err('NOT_FOUND', 'Bank transaction not found', 404);
  if (row.review_status === 'posted' || row.posted_journal_id) {
    return err('VALIDATION', 'This transaction is already posted to the books', 400);
  }
  if (row.review_status === 'excluded') {
    return err('VALIDATION', 'This transaction is excluded — undo the exclusion first', 400);
  }
  if (Number(row.amount) >= 0) {
    return err('VALIDATION', 'An expense comes from money out — this transaction is money in', 400);
  }
  const amount = Math.abs(Number(row.amount));
  const sb = supabaseAdmin();
  const { data: entityId } = await sb.rpc('acct_default_entity', { p_tenant_id: DEFAULT_TENANT_ID });
  if (!entityId) return err('CONFIG', 'No default entity for this tenant', 500);

  const { data: spend, error: spendErr } = await sb
    .from('acct_spend_transactions')
    .insert({
      tenant_id: DEFAULT_TENANT_ID,
      entity_id: entityId,
      txn_kind: 'expense',
      payee_vendor_id: (body.vendor_id as string) || null,
      payee_name: (body.payee as string) || row.payee || row.description,
      bank_account_id: row.bank_account_id,
      bank_transaction_id: id,
      payment_date: row.transaction_date,
      payment_method: 'bank',
      memo: (body.memo as string) || row.description,
      subtotal: amount,
      total: amount,
      status: 'draft',
    })
    .select('id')
    .single();
  if (spendErr) return err('VALIDATION', spendErr.message, 400);

  const { error: lineErr } = await sb.from('acct_spend_lines').insert({
    tenant_id: DEFAULT_TENANT_ID,
    spend_id: spend.id,
    line_no: 1,
    account_id: accountId,
    description: (body.memo as string) || row.description,
    quantity: 1,
    rate: amount,
    amount,
  });
  if (lineErr) {
    await sb.from('acct_spend_transactions').delete().eq('id', spend.id);
    return err('VALIDATION', lineErr.message, 400);
  }

  // Post the bank transaction to the books against the expense account.
  const { data: journalId, error: acceptErr } = await sb.rpc('acct_accept_bank_transaction', {
    p_bank_txn_id: id,
    p_override: {
      txn_type: 'expense',
      category_account_id: accountId,
      payee_vendor_id: (body.vendor_id as string) || undefined,
      memo: (body.memo as string) || row.description,
    },
  });
  if (acceptErr) {
    await sb.from('acct_spend_transactions').delete().eq('id', spend.id);
    return err('VALIDATION', acceptErr.message, 400);
  }
  const { error: linkErr } = await sb
    .from('acct_spend_transactions')
    // NOTE: the CHECK vocabulary is draft/posted/void — 'paid' is not
    // a valid status and the update would fail silently.
    .update({ posted_journal_id: journalId, status: 'posted' })
    .eq('id', spend.id);
  if (linkErr) return err('VALIDATION', `Expense created but could not be linked: ${linkErr.message}`, 400);

  const { data } = await sb
    .from('acct_bank_transactions')
    .select('id, bank_account_id, transaction_date, posted_date, amount, currency, description, payee, reference, match_status, matched_journal_line_id, review_status, txn_type, category_account_id, payee_vendor_id, payee_customer_id, transfer_bank_account_id, memo, suggested_rule_id, posted_journal_id, matched_doc_type, matched_doc_id, excluded_reason, created_at')
    .eq('id', id)
    .single();
  return NextResponse.json({
    data: shapeRow(data || { id, review_status: 'posted' }),
    meta: { spend_id: spend.id, journal_entry_id: journalId },
    message: 'Expense created and posted',
  }, { status: 201 });
}
