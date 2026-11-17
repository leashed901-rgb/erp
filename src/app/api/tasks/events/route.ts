import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { toCalendarEvent } from '@/lib/taskTypes';

/* Calendar events (doc 27) over platform_calendar_events —
   registry action create.calendar_event. When no calendar exists
   yet, the tenant's default calendar is created so the event has
   its required calendar_id. */
function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

async function defaultCalendarId(): Promise<string | null> {
  const sb = supabaseAdmin();
  const { data: existing } = await sb
    .from('platform_calendars')
    .select('id')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (existing) return String((existing as { id: string }).id);
  const { data: created } = await sb
    .from('platform_calendars')
    .insert({ tenant_id: DEFAULT_TENANT_ID, name: 'Team calendar', timezone: 'America/Chicago', visibility: 'team', blocks_availability: false })
    .select('id')
    .single();
  return created ? String((created as { id: string }).id) : null;
}

export async function GET(req: NextRequest) {
  const from = req.nextUrl.searchParams.get('from');
  const to = req.nextUrl.searchParams.get('to');
  const sb = supabaseAdmin();
  let query = sb
    .from('platform_calendar_events')
    .select('*')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .order('starts_at', { ascending: true })
    .limit(500);
  if (from) query = query.gte('starts_at', from);
  if (to) query = query.lte('starts_at', to);
  const { data, error } = await query;
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: (data || []).map((r) => toCalendarEvent(r as Record<string, unknown>)) });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const startsAt = typeof body.startsAt === 'string' ? body.startsAt : null;
  const endsAt = typeof body.endsAt === 'string' ? body.endsAt : null;
  if (!title || !startsAt || !endsAt) return err('VALIDATION', 'title, startsAt and endsAt are required', 400);
  const calendarId = typeof body.calendarId === 'string' ? body.calendarId : await defaultCalendarId();
  if (!calendarId) return err('INTERNAL', 'No calendar available', 500);
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('platform_calendar_events')
    .insert({
      tenant_id: DEFAULT_TENANT_ID,
      calendar_id: calendarId,
      title,
      description: typeof body.description === 'string' ? body.description : null,
      location: typeof body.location === 'string' ? body.location : null,
      starts_at: startsAt,
      ends_at: endsAt,
      all_day: Boolean(body.allDay),
      status: typeof body.status === 'string' ? body.status : 'confirmed',
      related_type: typeof body.relatedType === 'string' ? body.relatedType : null,
      related_id: typeof body.relatedId === 'string' ? body.relatedId : null,
      meeting_url: typeof body.meetingUrl === 'string' ? body.meetingUrl : null,
      created_by: typeof body.createdBy === 'string' ? body.createdBy : null,
    })
    .select('*')
    .single();
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: toCalendarEvent(data as Record<string, unknown>) }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const id = typeof body.id === 'string' ? body.id : null;
  if (!id) return err('VALIDATION', 'id is required', 400);
  const patch: Record<string, unknown> = {};
  if (typeof body.title === 'string') patch.title = body.title;
  if (typeof body.startsAt === 'string') patch.starts_at = body.startsAt;
  if (typeof body.endsAt === 'string') patch.ends_at = body.endsAt;
  if (typeof body.status === 'string') patch.status = body.status;
  if (typeof body.location === 'string') patch.location = body.location;
  if (!Object.keys(patch).length) return err('VALIDATION', 'nothing to update', 400);
  const sb = supabaseAdmin();
  const { data, error } = await sb.from('platform_calendar_events').update(patch).eq('tenant_id', DEFAULT_TENANT_ID).eq('id', id).select('*').maybeSingle();
  if (error) return err('INTERNAL', error.message, 500);
  if (!data) return err('NOT_FOUND', 'Event not found', 404);
  return NextResponse.json({ data: toCalendarEvent(data as Record<string, unknown>) });
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return err('VALIDATION', 'id query param required', 400);
  const sb = supabaseAdmin();
  const { error } = await sb.from('platform_calendar_events').delete().eq('tenant_id', DEFAULT_TENANT_ID).eq('id', id);
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: { id, deleted: true } });
}
