import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/** GET /api/sales-tax/rates — list tax rates/codes.
 *  Reads acct_tax_codes. */
export async function GET() {
  const { data, error } = await supabaseAdmin()
    .from('acct_tax_codes')
    .select('*')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .order('code', { ascending: true });
  if (error) {
    const code = (error as { code?: string }).code;
    if (code === '42P01' || code === 'PGRST205' || code === 'PGRST200') {
      return NextResponse.json({ data: [], schema_pending: true });
    }
    return NextResponse.json({ error: { code: 'INTERNAL', message: error.message, requestId: crypto.randomUUID() } }, { status: 500 });
  }
  return NextResponse.json({ data });
}

/** POST /api/sales-tax/rates — create a tax code.
 *  Body: { code, name, rate, jurisdiction_id?, recoverable_percent?, is_compound? } */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: { code: 'VALIDATION', message: 'Invalid JSON body', requestId: crypto.randomUUID() } }, { status: 400 });
  }
  if (!body.code || !body.name || body.rate == null) {
    return NextResponse.json({ error: { code: 'VALIDATION', message: 'code, name, rate are required', requestId: crypto.randomUUID() } }, { status: 400 });
  }
  const insert: Record<string, unknown> = {
    tenant_id: DEFAULT_TENANT_ID,
    code: String(body.code),
    name: String(body.name),
    rate: Number(body.rate),
  };
  if (body.jurisdiction_id) insert.jurisdiction_id = String(body.jurisdiction_id);
  if (body.recoverable_percent != null) insert.recoverable_percent = Number(body.recoverable_percent);
  if (body.is_compound) insert.is_compound = true;
  const { data, error } = await supabaseAdmin()
    .from('acct_tax_codes')
    .insert(insert)
    .select('*')
    .single();
  if (error) {
    return NextResponse.json({ error: { code: 'INTERNAL', message: error.message, requestId: crypto.randomUUID() } }, { status: 500 });
  }
  return NextResponse.json({ data }, { status: 201 });
}
