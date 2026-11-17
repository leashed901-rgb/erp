import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { drainOutbox } from '@/lib/resend';

/* Newsletter send (doc 24): enqueue the campaign to every confirmed
   subscriber that is not suppressed, through the platform's
   email_enqueue → email_outbox pipeline (the mail worker sends).
   The campaign row records started/completed and status 'sent'. */

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const sb = supabaseAdmin();
  const { data: campaign } = await sb
    .from('crm_campaigns')
    .select('*')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('id', id)
    .maybeSingle();
  if (!campaign) return err('NOT_FOUND', 'Campaign not found', 404);
  const c = campaign as Record<string, unknown>;
  if (c.status === 'sent') return err('CONFLICT', 'Campaign already sent', 409);

  let subject = typeof body.subject === 'string' ? body.subject : '';
  let html = typeof body.html === 'string' ? body.html : '';
  let text = typeof body.text === 'string' ? body.text : '';
  if (c.template_id) {
    const { data: tpl } = await sb
      .from('crm_message_templates')
      .select('subject, body')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .eq('id', c.template_id as string)
      .maybeSingle();
    const t = tpl as { subject?: string; body?: string } | null;
    if (t) {
      subject = subject || t.subject || '';
      html = html || t.body || '';
      text = text || t.body || '';
    }
  }
  if (!subject) subject = String(c.name || 'Newsletter');
  if (!html && !text) text = String(c.name || '');

  const { data: senderRow } = await sb
    .from('email_sender_domains')
    .select('domain, default_from')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('status', 'verified')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const sender = senderRow as { domain: string; default_from: string | null } | null;
  if (!sender) return err('CONFLICT', 'No verified sending domain for this tenant (Settings > Email)', 409);
  const from = sender.default_from || `no-reply@${sender.domain}`;

  const { data: subs } = await sb
    .from('newsletter_subscribers')
    .select('email')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .not('confirmed_at', 'is', null)
    .limit(1000);
  const { data: suppressed } = await sb
    .from('marketing_suppressions')
    .select('contact')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('channel', 'email');
  const suppressedSet = new Set((suppressed || []).map((s) => String((s as Record<string, unknown>).contact).toLowerCase()));
  const recipients = (subs || [])
    .map((s) => String((s as Record<string, unknown>).email))
    .filter((e) => !suppressedSet.has(e.toLowerCase()));
  if (!recipients.length) return err('CONFLICT', 'No confirmed, unsuppressed subscribers to send to', 409);

  const startedAt = new Date().toISOString();
  await sb.from('crm_campaigns').update({ status: 'sending', started_at: startedAt }).eq('tenant_id', DEFAULT_TENANT_ID).eq('id', id);

  let enqueued = 0;
  for (const email of recipients) {
    const { error } = await sb.rpc('email_enqueue', {
      p_tenant_id: DEFAULT_TENANT_ID,
      p_idempotency_key: `campaign:${id}:${email}`,
      p_from: from,
      p_to: [email],
      p_subject: subject,
      p_html: html || null,
      p_text: text || null,
      p_category: 'marketing',
      p_related_type: 'crm_campaigns',
      p_related_id: id,
    });
    if (error) {
      await sb.from('crm_campaigns').update({ status: 'draft' }).eq('tenant_id', DEFAULT_TENANT_ID).eq('id', id);
      return err('INTERNAL', `Enqueue failed for ${email}: ${error.message}`, 500);
    }
    enqueued++;
  }

  const completedAt = new Date().toISOString();
  await sb
    .from('crm_campaigns')
    .update({ status: 'sent', completed_at: completedAt })
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('id', id);

  // Deliver now — the outbox had no worker, so enqueued mail sat 'queued'
  // forever while the campaign already said 'sent'. Drain inline; if
  // delivery fails (no Resend key, rejected send) the counts say so and
  // the rows stay queued for POST /api/marketing/mail/drain to retry.
  let delivered = 0;
  let failed = 0;
  let drainErrors: string[] = [];
  try {
    const drained = await drainOutbox(Math.max(enqueued, 50));
    delivered = drained.sent;
    failed = drained.failed;
    drainErrors = drained.errors;
  } catch (e) {
    failed = enqueued;
    drainErrors = [e instanceof Error ? e.message : String(e)];
  }
  return NextResponse.json({
    data: { id, status: 'sent', enqueued, delivered, failed, drainErrors, from, startedAt, completedAt },
  });
}
