import { NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/* Posted ad-spend expenses + reconciliation (doc 22): the ledger side
   of ad spend. Journals = acct_spend_transactions posted by the
   spend/post route (ref_no ADSPEND-<date>); recon rolls the posted
   total up against the Advertising chart-of-accounts account. */

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

export async function GET() {
  const sb = supabaseAdmin();
  const { data: txns, error } = await sb
    .from('acct_spend_transactions')
    .select('id, payment_date, total, memo, status, ref_no')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .like('ref_no', 'ADSPEND-%')
    .order('payment_date', { ascending: false })
    .limit(200);
  if (error) return err('INTERNAL', error.message, 500);

  const { data: adAccount } = await sb
    .from('acct_chart_of_accounts')
    .select('id, code, name')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .ilike('name', '%advertising%')
    .limit(1)
    .maybeSingle();

  const rows = (txns || []).filter((t) => t.status !== 'void');
  const postedTotal = rows.reduce((s, t) => s + (Number(t.total) || 0), 0);
  const journals = rows.map((t) => ({
    id: String(t.id),
    date: String(t.payment_date || ''),
    amount: Number(t.total) || 0,
    account: adAccount ? String(adAccount.code || '') : '',
    memo: String(t.memo || ''),
    status: t.status === 'posted' ? 'Posted' : String(t.status || ''),
  }));
  const recon = adAccount
    ? [{
        id: String(adAccount.id),
        account: String(adAccount.code || ''),
        name: String(adAccount.name || ''),
        debits: postedTotal,
        ledger: postedTotal,
        state: 'Open',
        lastLocked: rows[0] ? String(rows[0].payment_date || '') : '—',
      }]
    : [];
  return NextResponse.json({ data: { journals, recon } });
}
