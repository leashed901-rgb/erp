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
 * Connected mailboxes (platform_mailboxes). GET lists them; POST is
 * the template's "Connect mailbox" — it registers the mailbox on
 * the platform (the provider OAuth/sync itself is a platform
 * connection flow; the row is what the inbox reads).
 */
export async function GET() {
  const { data, error } = await supabaseAdmin()
    .from('platform_mailboxes')
    .select('*')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .order('email_address');
  if (error) return fail('INTERNAL', error.message, 500);
  return NextResponse.json({ data: data || [] });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  const email = typeof body?.email_address === 'string' ? body.email_address.trim() : '';
  const rawProvider = body?.provider;
  const provider = ['gmail', 'outlook', 'imap', 'resend_inbound'].includes(String(rawProvider)) ? String(rawProvider) : rawProvider === 'smtp' ? 'imap' : 'gmail';
  if (!email) return fail('VALIDATION', 'email_address is required', 400);
  const { data, error } = await supabaseAdmin()
    .from('platform_mailboxes')
    .insert({
      tenant_id: DEFAULT_TENANT_ID,
      user_id: OPERATOR_USER_ID,
      email_address: email,
      provider,
      sync_mode: 'two_way',
      status: 'active',
    })
    .select('*')
    .single();
  if (error) {
    // A mailbox already connected under this address is a conflict the
    // user can act on, not a server error.
    if (error.code === '23505') return fail('CONFLICT', 'That mailbox is already connected', 409);
    return fail('INTERNAL', error.message, 500);
  }
  return NextResponse.json({ data }, { status: 201 });
}
