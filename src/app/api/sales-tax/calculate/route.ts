import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/** POST /api/sales-tax/calculate — wraps acct_calculate_tax RPC.
 *  Body: { amount, jurisdiction_id?, tax_code?, customer_id? }
 *  Returns the calculated tax for a given amount. */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: { code: 'VALIDATION', message: 'Invalid JSON body', requestId: crypto.randomUUID() } }, { status: 400 });
  }
  const amount = Number(body.amount);
  if (!Number.isFinite(amount)) {
    return NextResponse.json({ error: { code: 'VALIDATION', message: 'amount is required', requestId: crypto.randomUUID() } }, { status: 400 });
  }

  // 1. Try the RPC.
  const { data: rpcData, error: rpcErr } = await supabaseAdmin().rpc('acct_calculate_tax', {
    tenant_uuid: DEFAULT_TENANT_ID,
    amount,
    jurisdiction_uuid: body.jurisdiction_id || null,
    tax_code: body.tax_code || null,
    customer_uuid: body.customer_id || null,
  });
  if (!rpcErr && rpcData) {
    const result = typeof rpcData === 'number' ? { tax: rpcData, total: amount + rpcData } : rpcData;
    return NextResponse.json({ data: { ...result, source: 'rpc' } });
  }

  // 2. Fallback: look up the rate from acct_tax_codes.
  let rate = 0;
  if (body.tax_code) {
    const { data: taxCode } = await supabaseAdmin()
      .from('acct_tax_codes')
      .select('rate')
      .eq('code', body.tax_code)
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .maybeSingle();
    rate = Number(taxCode?.rate) || 0;
  } else {
    // Default: try the first active tax code.
    const { data: firstCode } = await supabaseAdmin()
      .from('acct_tax_codes')
      .select('rate')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .limit(1)
      .maybeSingle();
    rate = Number(firstCode?.rate) || 0;
  }

  const tax = Math.round(amount * rate * 100) / 100;
  return NextResponse.json({
    data: {
      tax,
      rate,
      total: Math.round((amount + tax) * 100) / 100,
      source: 'fallback',
    },
  });
}
