import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { toScheduleSlot } from '@/lib/socialTypes';
import { firstPartySellerId } from '@/lib/socialServer';

/* Recurring weekly schedule slots (doc 23: social_schedule_slots) —
   the calendar's standing publishing times. */

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

export async function GET() {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('social_schedule_slots')
    .select('*')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .order('weekday', { ascending: true })
    .order('time_local', { ascending: true });
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: (data || []).map((r) => toScheduleSlot(r as Record<string, unknown>)) });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const weekday = typeof body.weekday === 'number' ? body.weekday : null;
  if (weekday == null || weekday < 0 || weekday > 6) return err('VALIDATION', 'weekday (0-6) is required', 400);
  const timeLocal = typeof body.timeLocal === 'string' && /^\d{2}:\d{2}/.test(body.timeLocal) ? body.timeLocal : null;
  if (!timeLocal) return err('VALIDATION', 'timeLocal (HH:MM) is required', 400);
  const sellerId = await firstPartySellerId();
  if (!sellerId) return err('CONFLICT', 'The tenant has no first-party seller — set one up before adding slots', 409);
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('social_schedule_slots')
    .insert({
      tenant_id: DEFAULT_TENANT_ID,
      seller_id: sellerId,
      weekday,
      time_local: timeLocal,
      timezone: typeof body.timezone === 'string' ? body.timezone : 'America/Chicago',
      label: typeof body.label === 'string' ? body.label : null,
      is_active: body.isActive !== false,
    })
    .select('*')
    .single();
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: toScheduleSlot(data as Record<string, unknown>) }, { status: 201 });
}
