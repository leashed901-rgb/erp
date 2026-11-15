import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/** POST /api/contractors/invite — wraps acct_invite_contractor RPC.
 *  Sends a W-9 invite to a contractor (creates an acct_contractor_invites row).
 *  Body: { email, name?, party_id? } */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: { code: 'VALIDATION', message: 'Invalid JSON body', requestId: crypto.randomUUID() } }, { status: 400 });
  }
  const email = (body.email as string | undefined)?.trim().toLowerCase();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: { code: 'VALIDATION', message: 'Valid email is required', requestId: crypto.randomUUID() } }, { status: 400 });
  }

  // 1. Try the RPC.
  const { data: rpcData, error: rpcErr } = await supabaseAdmin().rpc('acct_invite_contractor', {
    email,
    tenant_uuid: DEFAULT_TENANT_ID,
    contractor_name: (body.name as string | undefined) || null,
    party_uuid: (body.party_id as string | undefined) || null,
  });
  if (!rpcErr && rpcData) {
    const row = rpcData as { id?: string };
    return NextResponse.json({ data: { invited: true, invite_id: row.id || null, source: 'rpc' } }, { status: 201 });
  }

  // 2. Fallback: insert a contractor invite row directly.
  // acct_contractor_invites requires vendor_id (FK to acct_vendors) + email.
  const vendorId = (body.vendor_id as string | undefined) || (body.party_id as string | undefined);
  if (!vendorId) {
    return NextResponse.json({ error: { code: 'VALIDATION', message: 'vendor_id (or party_id) is required — contractors must be linked to an acct_vendors row', requestId: crypto.randomUUID() } }, { status: 400 });
  }
  const insert: Record<string, unknown> = {
    tenant_id: DEFAULT_TENANT_ID,
    vendor_id: vendorId,
    email,
    status: 'sent',
    token_hash: crypto.randomUUID().replace(/-/g, ''),
    expires_at: new Date(Date.now() + 30 * 86400000).toISOString(),
  };
  const { data, error } = await supabaseAdmin()
    .from('acct_contractor_invites')
    .insert(insert)
    .select('id, email, vendor_id, status')
    .single();
  if (error) {
    return NextResponse.json({ error: { code: 'INTERNAL', message: error.message, requestId: crypto.randomUUID() } }, { status: 500 });
  }
  return NextResponse.json({ data: { invited: true, invite: data, source: 'fallback' } }, { status: 201 });
}
