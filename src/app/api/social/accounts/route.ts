import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { toSocialAccount } from '@/lib/socialTypes';
import { firstPartySellerId } from '@/lib/socialServer';

/* Social channel accounts (doc 23: Channels). Rows are seller-scoped
   to the tenant's first-party seller. OAuth token custody lives in
   social_oauth_tokens (platform service); this surface manages the
   channel records and their connection status. */

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

const NETWORKS = ['facebook', 'instagram', 'tiktok', 'pinterest', 'threads', 'x', 'linkedin', 'youtube'];

export async function GET() {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('social_accounts')
    .select('*')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .order('network', { ascending: true });
  if (error) return err('INTERNAL', error.message, 500);
  /* Effective status: a row that says 'connected' with no OAuth token
     held anywhere cannot publish — report it as needs_reconnect so no
     screen presents a tokenless account as live. Token custody is in
     social_oauth_tokens; zero rows there means zero live connections. */
  const { data: tokens } = await sb
    .from('social_oauth_tokens')
    .select('social_account_id, access_token_ciphertext')
    .eq('tenant_id', DEFAULT_TENANT_ID);
  const live = new Set(
    ((tokens || []) as { social_account_id: string; access_token_ciphertext: string | null }[])
      .filter((t) => t.access_token_ciphertext)
      .map((t) => t.social_account_id),
  );
  return NextResponse.json({
    data: (data || []).map((r) => {
      const a = toSocialAccount(r as Record<string, unknown>);
      if (a.status === 'connected' && !live.has(a.id)) a.status = 'needs_reconnect';
      return a;
    }),
  });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const network = typeof body.network === 'string' ? body.network.toLowerCase() : '';
  if (!NETWORKS.includes(network)) return err('VALIDATION', `network must be one of ${NETWORKS.join(', ')}`, 400);
  const handle = typeof body.handle === 'string' && body.handle.trim() ? body.handle.trim() : null;
  if (!handle) return err('VALIDATION', 'handle is required', 400);
  const sellerId = await firstPartySellerId();
  if (!sellerId) return err('CONFLICT', 'The tenant has no first-party seller — set one up before adding channels', 409);
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('social_accounts')
    .insert({
      tenant_id: DEFAULT_TENANT_ID,
      seller_id: sellerId,
      network,
      platform: network,
      handle,
      display_name: typeof body.displayName === 'string' ? body.displayName : handle,
      platform_account_id: typeof body.platformAccountId === 'string' ? body.platformAccountId : handle,
      metricool_brand_id: typeof body.metricoolBrandId === 'string' ? body.metricoolBrandId : '',
      status: 'disconnected',
    })
    .select('*')
    .single();
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: toSocialAccount(data as Record<string, unknown>) }, { status: 201 });
}
