import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

/** POST /api/bank-rules/apply-all — run every active rule over the For
 *  review queue (acct_apply_bank_rules). This is what "Sync bank" does
 *  in the feed: there is no live bank feed connected, so the sync is
 *  the rule engine over the transactions already in the books.
 *  Auto-confirm rules post; the rest land Categorized with a
 *  suggestion for the user to confirm. */
export async function POST(_req: NextRequest) {
  const sb = supabaseAdmin();
  const { data: before } = await sb
    .from('acct_bank_transactions')
    .select('id, review_status')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('review_status', 'for_review');
  const forReviewIds = (before || []).map((t) => t.id);
  if (forReviewIds.length === 0) {
    return NextResponse.json({
      data: { posted: [], suggested: [], failed: [] },
      meta: { checked: 0, posted_count: 0, suggested_count: 0, failed_count: 0 },
      message: 'Nothing for review — the queue is empty',
    });
  }
  const { data: applied, error } = await sb.rpc('acct_apply_bank_rules', {
    p_tenant_id: DEFAULT_TENANT_ID,
    p_bank_txn_id: null,
  });
  if (error) return err('VALIDATION', error.message, 400);
  const { data: after } = await sb
    .from('acct_bank_transactions')
    .select('id, description, amount, review_status')
    .in('id', forReviewIds);
  const posted = (after || []).filter((t) => t.review_status === 'posted');
  const suggested = (after || []).filter(
    (t) => t.review_status === 'categorized' || t.review_status === 'matched',
  );
  const stillReview = (after || []).filter((t) => t.review_status === 'for_review');
  return NextResponse.json({
    data: {
      posted: posted.map((t) => ({ id: t.id, description: t.description, amount: Number(t.amount) })),
      suggested: suggested.map((t) => ({ id: t.id, description: t.description, amount: Number(t.amount) })),
      still_review: stillReview.length,
    },
    meta: {
      checked: forReviewIds.length,
      engine_applied: applied ?? 0,
      posted_count: posted.length,
      suggested_count: suggested.length,
      still_review_count: stillReview.length,
    },
    message: `Rules run over ${forReviewIds.length} transactions — ${posted.length} posted, ${suggested.length} categorized, ${stillReview.length} still for review`,
  });
}
