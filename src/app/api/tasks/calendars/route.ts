import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { toCalendar } from '@/lib/taskTypes';

/* Calendars (doc 27) over platform_calendars. */
function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

export async function GET() {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('platform_calendars')
    .select('*')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .order('name', { ascending: true })
    .limit(100);
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: (data || []).map((r) => toCalendar(r as Record<string, unknown>)) });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) return err('VALIDATION', 'name is required', 400);
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('platform_calendars')
    .insert({
      tenant_id: DEFAULT_TENANT_ID,
      name,
      color: typeof body.color === 'string' ? body.color : null,
      timezone: typeof body.timezone === 'string' ? body.timezone : 'America/Chicago',
      visibility: typeof body.visibility === 'string' ? body.visibility : 'team',
      staff_id: typeof body.staffId === 'string' ? body.staffId : null,
      blocks_availability: Boolean(body.blocksAvailability),
    })
    .select('*')
    .single();
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: toCalendar(data as Record<string, unknown>) }, { status: 201 });
}
