import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/** GET /api/sales-tax/jurisdictions — list tax jurisdictions.
 *  Reads acct_tax_jurisdictions. Columns: code, name, country_code, state_code,
 *  locality, registration_number, level, is_active, filing_frequency. */
export async function GET() {
  const { data, error } = await supabaseAdmin()
    .from('acct_tax_jurisdictions')
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

/** POST /api/sales-tax/jurisdictions — create a jurisdiction.
 *  Body: { code, name, country_code?, state_code?, locality?, registration_number? } */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: { code: 'VALIDATION', message: 'Invalid JSON body', requestId: crypto.randomUUID() } }, { status: 400 });
  }
  if (!body.code || !body.name) {
    return NextResponse.json({ error: { code: 'VALIDATION', message: 'code and name are required', requestId: crypto.randomUUID() } }, { status: 400 });
  }
  const insert: Record<string, unknown> = {
    tenant_id: DEFAULT_TENANT_ID,
    code: String(body.code),
    name: String(body.name),
    level: body.level || 'state',
    is_active: true,
  };
  // Map UI field names → DB column names (country → country_code, state → state_code).
  if (body.country_code || body.country) insert.country_code = String(body.country_code || body.country || 'US');
  if (body.state_code || body.state) insert.state_code = String(body.state_code || body.state);
  if (body.locality) insert.locality = String(body.locality);
  if (body.registration_number) insert.registration_number = String(body.registration_number);
  const { data, error } = await supabaseAdmin()
    .from('acct_tax_jurisdictions')
    .insert(insert)
    .select('*')
    .single();
  if (error) {
    return NextResponse.json({ error: { code: 'INTERNAL', message: error.message, requestId: crypto.randomUUID() } }, { status: 500 });
  }
  return NextResponse.json({ data }, { status: 201 });
}
