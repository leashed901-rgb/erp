import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/** POST /api/crm/leads/[id]/convert
 *  Wraps the crm_convert_lead RPC. Sets status='converted', conversion_date=now,
 *  and creates a customer from the lead if none exists. Returns the new customer_id.
 *  Falls back to a manual conversion if the RPC isn't installed. */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // 1. Try the RPC first (canonical path).
  const { data: rpcData, error: rpcErr } = await supabaseAdmin().rpc('crm_convert_lead', {
    lead_uuid: id,
    tenant_uuid: DEFAULT_TENANT_ID,
  });
  if (!rpcErr && rpcData) {
    const row = rpcData as { customer_id?: string };
    return NextResponse.json({ data: { converted: true, customer_id: row.customer_id || null } });
  }
  // PGRST202 = function not found — fall through to manual.
  const fallback = !rpcErr || rpcErr.code === 'PGRST202' || /could not find.*function/i.test(rpcErr.message || '');

  // 2. Manual fallback: load the lead, create a customer, mark converted.
  const { data: lead, error: leadErr } = await supabaseAdmin()
    .from('crm_leads')
    .select('id, contact_name, email, phone, status, customer_id, lead_type, lead_source')
    .eq('id', id)
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .maybeSingle();
  if (leadErr) {
    return NextResponse.json({ error: { code: 'INTERNAL', message: leadErr.message } }, { status: 500 });
  }
  if (!lead) {
    return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Lead not found' } }, { status: 404 });
  }
  if (lead.status === 'converted' && lead.customer_id) {
    return NextResponse.json({ data: { converted: true, customer_id: lead.customer_id, already: true } });
  }

  // Create the customer from the lead if we don't already have one.
  let customerId = lead.customer_id;
  if (!customerId) {
    const [first, ...rest] = (lead.contact_name || '').split(' ');
    const { data: newCust, error: custErr } = await supabaseAdmin()
      .from('crm_customers')
      .insert({
        tenant_id: DEFAULT_TENANT_ID,
        first_name: first || null,
        last_name: rest.join(' ') || null,
        email: lead.email,
        phone: lead.phone,
        country: 'US',
        customer_type: 'Retail',
        lifecycle_stage: 'new_customer',
      })
      .select('id')
      .single();
    if (custErr) {
      return NextResponse.json({ error: { code: 'INTERNAL', message: custErr.message } }, { status: 500 });
    }
    customerId = newCust.id;
  }

  const { error: updErr } = await supabaseAdmin()
    .from('crm_leads')
    .update({
      status: 'converted',
      conversion_date: new Date().toISOString(),
      customer_id: customerId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('tenant_id', DEFAULT_TENANT_ID);
  if (updErr) {
    return NextResponse.json({ error: { code: 'INTERNAL', message: updErr.message } }, { status: 500 });
  }

  return NextResponse.json({
    data: { converted: true, customer_id: customerId, fallback: !fallback ? false : true },
  });
}
