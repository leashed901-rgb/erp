import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status = 400) {
  return NextResponse.json({ error: { code, message } }, { status });
}

/** POST /api/val/material-events — logs a valuation material event (val_material_events). */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const eventType = String(body.event_type ?? '').trim();
    const eventDate = String(body.event_date ?? '');
    if (!eventType) return err('VALIDATION', 'event_type is required.');
    if (!eventDate) return err('VALIDATION', 'event_date is required.');
    const sb = supabaseAdmin();
    const { data: entityId } = await sb.rpc('acct_default_entity', { p_tenant_id: DEFAULT_TENANT_ID });
    const { data, error } = await sb
      .from('val_material_events')
      .insert({
        tenant_id: DEFAULT_TENANT_ID,
        entity_id: entityId ?? null,
        event_type: eventType,
        event_date: eventDate,
        description: body.description ?? null,
        triggers_revaluation: Boolean(body.triggers_revaluation),
        resolved_val_request_id: body.resolved_val_request_id ?? null,
      })
      .select()
      .single();
    if (error) return err('CREATE_FAILED', error.message);
    return NextResponse.json({ data }, { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to log material event.';
    return err('CREATE_FAILED', message);
  }
}
