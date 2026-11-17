import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { toTimeOffRequest } from '@/lib/timeTypes';

const err = (code: string, message: string, status: number) =>
  NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });

/** GET /api/crm/time-off-requests — backs the existing
 *  useTimeOffRequests hook (doc 13 nav: Time/Time off). */
export async function GET(req: NextRequest) {
  const staffId = new URL(req.url).searchParams.get('staff_id');
  let query = supabaseAdmin()
    .from('crm_time_off_requests')
    .select('*')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .order('starts_on', { ascending: false })
    .limit(200);
  if (staffId) query = query.eq('staff_id', staffId);
  const { data, error } = await query;
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: (data || []).map((r) => toTimeOffRequest(r as Record<string, unknown>)) });
}

/** POST — create a time-off request. */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return err('VALIDATION', 'Invalid JSON', 400); }
  if (!body.staffId || !body.startsOn || !body.endsOn) return err('VALIDATION', 'staffId, startsOn, endsOn are required', 400);
  const { data, error } = await supabaseAdmin()
    .from('crm_time_off_requests')
    .insert({
      tenant_id: DEFAULT_TENANT_ID,
      staff_id: String(body.staffId),
      request_type: body.requestType ? String(body.requestType) : 'pto',
      starts_on: String(body.startsOn),
      ends_on: String(body.endsOn),
      is_partial_day: Boolean(body.isPartialDay),
      hours_requested: body.hoursRequested != null ? Number(body.hoursRequested) : null,
      reason: body.reason ? String(body.reason) : null,
      status: 'pending',
      blocks_booking: body.blocksBooking !== false,
    })
    .select('*')
    .single();
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: toTimeOffRequest(data as Record<string, unknown>) }, { status: 201 });
}
