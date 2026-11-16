import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function fail(code: string, message: string, status: number) {
  return NextResponse.json(
    { error: { code, message, requestId: crypto.randomUUID() } },
    { status },
  );
}

/** Routes belong to a crm_staff member; the default is the
 *  tenant's first staff record (the builder's staff picker can
 *  override it). */
export async function resolveStaffId(sb: ReturnType<typeof supabaseAdmin>, requested?: string | null): Promise<string | null> {
  if (requested) return requested;
  const { data } = await sb
    .from('crm_staff')
    .select('id')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  return data?.id || null;
}

/** A route with its stops enriched with the party name + appointment. */
export async function routeWithStops(sb: ReturnType<typeof supabaseAdmin>, route: Record<string, any>) {
  const { data: stops } = await sb
    .from('crm_route_stops')
    .select('*')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('route_id', route.id)
    .order('seq', { ascending: true });
  const rows = stops || [];
  const custIds = [...new Set(rows.map(s => s.customer_id).filter(Boolean))];
  const apptIds = [...new Set(rows.map(s => s.appointment_id).filter(Boolean))];
  const [custRes, apptRes] = await Promise.all([
    custIds.length ? sb.from('crm_customers').select('id, first_name, last_name, company_name, phone, city, state').in('id', custIds) : Promise.resolve({ data: [] as Record<string, any>[] }),
    apptIds.length ? sb.from('crm_appointments').select('id, title, appointment_number, starts_at').in('id', apptIds) : Promise.resolve({ data: [] as Record<string, any>[] }),
  ]);
  const cust = new Map((custRes.data || []).map(c => [c.id, c]));
  const appt = new Map((apptRes.data || []).map(a => [a.id, a]));
  return {
    ...route,
    stops: rows.map(s => ({
      ...s,
      party_name: s.customer_id
        ? (() => { const c = cust.get(s.customer_id); return c ? ([c.first_name, c.last_name].filter(Boolean).join(' ') || c.company_name || 'Customer') : null; })()
        : null,
      party_phone: s.customer_id ? (cust.get(s.customer_id)?.phone ?? null) : null,
      party_city: s.customer_id ? (cust.get(s.customer_id)?.city ?? null) : null,
      appointment_title: s.appointment_id ? (appt.get(s.appointment_id)?.title ?? null) : null,
      appointment_number: s.appointment_id ? (appt.get(s.appointment_id)?.appointment_number ?? null) : null,
    })),
  };
}

/**
 * GET /api/crm/routes?date=YYYY-MM-DD&staff_id= — the route for a
 * day + staff member with its stops (null route when none exists).
 */
export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get('date') || new Date().toISOString().slice(0, 10);
  const sb = supabaseAdmin();
  const staffId = await resolveStaffId(sb, req.nextUrl.searchParams.get('staff_id'));
  if (!staffId) return NextResponse.json({ data: null });
  const { data: route, error } = await sb
    .from('crm_routes')
    .select('*')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('staff_id', staffId)
    .eq('route_date', date)
    .maybeSingle();
  if (error) return fail('INTERNAL', error.message, 500);
  if (!route) return NextResponse.json({ data: null });
  return NextResponse.json({ data: await routeWithStops(sb, route) });
}
