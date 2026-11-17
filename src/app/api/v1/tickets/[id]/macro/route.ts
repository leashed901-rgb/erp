import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { appendTicketEvent } from '@/lib/supportServer';

/** POST /api/v1/tickets/[id]/macro — apply a support_macros row.
 *  Body: { macroId }. Field actions (set_status / set_priority /
 *  assign / set_category / add_tags) update the ticket; text actions
 *  (reply / note) append immutable timeline events. One system event
 *  records the macro application itself. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: { code: 'VALIDATION', message: 'Invalid JSON', requestId: crypto.randomUUID() } }, { status: 400 });
  }
  const macroId = typeof body.macroId === 'string' ? body.macroId : null;
  if (!macroId) return NextResponse.json({ error: { code: 'VALIDATION', message: 'macroId is required', requestId: crypto.randomUUID() } }, { status: 400 });

  const sb = supabaseAdmin();
  const { data: macro } = await sb.from('support_macros').select('*').eq('tenant_id', DEFAULT_TENANT_ID).eq('id', macroId).maybeSingle();
  if (!macro) return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Macro not found', requestId: crypto.randomUUID() } }, { status: 404 });
  const m = macro as { name: string; actions: Array<Record<string, unknown>>; is_active: boolean };
  if (!m.is_active) return NextResponse.json({ error: { code: 'CONFLICT', message: 'Macro is inactive', requestId: crypto.randomUUID() } }, { status: 409 });

  const { data: ticket } = await sb.from('support_tickets').select('tags').eq('tenant_id', DEFAULT_TENANT_ID).eq('id', id).maybeSingle();
  if (!ticket) return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Ticket not found', requestId: crypto.randomUUID() } }, { status: 404 });

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  const applied: string[] = [];
  let tags = Array.isArray((ticket as { tags: unknown }).tags) ? ((ticket as { tags: string[] }).tags) : [];

  for (const raw of m.actions || []) {
    const kind = String(raw.type || raw.action || '');
    const value = raw.value;
    if (kind === 'set_status' && typeof value === 'string') {
      updates.status = value;
      if (value === 'resolved') updates.resolved_at = new Date().toISOString();
      if (value === 'closed') updates.closed_at = new Date().toISOString();
      applied.push(`status → ${value}`);
    } else if (kind === 'set_priority' && typeof value === 'string') {
      updates.priority = value;
      applied.push(`priority → ${value}`);
    } else if (kind === 'assign' && typeof raw.staff_id === 'string') {
      updates.assigned_staff_id = raw.staff_id;
      applied.push('assigned');
    } else if (kind === 'set_category' && typeof value === 'string') {
      updates.category = value;
      applied.push(`category → ${value}`);
    } else if (kind === 'add_tags' && Array.isArray(raw.tags)) {
      tags = [...new Set([...tags, ...raw.tags.map(String)])];
      updates.tags = tags;
      applied.push('tags added');
    } else if ((kind === 'reply' || kind === 'note') && typeof raw.text === 'string' && raw.text.trim()) {
      await appendTicketEvent({
        ticketId: id,
        eventType: 'message',
        detail: raw.text,
        actorType: 'staff',
        actorLabel: typeof body.author_name === 'string' ? body.author_name : 'Agent',
        visibility: kind === 'note' ? 'internal' : 'public',
        payload: { macro_id: macroId },
      });
      applied.push(kind === 'note' ? 'internal note added' : 'reply added');
    }
  }

  const { data, error } = await sb
    .from('support_tickets')
    .update(updates)
    .eq('id', id)
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .select('*')
    .single();
  if (error || !data) return NextResponse.json({ error: { code: 'INTERNAL', message: error?.message || 'Macro apply failed', requestId: crypto.randomUUID() } }, { status: 500 });

  await appendTicketEvent({
    ticketId: id, eventType: 'macro_applied', visibility: 'internal', actorType: 'staff',
    detail: `Macro "${m.name}" applied: ${applied.join(', ') || 'no actions'}`,
    payload: { macro_id: macroId, applied },
  });

  return NextResponse.json({ data, meta: { applied } });
}
