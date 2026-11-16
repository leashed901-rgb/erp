import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

/** POST /api/bank-rules/[id]/preview — live preview: which For review
 *  transactions does this rule match right now (acct_bank_rule_matches
 *  per transaction, not the screen's hardcoded SAMPLE_TXNS). */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* empty body ok */ }
  const sb = supabaseAdmin();
  const { data: rule } = await sb
    .from('acct_bank_rules')
    .select('id, name')
    .eq('id', id)
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .single();
  if (!rule) return err('NOT_FOUND', 'Bank rule not found', 404);

  let query = sb
    .from('acct_bank_transactions')
    .select('id, transaction_date, description, payee, amount, review_status')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('review_status', 'for_review')
    .order('transaction_date', { ascending: false })
    .limit(200);
  if (body.bank_account_id) query = query.eq('bank_account_id', body.bank_account_id as string);
  const { data: txns } = await query;

  const matches = [];
  for (const t of txns || []) {
    const { data: hit } = await sb.rpc('acct_bank_rule_matches', {
      p_rule_id: id,
      p_txn_id: t.id,
    });
    if (hit) matches.push(t);
  }
  return NextResponse.json({
    data: matches,
    meta: { rule_id: id, rule_name: rule.name, checked: (txns || []).length, matched: matches.length },
  });
}
