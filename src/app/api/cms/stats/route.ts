import { NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/* GET /api/cms/stats — the Website / CMS overview tiles (kpis.md).
   Every tile is a real count from the database; each opens the backing
   list. Banners active uses the same live-now window rule as the
   storefront, the list and the editors. */
export async function GET() {
  const sb = supabaseAdmin();
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const [{ data: pages }, { data: banners }, { count: submissions }] = await Promise.all([
    sb.from('cms_pages').select('status').eq('tenant_id', DEFAULT_TENANT_ID),
    sb.from('cms_banners').select('is_active, starts_at, ends_at').eq('tenant_id', DEFAULT_TENANT_ID),
    sb
      .from('platform_webform_submissions')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .gte('created_at', sevenDaysAgo),
  ]);
  const now = Date.now();
  const livePages = (pages || []).filter((p) => p.status === 'published').length;
  const drafts = (pages || []).filter((p) => p.status === 'draft').length;
  const activeBanners = (banners || []).filter(
    (b) => b.is_active && (!b.starts_at || new Date(b.starts_at).getTime() <= now) && (!b.ends_at || new Date(b.ends_at).getTime() >= now),
  ).length;
  return NextResponse.json({
    data: {
      kpis: [
        { label: 'Pages live', value: String(livePages), screen: 'cms-pages' },
        { label: 'Drafts', value: String(drafts), screen: 'cms-pages' },
        { label: 'Banners active', value: String(activeBanners), screen: 'banners' },
        { label: 'Form submissions (7d)', value: String(submissions ?? 0), screen: 'set-lead-capture' },
      ],
    },
  });
}
