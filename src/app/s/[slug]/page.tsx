import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { resolveCmsPage } from '@/lib/cmsRender';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import CmsPageRender from '@/components/cms/CmsPageRender';

/* Public storefront page — /s/<slug>. Renders a published CMS page with
   its live banners and navigation, straight from the database on every
   request: a publish shows up with no redeploy. No shell, no auth gate —
   this is the storefront surface, not the admin. */

// force-dynamic: without it Next statically prerenders this page on first
// request and a later publish (or an expired banner window) would keep
// serving the stale HTML until revalidation that never comes.
export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const payload = await resolveCmsPage(slug);
  if (!payload) return { title: 'Page not found' };
  return {
    title: payload.seo?.metaTitle || payload.page.title,
    description: payload.seo?.metaDescription || payload.page.excerpt || undefined,
    robots: payload.seo && !payload.seo.robotsIndex ? { index: false, follow: payload.seo.robotsFollow } : undefined,
    openGraph: {
      title: payload.seo?.ogTitle || payload.page.title,
      description: payload.seo?.ogDescription || payload.page.excerpt || undefined,
      images: payload.seo?.ogImageUrl ? [payload.seo.ogImageUrl] : undefined,
    },
  };
}

export default async function StorefrontPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const payload = await resolveCmsPage(slug);
  if (!payload) notFound();

  const { data: settings } = await supabaseAdmin()
    .from('cms_website_settings')
    .select('brand_name, maintenance_mode, maintenance_message')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .maybeSingle();
  const brand = (settings as { brand_name?: string } | null)?.brand_name || 'Store';
  if ((settings as { maintenance_mode?: boolean } | null)?.maintenance_mode) {
    return (
      <main className="min-h-screen bg-white flex items-center justify-center px-6">
        <div className="text-center max-w-md">
          <h1 className="text-2xl font-bold">{brand}</h1>
          <p className="mt-3 text-[15px] text-[#6f7a69]">{(settings as { maintenance_message?: string }).maintenance_message || 'We are down for maintenance — please check back soon.'}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-white">
      {/* Live banners — the window rule already filtered these. */}
      {payload.banners.map((b) => (
        <div key={b.id} className="px-5 py-3 text-center" style={{ backgroundColor: b.backgroundColor || '#0a6400', color: b.textColor || '#ffffff' }}>
          {b.headline && <span className="text-[14px] font-bold">{b.headline}</span>}
          {b.subheadline && <span className="text-[13px] ml-2 opacity-90">{b.subheadline}</span>}
          {b.ctaLabel && b.ctaUrl && (
            <a href={b.ctaUrl} className="ml-4 inline-block h-8 px-4 rounded-full bg-white text-[#1a1c1e] text-[12px] font-semibold leading-8">
              {b.ctaLabel}
            </a>
          )}
        </div>
      ))}

      <header className="border-b border-[#dad9dd]">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <a href="/" className="text-[16px] font-bold">
            {brand}
          </a>
          <nav className="flex gap-5">
            {payload.navigation.header.map((item) => (
              <a key={item.id} href={item.href || '#'} className="text-[13px] font-semibold text-[#444] hover:text-black">
                {item.label}
              </a>
            ))}
          </nav>
        </div>
      </header>

      <CmsPageRender blocks={payload.blocks} />

      <footer className="border-t border-[#dad9dd] mt-8">
        <div className="max-w-6xl mx-auto px-6 py-8 flex items-center justify-between">
          <span className="text-[13px] text-[#6f7a69]">© {new Date().getFullYear()} {brand}</span>
          <nav className="flex gap-5">
            {payload.navigation.footer.map((item) => (
              <a key={item.id} href={item.href || '#'} className="text-[13px] text-[#6f7a69] hover:text-black">
                {item.label}
              </a>
            ))}
          </nav>
        </div>
      </footer>
    </main>
  );
}
