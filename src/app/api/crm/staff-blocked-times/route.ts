import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

const err = (code: string, message: string, status: number) =>
  NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });

/** GET /api/crm/staff-blocked-times — staff schedule blocks (doc 13
 *  nav: Time/Staff schedule → crm_staff_blocked_times). POST adds one. */
export async function GET(req: NextRequest) {
  const staffId = new URL(req.url).searchParams.get('staff_id');
  let query = supabaseAdmin()
    .from('crm_staff_blocked_times')
    .select('*')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .order('starts_at', { ascending: true })
    .limit(200);
  if (staffId) query = query.eq('staff_id', staffId);
  const { data, error } = await query;
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data });
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return err('VALIDATION', 'Invalid JSON', 400); }
  if (!body.staffId || !body.startsAt || !body.endsAt) return err('VALIDATION', 'staffId, startsAt, endsAt are required', 400);
  const { data, error } = await supabaseAdmin()
    .from('crm_staff_blocked_times')
    .insert({
      tenant_id: DEFAULT_TENANT_ID,
      staff_id: String(body.staffId),
      location_id: body.locationId ? String(body.locationId) : null,
      starts_at: String(body.startsAt),
      ends_at: String(body.endsAt),
      block_type: body.blockType ? String(body.blockType) : 'unavailable',
      reason: body.reason ? String(body.reason) : null,
    })
    .select('*')
    .single();
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data }, { status: 201 });
}
