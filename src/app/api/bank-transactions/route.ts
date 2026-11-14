import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/** GET /api/bank-transactions?account_id=xxx&status=review
 *  Reads acct_bank_transactions — the real bank feed.
 *  Columns on this table: transaction_date, posted_date, description, payee,
 *  amount, match_status, review_status, review_stage, category_account_id,
 *  matched_doc_id, matched_doc_type. */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const accountId = searchParams.get('account_id');
  const status = searchParams.get('status');
  const limit = Math.min(Number(searchParams.get('limit') || 200), 500);

  let q = supabaseAdmin()
    .from('acct_bank_transactions')
    .select('*')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .order('transaction_date', { ascending: false })
    .limit(limit);
  if (accountId) q = q.eq('bank_account_id', accountId);
  // Status filter maps to review_status (review / categorized / excluded) or
  // match_status (matched). The `status` query param is the screen's tab.
  if (status && status !== 'all') {
    if (status === 'matched') q = q.eq('match_status', 'matched');
    else if (status === 'review') q = q.eq('review_status', 'for_review');
    else q = q.eq('review_status', status);
  }

  const { data, error } = await q;
  if (error) {
    const code = (error as { code?: string }).code;
    if (code === '42P01' || code === 'PGRST205' || code === 'PGRST200') {
      return NextResponse.json({ data: [], schema_pending: true });
    }
    return NextResponse.json({ error: { code: 'INTERNAL', message: error.message, requestId: crypto.randomUUID() } }, { status: 500 });
  }
  // Normalize to the BankTransaction shape the UI expects.
  const rows = (data || []).map((r: Record<string, unknown>) => {
    const matchStatus = r.match_status as string | undefined;
    const reviewStatus = r.review_status as string | undefined;
    // Map DB values → UI status set (review | matched | categorized | excluded)
    let status: string;
    if (matchStatus === 'matched' || matchStatus === 'reconciled') status = 'matched';
    else if (reviewStatus === 'categorized') status = 'categorized';
    else if (reviewStatus === 'excluded') status = 'excluded';
    else status = 'review';
    return {
      ...r,
      posted_at: r.posted_date || r.transaction_date,
      status,
      category: r.category_account_id || null,
      matched_document_id: r.matched_doc_id || null,
      matched_document_type: r.matched_doc_type || null,
    };
  });
  return NextResponse.json({ data: rows });
}

/** POST /api/bank-transactions — insert a bank transaction (manual entry). */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: { code: 'VALIDATION', message: 'Invalid JSON body', requestId: crypto.randomUUID() } }, { status: 400 });
  }
  const insert: Record<string, unknown> = {
    tenant_id: DEFAULT_TENANT_ID,
    bank_account_id: body.bank_account_id || null,
    transaction_date: body.transaction_date || body.posted_at || body.date || new Date().toISOString(),
    description: String(body.description || body.desc || ''),
    amount: Number(body.amount) || 0,
    currency: String(body.currency || 'USD'),
    review_status: String(body.status || 'review'),
  };
  if (body.payee) insert.payee = String(body.payee);
  const { data, error } = await supabaseAdmin()
    .from('acct_bank_transactions')
    .insert(insert)
    .select('*')
    .single();
  if (error) {
    return NextResponse.json({ error: { code: 'INTERNAL', message: error.message, requestId: crypto.randomUUID() } }, { status: 500 });
  }
  return NextResponse.json({ data }, { status: 201 });
}
