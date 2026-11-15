import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/** GET /api/sales-tax/filings — list sales tax filings.
 *  Reads acct_tax_filings. */
export async function GET() {
  const { data, error } = await supabaseAdmin()
    .from('acct_tax_filings')
    .select('*')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .order('created_at', { ascending: false });
  if (error) {
    const code = (error as { code?: string }).code;
    if (code === '42P01' || code === 'PGRST205' || code === 'PGRST200') {
      return NextResponse.json({ data: [], schema_pending: true });
    }
    return NextResponse.json({ error: { code: 'INTERNAL', message: error.message, requestId: crypto.randomUUID() } }, { status: 500 });
  }
  return NextResponse.json({ data });
}

/** POST /api/sales-tax/filings — prepare a sales tax filing.
 *  Wraps acct_prepare_sales_tax_filing RPC.
 *  Body: { period_start, period_end, jurisdiction_id? } */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: { code: 'VALIDATION', message: 'Invalid JSON body', requestId: crypto.randomUUID() } }, { status: 400 });
  }
  if (!body.period_start || !body.period_end) {
    return NextResponse.json({ error: { code: 'VALIDATION', message: 'period_start and period_end are required', requestId: crypto.randomUUID() } }, { status: 400 });
  }

  // 1. Try the RPC.
  const { data: rpcData, error: rpcErr } = await supabaseAdmin().rpc('acct_prepare_sales_tax_filing', {
    tenant_uuid: DEFAULT_TENANT_ID,
    period_start: body.period_start,
    period_end: body.period_end,
    jurisdiction_uuid: body.jurisdiction_id || null,
  });
  if (!rpcErr && rpcData) {
    return NextResponse.json({ data: { prepared: true, result: rpcData, source: 'rpc' } }, { status: 201 });
  }

  // 2. Fallback: insert a filing row directly.
  const insert: Record<string, unknown> = {
    tenant_id: DEFAULT_TENANT_ID,
    period_start: body.period_start,
    period_end: body.period_end,
    status: 'draft',
  };
  if (body.jurisdiction_id) insert.jurisdiction_id = String(body.jurisdiction_id);
  const { data, error } = await supabaseAdmin()
    .from('acct_tax_filings')
    .insert(insert)
    .select('*')
    .single();
  if (error) {
    return NextResponse.json({ error: { code: 'INTERNAL', message: error.message, requestId: crypto.randomUUID() } }, { status: 500 });
  }
  return NextResponse.json({ data: { prepared: true, filing: data, source: 'fallback' } }, { status: 201 });
}
