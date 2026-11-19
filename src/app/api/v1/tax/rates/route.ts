import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/**
 * GET /api/v1/tax/rates — list tax codes + jurisdictions.
 * POST /api/v1/tax/rates — create a tax code (rate + jurisdiction).
 *
 * Canonical tables: acct_tax_codes + acct_tax_jurisdictions.
 * (Decision D-6: these are canonical; acct_tax_rules/taxes are legacy.)
 */

/** GET — list tax codes joined with jurisdictions. */
export async function GET() {
  const { data: codes, error } = await supabaseAdmin()
    .from('acct_tax_codes')
    .select('*')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('is_active', true)
    .order('code', { ascending: true });

  if (error) return NextResponse.json({ error: { code: 'INTERNAL', message: error.message, requestId: crypto.randomUUID() } }, { status: 500 });

  // Fetch jurisdictions separately
  const jurisdictionIds = [...new Set((codes || []).map((c) => c.jurisdiction_id).filter(Boolean))];
  let jurisdictions: Record<string, { name: string; state_code: string | null; level: string }> = {};
  if (jurisdictionIds.length > 0) {
    const { data: jur } = await supabaseAdmin()
      .from('acct_tax_jurisdictions')
      .select('id,name,state_code,level')
      .in('id', jurisdictionIds);
    (jur || []).forEach((j) => {
      jurisdictions[j.id] = { name: j.name, state_code: j.state_code, level: j.level };
    });
  }

  // Merge
  const merged = (codes || []).map((c) => ({
    ...c,
    jurisdiction: c.jurisdiction_id ? jurisdictions[c.jurisdiction_id] : null,
  }));

  return NextResponse.json({ data: merged });
}

/** POST — create a tax code. */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: { code: 'VALIDATION', message: 'Invalid JSON', requestId: crypto.randomUUID() } }, { status: 400 });
  }

  // Create or find jurisdiction (real acct_tax_jurisdictions columns:
  // code, name, country_code, state_code, level — there is no region).
  let jurisdictionId = body.jurisdiction_id as string | undefined;
  if (!jurisdictionId && body.jurisdiction_name) {
    const name = String(body.jurisdiction_name);
    const { data: jur } = await supabaseAdmin()
      .from('acct_tax_jurisdictions')
      .insert({
        tenant_id: DEFAULT_TENANT_ID,
        code: String(body.jurisdiction_code || name.toUpperCase().replace(/[^A-Z0-9]+/g, '-').slice(0, 40)),
        name,
        country_code: String(body.country_code || body.country || 'US'),
        state_code: body.state_code ? String(body.state_code) : null,
        level: String(body.level || 'state'),
        is_active: true,
      })
      .select('id')
      .single();
    if (jur) jurisdictionId = jur.id;
  }

  const insert = {
    tenant_id: DEFAULT_TENANT_ID,
    jurisdiction_id: jurisdictionId || null,
    code: String(body.code || `TAX-${Date.now()}`),
    name: String(body.name || 'Sales Tax'),
    tax_type: String(body.tax_type || 'sales'),
    rate: Number(body.rate) || 0,
    recoverable_percent: Number(body.recoverable_percent) || 0,
    payable_account_id: body.payable_account_id || null,
    receivable_account_id: body.receivable_account_id || null,
    effective_from: body.effective_from || new Date().toISOString().slice(0, 10),
    is_compound: Boolean(body.is_compound),
    is_active: true,
  };

  const { data, error } = await supabaseAdmin().from('acct_tax_codes').insert(insert).select('*').single();
  if (error) return NextResponse.json({ error: { code: 'INTERNAL', message: error.message, requestId: crypto.randomUUID() } }, { status: 500 });
  return NextResponse.json({ data }, { status: 201 });
}
