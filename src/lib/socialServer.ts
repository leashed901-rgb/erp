import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { toSocialPost, type SocialPost } from '@/lib/socialTypes';

/* Shared server helpers for the /api/social routes. The satellite
   social tables (accounts, slots, assets, targets, attempts) are
   seller-scoped: seller_id is the tenant's first-party seller,
   resolved through the platform's first_party_seller() lookup. */

export async function firstPartySellerId(): Promise<string | null> {
  const sb = supabaseAdmin();
  const { data } = await sb.rpc('first_party_seller', { p_tenant: DEFAULT_TENANT_ID });
  return typeof data === 'string' ? data : null;
}

export async function loadPost(postId: string): Promise<SocialPost | null> {
  const sb = supabaseAdmin();
  const { data } = await sb
    .from('social_posts')
    .select('*')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('id', postId)
    .maybeSingle();
  if (!data) return null;
  const { data: networks } = await sb
    .from('social_post_networks')
    .select('*')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('social_post_id', postId)
    .order('network', { ascending: true });
  const { toPostNetwork } = await import('@/lib/socialTypes');
  return toSocialPost(
    data as Record<string, unknown>,
    (networks || []).map((n) => toPostNetwork(n as Record<string, unknown>)),
  );
}
