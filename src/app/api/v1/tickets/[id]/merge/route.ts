import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { appendTicketEvent } from '@/lib/supportServer';

/** POST /api/v1/tickets/[id]/merge — merge this ticket INTO another.
 *  Body: { intoId } — the source ticket is closed with merged_into_id
 *  set, and both timelines get an immutable merge event. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: { code: 'VALIDATION', message: 'Invalid JSON', requestId: crypto.randomUUID() } }, { status: 400 });
  }
  const intoId = typeof body.intoId === 'string' ? body.intoId : null;
  if (!intoId || intoId === id) {
    return NextResponse.json({ error: { code: 'VALIDATION', message: 'intoId (a different ticket) is required', requestId: crypto.randomUUID() } }, { status: 400 });
  }
  const sb = supabaseAdmin();
  const { data: target } = await sb.from('support_tickets').select('id, ticket_ref, subject').eq('tenant_id', DEFAULT_TENANT_ID).eq('id', intoId).maybeSingle();
  if (!target) return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Target ticket not found', requestId: crypto.randomUUID() } }, { status: 404 });
  const t = target as { ticket_ref: string; subject: string };

  const now = new Date().toISOString();
  const { data, error } = await sb
    .from('support_tickets')
    .update({ merged_into_id: intoId, status: 'closed', closed_at: now, resolved_at: now, updated_at: now })
    .eq('id', id)
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .select('*')
    .single();
  if (error || !data) return NextResponse.json({ error: { code: 'INTERNAL', message: error?.message || 'Merge failed', requestId: crypto.randomUUID() } }, { status: 500 });

  await appendTicketEvent({
    ticketId: id, eventType: 'merged', visibility: 'internal', actorType: 'staff',
    detail: `Merged into ${t.ticket_ref} — ${t.subject}`,
    payload: { merged_into_id: intoId },
  });
  await appendTicketEvent({
    ticketId: intoId, eventType: 'merged', visibility: 'internal', actorType: 'staff',
    detail: `Ticket ${(data as { ticket_ref: string }).ticket_ref} was merged into this ticket`,
    payload: { merged_from_id: id },
  });

  return NextResponse.json({ data });
}
