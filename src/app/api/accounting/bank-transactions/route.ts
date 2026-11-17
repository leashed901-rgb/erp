import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/* Bank feed transactions over acct_bank_transactions. Status maps the
   platform review_status onto the screen's three tabs:
   for_review → review; categorized/posted/matched → categorized;
   excluded → excluded. Category/suggested labels resolve against
   acct_chart_of_accounts. */

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

export function bankTxnStatus(reviewStatus: string): 'review' | 'categorized' | 'excluded' {
  if (reviewStatus === 'excluded') return 'excluded';
  if (reviewStatus === 'for_review') return 'review';
  return 'categorized';
}

export async function GET(req: NextRequest) {
  const accountId = req.nextUrl.searchParams.get('accountId');
  const sb = supabaseAdmin();
  let query = sb
    .from('acct_bank_transactions')
    .select('*')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .order('transaction_date', { ascending: false })
    .limit(500);
  if (accountId) query = query.eq('bank_account_id', accountId);
  const { data, error } = await query;
  if (error) return err('INTERNAL', error.message, 500);

  const { data: coa } = await sb
    .from('acct_chart_of_accounts')
    .select('id, name')
    .eq('tenant_id', DEFAULT_TENANT_ID);
  const names = new Map(((coa || []) as Record<string, unknown>[]).map((a) => [String(a.id), String(a.name)]));

  return NextResponse.json({
    data: ((data || []) as Record<string, unknown>[]).map((t) => {
      const amount = Number(t.amount || 0);
      const catId = (t.category_account_id as string) || null;
      const sugId = (t.suggested_account_id as string) || null;
      return {
        id: String(t.id),
        bankAccountId: String(t.bank_account_id),
        date: String(t.transaction_date || ''),
        description: String(t.description || ''),
        payee: (t.payee as string) || null,
        amount,
        type: amount >= 0 ? 'income' : 'expense',
        status: bankTxnStatus(String(t.review_status || 'for_review')),
        rawStatus: String(t.review_status || 'for_review'),
        matchStatus: String(t.match_status || 'unmatched'),
        categoryAccountId: catId,
        categoryLabel: catId ? names.get(catId) || null : null,
        suggestedAccountId: sugId,
        suggestedLabel: sugId ? names.get(sugId) || null : null,
        suggestedRuleId: (t.suggested_rule_id as string) || null,
        matchedLabel: t.matched_doc_type
          ? `${String(t.matched_doc_type).replace(/_/g, ' ')}`
          : String(t.match_status) === 'matched'
            ? 'Matched'
            : null,
        excludedReason: (t.excluded_reason as string) || null,
        hasReceipt: !!t.receipt_attachment_id,
        memo: (t.memo as string) || null,
      };
    }),
  });
}
