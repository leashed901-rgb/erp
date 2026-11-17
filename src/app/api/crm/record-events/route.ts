import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function fail(code: string, message: string, status: number) {
  return NextResponse.json(
    { error: { code, message, requestId: crypto.randomUUID() } },
    { status },
  );
}

/**
 * Tracked-record events (crm_record_events) — the lifecycle timeline
 * of a tracked record (dependent): status changes, vaccinations,
 * appointments and any other dated event. Registered actions
 * create.record_event / read.crm_record_events.
 *
 * GET  /api/crm/record-events?dependent_id=<uuid>
 * POST /api/crm/record-events { dependent_id, event_type, occurred_at?,
 *        reference_number?, status_from?, status_to?, amount?,
 *        appointment_id? }
 */
export async function GET(req: NextRequest) {
  const dependentId = req.nextUrl.searchParams.get('dependent_id');
  if (!dependentId) return fail('VALIDATION', 'dependent_id is required', 400);
  const { data, error } = await supabaseAdmin()
    .from('crm_record_events')
    .select('*')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('dependent_id', dependentId)
    .order('occurred_at', { ascending: false })
    .limit(100);
  if (error) return fail('INTERNAL', error.message, 500);
  return NextResponse.json({ data: data || [] });
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return fail('VALIDATION', 'Invalid JSON body', 400);
  }
  if (!body.dependent_id || !body.event_type) {
    return fail('VALIDATION', 'dependent_id and event_type are required', 400);
  }
  const { data, error } = await supabaseAdmin()
    .from('crm_record_events')
    .insert({
      tenant_id: DEFAULT_TENANT_ID,
      dependent_id: String(body.dependent_id),
      event_type: String(body.event_type),
      occurred_at:
        typeof body.occurred_at === 'string' && body.occurred_at
          ? body.occurred_at
          : new Date().toISOString(),
      reference_number: (body.reference_number as string) || null,
      status_from: (body.status_from as string) || null,
      status_to: (body.status_to as string) || null,
      amount: body.amount != null ? Number(body.amount) : null,
      appointment_id: (body.appointment_id as string) || null,
    })
    .select('*')
    .single();
  if (error) return fail('INTERNAL', error.message, 500);
  return NextResponse.json({ data }, { status: 201 });
}
