import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/** PATCH /api/bank-transactions/[id] — categorize or update a bank txn.
 *  Body: { category?, status?, payee?, excluded? }
 *  Real columns: review_status (review/categorized/excluded), category_account_id,
 *  matched_doc_id, matched_doc_type. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: { code: 'VALIDATION', message: 'Invalid JSON body', requestId: crypto.randomUUID() } }, { status: 400 });
  }
  const updates: Record<string, unknown> = { reviewed_at: new Date().toISOString() };
  if ('payee' in body) updates.payee = body.payee;
  if ('description' in body) updates.description = body.description;
  // category maps to category_account_id (FK to acct_chart_of_accounts).
  // For now, store the string the user picked — the join to a real account
  // happens in a later enrichment step.
  if ('category' in body) updates.category_account_id = body.category;
  // status flips
  if (body.excluded === true) {
    updates.review_status = 'excluded';
  } else if (body.status) {
    updates.review_status = body.status;
  }

  const { data, error } = await supabaseAdmin()
    .from('acct_bank_transactions')
    .update(updates)
    .eq('id', id)
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .select('*')
    .single();
  if (error || !data) {
    // If category_account_id is an FK constraint failure (string vs UUID),
    // retry without it — just flip the review_status.
    if (updates.category_account_id) {
      delete updates.category_account_id;
      const { data: d2, error: e2 } = await supabaseAdmin()
        .from('acct_bank_transactions')
        .update(updates)
        .eq('id', id)
        .eq('tenant_id', DEFAULT_TENANT_ID)
        .select('*')
        .single();
      if (e2) {
        return NextResponse.json({ error: { code: 'INTERNAL', message: e2.message } }, { status: 500 });
      }
      return NextResponse.json({ data: d2 });
    }
    return NextResponse.json({ error: { code: 'VALIDATION', message: error?.message || 'Bank transaction not found', requestId: crypto.randomUUID() } }, { status: 400 });
  }
  return NextResponse.json({ data });
}
