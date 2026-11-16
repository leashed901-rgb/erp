import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import type { TaxJurisdiction } from '@/lib/taxTypes';

const err = (code: string, message: string, status: number) =>
  NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });

const toDto = (r: Record<string, unknown>): TaxJurisdiction => ({
  id: String(r.id),
  code: (r.code as string) || null,
  name: String(r.name),
  countryCode: (r.country_code as string) || null,
  stateCode: (r.state_code as string) || null,
  locality: (r.locality as string) || null,
  registrationNumber: (r.registration_number as string) || null,
  level: (r.level as string) || null,
  authorityName: (r.authority_name as string) || null,
  filingFrequency: (r.filing_frequency as string) || null,
  isActive: Boolean(r.is_active),
});

/** GET /api/tax/jurisdictions — canonical jurisdictions (decision D-6). */
export async function GET() {
  const { data, error } = await supabaseAdmin()
    .from('acct_tax_jurisdictions')
    .select('*')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('is_active', true)
    .order('name', { ascending: true });
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: (data || []).map(toDto) });
}

/** POST /api/tax/jurisdictions — create a jurisdiction. */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return err('VALIDATION', 'Invalid JSON', 400); }
  if (!body.name) return err('VALIDATION', 'name is required', 400);
  const insert = {
    tenant_id: DEFAULT_TENANT_ID,
    code: body.code ? String(body.code) : null,
    name: String(body.name),
    country_code: String(body.countryCode || 'US'),
    state_code: body.stateCode ? String(body.stateCode) : null,
    locality: body.locality ? String(body.locality) : null,
    registration_number: body.registrationNumber ? String(body.registrationNumber) : null,
    level: body.level ? String(body.level) : 'state',
    authority_name: body.authorityName ? String(body.authorityName) : null,
    filing_frequency: body.filingFrequency ? String(body.filingFrequency) : 'monthly',
    is_active: true,
  };
  const { data, error } = await supabaseAdmin().from('acct_tax_jurisdictions').insert(insert).select('*').single();
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: toDto(data) }, { status: 201 });
}
