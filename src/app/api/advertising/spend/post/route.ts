import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { AD_SPEND_REF } from '../route';

/* Post a day's ad spend to Expenses (doc 22: "ad spend posting to
   Expenses automatically — Bill/Expense with Source = Ad platform").
   Creates one posted acct_spend_transactions expense against the
   Advertising & Marketing COA account, paid from the tenant's first
   bank account, keyed by ref_no ADSPEND-<date> so re-posting the same
   day returns the existing expense instead of duplicating it. */

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const date = typeof body.date === 'string' ? body.date : null;
  if (!date) return err('VALIDATION', 'date is required', 400);
  const sb = supabaseAdmin();

  const { data: dayRows } = await sb.from('ad_campaign_daily').select('*').eq('delivery_date', date);
  if (!dayRows?.length) return err('NOT_FOUND', `No ad delivery recorded for ${date}`, 404);
  const amount = dayRows.reduce((s, r) => s + (Number(r.spend_cents) || 0), 0) / 100;
  const dayImpressions = dayRows.reduce((s, r) => s + (Number(r.impressions) || 0), 0);
  const dayClicks = dayRows.reduce((s, r) => s + (Number(r.clicks) || 0), 0);
  if (amount <= 0) return err('VALIDATION', `No spend to post for ${date}`, 400);

  const ref = AD_SPEND_REF(date);
  const { data: existing } = await sb
    .from('acct_spend_transactions')
    .select('id, total')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('ref_no', ref)
    .neq('status', 'void')
    .maybeSingle();
  if (existing) return NextResponse.json({ data: { id: existing.id as string, total: Number(existing.total) || 0, alreadyPosted: true } });

  const { data: entity } = await sb.from('acct_entities').select('id').eq('tenant_id', DEFAULT_TENANT_ID).limit(1).maybeSingle();
  const { data: bank } = await sb.from('acct_bank_accounts').select('id').eq('tenant_id', DEFAULT_TENANT_ID).order('created_at', { ascending: true }).limit(1).maybeSingle();
  if (!bank) return err('VALIDATION', 'No bank account is set up to pay ad spend from.', 400);
  const { data: adAccount } = await sb
    .from('acct_chart_of_accounts')
    .select('id')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .ilike('name', '%advertising%')
    .limit(1)
    .maybeSingle();
  if (!adAccount) return err('VALIDATION', 'No Advertising expense account exists in the chart of accounts.', 400);

  const { data: txn, error } = await sb
    .from('acct_spend_transactions')
    .insert({
      tenant_id: DEFAULT_TENANT_ID,
      entity_id: (entity?.id as string) || null,
      txn_kind: 'expense',
      payee_name: 'Ad platform',
      bank_account_id: bank.id as string,
      payment_date: date,
      ref_no: ref,
      memo: `Ad spend ${date} — ${dayImpressions} impressions, ${dayClicks} clicks`,
      tags: ['ads'],
      currency: 'USD',
      subtotal: amount,
      tax_total: 0,
      total: amount,
      status: 'draft',
      print_status: 'not_applicable',
    })
    .select('id')
    .single();
  if (error) return err('INTERNAL', error.message, 500);

  const { error: lineErr } = await sb.from('acct_spend_lines').insert({
    tenant_id: DEFAULT_TENANT_ID,
    spend_id: txn.id as string,
    line_no: 1,
    account_id: adAccount.id as string,
    description: `Ad spend ${date}`,
    amount,
    tax_amount: 0,
  });
  if (lineErr) return err('INTERNAL', lineErr.message, 500);
  const { error: postErr } = await sb.from('acct_spend_transactions').update({ status: 'posted' }).eq('id', txn.id as string);
  if (postErr) return err('INTERNAL', postErr.message, 500);
  return NextResponse.json({ data: { id: txn.id as string, total: amount, alreadyPosted: false } }, { status: 201 });
}
