import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { toPostNetwork, toSocialPost } from '@/lib/socialTypes';
import { firstPartySellerId, loadPost } from '@/lib/socialServer';

/* Social posts (doc 23): list + create. Creating a post fans out to
   social_post_networks (one row per channel) and, for channels with
   a connected account, social_post_targets in 'queued' — the rows
   the publish worker claims via social_claim_outbox_events. */

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

const POST_STATUSES = ['draft', 'scheduled', 'publishing', 'published', 'failed', 'cancelled'];
const SOURCE_TYPES = ['product', 'design', 'design_publication', 'collection', 'custom'];

export async function GET(req: NextRequest) {
  const status = req.nextUrl.searchParams.get('status');
  const sb = supabaseAdmin();
  let query = sb
    .from('social_posts')
    .select('*')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .order('created_at', { ascending: false })
    .limit(200);
  if (status && POST_STATUSES.includes(status)) query = query.eq('status', status);
  const { data, error } = await query;
  if (error) return err('INTERNAL', error.message, 500);
  const posts = (data || []) as Record<string, unknown>[];
  const ids = posts.map((p) => String(p.id));
  const networksByPost = new Map<string, ReturnType<typeof toPostNetwork>[]>();
  if (ids.length) {
    const { data: nets } = await sb
      .from('social_post_networks')
      .select('*')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .in('social_post_id', ids);
    for (const n of nets || []) {
      const row = n as Record<string, unknown>;
      const key = String(row.social_post_id);
      if (!networksByPost.has(key)) networksByPost.set(key, []);
      networksByPost.get(key)!.push(toPostNetwork(row));
    }
  }
  return NextResponse.json({ data: posts.map((p) => toSocialPost(p, networksByPost.get(String(p.id)) || [])) });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const caption = typeof body.caption === 'string' && body.caption.trim() ? body.caption.trim() : null;
  if (!caption) return err('VALIDATION', 'caption is required', 400);
  const channels = Array.isArray(body.channels)
    ? (body.channels as unknown[]).filter((c): c is string => typeof c === 'string' && c.length > 0)
    : [];
  if (!channels.length) return err('VALIDATION', 'at least one channel is required', 400);
  const sourceType = typeof body.sourceType === 'string' && SOURCE_TYPES.includes(body.sourceType) ? body.sourceType : 'custom';
  const scheduledAt = typeof body.scheduledAt === 'string' && body.scheduledAt ? body.scheduledAt : null;
  const publishNow = body.publishNow === true;
  const status = publishNow ? 'publishing' : scheduledAt ? 'scheduled' : 'draft';
  const sb = supabaseAdmin();

  const { data: post, error } = await sb
    .from('social_posts')
    .insert({
      tenant_id: DEFAULT_TENANT_ID,
      caption,
      title: typeof body.title === 'string' ? body.title : null,
      body: typeof body.body === 'string' ? body.body : null,
      source_type: sourceType,
      source_id: typeof body.sourceId === 'string' ? body.sourceId : null,
      media_urls: Array.isArray(body.mediaUrls) ? (body.mediaUrls as string[]) : [],
      product_url: typeof body.productUrl === 'string' ? body.productUrl : null,
      link_url: typeof body.linkUrl === 'string' ? body.linkUrl : null,
      scheduled_at: publishNow ? new Date().toISOString() : scheduledAt,
      status,
      series_id: typeof body.seriesId === 'string' ? body.seriesId : null,
    })
    .select('*')
    .single();
  if (error) return err('INTERNAL', error.message, 500);
  const postId = String((post as Record<string, unknown>).id);
  const networkStatus = status === 'draft' ? 'draft' : 'scheduled';

  /* Connected accounts per network, for target fan-out. */
  const { data: accounts } = await sb
    .from('social_accounts')
    .select('id, network, platform')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('status', 'connected')
    .in('network', channels);
  const accountByNetwork = new Map<string, Record<string, unknown>>();
  for (const a of accounts || []) {
    const row = a as Record<string, unknown>;
    if (!accountByNetwork.has(String(row.network))) accountByNetwork.set(String(row.network), row);
  }

  const { error: netErr } = await sb.from('social_post_networks').insert(
    channels.map((network) => ({
      tenant_id: DEFAULT_TENANT_ID,
      social_post_id: postId,
      network,
      status: networkStatus,
      social_account_id: accountByNetwork.has(network) ? String(accountByNetwork.get(network)!.id) : null,
    })),
  );
  if (netErr) return err('INTERNAL', netErr.message, 500);

  const sellerId = await firstPartySellerId();
  if (sellerId) {
    const targets = channels
      .filter((n) => accountByNetwork.has(n))
      .map((network) => {
        const account = accountByNetwork.get(network)!;
        return {
          tenant_id: DEFAULT_TENANT_ID,
          post_id: postId,
          seller_id: sellerId,
          social_account_id: String(account.id),
          platform: String(account.platform),
          status: status === 'draft' ? 'skipped' : 'queued',
          idempotency_key: `post:${postId}:${String(account.id)}`,
        };
      });
    if (targets.length) {
      const { error: tgtErr } = await sb.from('social_post_targets').insert(targets);
      if (tgtErr) return err('INTERNAL', tgtErr.message, 500);
    }
  }

  const full = await loadPost(postId);
  return NextResponse.json({ data: full }, { status: 201 });
}
