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
 * POST /api/crm/inbox/send — the mailbox "New message" compose.
 * Enqueues through email_enqueue on the tenant's verified sender
 * domain (honestly queued — the mail worker delivers), opens an
 * email conversation with the party, and records the outbound
 * message on the thread so it lands in the inbox and on the
 * party's timeline.
 * Body: { to?, customer_id?, subject, body, mailbox_id? }
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || typeof body !== 'object') return fail('VALIDATION', 'JSON body required', 400);
  const subject = typeof body.subject === 'string' ? body.subject.trim() : '';
  const text = typeof body.body === 'string' ? body.body : '';
  if (!subject || !text.trim()) return fail('VALIDATION', 'subject and body are required', 400);

  const sb = supabaseAdmin();
  let to = typeof body.to === 'string' ? body.to.trim() : '';
  let customerId: string | null = typeof body.customer_id === 'string' ? body.customer_id : null;
  if (customerId && !to) {
    const { data: cust } = await sb
      .from('crm_customers')
      .select('email')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .eq('id', customerId)
      .maybeSingle();
    to = cust?.email || '';
  }
  if (!to) return fail('VALIDATION', 'A recipient (to, or a customer with an email) is required', 400);

  // Sender: the chosen mailbox's address, else the tenant's first
  // verified sender domain (same rule as the party email route).
  let fromAddress: string | null = null;
  if (typeof body.mailbox_id === 'string') {
    const { data: mailbox } = await sb
      .from('platform_mailboxes')
      .select('email_address')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .eq('id', body.mailbox_id)
      .maybeSingle();
    fromAddress = mailbox?.email_address || null;
  }
  if (!fromAddress) {
    const { data: domainRow } = await sb
      .from('email_sender_domains')
      .select('domain')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    fromAddress = `no-reply@${domainRow?.domain || 'mail.unsaidmemories.com'}`;
  }

  const { data: enqueued, error: enqueueError } = await sb.rpc('email_enqueue', {
    p_tenant_id: DEFAULT_TENANT_ID,
    p_idempotency_key: `inbox:${crypto.randomUUID()}`,
    p_from: fromAddress,
    p_to: [to],
    p_subject: subject,
    p_html: null,
    p_text: text,
    p_category: 'transactional',
    p_related_type: customerId ? 'party' : null,
    p_related_id: customerId,
    p_attachments: [],
    p_scheduled_at: null,
    p_crm_customer_id: customerId,
  });
  if (enqueueError) return fail('INTERNAL', enqueueError.message, 500);

  // Thread + outbound message record.
  const { data: conversation } = await sb
    .from('crm_conversations')
    .insert({
      tenant_id: DEFAULT_TENANT_ID,
      customer_id: customerId,
      channel: 'email',
      status: 'open',
      subject,
      started_at: new Date().toISOString(),
      last_message_at: new Date().toISOString(),
    })
    .select('id')
    .single();
  if (conversation) {
    await sb.from('crm_messages').insert({
      tenant_id: DEFAULT_TENANT_ID,
      conversation_id: conversation.id,
      customer_id: customerId,
      channel: 'email',
      direction: 'outbound',
      status: 'queued',
      from_address: fromAddress,
      to_address: to,
      subject,
      body: text,
      body_text: text,
      metadata: {},
      email_references: [],
      cc_addresses: [],
      bcc_addresses: [],
    });
  }

  return NextResponse.json({
    data: {
      queued: true,
      outbox_id: enqueued ?? null,
      conversation_id: conversation?.id ?? null,
      to,
      from: fromAddress,
    },
  }, { status: 201 });
}
