import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { deliverOutboxRow, resolveDefaultFrom, ResendNotConfiguredError } from '@/lib/resend';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

/** GET /api/parties/[id]/invite-w9 — the latest W-9 invite for the
 *  vendor + whether a W-9 is on file. Powers the W-9 panel. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = supabaseAdmin();
  const { data: vendor } = await sb
    .from('acct_vendors')
    .select('id, legal_name, email, is_1099_vendor, w9_received_at, vendor_kind')
    .eq('id', id)
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .single();
  if (!vendor) return err('NOT_FOUND', 'No vendor record for this party', 404);
  const { data: invite } = await sb
    .from('acct_contractor_invites')
    .select('id, vendor_id, email, status, expires_at, sent_at, completed_at')
    .eq('vendor_id', id)
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .order('sent_at', { ascending: false })
    .limit(1)
    .single();
  return NextResponse.json({
    data: {
      vendor_id: vendor.id,
      legal_name: vendor.legal_name,
      email: vendor.email,
      is_1099_vendor: vendor.is_1099_vendor,
      w9_received_at: vendor.w9_received_at,
      vendor_kind: vendor.vendor_kind,
      invite: invite || null,
    },
  });
}

/** POST /api/parties/[id]/invite-w9 — the W-9 invite flow (doc 07).
 *  Calls acct_invite_contractor: revokes any outstanding invite,
 *  marks the vendor a contractor, and writes a fresh
 *  acct_contractor_invites row (30-day expiry). Returns that row —
 *  the W-9 pill flips to Requested from it.
 *
 *  The invite email goes out through Resend: the mail is enqueued in
 *  email_outbox (idempotent on the invite id) and the queued row is
 *  delivered immediately via deliverOutboxRow. There is no W-9
 *  completion portal in the app yet, so the email carries the invite
 *  code and asks the vendor to reply with the completed W-9 — no
 *  completion URL is invented. If delivery fails, the invite row
 *  stands and the response says so plainly. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* empty body ok */ }
  const sb = supabaseAdmin();

  const { data: spine } = await sb
    .from('platform_parties')
    .select('id, metadata')
    .eq('id', id)
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .single();
  if (!spine) return err('NOT_FOUND', 'Party not found', 404);
  const roles: string[] = (spine.metadata as Record<string, unknown>)?.roles as string[] || [];
  const isVendorParty = roles.includes('vendor') || roles.includes('contractor') || roles.includes('supplier');
  if (!isVendorParty) {
    return err('VALIDATION', 'W-9 invites go to vendors / contractors', 400);
  }

  const { data: vendor } = await sb
    .from('acct_vendors')
    .select('id, legal_name, email, is_1099_vendor, w9_received_at')
    .eq('id', id)
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .single();
  if (!vendor) {
    return err('NOT_FOUND', 'No vendor record for this party — add it as a vendor first', 404);
  }
  if (vendor.w9_received_at) {
    return err('VALIDATION', 'W-9 is already on file for this vendor', 400);
  }
  const email = String(body.email || vendor.email || (spine.metadata as Record<string, unknown>)?.email || '').trim();
  if (!email) return err('VALIDATION', 'An email address is required to send the W-9 invite', 400);

  const { data: token, error } = await sb.rpc('acct_invite_contractor', {
    p_vendor_id: id,
    p_email: email,
  });
  if (error) return err('VALIDATION', error.message, 400);

  // The vendor is now a contractor too — merge the role into the spine
  // (union, not replace) so the Contractors tab lists them.
  const existingRoles: string[] = Array.isArray((spine.metadata as Record<string, unknown>)?.roles)
    ? ((spine.metadata as Record<string, unknown>).roles as string[])
    : [];
  if (!existingRoles.includes('contractor')) {
    await sb
      .from('platform_parties')
      .update({
        metadata: { ...(spine.metadata as Record<string, unknown>), roles: [...existingRoles, 'contractor'] },
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('tenant_id', DEFAULT_TENANT_ID);
  }

  const { data: invite } = await sb
    .from('acct_contractor_invites')
    .select('id, vendor_id, email, status, expires_at, sent_at, completed_at')
    .eq('vendor_id', id)
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .order('sent_at', { ascending: false })
    .limit(1)
    .single();

  // Email the invite through Resend (enqueue + deliver the outbox row).
  const inviteRow = invite || { id: null, vendor_id: id, email, status: 'sent', expires_at: null, sent_at: null, completed_at: null };
  const expires = inviteRow.expires_at
    ? new Date(inviteRow.expires_at as string).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : 'in 30 days';
  const tokenText = typeof token === 'string' && token ? token : null;
  let emailSent = false;
  let emailError: string | null = null;
  let emailId: string | null = null;
  try {
    const from = await resolveDefaultFrom();
    const { data: outboxId, error: enqueueErr } = await sb.rpc('email_enqueue', {
      p_tenant_id: DEFAULT_TENANT_ID,
      p_idempotency_key: `w9-invite:${inviteRow.id || id}`,
      p_from: from,
      p_to: [email],
      p_subject: `W-9 requested — ${vendor.legal_name}`,
      p_html:
        `<p>Hello ${vendor.legal_name},</p>` +
        `<p>We need a completed IRS Form W-9 on file for you before we can pay you. Please complete the form and reply to this email with it attached.</p>` +
        (tokenText ? `<p>Your invite code: <strong>${tokenText}</strong></p>` : '') +
        `<p>This invite expires ${expires}. If you have already sent your W-9, you can ignore this message.</p>`,
      p_text:
        `Hello ${vendor.legal_name},\n\nWe need a completed IRS Form W-9 on file for you before we can pay you. Please complete the form and reply to this email with it attached.\n\n` +
        (tokenText ? `Your invite code: ${tokenText}\n\n` : '') +
        `This invite expires ${expires}. If you have already sent your W-9, you can ignore this message.`,
      p_category: 'transactional',
      p_related_type: 'acct_vendors',
      p_related_id: id,
    });
    if (enqueueErr || !outboxId) throw new Error(enqueueErr?.message || 'Could not queue the invite email');
    const delivered = await deliverOutboxRow(String(outboxId));
    emailSent = true;
    emailId = delivered.resendId;
  } catch (e) {
    emailError = e instanceof Error ? e.message : String(e);
  }

  return NextResponse.json({
    data: inviteRow,
    meta: {
      invite_token_issued: !!token,
      email_sent: emailSent,
      email_id: emailId,
      email_error: emailError,
      email_note: emailSent
        ? undefined
        : 'Invite recorded, but the email did not go out — it stays queued in the outbox. Resend needs a configured API key (RESEND_API_KEY).',
    },
    message: emailSent
      ? `W-9 invite emailed to ${email}`
      : `W-9 invite recorded for ${email} — email did not go out: ${emailError}`,
  }, { status: 201 });
}
