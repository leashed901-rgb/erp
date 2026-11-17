import { NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

/**
 * UGC moderation queue (Kim's ugc_modration design): one queue over the two
 * real UGC stores — product reviews (`reviews`) and seller social posts
 * (`seller_social_posts`). Statuses are normalized to the design's vocab:
 * pending | approved | rejected | flagged.
 */

export type UgcStatus = 'pending' | 'approved' | 'rejected' | 'flagged';

export function mapReviewStatus(status: string | null, isPublished: boolean | null): UgcStatus {
  const s = (status || '').toLowerCase();
  if (s === 'published' || isPublished) return 'approved';
  if (s === 'rejected') return 'rejected';
  if (s === 'flagged') return 'flagged';
  return 'pending';
}

export function mapSocialStatus(status: string | null): UgcStatus {
  const s = (status || '').toLowerCase();
  if (s === 'published' || s === 'approved') return 'approved';
  if (s === 'rejected') return 'rejected';
  if (s === 'flagged') return 'flagged';
  return 'pending';
}

export async function GET() {
  const db = supabaseAdmin();
  try {
    const [{ data: reviews }, { data: posts }] = await Promise.all([
      db.from('reviews').select('id, product_id, customer_id, author_name, rating, title, body, is_verified_purchase, is_published, status, created_at').eq('tenant_id', DEFAULT_TENANT_ID).order('created_at', { ascending: false }).limit(200),
      db.from('seller_social_posts').select('id, seller_id, network, listing_id, external_url, status, payload, created_at').eq('tenant_id', DEFAULT_TENANT_ID).order('created_at', { ascending: false }).limit(200),
    ]);

    const productIds = Array.from(new Set([...(reviews || []).map((r) => r.product_id), ...(posts || []).map((p) => p.listing_id)].filter(Boolean))) as string[];
    const productNames = new Map<string, { name: string; sku: string | null }>();
    if (productIds.length) {
      const [{ data: storefront }, { data: commerce }] = await Promise.all([
        db.from('products').select('id, name').in('id', productIds),
        db.from('commerce_products').select('id, name, sku').in('id', productIds),
      ]);
      for (const p of commerce || []) productNames.set(p.id, { name: p.name || 'Product', sku: p.sku || null });
      for (const p of storefront || []) productNames.set(p.id, { name: p.name || 'Product', sku: productNames.get(p.id)?.sku || null });
    }

    const submissions = [
      ...(reviews || []).map((r) => ({
        id: r.id,
        source: 'review' as const,
        status: mapReviewStatus(r.status, r.is_published),
        product: { name: productNames.get(r.product_id)?.name || 'Product', sku: productNames.get(r.product_id)?.sku || null, id: r.product_id },
        customer: { name: r.author_name || 'Customer', id: r.customer_id },
        network: 'Review',
        media_kind: 'text' as const,
        media_url: null as string | null,
        caption: r.body || r.title || '',
        rating: r.rating,
        verified_purchase: r.is_verified_purchase,
        checks: null as Record<string, boolean> | null,
        submitted_at: r.created_at,
      })),
      ...(posts || []).map((p) => {
        const payload = (p.payload || {}) as Record<string, unknown>;
        return {
          id: p.id,
          source: 'social' as const,
          status: mapSocialStatus(p.status),
          product: { name: productNames.get(p.listing_id || '')?.name || 'Listing', sku: productNames.get(p.listing_id || '')?.sku || null, id: p.listing_id },
          customer: { name: (payload.author_name as string) || 'Seller post', id: p.seller_id },
          network: p.network || 'Social',
          media_kind: ((payload.media_kind as string) || 'photo') as string,
          media_url: (payload.media_url as string) || p.external_url || null,
          caption: (payload.caption as string) || '',
          rating: null as number | null,
          verified_purchase: null as boolean | null,
          checks: (payload.checks as Record<string, boolean>) || null,
          submitted_at: p.created_at,
        };
      }),
    ].sort((a, b) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime());

    const counts = {
      pending: submissions.filter((s) => s.status === 'pending').length,
      approved: submissions.filter((s) => s.status === 'approved').length,
      rejected: submissions.filter((s) => s.status === 'rejected').length,
      flagged: submissions.filter((s) => s.status === 'flagged').length,
    };

    return NextResponse.json({ data: { submissions, counts } });
  } catch (e) {
    return NextResponse.json({ error: { code: 'UGC_SUBMISSIONS_FAILED', message: e instanceof Error ? e.message : 'Failed' } }, { status: 500 });
  }
}
