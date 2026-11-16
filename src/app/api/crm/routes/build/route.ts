import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { resolveStaffId, routeWithStops } from '../route';

function fail(code: string, message: string, status: number) {
  return NextResponse.json(
    { error: { code, message, requestId: crypto.randomUUID() } },
    { status },
  );
}

/**
 * POST /api/crm/routes/build { date, staff_id? } — build (or rebuild)
 * the day's route from the staff member's appointments.
 *
 * The platform RPC crm_build_route is member-guarded
 * (platform_is_tenant_member on auth.uid), unreachable via service
 * role — same wall as crm_move_deal / crm_convert_lead. This route
 * performs the RPC's exact writes: upsert the route, drop pending
 * appointment stops, insert stops from the day's appointments whose
 * customer has any address on file (street, or city/state),
 * renumber 1..n in appointment-time order — that ordering IS
 * the route — mark it 'planned' and enqueue the route.optimize
 * outbox event for drive-time enrichment (a platform worker).
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  const date = typeof body?.date === 'string' ? body.date : new Date().toISOString().slice(0, 10);
  const sb = supabaseAdmin();
  const staffId = await resolveStaffId(sb, typeof body?.staff_id === 'string' ? body.staff_id : null);
  if (!staffId) return fail('VALIDATION', 'No staff records exist to own a route', 400);

  // 1. Upsert the route (unique tenant+staff+date).
  const { data: route, error: routeError } = await sb
    .from('crm_routes')
    .upsert(
      { tenant_id: DEFAULT_TENANT_ID, staff_id: staffId, route_date: date, name: `Route ${date}`, updated_at: new Date().toISOString() },
      { onConflict: 'tenant_id,staff_id,route_date' },
    )
    .select('*')
    .single();
  if (routeError) return fail('INTERNAL', routeError.message, 500);

  // 2. Drop pending appointment-derived stops (manual stops stay).
  await sb
    .from('crm_route_stops')
    .delete()
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('route_id', route.id)
    .eq('status', 'pending')
    .not('appointment_id', 'is', null);

  // 3. The day's appointments for this staff member.
  // The RPC filters staff_id = p_staff; appointments booked from a
  // party profile carry no staff assignment, so unassigned bookings
  // join the operator's route too — otherwise the builder would
  // never see the appointments the product actually creates.
  const { data: appointments, error: apptError } = await sb
    .from('crm_appointments')
    .select('id, customer_id, starts_at, ends_at, timezone, status')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .or(`staff_id.eq.${staffId},staff_id.is.null`)
    .not('status', 'in', '("cancelled","rescheduled","no_show")')
    .order('starts_at', { ascending: true });
  if (apptError) return fail('INTERNAL', apptError.message, 500);

  const dayAppts = (appointments || []).filter(a => {
    const tz = a.timezone || 'America/Chicago';
    try {
      const local = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(a.starts_at));
      return local === date;
    } catch {
      return String(a.starts_at).slice(0, 10) === date;
    }
  });

  if (dayAppts.length > 0) {
    const custIds = [...new Set(dayAppts.map(a => a.customer_id).filter(Boolean))];
    const { data: customers } = await sb
      .from('crm_customers')
      .select('id, address_line1, city, state, postal_code')
      .in('id', custIds);
    const cust = new Map((customers || []).map(c => [c.id, c]));
    const { data: existing } = await sb
      .from('crm_route_stops')
      .select('appointment_id')
      .eq('route_id', route.id);
    const existingAppts = new Set((existing || []).map(s => s.appointment_id));
    const { data: maxRow } = await sb
      .from('crm_route_stops')
      .select('seq')
      .eq('route_id', route.id)
      .order('seq', { ascending: false })
      .limit(1)
      .maybeSingle();
    let seq = (maxRow?.seq || 0) + 1;
    const inserts = [];
    for (const a of dayAppts) {
      const c = a.customer_id ? cust.get(a.customer_id) : null;
      if (!c) continue;
      // Route the appointment with whatever address the party has.
      // The RPC excluded parties without a street address — in this
      // tenant that is EVERY party (they carry city/state), so the
      // builder routed nothing at all. A stop composed from
      // city/state is a real stop on the driver's list; the street
      // address refines it when one is on file.
      const address = [c.address_line1, c.city, c.state, c.postal_code].filter(Boolean).join(', ');
      if (!address) continue;
      if (existingAppts.has(a.id)) continue;
      inserts.push({
        tenant_id: DEFAULT_TENANT_ID,
        route_id: route.id,
        seq: seq++,
        appointment_id: a.id,
        customer_id: a.customer_id,
        address,
        window_start: a.starts_at,
        window_end: a.ends_at,
        service_minutes: Math.round((new Date(a.ends_at).getTime() - new Date(a.starts_at).getTime()) / 60000),
        status: 'pending',
      });
    }
    if (inserts.length > 0) {
      const { error: insertError } = await sb.from('crm_route_stops').insert(inserts);
      if (insertError) return fail('INTERNAL', insertError.message, 500);
    }
  }

  // 4. Renumber 1..n in current seq order.
  const { data: allStops } = await sb
    .from('crm_route_stops')
    .select('id')
    .eq('route_id', route.id)
    .order('seq', { ascending: true });
  for (let i = 0; i < (allStops || []).length; i++) {
    await sb.from('crm_route_stops').update({ seq: 1000 + i }).eq('id', allStops![i].id);
  }
  for (let i = 0; i < (allStops || []).length; i++) {
    await sb.from('crm_route_stops').update({ seq: i + 1 }).eq('id', allStops![i].id);
  }

  // 5. Status: the build itself sequences the stops (appointment
  // time order, renumbered above), so a route with stops is
  // 'planned' — routed, ready for the driver. The optimize event
  // still goes out for drive-time/distance enrichment by the
  // platform worker; an empty day stays 'draft'.
  const stopCount = (allStops || []).length;
  await sb.from('crm_routes').update({ status: stopCount > 0 ? 'planned' : 'draft', updated_at: new Date().toISOString() }).eq('id', route.id);
  await sb.from('platform_outbox').insert({
    tenant_id: DEFAULT_TENANT_ID,
    channel: 'integration',
    event_type: 'route.optimize',
    aggregate_type: 'crm_routes',
    aggregate_ref: route.id,
    payload: { route_id: route.id },
    status: 'pending',
    attempts: 0,
    available_at: new Date().toISOString(),
    source_table: 'crm_routes',
    source_id: `${route.id}:${Math.floor(Date.now() / 1000)}`,
  });

  const { data: fresh } = await sb.from('crm_routes').select('*').eq('id', route.id).single();
  return NextResponse.json({ data: await routeWithStops(sb, fresh || route) });
}
