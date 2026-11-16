import { NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/* Rule KPIs from acct_bank_transactions: auto-categorized in the last
   30 days = transactions a rule suggested (suggested_rule_id set)
   dated within the window; match rate = share of all feed
   transactions that are matched or categorized. */

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

export async function GET() {
  const sb = supabaseAdmin();
  const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const { data, error } = await sb
    .from('acct_bank_transactions')
    .select('suggested_rule_id, match_status, category_account_id, transaction_date')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .limit(10000);
  if (error) return err('INTERNAL', error.message, 500);
  const rows = (data || []) as Record<string, unknown>[];
  const autoCategorized30d = rows.filter((t) => t.suggested_rule_id && String(t.transaction_date) >= since).length;
  const matchedOrCategorized = rows.filter((t) => t.match_status === 'matched' || t.category_account_id).length;
  const matchRate = rows.length ? Math.round((matchedOrCategorized / rows.length) * 100) : 0;
  return NextResponse.json({ data: { autoCategorized30d, matchRate, totalTransactions: rows.length } });
}
