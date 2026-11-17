import { NextResponse, NextRequest } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

/**
 * GET /api/leases — acct_leases (Batch H). POST — create a lease.
 * There is no engine create RPC for leases, so this is a direct
 * insert; the lease number comes from the engine's acct_next_number
 * ('LS-' prefix). The ROU asset and lease liability are amounts on
 * the row — the engine books no journal at creation, so none is
 * invented here either.
 */
export async function GET() {
  const { data, error } = await supabaseAdmin().from('acct_leases').select('*').eq('tenant_id', DEFAULT_TENANT_ID).order('commencement_date', { ascending: false });
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({
    data: ((data ?? []) as Record<string, unknown>[]).map((l) => ({
      id: l.id,
      leaseNumber: l.lease_number,
      counterparty: l.counterparty_name,
      commencement: l.commencement_date,
      end: l.end_date,
      currency: l.currency,
      paymentFrequency: l.payment_frequency,
      initialDirectCost: Number(l.initial_direct_cost || 0),
      incentive: Number(l.lease_incentive || 0),
      discountRate: Number(l.discount_rate || 0),
      rouAsset: Number(l.right_of_use_asset || 0),
      liability: Number(l.lease_liability || 0),
      status: l.status,
    })),
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const counterparty = String(body.counterparty || '').trim();
  const commencement = String(body.commencement || '').slice(0, 10);
  const end = String(body.end || '').slice(0, 10);
  if (!counterparty) return err('VALIDATION', 'Counterparty name is required', 400);
  if (!commencement || !end) return err('VALIDATION', 'Commencement and end dates are required', 400);
  if (end <= commencement) return err('VALIDATION', 'End date must be after commencement', 400);
  const discount = Number(body.discountRate);
  if (!Number.isFinite(discount) || discount < 0 || discount >= 1) {
    return err('VALIDATION', 'Discount rate is a fraction (0.07 = 7%) and must be below 1', 400);
  }
  const { data: ent } = await supabaseAdmin().rpc('acct_default_entity', { p_tenant_id: DEFAULT_TENANT_ID });
  const { data: num } = await supabaseAdmin().rpc('acct_next_number', {
    p_tenant_id: DEFAULT_TENANT_ID,
    p_entity_id: ent,
    p_doc_type: 'lease',
    p_default_prefix: 'LS-',
  });
  const { data, error } = await supabaseAdmin().from('acct_leases').insert({
    tenant_id: DEFAULT_TENANT_ID,
    entity_id: ent,
    lease_number: (num as string) || `LS-${Date.now()}`,
    counterparty_name: counterparty,
    commencement_date: commencement,
    end_date: end,
    currency: String(body.currency || 'USD').slice(0, 3),
    payment_frequency: body.paymentFrequency || 'monthly',
    initial_direct_cost: Number(body.initialDirectCost || 0),
    lease_incentive: Number(body.incentive || 0),
    discount_rate: discount,
    right_of_use_asset: Number(body.rouAsset || 0),
    lease_liability: Number(body.liability || 0),
    status: 'draft',
  }).select('id').single();
  if (error) return err('DB_ERROR', error.message, 400);
  return NextResponse.json({ data: { id: (data as Record<string, unknown>).id } }, { status: 201 });
}
