import { NextRequest, NextResponse } from 'next/server';
import { resolveCmsPage } from '@/lib/cmsRender';

/* GET /api/cms/render?slug=/my-page[&preview=1] — the storefront render
   payload: published page + resolved blocks + live-now banners +
   navigation + SEO. preview=1 returns drafts too (the page editor's
   Preview tab). The public /s/[slug] page serves the same payload as
   HTML, so a publish shows up with no redeploy. */
export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get('slug') || '';
  const preview = req.nextUrl.searchParams.get('preview') === '1';
  if (!slug) return NextResponse.json({ error: { code: 'VALIDATION', message: 'slug is required', requestId: crypto.randomUUID() } }, { status: 400 });
  const payload = await resolveCmsPage(slug, preview);
  if (!payload) return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Page not found or not published', requestId: crypto.randomUUID() } }, { status: 404 });
  return NextResponse.json({ data: payload });
}
