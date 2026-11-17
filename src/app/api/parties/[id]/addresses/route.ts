import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import type { PartyAddress } from '@/lib/arApLinkTypes';

const err = (code: string, message: string, status: number) =>
  NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });

const toAddress = (r: Record<string, unknown>): PartyAddress => ({
  id: String(r.id),
  partyType: String(r.party_type || ''),
  partyId: String(r.party_id || ''),
  addressType: String(r.address_type || ''),
  line1: String(r.line1 || ''),
  line2: (r.line2 as string) || null,
  city: String(r.city || ''),
  state: (r.state as string) || null,
  postalCode: (r.postal_code as string) || null,
  country: String(r.country || ''),
  isDefault: Boolean(r.is_default),
});

/**
 * GET /api/parties/[id]/addresses — the party's stored addresses
 * (acct_party_addresses). The party drawer previously kept one street
 * line on the party row; this is the typed, multi-address record.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('acct_party_addresses')
    .select('*')
    .eq('party_id', id)
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: true });
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: (data || []).map(toAddress) });
}

/**
 * POST /api/parties/[id]/addresses — add an address. Body:
 * { addressType?, line1, line2?, city, state?, postalCode?, country?,
 *   isDefault? }. party_type is derived from the party's roles
 *   (vendor → 'vendor', else 'customer'). When isDefault is true, the
 *   party's other addresses of the same type lose the default flag.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return err('VALIDATION', 'Invalid JSON', 400); }
  if (!body.line1 || !body.city) return err('VALIDATION', 'line1 and city are required', 400);
  const sb = supabaseAdmin();
  const { data: party } = await sb.from('platform_parties').select('id,metadata').eq('id', id).eq('tenant_id', DEFAULT_TENANT_ID).maybeSingle();
  if (!party) return err('NOT_FOUND', 'Party not found', 404);
  const roles = ((party.metadata as Record<string, unknown>)?.roles as string[]) || [];
  const partyType = roles.some((r) => String(r).toLowerCase() === 'vendor') ? 'vendor' : 'customer';
  const addressType = String(body.addressType || 'billing');
  const isDefault = body.isDefault !== false;
  if (isDefault) {
    await sb.from('acct_party_addresses').update({ is_default: false }).eq('party_id', id).eq('address_type', addressType).eq('tenant_id', DEFAULT_TENANT_ID);
  }
  const { data, error } = await sb.from('acct_party_addresses').insert({
    tenant_id: DEFAULT_TENANT_ID,
    party_type: partyType,
    party_id: id,
    address_type: addressType,
    line1: String(body.line1),
    line2: body.line2 ? String(body.line2) : null,
    city: String(body.city),
    state: body.state ? String(body.state) : null,
    postal_code: body.postalCode ? String(body.postalCode) : null,
    country: body.country ? String(body.country) : 'US',
    is_default: isDefault,
  }).select('*').single();
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: toAddress(data) }, { status: 201 });
}
