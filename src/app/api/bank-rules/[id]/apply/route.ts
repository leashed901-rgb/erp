import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

/** POST /api/bank-rules/[id]/apply — apply this rule to existing For
 *  review transactions. For each live transaction the rule matches
 *  (acct_bank_rule_matches), run the engine (acct_apply_bank_rules)
 *  for that transaction: the engine categorizes it, and posts the
 *  journal only when the rule has auto_confirm. So a non-auto-confirm
 *  rule leaves the row Categorized with its suggestion — the user
 *  still confirms it in the feed — exactly like the engine does on
 *  import. Returns posted / suggested / failed counts per row. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* empty body ok */ }
  const sb = supabaseAdmin();
  const { data: rule } = await sb
    .from('acct_bank_rules')
    .select('id, name, txn_type, is_active, auto_confirm')
    .eq('id', id)
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .single();
  if (!rule) return err('NOT_FOUND', 'Bank rule not found', 404);
  if (!rule.is_active) return err('VALIDATION', 'Rule is paused — resume it before applying', 400);

  let query = sb
    .from('acct_bank_transactions')
    .select('id, description, amount')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('review_status', 'for_review')
    .order('transaction_date', { ascending: false })
    .limit(200);
  if (body.bank_account_id) query = query.eq('bank_account_id', body.bank_account_id as string);
  const { data: txns } = await query;

  const posted: { id: string; description: string; amount: number }[] = [];
  const suggested: { id: string; description: string; amount: number }[] = [];
  const failed: { id: string; description: string; error: string }[] = [];
  for (const t of txns || []) {
    const { data: hit } = await sb.rpc('acct_bank_rule_matches', {
      p_rule_id: id,
      p_txn_id: t.id,
    });
    if (!hit) continue;
    const { error } = await sb.rpc('acct_apply_bank_rules', {
      p_tenant_id: DEFAULT_TENANT_ID,
      p_bank_txn_id: t.id,
    });
    if (error) {
      failed.push({ id: t.id, description: t.description, error: error.message });
      continue;
    }
    const { data: after } = await sb
      .from('acct_bank_transactions')
      .select('review_status')
      .eq('id', t.id)
      .single();
    if (after?.review_status === 'posted') {
      posted.push({ id: t.id, description: t.description, amount: Number(t.amount) });
    } else if (after?.review_status === 'categorized' || after?.review_status === 'matched') {
      suggested.push({ id: t.id, description: t.description, amount: Number(t.amount) });
    }
  }
  return NextResponse.json({
    data: { posted, suggested, failed },
    meta: {
      rule_id: id,
      rule_name: rule.name,
      auto_confirm: rule.auto_confirm,
      checked: (txns || []).length,
      posted_count: posted.length,
      suggested_count: suggested.length,
      failed_count: failed.length,
    },
    message: rule.auto_confirm
      ? `Applied "${rule.name}" — ${posted.length} posted, ${suggested.length} suggested`
      : `Applied "${rule.name}" — ${suggested.length} categorized (auto-confirm is off, so nothing posted yet)`,
  });
}
