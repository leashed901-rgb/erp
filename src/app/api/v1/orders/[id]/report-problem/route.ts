import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/* Report a problem (doc 14: fulfillment.report_problem →
   support_tickets). The ticket's conversation lives in
   crm_conversations (the FK target of support_tickets.conversation_id)
   and the ticket links the order directly via its order_id column.
   Also flags the order needs_attention so it surfaces in the queue. */

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const subject = typeof body.subject === 'string' && body.subject.trim() ? body.subject.trim() : null;
  if (!subject) return err('VALIDATION', 'subject is required', 400);
  const sb = supabaseAdmin();
  const { data: order } = await sb.from('erp_orders').select('order_number').eq('tenant_id', DEFAULT_TENANT_ID).eq('id', id).maybeSingle();

  const { data: conv, error: convErr } = await sb
    .from('crm_conversations')
    .insert({ tenant_id: DEFAULT_TENANT_ID, subject, status: 'open', channel: 'internal' })
    .select('id')
    .single();
  if (convErr) return err('INTERNAL', convErr.message, 500);

  const ref = `ORD-${String(order?.order_number || id.slice(0, 8))}-${Date.now().toString(36).toUpperCase()}`;
  const { data: ticket, error } = await sb
    .from('support_tickets')
    .insert({
      tenant_id: DEFAULT_TENANT_ID,
      ticket_ref: ref,
      requester_type: 'internal',
      subject,
      status: 'open',
      priority: typeof body.priority === 'string' ? body.priority : 'normal',
      category: 'order',
      tags: [],
      visibility_level: 'internal',
      conversation_id: conv.id,
      order_id: order ? id : null,
      metadata: { order_id: id, order_number: order?.order_number ?? null, description: typeof body.description === 'string' ? body.description : null },
    })
    .select('*')
    .single();
  if (error) return err('INTERNAL', error.message, 500);

  if (order) await sb.from('erp_orders').update({ needs_attention: true, attention_reason: subject }).eq('id', id);
  return NextResponse.json({
    data: {
      id: ticket.id as string,
      ticketRef: ticket.ticket_ref as string,
      subject: ticket.subject as string,
      status: ticket.status as string,
      priority: ticket.priority as string,
      orderId: id,
      orderNumber: (order?.order_number as string) ?? null,
    },
  }, { status: 201 });
}
