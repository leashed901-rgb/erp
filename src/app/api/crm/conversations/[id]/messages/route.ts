import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function fail(code: string, message: string, status: number) {
  return NextResponse.json(
    { error: { code, message, requestId: crypto.randomUUID() } },
    { status },
  );
}

const OPERATOR_USER_ID = 'd5146f15-a9a8-4e07-b25d-90a5b412bbb6';

/**
 * POST /api/crm/conversations/[id]/messages — reply on a thread.
 * Records the outbound message; on email threads it also enqueues
 * the send through email_enqueue (queued — the mail worker
 * delivers). Body: { body }.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  const text = typeof body?.body === 'string' ? body.body : '';
  if (!text.trim()) return fail('VALIDATION', 'body is required', 400);

  const sb = supabaseAdmin();
  const { data: conversation } = await sb
    .from('crm_conversations')
    .select('*')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('id', id)
    .maybeSingle();
  if (!conversation) return fail('NOT_FOUND', 'Conversation not found', 404);

  let queued = false;
  if (conversation.channel === 'email' && conversation.customer_id) {
    const { data: cust } = await sb
      .from('crm_customers')
      .select('email')
      .eq('id', conversation.customer_id)
      .maybeSingle();
    if (cust?.email) {
      const { data: domainRow } = await sb
        .from('email_sender_domains')
        .select('domain')
        .eq('tenant_id', DEFAULT_TENANT_ID)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();
      const { error: enqueueError } = await sb.rpc('email_enqueue', {
        p_tenant_id: DEFAULT_TENANT_ID,
        p_idempotency_key: `thread-reply:${id}:${crypto.randomUUID()}`,
        p_from: `no-reply@${domainRow?.domain || 'mail.unsaidmemories.com'}`,
        p_to: [cust.email],
        p_subject: conversation.subject ? `Re: ${conversation.subject}` : 'Re: your message',
        p_html: null,
        p_text: text,
        p_category: 'transactional',
        p_related_type: 'party',
        p_related_id: conversation.customer_id,
        p_attachments: [],
        p_scheduled_at: null,
        p_crm_customer_id: conversation.customer_id,
      });
      if (enqueueError) return fail('INTERNAL', enqueueError.message, 500);
      queued = true;
    }
  }

  const { data: message, error } = await sb
    .from('crm_messages')
    .insert({
      tenant_id: DEFAULT_TENANT_ID,
      conversation_id: id,
      customer_id: conversation.customer_id,
      channel: conversation.channel,
      direction: 'outbound',
      status: queued ? 'queued' : 'sent',
      subject: conversation.subject,
      body: text,
      body_text: text,
      metadata: {},
      email_references: [],
      cc_addresses: [],
      bcc_addresses: [],
    })
    .select('*')
    .single();
  if (error) return fail('INTERNAL', error.message, 500);

  await sb
    .from('crm_conversations')
    .update({ last_message_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', id);

  return NextResponse.json({ data: { message, queued } }, { status: 201 });
}
