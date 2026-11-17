import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function fail(code: string, message: string, status: number) {
  return NextResponse.json(
    { error: { code, message, requestId: crypto.randomUUID() } },
    { status },
  );
}

const EMAIL_TABLES: Record<string, string> = {
  crm_customers: 'crm_customers',
  crm_leads: 'crm_leads',
  acct_vendors: 'acct_vendors',
  suppliers: 'suppliers',
};

/**
 * POST /api/parties/[id]/email?source=<table> — the registered
 * `party.email` action: send a message to this party from its profile.
 *
 * Enqueues through the platform's email_enqueue RPC (the tenant's
 * verified sender domain) with the party as the related record, and
 * writes the outbound email onto the party's timeline (crm_activity)
 * so the thread is visible on the profile. Delivery itself runs
 * through the platform mail worker — this route queues, and says so.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const source = req.nextUrl.searchParams.get('source') || 'crm_customers';
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return fail('VALIDATION', 'Invalid JSON body', 400);
  }
  const subject = typeof body.subject === 'string' ? body.subject.trim() : '';
  const text = typeof body.body === 'string' ? body.body.trim() : '';
  if (!subject || !text) return fail('VALIDATION', 'subject and body are required', 400);

  const db = supabaseAdmin();

  // Recipient: explicit `to` wins; otherwise the source record's email.
  let to = typeof body.to === 'string' && body.to.includes('@') ? body.to.trim() : null;
  if (!to && EMAIL_TABLES[source]) {
    const { data } = await db
      .from(EMAIL_TABLES[source])
      .select('email')
      .eq('id', id)
      .maybeSingle();
    to = (data as { email?: string } | null)?.email || null;
  }
  if (!to) return fail('VALIDATION', 'No email address on file for this party', 400);

  // Sender: the tenant's verified default domain (same source the PO
  // send path uses); no-reply mailbox on that domain.
  const { data: domainRow } = await db
    .from('email_sender_domains')
    .select('domain')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .order('created_at')
    .limit(1)
    .maybeSingle();
  const from = `no-reply@${(domainRow as { domain?: string } | null)?.domain || 'mail.unsaidmemories.com'}`;

  const { error: enqueueError } = await db.rpc('email_enqueue', {
    p_tenant_id: DEFAULT_TENANT_ID,
    p_idempotency_key: `party-email:${id}:${crypto.randomUUID()}`,
    p_from: from,
    p_to: [to],
    p_subject: subject,
    p_html: null,
    p_text: text,
    p_category: 'transactional',
    p_related_type: 'party',
    p_related_id: id,
    p_attachments: [],
    p_scheduled_at: null,
    p_crm_customer_id: source === 'crm_customers' ? id : null,
  });
  if (enqueueError) return fail('ENQUEUE_FAILED', enqueueError.message, 500);

  // Timeline: the outbound email lands on the party's activity feed.
  let timeline = false;
  if (source === 'crm_customers' || source === 'crm_leads') {
    const { error: activityError } = await db.from('crm_activity').insert({
      tenant_id: DEFAULT_TENANT_ID,
      customer_id: source === 'crm_customers' ? id : null,
      lead_id: source === 'crm_leads' ? id : null,
      activity_type: 'email',
      channel: 'email',
      direction: 'outbound',
      subject,
      body: text,
      occurred_at: new Date().toISOString(),
      metadata: { to, from, queued: true },
    });
    timeline = !activityError;
  }

  return NextResponse.json(
    { data: { queued: true, timeline, to, from } },
    { status: 201 },
  );
}
