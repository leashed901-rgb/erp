import { NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/**
 * GET /api/community/overview — the 4 KPI tiles from kpis-7, all live:
 *   Reviews (30d)  — count of reviews created in the last 30 days
 *   Avg rating     — average rating across published reviews
 *                     (null when there are no published reviews)
 *   Pending moderation — ugc_reports rows still in the queue
 *                     (status 'open')
 *   Posts (7d)     — count of posts created in the last 7 days
 * Tiles link to their backing lists (community-reviews,
 * community-reviews, community-trust-&-safety--reports,
 * community-posts).
 */

function err(code: string, message: string, status = 500) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export async function GET() {
  try {
    const sb = supabaseAdmin();
    const now = new Date();
    const d30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const d7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const [reviews30d, published, pending, posts7d] = await Promise.all([
      sb.from('reviews').select('id', { count: 'exact', head: true }).eq('tenant_id', DEFAULT_TENANT_ID).gte('created_at', d30),
      sb.from('reviews').select('rating').eq('tenant_id', DEFAULT_TENANT_ID).eq('status', 'published'),
      sb.from('ugc_reports').select('id', { count: 'exact', head: true }).eq('tenant_id', DEFAULT_TENANT_ID).eq('status', 'open'),
      sb.from('ugc_posts').select('id', { count: 'exact', head: true }).eq('tenant_id', DEFAULT_TENANT_ID).gte('created_at', d7),
    ]);
    for (const r of [reviews30d, published, pending, posts7d]) {
      if (r.error) return err('INTERNAL', r.error.message);
    }
    const ratings = (published.data || []).map((r) => Number(r.rating)).filter((n) => Number.isFinite(n));
    const avgRating = ratings.length
      ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 100) / 100
      : null;
    // ScreenContent's overview renderer reads data.kpis (label/value/screen).
    return NextResponse.json({
      data: {
        reviews30d: reviews30d.count || 0,
        avgRating,
        publishedReviews: ratings.length,
        pendingModeration: pending.count || 0,
        posts7d: posts7d.count || 0,
        kpis: [
          { label: 'Reviews (30d)', value: reviews30d.count || 0, screen: 'community-reviews' },
          { label: 'Avg rating', value: avgRating === null ? '—' : avgRating.toFixed(1), screen: 'community-reviews' },
          { label: 'Pending moderation', value: pending.count || 0, screen: 'community-trust-&-safety--reports' },
          { label: 'Posts (7d)', value: posts7d.count || 0, screen: 'community-posts' },
        ],
      },
    });
  } catch (e) {
    return err('INTERNAL', e instanceof Error ? e.message : String(e));
  }
}
