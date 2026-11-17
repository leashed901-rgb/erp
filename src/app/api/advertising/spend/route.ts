import { NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { toAdDailySpend } from '@/lib/adDto';

/* Ad spend & finance (doc 22 nav → ad_campaign_daily): platform daily
   delivery totals. `posted` reflects whether that day's spend has
   already been posted to Expenses (acct_spend_transactions ref_no
   ADSPEND-<date>). */

export const AD_SPEND_REF = (date: string) => `ADSPEND-${date}`;

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

export async function GET() {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('ad_campaign_daily')
    .select('*')
    .order('delivery_date', { ascending: false })
    .limit(120);
  if (error) return err('INTERNAL', error.message, 500);
  const rows = (data || []) as Record<string, unknown>[];
  const dates = rows.map((r) => AD_SPEND_REF(String(r.delivery_date || '')));
  const posted = new Set<string>();
  if (dates.length) {
    const { data: txns } = await sb
      .from('acct_spend_transactions')
      .select('ref_no')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .in('ref_no', dates)
      .neq('status', 'void');
    (txns || []).forEach((t) => posted.add(String(t.ref_no)));
  }
  return NextResponse.json({ data: rows.map((r) => toAdDailySpend(r, posted.has(AD_SPEND_REF(String(r.delivery_date || ''))))) });
}
