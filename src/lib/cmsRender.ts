import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { toCmsPage, toBanner, toNavItem, toSeoEntry } from '@/lib/cmsTypes';

/* The storefront render payload — one function, two consumers: the
   /api/cms/render route (JSON) and the public /s/[slug] server page
   (HTML). Resolution rules, in one place:
   - page: published only, unless preview=1 (the editor's own preview).
   - banners: live-now rule — is_active AND inside starts_at/ends_at.
   - blocks: gallery / testimonial / FAQ / featured-product items are
     resolved into props.items so the renderer never invents content. */

export interface ResolvedBlock {
  id: string;
  type: string;
  props: Record<string, unknown>;
}

export interface RenderPayload {
  page: ReturnType<typeof toCmsPage>;
  seo: ReturnType<typeof toSeoEntry> | null;
  blocks: ResolvedBlock[];
  banners: ReturnType<typeof toBanner>[];
  navigation: { header: ReturnType<typeof toNavItem>[]; footer: ReturnType<typeof toNavItem>[] };
}

const str = (v: unknown) => (typeof v === 'string' ? v : '');

function liveNow(isActive: boolean, startsAt: string | null, endsAt: string | null): boolean {
  if (!isActive) return false;
  const now = Date.now();
  if (startsAt && new Date(startsAt).getTime() > now) return false;
  if (endsAt && new Date(endsAt).getTime() < now) return false;
  return true;
}

async function resolveBlocks(blocks: ResolvedBlock[]): Promise<ResolvedBlock[]> {
  const sb = supabaseAdmin();
  const out: ResolvedBlock[] = [];
  for (const b of blocks) {
    const props = { ...(b.props || {}) };
    if (b.type === 'gallery' && str(props.gallery_id)) {
      const { data } = await sb
        .from('cms_gallery_items')
        .select('image_url, alt_text, caption')
        .eq('tenant_id', DEFAULT_TENANT_ID)
        .eq('gallery_id', String(props.gallery_id))
        .eq('is_published', true)
        .order('sort_order', { ascending: true })
        .limit(24);
      props.items = (data || []).map((r) => ({ image_url: r.image_url, alt_text: r.alt_text, caption: r.caption }));
    }
    if (b.type === 'testimonials') {
      const count = Math.min(Math.max(Number(props.count) || 3, 1), 12);
      const { data } = await sb
        .from('testimonials')
        .select('quote, author, rating')
        .eq('tenant_id', DEFAULT_TENANT_ID)
        .eq('visible', true)
        .order('order', { ascending: true })
        .limit(count);
      props.items = (data || []).map((r) => ({ quote: r.quote, author: r.author, rating: r.rating }));
    }
    if (b.type === 'faq') {
      const { data } = await sb
        .from('faqs')
        .select('question, answer')
        .eq('tenant_id', DEFAULT_TENANT_ID)
        .eq('is_published', true)
        .order('display_order', { ascending: true })
        .limit(20);
      props.items = (data || []).map((r) => ({ question: r.question, answer: r.answer }));
    }
    if (b.type === 'featured-products' && str(props.product_ids)) {
      const ids = str(props.product_ids)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 12);
      if (ids.length) {
        const [{ data: products }, { data: variants }] = await Promise.all([
          sb.from('products').select('id, name').eq('tenant_id', DEFAULT_TENANT_ID).in('id', ids),
          sb.from('product_variants').select('product_id, price').eq('tenant_id', DEFAULT_TENANT_ID).in('product_id', ids),
        ]);
        const minPrice = new Map<string, number>();
        for (const v of variants || []) {
          if (v.price == null) continue;
          const cur = minPrice.get(v.product_id);
          if (cur == null || Number(v.price) < cur) minPrice.set(v.product_id, Number(v.price));
        }
        const byId = new Map((products || []).map((p) => [p.id, p]));
        props.items = ids
          .map((id) => byId.get(id))
          .filter(Boolean)
          .map((p) => ({ name: (p as { name: string }).name, price: minPrice.get((p as { id: string }).id) ?? null }));
      } else {
        props.items = [];
      }
    }
    out.push({ id: b.id, type: b.type, props });
  }
  return out;
}

export async function resolveCmsPage(slug: string, preview = false): Promise<RenderPayload | null> {
  const sb = supabaseAdmin();
  const candidates = slug.startsWith('/') ? [slug, slug.slice(1)] : [`/${slug}`, slug];
  let pageRow: Record<string, unknown> | null = null;
  for (const s of candidates) {
    const { data } = await sb.from('cms_pages').select('*').eq('tenant_id', DEFAULT_TENANT_ID).eq('slug', s).maybeSingle();
    if (data) {
      pageRow = data as Record<string, unknown>;
      break;
    }
  }
  if (!pageRow) return null;
  if (!preview && String(pageRow.status) !== 'published') return null;

  const page = toCmsPage(pageRow);
  const [seoRes, bannerRes, menuRes] = await Promise.all([
    sb.from('cms_seo').select('*').eq('tenant_id', DEFAULT_TENANT_ID).eq('page_id', page.id).maybeSingle(),
    sb.from('cms_banners').select('*').eq('tenant_id', DEFAULT_TENANT_ID).eq('is_active', true).order('sort_order', { ascending: true }).limit(20),
    sb.from('cms_navigation_menus').select('id, location').eq('tenant_id', DEFAULT_TENANT_ID).eq('status', 'active'),
  ]);
  const banners = ((bannerRes.data || []) as Record<string, unknown>[])
    .map((r) => toBanner(r))
    .filter((b) => liveNow(b.isActive, b.startsAt, b.endsAt));
  const menuIds = ((menuRes.data || []) as { id: string; location: string }[]).reduce<Record<string, string>>((acc, m) => {
    acc[m.location] = m.id;
    return acc;
  }, {});
  const { data: navItems } = await sb
    .from('cms_navigation_items')
    .select('*')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('status', 'active')
    .order('sort_order', { ascending: true })
    .limit(200);
  const items = ((navItems || []) as Record<string, unknown>[]).map((r) => toNavItem(r));
  const blocks = await resolveBlocks((page.blocks as ResolvedBlock[]) || []);

  return {
    page,
    seo: seoRes.data ? toSeoEntry(seoRes.data as Record<string, unknown>) : null,
    blocks,
    banners,
    navigation: {
      header: items.filter((i) => i.menuId === menuIds.header),
      footer: items.filter((i) => i.menuId === menuIds.footer),
    },
  };
}
