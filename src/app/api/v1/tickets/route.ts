import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/** GET /api/v1/tickets?status=open&queue=customer
 *  Lists support tickets with filters. */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status');
  const queue = searchParams.get('queue');
  const assignee = searchParams.get('assigned_to');
  const customerId = searchParams.get('customer_id');

  let query = supabaseAdmin()
    .from('support_tickets')
    .select('*')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .order('created_at', { ascending: false })
    .limit(100);

  if (status && status !== 'all') query = query.eq('status', status);
  if (assignee) query = query.eq('assigned_staff_id', assignee);
  if (customerId) query = query.eq('requester_customer_id', customerId);
  if (queue === 'attention') query = query.not('first_response_due_at', 'is', null);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: { code: 'INTERNAL', message: error.message, requestId: crypto.randomUUID() } }, { status: 500 });
  return NextResponse.json({ data, meta: { total: data.length } });
}

/** POST /api/v1/tickets — create a ticket. */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: { code: 'VALIDATION', message: 'Invalid JSON', requestId: crypto.randomUUID() } }, { status: 400 });
  }

  const insert = {
    tenant_id: DEFAULT_TENANT_ID,
    ticket_ref: body.ticket_ref || `TKT-${Date.now()}`,
    requester_type: body.requester_type || 'customer',
    requester_customer_id: body.requester_customer_id || null,
    requester_name: body.requester_name || null,
    requester_email: body.requester_email || null,
    subject: body.subject || 'New ticket',
    status: 'new',
    priority: body.priority || 'normal',
    category: body.category || null,
    ticket_type: body.ticket_type || 'question',
    source_channel: body.source_channel || 'web',
    order_id: body.order_id || null,
    product_id: body.product_id || null,
    tags: body.tags || [],
    metadata: body.metadata || {},
  };

  const { data, error } = await supabaseAdmin().from('support_tickets').insert(insert).select('*').single();
  if (error) return NextResponse.json({ error: { code: 'INTERNAL', message: error.message, requestId: crypto.randomUUID() } }, { status: 500 });

  // Create the first message if provided
  if (body.message && data) {
    await supabaseAdmin().from('support_ticket_events').insert({
      tenant_id: DEFAULT_TENANT_ID,
      ticket_id: data.id,
      event_type: 'message',
      content: String(body.message),
      author_type: 'requester',
      author_name: body.requester_name || 'Customer',
    }).catch(() => {});
  }

  return NextResponse.json({ data }, { status: 201 });
}
