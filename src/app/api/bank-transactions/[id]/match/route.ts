import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { shapeRow } from '../../route';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

/** POST /api/bank-transactions/[id]/match — link the transaction to an
 *  already-posted journal line (the Match drawer). The candidate must
 *  come from acct_bank_match_candidates; the line is marked cleared
 *  and the transaction becomes Matched without creating a new entry. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return err('VALIDATION', 'Invalid JSON', 400);
  }
  const journalLineId = body.journal_line_id as string | undefined;
  if (!journalLineId) return err('VALIDATION', 'journal_line_id is required', 400);

  const { data: row } = await supabaseAdmin()
    .from('acct_bank_transactions')
    .select('id, review_status, match_status')
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

  // The line must be a real candidate for this transaction.
  const { data: candidates, error: candErr } = await supabaseAdmin().rpc('acct_bank_match_candidates', {
    p_bank_txn_id: id,
    p_days: 10,
  });
  if (candErr) return err('INTERNAL', candErr.message, 500);
  const match = (candidates || []).find((c: { journal_line_id: string }) => c.journal_line_id === journalLineId);
  if (!match) {
    return err('VALIDATION', 'That journal line is not a match candidate for this transaction', 400);
  }

  const { error: lineErr } = await supabaseAdmin()
    .from('acct_journal_lines')
    .update({ cleared_status: 'cleared', cleared_at: new Date().toISOString() })
    .eq('id', journalLineId)
    .eq('tenant_id', DEFAULT_TENANT_ID);
  if (lineErr) return err('INTERNAL', lineErr.message, 500);

  const { data, error } = await supabaseAdmin()
    .from('acct_bank_transactions')
    .update({
      matched_journal_line_id: journalLineId,
      match_status: 'matched',
      review_status: 'matched',
    })
    .eq('id', id)
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .select('id, bank_account_id, transaction_date, posted_date, amount, currency, description, payee, reference, match_status, matched_journal_line_id, review_status, txn_type, category_account_id, payee_vendor_id, payee_customer_id, transfer_bank_account_id, memo, suggested_rule_id, posted_journal_id, matched_doc_type, matched_doc_id, excluded_reason, created_at')
    .single();
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({
    data: shapeRow(data),
    message: `Matched to journal entry ${match.entry_no}`,
  });
}
