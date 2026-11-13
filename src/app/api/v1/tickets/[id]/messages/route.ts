import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

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

/** POST /api/v1/tickets/[id]/messages — add a message or internal note. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: { code: 'VALIDATION', message: 'Invalid JSON', requestId: crypto.randomUUID() } }, { status: 400 });
  }

  const insert = {
    tenant_id: DEFAULT_TENANT_ID,
    ticket_id: id,
    event_type: body.event_type || 'message',
    content: String(body.content || ''),
    author_type: body.author_type || 'staff',
    author_name: body.author_name || 'Agent',
    author_staff_id: body.author_staff_id || null,
    is_internal: Boolean(body.is_internal),
    metadata: body.metadata || {},
  };

  const { data, error } = await supabaseAdmin().from('support_ticket_events').insert(insert).select('*').single();
  if (error) return NextResponse.json({ error: { code: 'INTERNAL', message: error.message, requestId: crypto.randomUUID() } }, { status: 500 });

  // Update the ticket's last_message_at
  await supabaseAdmin().from('support_tickets').update({
    last_message_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    message_count: 1, // The trigger should increment this; set as fallback
  }).eq('id', id).eq('tenant_id', DEFAULT_TENANT_ID);

  return NextResponse.json({ data }, { status: 201 });
}
