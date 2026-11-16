import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { toSocialAccount } from '@/lib/socialTypes';

/* Channel connection state (doc 23): connect / disconnect /
   needs_reconnect transitions on social_accounts.status. */

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

const STATUSES = ['connected', 'disconnected', 'needs_reconnect'];

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const patch: Record<string, unknown> = {};
  if (typeof body.status === 'string') {
    if (!STATUSES.includes(body.status)) return err('VALIDATION', `status must be one of ${STATUSES.join(', ')}`, 400);
    patch.status = body.status;
  }
  if (typeof body.handle === 'string') patch.handle = body.handle;
  if (typeof body.displayName === 'string') patch.display_name = body.displayName;
  if (!Object.keys(patch).length) return err('VALIDATION', 'nothing to update', 400);
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('social_accounts')
    .update(patch)
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('id', id)
    .select('*')
    .maybeSingle();
  if (error) return err('INTERNAL', error.message, 500);
  if (!data) return err('NOT_FOUND', 'Account not found', 404);
  return NextResponse.json({ data: toSocialAccount(data as Record<string, unknown>) });
}
