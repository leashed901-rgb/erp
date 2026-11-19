import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { appendTicketEvent } from '@/lib/supportServer';

/** GET /api/v1/tickets/[id]/messages — ticket conversation timeline.
 *  Returns support_ticket_events for this ticket (messages, notes, system events). */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data, error } = await supabaseAdmin()
    .from('support_ticket_events')
    .select('*')
    .eq('ticket_id', id)
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .order('created_at', { ascending: true })
    .limit(200);
  if (error) return NextResponse.json({ error: { code: 'INTERNAL', message: error.message, requestId: crypto.randomUUID() } }, { status: 500 });
  return NextResponse.json({ data });
}

/** POST /api/v1/tickets/[id]/messages — add a message or internal note.
 *  Events are immutable rows: the text lives in `detail`, internal
 *  notes carry visibility 'internal'. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: { code: 'VALIDATION', message: 'Invalid JSON', requestId: crypto.randomUUID() } }, { status: 400 });
  }

  const detail = typeof body.content === 'string' ? body.content : typeof body.detail === 'string' ? body.detail : '';
  if (!detail.trim()) {
    return NextResponse.json({ error: { code: 'VALIDATION', message: 'content is required', requestId: crypto.randomUUID() } }, { status: 400 });
  }
  const isInternal = Boolean(body.is_internal) || body.visibility === 'internal';

  const event = await appendTicketEvent({
    ticketId: id,
    eventType: typeof body.event_type === 'string' ? body.event_type : 'message',
    detail,
    actorType: typeof body.author_type === 'string' ? body.author_type : 'staff',
    actorStaffId: typeof body.author_staff_id === 'string' ? body.author_staff_id : null,
    actorLabel: typeof body.author_name === 'string' ? body.author_name : 'Agent',
    visibility: isInternal ? 'internal' : 'public',
    payload: body.metadata && typeof body.metadata === 'object' ? (body.metadata as Record<string, unknown>) : {},
  });
  if (!event) {
    return NextResponse.json({ error: { code: 'INTERNAL', message: 'Could not append the event', requestId: crypto.randomUUID() } }, { status: 500 });
  }

  const sb = supabaseAdmin();
  const { data: row } = await sb
    .from('support_ticket_events')
    .select('*')
    .eq('id', event.id)
    .single();

  // GAP-5: a public reply must reach the requester by email, not just the
  // timeline. Enqueue through email_enqueue (same pattern as
  // /api/crm/inbox/send) on the tenant's first verified sender domain.
  // Best-effort: the timeline event already landed, so an enqueue failure
  // is reported, never allowed to fail the reply.
  let emailQueued = false;
  if (!isInternal) {
    try {
      const { data: ticket } = await sb
        .from('support_tickets')
        .select('ticket_ref, subject, requester_email, requester_customer_id')
        .eq('id', id)
        .eq('tenant_id', DEFAULT_TENANT_ID)
        .maybeSingle();
      const to = ticket?.requester_email as string | undefined;
      const ticketRef = ticket?.ticket_ref || id;
      const ticketSubject = ticket?.subject || 'Your support ticket';
      const requesterCustomerId = ticket?.requester_customer_id || null;
      if (to) {
        const { data: domainRow } = await sb
          .from('email_sender_domains')
          .select('domain')
          .eq('tenant_id', DEFAULT_TENANT_ID)
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle();
        const fromAddress = `no-reply@${domainRow?.domain || 'mail.unsaidmemories.com'}`;
        const { error: enqueueError } = await sb.rpc('email_enqueue', {
          p_tenant_id: DEFAULT_TENANT_ID,
          p_idempotency_key: `ticket-reply:${event.id}`,
          p_from: fromAddress,
          p_to: [to],
          p_subject: `Re: [${ticketRef}] ${ticketSubject}`,
          p_html: null,
          p_text: detail,
          p_category: 'transactional',
          p_related_type: 'support_ticket',
          p_related_id: id,
          p_attachments: [],
          p_scheduled_at: null,
          p_crm_customer_id: requesterCustomerId,
        });
        emailQueued = !enqueueError;
      }
    } catch {
      emailQueued = false;
    }
  }

  // Touch the ticket's activity stamp (message counts are maintained
  // by the platform's recount trigger/function).
  await sb.from('support_tickets').update({
    last_message_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('id', id).eq('tenant_id', DEFAULT_TENANT_ID);

  return NextResponse.json({ data: row, email_queued: emailQueued }, { status: 201 });
}
