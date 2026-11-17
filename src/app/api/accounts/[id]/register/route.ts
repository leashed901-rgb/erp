import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

/** GET /api/accounts/[id]/register?from=&to= — the account register
 *  (Date · Type · Num · Payee · Memo · Debit · Credit · Balance) from
 *  the acct_account_register RPC. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const from = searchParams.get('from') || null;
  const to = searchParams.get('to') || null;

  const { data: account } = await supabaseAdmin()
    .from('acct_chart_of_accounts')
    .select('id, code, name, account_type, normal_balance')
    .eq('id', id)
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .single();
  if (!account) return err('NOT_FOUND', 'Account not found', 404);

  const { data, error } = await supabaseAdmin().rpc('acct_account_register', {
    p_account: id,
    // NOTE: p_to defaults to CURRENT_DATE in the RPC — pass it only when
    // the caller gave one. An explicit null would override the default
    // and match nothing (posting_date <= NULL is never true).
    ...(from ? { p_from: from } : {}),
    ...(to ? { p_to: to } : {}),
  });
  if (error) return err('INTERNAL', error.message, 500);
  const { data: bal } = await supabaseAdmin().rpc('acct_account_balance', { p_account_id: id });
  return NextResponse.json({
    data: (data || []).map((r: Record<string, unknown>) => ({
      date: r.posting_date,
      entry_id: r.journal_entry_id,
      entry_no: r.entry_no,
      source: r.source,
      reference: r.reference,
      payee: r.payee,
      memo: r.memo,
      split_account: r.split_account,
      payment: Number(r.payment ?? 0),
      deposit: Number(r.deposit ?? 0),
      cleared_status: r.cleared_status,
      running_balance: Number(r.running_balance ?? 0),
    })),
    meta: { account, balance: Number(bal ?? 0) },
  });
}
