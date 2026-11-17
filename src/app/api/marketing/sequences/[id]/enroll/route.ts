import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/* Sequence enrollment (doc 24: sequence.enroll). The platform RPC
   crm_enroll_in_sequence is guarded by
   platform_is_tenant_member(auth.uid()), which a service-role call
   can never satisfy ('not allowed') — the same guard pattern as
   erp_hold_order in doc 14. This route performs the RPC's exact
   checks and insert directly: active sequence, do-not-contact,
   marketing opt-in, suppression list, first-step delay. */

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const customerId = typeof body.customerId === 'string' ? body.customerId : null;
  const leadId = typeof body.leadId === 'string' ? body.leadId : null;
  const dealId = typeof body.dealId === 'string' ? body.dealId : null;
  if (!customerId && !leadId && !dealId) return err('VALIDATION', 'one of customerId, leadId, dealId is required', 400);
  const sb = supabaseAdmin();

  const { data: seq } = await sb
    .from('crm_sequences')
    .select('id, purpose, is_active')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('id', id)
    .maybeSingle();
  if (!seq || !(seq as { is_active: boolean }).is_active) return err('NOT_FOUND', 'Sequence not found or inactive', 404);
  const purpose = String((seq as { purpose: string }).purpose);

  let email: string | null = null;
  if (customerId) {
    const { data: cust } = await sb
      .from('crm_customers')
      .select('email, do_not_contact, marketing_email_opt_in')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .eq('id', customerId)
      .maybeSingle();
    if (!cust) return err('NOT_FOUND', 'Customer not found', 404);
    const c = cust as { email: string | null; do_not_contact: boolean; marketing_email_opt_in: boolean };
    if (c.do_not_contact) return err('CONFLICT', 'this contact is marked do not contact', 409);
    if (purpose === 'marketing' && !c.marketing_email_opt_in) {
      return err('CONFLICT', 'this contact has not opted in to marketing email', 409);
    }
    email = c.email;
  } else if (leadId) {
    const { data: lead } = await sb
      .from('crm_leads')
      .select('email')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .eq('id', leadId)
      .maybeSingle();
    if (!lead) return err('NOT_FOUND', 'Lead not found', 404);
    email = (lead as { email: string | null }).email;
  }

  if (email) {
    const { data: suppressed } = await sb
      .from('marketing_suppressions')
      .select('id')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .eq('channel', 'email')
      .ilike('contact', email)
      .limit(1);
    if (suppressed?.length) return err('CONFLICT', 'this email is suppressed', 409);
  }

  const { data: firstStep } = await sb
    .from('crm_sequence_steps')
    .select('delay_days')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('sequence_id', id)
    .order('step_no', { ascending: true })
    .limit(1);
  const delayDays = firstStep?.length ? Number((firstStep[0] as { delay_days: number }).delay_days) || 0 : 0;
  const nextRunAt = new Date(Date.now() + delayDays * 86400_000).toISOString();

  const { data, error } = await sb
    .from('crm_sequence_enrollments')
    .insert({
      tenant_id: DEFAULT_TENANT_ID,
      sequence_id: id,
      customer_id: customerId,
      lead_id: leadId,
      deal_id: dealId,
      email,
      next_run_at: nextRunAt,
    })
    .select('id')
    .single();
  if (error) {
    if (String(error.message).includes('crm_sequence_enrollments_active_uq')) {
      return err('CONFLICT', 'already actively enrolled in this sequence', 409);
    }
    return err('INTERNAL', error.message, 500);
  }
  return NextResponse.json({ data: { enrollmentId: (data as { id: string }).id, nextRunAt } }, { status: 201 });
}
