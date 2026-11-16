import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/**
 * Email delivery through Resend (https://resend.com).
 *
 * The platform queues mail in `email_outbox` (acct_send_invoice enqueues
 * there) but nothing in this repo drains the queue — rows sit 'queued'
 * forever. These helpers deliver through the Resend API and mark the
 * outbox row the way the platform's sender does (email_mark_sent).
 *
 * Key: RESEND_API_KEY in apps/web/.env.local (resend.com -> API Keys).
 * From: the tenant's verified sending domain in email_sender_domains
 * (same source as the DB's app__default_from), or RESEND_FROM.
 */

export class ResendNotConfiguredError extends Error {
  constructor() {
    super(
      'RESEND_API_KEY is not configured — add the Resend API key (resend.com → API Keys) to apps/web/.env.local and restart the server. The email stays queued in the outbox until then.',
    );
    this.name = 'ResendNotConfiguredError';
  }
}

function resendApiKey(): string {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) throw new ResendNotConfiguredError();
  return key;
}

/** From address, mirroring the DB's app__default_from: verified domain first. */
export async function resolveDefaultFrom(): Promise<string> {
  const { data } = await supabaseAdmin()
    .from('email_sender_domains')
    .select('domain, default_from')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .in('status', ['verified', 'active'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (data) return data.default_from || `no-reply@${data.domain}`;
  if (process.env.RESEND_FROM?.trim()) return process.env.RESEND_FROM.trim();
  throw new Error(
    'No verified sending domain for this tenant (Settings > Email) and no RESEND_FROM configured.',
  );
}

export interface ResendEmail {
  from?: string;
  to: string[];
  cc?: string[];
  subject: string;
  html?: string;
  text?: string;
}

/** One Resend send. Throws ResendNotConfiguredError when the key is missing. */
export async function sendEmailViaResend(email: ResendEmail): Promise<{ id: string }> {
  const key = resendApiKey();
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: email.from ?? (await resolveDefaultFrom()),
      to: email.to,
      cc: email.cc?.length ? email.cc : undefined,
      subject: email.subject,
      html: email.html,
      text: email.text,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend rejected the send (${res.status}): ${body.slice(0, 300)}`);
  }
  const json = (await res.json()) as { id: string };
  return { id: json.id };
}

/**
 * Deliver one queued email_outbox row through Resend, then mark it sent
 * (or record the failure, leaving it queued for retry) via email_mark_sent.
 */
export async function deliverOutboxRow(outboxId: string): Promise<{ resendId: string }> {
  const sb = supabaseAdmin();
  const { data: row, error } = await sb
    .from('email_outbox')
    .select('id, from_address, to_addresses, cc_addresses, subject, html_body, text_body')
    .eq('id', outboxId)
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .single();
  if (error || !row) throw new Error(`Outbox row ${outboxId} not found: ${error?.message || ''}`);

  try {
    const { id } = await sendEmailViaResend({
      from: row.from_address,
      to: row.to_addresses as string[],
      cc: (row.cc_addresses as string[]) || [],
      subject: row.subject,
      html: row.html_body ?? undefined,
      text: row.text_body ?? undefined,
    });
    await sb.rpc('email_mark_sent', { p_outbox_id: outboxId, p_resend_email_id: id, p_error: null });
    return { resendId: id };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await sb.rpc('email_mark_sent', { p_outbox_id: outboxId, p_resend_email_id: null, p_error: msg });
    throw e;
  }
}

/**
 * Drain the outbox: claim a batch of queued rows (email_claim_batch marks
 * them 'sending', SKIP LOCKED so concurrent drains don't double-send) and
 * deliver each through Resend. This is the mail worker — nothing in the
 * repo called it before, so queued rows sat forever. Callers: the campaign
 * send route (inline, after enqueue), the sequence processor, and
 * POST /api/marketing/mail/drain (manual / scheduled retry).
 * A missing RESEND_API_KEY leaves rows queued with the error recorded —
 * nothing is lost, and the counts say so honestly.
 */
export async function drainOutbox(limit = 50): Promise<{
  claimed: number;
  sent: number;
  failed: number;
  errors: string[];
}> {
  const sb = supabaseAdmin();
  const { data, error } = await sb.rpc('email_claim_batch', { p_limit: limit });
  if (error) throw new Error(`email_claim_batch failed: ${error.message}`);
  const rows = (data || []) as { id: string }[];
  let sent = 0;
  const errors: string[] = [];
  for (const row of rows) {
    try {
      await deliverOutboxRow(row.id);
      sent++;
    } catch (e) {
      errors.push(`${row.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return { claimed: rows.length, sent, failed: errors.length, errors };
}

/** Queue depth by status, for the mail drain route and the KPI tiles. */
export async function outboxCounts(): Promise<Record<string, number>> {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('email_outbox')
    .select('status')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .limit(5000);
  if (error) throw new Error(`outbox count failed: ${error.message}`);
  const counts: Record<string, number> = {};
  for (const r of data || []) {
    const s = String((r as { status?: string }).status || 'unknown');
    counts[s] = (counts[s] || 0) + 1;
  }
  return counts;
}
