import { NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/* Bank accounts over acct_bank_accounts with live balances
   (the GL balance via acct_account_balance) and per-status
   transaction counts for the Bank transactions screen's tabs.
   NOTE: balances used to be opening_balance + Σ feed amounts — that
   is wrong for this tenant (opening_balance is NULL and the feed is
   partial: it reported -$5 for an account whose books say $210+). The
   general ledger is the balance. */

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

export async function GET() {
  const sb = supabaseAdmin();
  const { data: accounts, error } = await sb
    .from('acct_bank_accounts')
    .select('*')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .order('name', { ascending: true });
  if (error) return err('INTERNAL', error.message, 500);

  const { data: txns } = await sb
    .from('acct_bank_transactions')
    .select('bank_account_id, amount, review_status')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .limit(10000);
  const counts = new Map<string, { review: number; categorized: number; excluded: number; total: number }>();
  for (const t of (txns || []) as Record<string, unknown>[]) {
    const acctId = String(t.bank_account_id);
    const c = counts.get(acctId) || { review: 0, categorized: 0, excluded: 0, total: 0 };
    c.total += 1;
    if (t.review_status === 'for_review') c.review += 1;
    else if (t.review_status === 'excluded') c.excluded += 1;
    else c.categorized += 1;
    counts.set(acctId, c);
  }

  // GL balance per bank account (acct_account_balance on the GL account).
  const balances = new Map<string, number>();
  for (const a of (accounts || []) as Record<string, unknown>[]) {
    if (!a.gl_account_id) continue;
    const { data: bal } = await sb.rpc('acct_account_balance', { p_account_id: a.gl_account_id });
    balances.set(String(a.id), Number(bal ?? 0));
  }

  return NextResponse.json({
    data: ((accounts || []) as Record<string, unknown>[]).map((a) => ({
      id: String(a.id),
      name: String(a.name || ''),
      institutionName: (a.institution_name as string) || null,
      accountType: String(a.account_type || ''),
      accountKind: String(a.account_kind || ''),
      maskedNumber: (a.masked_account_number as string) || null,
      glAccountId: String(a.gl_account_id || ''),
      isActive: a.is_active !== false,
      lastSyncAt: (a.last_sync_at as string) || null,
      balance: Math.round((balances.get(String(a.id)) ?? 0) * 100) / 100,
      counts: counts.get(String(a.id)) || { review: 0, categorized: 0, excluded: 0, total: 0 },
    })),
  });
}
