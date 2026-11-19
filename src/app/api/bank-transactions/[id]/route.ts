import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { shapeRow } from '../route';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

const SELECT =
  'id, bank_account_id, transaction_date, posted_date, amount, currency, description, payee, reference, match_status, matched_journal_line_id, review_status, txn_type, category_account_id, payee_vendor_id, payee_customer_id, transfer_bank_account_id, memo, suggested_rule_id, posted_journal_id, matched_doc_type, matched_doc_id, excluded_reason, created_at';

async function getRow(id: string) {
  const { data, error } = await supabaseAdmin()
    .from('acct_bank_transactions')
    .select(SELECT)
    .eq('id', id)
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .single();
  if (error || !data) return null;
  return data;
}

/** GET /api/bank-transactions/[id] */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const row = await getRow(id);
  if (!row) return err('NOT_FOUND', 'Bank transaction not found', 404);
  return NextResponse.json({ data: shapeRow(row) });
}

/** PATCH /api/bank-transactions/[id] — edit memo/payee, exclude or
 *  undo an exclusion. Categorizing (posting to the books) is NOT done
 *  here — use POST /categorize, which runs acct_accept_bank_transaction
 *  so the journal is real. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return err('VALIDATION', 'Invalid JSON', 400);
  }
  const row = await getRow(id);
  if (!row) return err('NOT_FOUND', 'Bank transaction not found', 404);
  if (row.review_status === 'posted') {
    return err('VALIDATION', 'This transaction is already posted to the books — reverse the journal instead of editing it', 400);
  }
  const updates: Record<string, unknown> = {};
  if (body.memo !== undefined) updates.memo = body.memo as string | null;
  if (body.payee !== undefined) updates.payee = body.payee as string | null;
  if (body.description !== undefined) updates.description = body.description as string;
  if (body.payee_vendor_id !== undefined) updates.payee_vendor_id = body.payee_vendor_id as string | null;
  if (body.payee_customer_id !== undefined) updates.payee_customer_id = body.payee_customer_id as string | null;
  if (body.exclude === true) {
    updates.review_status = 'excluded';
    updates.excluded_reason = (body.excluded_reason as string) || 'Excluded by user';
  } else if (body.exclude === false) {
    updates.review_status = 'for_review';
    updates.excluded_reason = null;
  }
  if (Object.keys(updates).length === 0) return err('VALIDATION', 'Nothing to update', 400);
  const { data, error } = await supabaseAdmin()
    .from('acct_bank_transactions')
    .update(updates)
    .eq('id', id)
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .select(SELECT)
    .single();
  if (error) return err('VALIDATION', error.message, 400);
  return NextResponse.json({ data: shapeRow(data) });
}

/** DELETE /api/bank-transactions/[id] — delete a review-queue row.
 *  Posted rows cannot be deleted (they have a journal). */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const row = await getRow(id);
  if (!row) return err('NOT_FOUND', 'Bank transaction not found', 404);
  if (row.review_status === 'posted' || row.posted_journal_id) {
    return err('VALIDATION', 'This transaction is posted to the books — reverse its journal entry instead of deleting it', 400);
  }
  const { error } = await supabaseAdmin()
    .from('acct_bank_transactions')
    .delete()
    .eq('id', id)
    .eq('tenant_id', DEFAULT_TENANT_ID);
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: { id, deleted: true } });
}
