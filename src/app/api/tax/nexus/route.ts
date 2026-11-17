import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import type { TaxNexus, NexusAlert } from '@/lib/taxTypes';

const err = (code: string, message: string, status: number) =>
  NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });

/** GET /api/tax/nexus — nexus registrations + live nexus alerts. */
export async function GET() {
  const sb = supabaseAdmin();
  const [{ data: nexus, error }, { data: alerts }] = await Promise.all([
    sb.from('acct_tax_nexus').select('*, acct_tax_jurisdictions(name,state_code)').eq('tenant_id', DEFAULT_TENANT_ID).order('registered_on', { ascending: false }),
    sb.from('tax_nexus_alerts').select('*').eq('tenant_id', DEFAULT_TENANT_ID).order('pct_of_threshold', { ascending: false }).limit(50),
  ]);
  if (error) return err('INTERNAL', error.message, 500);
  const nexusDtos: TaxNexus[] = (nexus || []).map((r) => {
    const j = (r.acct_tax_jurisdictions || {}) as { name?: string; state_code?: string };
    return {
      id: r.id,
      jurisdictionId: r.jurisdiction_id,
      jurisdictionName: j.name || null,
      stateCode: j.state_code || null,
      nexusType: r.nexus_type,
      collectTax: Boolean(r.collect_tax),
      registrationNumber: r.registration_number,
      registeredOn: r.registered_on,
      filingFrequency: r.filing_frequency,
    };
  });
  const alertDtos: NexusAlert[] = (alerts || []).map((a) => ({
    id: a.id,
    stateCode: a.state_code,
    status: a.status,
    windowLabel: a.window_label,
    countedSales: Number(a.counted_sales) || 0,
    countedTxns: Number(a.counted_txns) || 0,
    pctOfThreshold: Number(a.pct_of_threshold) || 0,
    resolution: a.resolution,
    lastCheckedAt: a.last_checked_at,
  }));
  return NextResponse.json({ data: { nexus: nexusDtos, alerts: alertDtos } });
}

/** POST /api/tax/nexus — register nexus in a jurisdiction. */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return err('VALIDATION', 'Invalid JSON', 400); }
  if (!body.jurisdictionId) return err('VALIDATION', 'jurisdictionId is required', 400);
  const sb = supabaseAdmin();
  const { data: entity } = await sb.from('acct_entities').select('id').eq('tenant_id', DEFAULT_TENANT_ID).eq('is_active', true).limit(1).maybeSingle();
  const insert = {
    tenant_id: DEFAULT_TENANT_ID,
    entity_id: entity?.id || null,
    jurisdiction_id: String(body.jurisdictionId),
    nexus_type: String(body.nexusType || 'economic'),
    collect_tax: body.collectTax !== false,
    registration_number: body.registrationNumber ? String(body.registrationNumber) : null,
    registered_on: body.registeredOn ? String(body.registeredOn) : new Date().toISOString().slice(0, 10),
    filing_frequency: body.filingFrequency ? String(body.filingFrequency) : 'monthly',
  };
  const { data, error } = await sb.from('acct_tax_nexus').insert(insert).select('*').single();
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data }, { status: 201 });
}
