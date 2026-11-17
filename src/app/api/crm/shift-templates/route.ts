import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

const err = (code: string, message: string, status: number) =>
  NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });

/** GET /api/crm/shift-templates — backs the existing useShiftTemplates
 *  hook (doc 13 nav: Time/Shift templates). POST creates a template. */
export async function GET() {
  const { data, error } = await supabaseAdmin()
    .from('crm_shift_templates')
    .select('*')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .order('day_of_week', { ascending: true })
    .limit(200);
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data });
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return err('VALIDATION', 'Invalid JSON', 400); }
  if (!body.name) return err('VALIDATION', 'name is required', 400);
  const { data, error } = await supabaseAdmin()
    .from('crm_shift_templates')
    .insert({
      tenant_id: DEFAULT_TENANT_ID,
      name: String(body.name),
      location_id: body.locationId ? String(body.locationId) : null,
      day_of_week: body.dayOfWeek != null ? Number(body.dayOfWeek) : null,
      starts_at: body.startsAt ? String(body.startsAt) : null,
      ends_at: body.endsAt ? String(body.endsAt) : null,
      break_minutes: body.breakMinutes != null ? Number(body.breakMinutes) : null,
      role: body.role ? String(body.role) : null,
      required_headcount: body.requiredHeadcount != null ? Number(body.requiredHeadcount) : null,
      is_active: body.isActive !== false,
    })
    .select('*')
    .single();
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data }, { status: 201 });
}
