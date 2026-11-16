import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function fail(code: string, message: string, status: number) {
  return NextResponse.json(
    { error: { code, message, requestId: crypto.randomUUID() } },
    { status },
  );
}

/**
 * POST /api/crm/routes/[id]/stops — add a stop to a route: from an
 * appointment (window + address come from it), from a party
 * (customer_id + their address), or a manual address.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || typeof body !== 'object') return fail('VALIDATION', 'JSON body required', 400);
  const sb = supabaseAdmin();

  const { data: route } = await sb
    .from('crm_routes')
    .select('id')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('id', id)
    .maybeSingle();
  if (!route) return fail('NOT_FOUND', 'Route not found', 404);

  let appointmentId: string | null = null;
  let customerId: string | null = typeof body.customer_id === 'string' ? body.customer_id : null;
  let address: string | null = typeof body.address === 'string' ? body.address : null;
  let windowStart: string | null = null;
  let windowEnd: string | null = null;
  let serviceMinutes: number | null = null;

  if (typeof body.appointment_id === 'string') {
    appointmentId = body.appointment_id;
    const { data: appt } = await sb
      .from('crm_appointments')
      .select('id, customer_id, starts_at, ends_at')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .eq('id', appointmentId)
      .maybeSingle();
    if (!appt) return fail('NOT_FOUND', 'Appointment not found', 404);
    customerId = appt.customer_id;
    windowStart = appt.starts_at;
    windowEnd = appt.ends_at;
    serviceMinutes = Math.round((new Date(appt.ends_at).getTime() - new Date(appt.starts_at).getTime()) / 60000);
  }

  if (customerId && !address) {
    const { data: cust } = await sb
      .from('crm_customers')
      .select('address_line1, city, state, postal_code')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .eq('id', customerId)
      .maybeSingle();
    // Compose from whatever address parts the party has — the
    // tenant's parties carry city/state even where no street
    // address is on file yet.
    if (cust) {
      const composed = [cust.address_line1, cust.city, cust.state, cust.postal_code].filter(Boolean).join(', ');
      if (composed) address = composed;
    }
  }
  if (!address && !appointmentId) {
    return fail('VALIDATION', 'An address, a party with an address, or an appointment is required', 400);
  }

  const { data: maxRow } = await sb
    .from('crm_route_stops')
    .select('seq')
    .eq('route_id', id)
    .order('seq', { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data, error } = await sb
    .from('crm_route_stops')
    .insert({
      tenant_id: DEFAULT_TENANT_ID,
      route_id: id,
      seq: (maxRow?.seq || 0) + 1,
      appointment_id: appointmentId,
      customer_id: customerId,
      address,
      window_start: windowStart,
      window_end: windowEnd,
      service_minutes: serviceMinutes ?? 30,
      notes: typeof body.notes === 'string' ? body.notes : null,
      status: 'pending',
    })
    .select('*')
    .single();
  if (error) return fail('INTERNAL', error.message, 500);
  return NextResponse.json({ data }, { status: 201 });
}
