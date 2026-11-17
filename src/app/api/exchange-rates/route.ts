import { NextResponse, NextRequest } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

/**
 * Exchange rates (Batch I). GET ?from=&to= — rates, newest first
 * (the engine reads the latest rate on or before the date it needs).
 * POST — add a rate (rate > 0 is enforced by the table's CHECK).
 * DELETE ?id=.
 */
export async function GET(req: NextRequest) {
  const q = new URL(req.url).searchParams;
  const from = q.get('from');
  const to = q.get('to');
  let query = supabaseAdmin().from('acct_exchange_rates').select('*').eq('tenant_id', DEFAULT_TENANT_ID).order('rate_date', { ascending: false }).limit(500);
  if (from) query = query.eq('from_currency', from.toUpperCase());
  if (to) query = query.eq('to_currency', to.toUpperCase());
  const { data, error } = await query;
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({
    data: ((data ?? []) as Record<string, unknown>[]).map((r) => ({
      id: r.id,
      rateDate: r.rate_date,
      fromCurrency: r.from_currency,
      toCurrency: r.to_currency,
      rate: Number(r.rate || 0),
      rateType: r.rate_type,
      source: r.source,
    })),
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const rateDate = String(body.rateDate || '').slice(0, 10);
  const fromCurrency = String(body.fromCurrency || '').toUpperCase();
  const toCurrency = String(body.toCurrency || '').toUpperCase();
  const rate = Number(body.rate);
  if (!rateDate) return err('VALIDATION', 'rateDate is required', 400);
  if (!fromCurrency || fromCurrency.length !== 3) return err('VALIDATION', 'fromCurrency is required (3 letters)', 400);
  if (!toCurrency || toCurrency.length !== 3) return err('VALIDATION', 'toCurrency is required (3 letters)', 400);
  if (!Number.isFinite(rate) || rate <= 0) return err('VALIDATION', 'rate must be greater than 0', 400);
  const sb = supabaseAdmin();
  const [{ data: from }, { data: to }] = await Promise.all([
    sb.from('acct_currencies').select('code').eq('tenant_id', DEFAULT_TENANT_ID).eq('code', fromCurrency).single(),
    sb.from('acct_currencies').select('code').eq('tenant_id', DEFAULT_TENANT_ID).eq('code', toCurrency).single(),
  ]);
  if (!from) return err('VALIDATION', `Unknown currency ${fromCurrency} — add it in Currencies first`, 400);
  if (!to) return err('VALIDATION', `Unknown currency ${toCurrency} — add it in Currencies first`, 400);
  const { data, error } = await sb.from('acct_exchange_rates').insert({
    tenant_id: DEFAULT_TENANT_ID,
    rate_date: rateDate,
    from_currency: fromCurrency,
    to_currency: toCurrency,
    rate,
    rate_type: body.rateType ? String(body.rateType) : 'spot',
    source: body.source ? String(body.source) : null,
  }).select().single();
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: { id: data.id, rateDate: data.rate_date, fromCurrency: data.from_currency, toCurrency: data.to_currency, rate: Number(data.rate || 0), rateType: data.rate_type, source: data.source } }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return err('VALIDATION', 'id is required', 400);
  const { error } = await supabaseAdmin().from('acct_exchange_rates').delete().eq('tenant_id', DEFAULT_TENANT_ID).eq('id', id);
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: { deleted: true } });
}
