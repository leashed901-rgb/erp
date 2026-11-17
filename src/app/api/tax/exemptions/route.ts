import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import type { TaxExemption } from '@/lib/taxTypes';

const err = (code: string, message: string, status: number) =>
  NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });

/** GET /api/tax/exemptions — customer exemption certificates on file. */
export async function GET() {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('acct_tax_exemptions')
    .select('*')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .order('created_at', { ascending: false });
  if (error) return err('INTERNAL', error.message, 500);
  const customerIds = [...new Set((data || []).map((r) => r.customer_id).filter(Boolean))];
  const names = new Map<string, string>();
  if (customerIds.length) {
    const { data: parties } = await sb.from('platform_parties').select('id,display_name').in('id', customerIds);
    (parties || []).forEach((p) => names.set(p.id, p.display_name));
  }
  const dtos: TaxExemption[] = (data || []).map((r) => ({
    id: r.id,
    customerId: r.customer_id,
    customerName: names.get(r.customer_id) || null,
    jurisdictionId: r.jurisdiction_id,
    reason: r.reason,
    certificateNo: r.certificate_no,
    validFrom: r.valid_from,
    validTo: r.valid_to,
    verifiedAt: r.verified_at,
  }));
  return NextResponse.json({ data: dtos });
}

/** POST /api/tax/exemptions — record an exemption certificate for a customer. */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return err('VALIDATION', 'Invalid JSON', 400); }
  if (!body.customerId) return err('VALIDATION', 'customerId is required', 400);
  const insert = {
    tenant_id: DEFAULT_TENANT_ID,
    customer_id: String(body.customerId),
    jurisdiction_id: body.jurisdictionId ? String(body.jurisdictionId) : null,
    reason: body.reason ? String(body.reason) : null,
    certificate_no: body.certificateNo ? String(body.certificateNo) : null,
    valid_from: body.validFrom ? String(body.validFrom) : new Date().toISOString().slice(0, 10),
    valid_to: body.validTo ? String(body.validTo) : null,
  };
  const { data, error } = await supabaseAdmin().from('acct_tax_exemptions').insert(insert).select('*').single();
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data }, { status: 201 });
}
