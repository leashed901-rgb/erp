import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { nextTicketRef, createTicketConversation, conversationChannel, appendTicketEvent } from '@/lib/supportServer';

/** GET /api/v1/tickets?status=open&queue=customer
 *  Lists support tickets with filters. Soft-deleted rows are hidden. */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status');
  const queue = searchParams.get('queue');
  const assignee = searchParams.get('assigned_to');
  const customerId = searchParams.get('customer_id');
  const email = searchParams.get('email');

  let query = supabaseAdmin()
    .from('support_tickets')
    .select('*')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(100);

  if (status && status !== 'all') query = query.eq('status', status);
  if (assignee) query = query.eq('assigned_staff_id', assignee);
  if (customerId) query = query.eq('requester_customer_id', customerId);
  if (email) query = query.eq('requester_email', email);
  if (queue === 'attention') query = query.not('first_response_due_at', 'is', null);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: { code: 'INTERNAL', message: error.message, requestId: crypto.randomUUID() } }, { status: 500 });
  return NextResponse.json({ data, meta: { total: data.length } });
}

/** POST /api/v1/tickets — create a ticket.
 *  support_tickets requires a linked crm_conversations row
 *  (conversation_id NOT NULL), a category, tags, metadata and a
 *  visibility_level — the conversation is created first, the ref
 *  comes from the platform ticket counter. */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: { code: 'VALIDATION', message: 'Invalid JSON', requestId: crypto.randomUUID() } }, { status: 400 });
  }

  const subject = typeof body.subject === 'string' && body.subject.trim() ? body.subject.trim() : 'New ticket';
  const sourceChannel = typeof body.source_channel === 'string' ? body.source_channel : 'web';
  const requesterType = typeof body.requester_type === 'string' ? body.requester_type : 'customer';

  const conversationId = await createTicketConversation({
    channel: conversationChannel(sourceChannel),
    subject,
    customerId: typeof body.requester_customer_id === 'string' ? body.requester_customer_id : null,
  });
  if (!conversationId) {
    return NextResponse.json({ error: { code: 'INTERNAL', message: 'Could not create the ticket conversation', requestId: crypto.randomUUID() } }, { status: 500 });
  }

  const insert = {
    tenant_id: DEFAULT_TENANT_ID,
    ticket_ref: typeof body.ticket_ref === 'string' && body.ticket_ref ? body.ticket_ref : await nextTicketRef(),
    requester_type: requesterType,
    requester_customer_id: body.requester_customer_id || null,
    requester_name: body.requester_name || null,
    requester_email: body.requester_email || null,
    subject,
    status: 'new',
    priority: typeof body.priority === 'string' ? body.priority : 'normal',
    category: typeof body.category === 'string' && body.category ? body.category : 'general',
    ticket_type: body.ticket_type || 'question',
    source_channel: sourceChannel,
    visibility_level: typeof body.visibility_level === 'string' ? body.visibility_level : requesterType === 'internal' ? 'internal' : 'public',
    conversation_id: conversationId,
    order_id: body.order_id || null,
    product_id: body.product_id || null,
    tags: Array.isArray(body.tags) ? body.tags : [],
    metadata: body.metadata && typeof body.metadata === 'object' ? body.metadata : {},
  };

  const { data, error } = await supabaseAdmin().from('support_tickets').insert(insert).select('*').single();
  if (error) return NextResponse.json({ error: { code: 'INTERNAL', message: error.message, requestId: crypto.randomUUID() } }, { status: 500 });

  // Create the first message if provided — an immutable timeline event.
  if (body.message && data) {
    await appendTicketEvent({
      ticketId: String((data as { id: string }).id),
      eventType: 'message',
      detail: String(body.message),
      actorType: 'requester',
      actorLabel: typeof body.requester_name === 'string' ? body.requester_name : 'Customer',
      visibility: 'public',
    });
  }

  return NextResponse.json({ data }, { status: 201 });
}
