import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { writePartySpine } from '@/lib/partySpine';

function fail(code: string, message: string, status: number) {
  return NextResponse.json(
    { error: { code, message, requestId: crypto.randomUUID() } },
    { status },
  );
}

/**
 * POST /api/crm/leads/[id]/convert — convert a lead to a deal
 * (registered action `lead.convert`).
 *
 * The platform RPC crm_convert_lead is member-guarded
 * (platform_is_tenant_member on auth.uid), which a service-role call
 * can never satisfy — the same wall as crm_enroll_in_sequence and the
 * support page RPCs. This route performs the RPC's exact writes:
 *   1. Resolve the customer: the lead's linked customer, else a
 *      customer with the same email, else a new crm_customers row
 *      built from the lead (name split, individual/active/US) — the
 *      person is never duplicated.
 *   2. Open a deal in the default pipeline's first open stage.
 *   3. Mark the lead converted with the customer linked.
 * Body (all optional): { deal_name?, amount?, pipeline_id? }.
 * Returns the new deal's id.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    /* empty body is fine — every arg is optional */
  }
  const db = supabaseAdmin();

  const { data: lead, error: leadError } = await db
    .from('crm_leads')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .maybeSingle();
  if (leadError) return fail('INTERNAL', leadError.message, 500);
  if (!lead) return fail('NOT_FOUND', 'Lead not found', 404);
  if (lead.status === 'converted' && lead.customer_id) {
    return fail('CONFLICT', 'Lead is already converted', 409);
  }

  // 1. Resolve or create the customer (the RPC's exact precedence).
  let customerId: string | null = lead.customer_id || null;
  if (!customerId && lead.email) {
    const { data: byEmail } = await db
      .from('crm_customers')
      .select('id')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .ilike('email', lead.email)
      .limit(1);
    customerId = byEmail?.[0]?.id || null;
  }
  if (!customerId) {
    const fullName = String(lead.contact_name || '');
    const firstName = fullName.split(' ')[0] || '';
    const rest = fullName.slice(fullName.indexOf(' ') + 1);
    const { data: created, error: createError } = await db
      .from('crm_customers')
      .insert({
        tenant_id: DEFAULT_TENANT_ID,
        customer_type: 'individual',
        lifecycle_status: 'active',
        country: 'US',
        first_name: firstName,
        last_name: fullName.includes(' ') ? rest : null,
        email: lead.email,
        phone: lead.phone,
        lifecycle_stage: 'customer',
        first_contact_at: lead.first_contact_at || new Date().toISOString(),
      })
      .select('id')
      .single();
    if (createError) return fail('INTERNAL', createError.message, 500);
    customerId = created.id;
  }

  if (!customerId) return fail('INTERNAL', 'Customer resolution failed', 500);

  // The new (or newly-linked) customer joins the party spine under
  // its own record id — the same mirror every customer create writes —
  // so the converted party appears in Parties/Customers immediately.
  await writePartySpine(customerId, 'customer', {
    name: lead.contact_name || lead.email || 'Customer',
    email: lead.email,
    phone: lead.phone,
  });

  // 2. Pipeline + first open stage.
  let pipelineId: string | null =
    typeof body.pipeline_id === 'string' && body.pipeline_id ? body.pipeline_id : null;
  if (!pipelineId) {
    const { data: pipes } = await db
      .from('crm_pipelines')
      .select('id, is_default')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .eq('is_active', true)
      .order('created_at');
    pipelineId = pipes?.find((p) => p.is_default)?.id || pipes?.[0]?.id || null;
  }
  if (!pipelineId) return fail('VALIDATION', 'No pipeline exists to open the deal in', 400);
  const { data: stages } = await db
    .from('crm_pipeline_stages')
    .select('id')
    .eq('pipeline_id', pipelineId)
    .eq('stage_kind', 'open')
    .order('sort_order')
    .limit(1);
  const stageId = stages?.[0]?.id || null;
  if (!stageId) return fail('VALIDATION', 'The pipeline has no open stage', 400);

  // 3. Open the deal.
  const { data: deal, error: dealError } = await db
    .from('crm_deals')
    .insert({
      tenant_id: DEFAULT_TENANT_ID,
      name:
        (typeof body.deal_name === 'string' && body.deal_name) ||
        `${lead.contact_name || 'Deal'} deal`,
      pipeline_id: pipelineId,
      stage_id: stageId,
      customer_id: customerId,
      lead_id: lead.id,
      owner_staff_id: lead.lead_owner_id || null,
      amount: body.amount != null ? Number(body.amount) : 0,
      source: lead.lead_source || null,
    })
    .select('id')
    .single();
  if (dealError) return fail('INTERNAL', dealError.message, 500);

  // 4. Mark the lead converted.
  const { error: updateError } = await db
    .from('crm_leads')
    .update({
      customer_id: customerId,
      status: 'converted',
      conversion_date: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', lead.id);
  if (updateError) return fail('INTERNAL', updateError.message, 500);

  return NextResponse.json(
    { data: { lead_id: lead.id, deal_id: deal.id, customer_id: customerId } },
    { status: 201 },
  );
}
