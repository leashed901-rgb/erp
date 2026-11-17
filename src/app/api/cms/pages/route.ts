import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { toCmsPage } from '@/lib/cmsTypes';

/* CMS pages (doc 25) over cms_pages. Updates write a
   cms_page_revisions row first — the revision history is the
   page's audit trail. */

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

export async function GET() {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('cms_pages')
    .select('*')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .order('updated_at', { ascending: false })
    .limit(200);
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: (data || []).map((r) => toCmsPage(r as Record<string, unknown>)) });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  if (!title) return err('VALIDATION', 'title is required', 400);
  const slug =
    typeof body.slug === 'string' && body.slug.trim()
      ? body.slug.trim().toLowerCase().replace(/[^a-z0-9/\\-]/g, '-')
      : '/' + title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('cms_pages')
    .insert({
      tenant_id: DEFAULT_TENANT_ID,
      title,
      slug,
      page_type: typeof body.pageType === 'string' && ['standard', 'home', 'services', 'about', 'contact', 'policy', 'landing', 'blog_post', 'faq', 'gallery', 'custom'].includes(body.pageType) ? body.pageType : 'standard',
      body: typeof body.body === 'string' ? body.body : null,
      blocks: Array.isArray(body.blocks) ? body.blocks : [],
      excerpt: typeof body.excerpt === 'string' ? body.excerpt : null,
      featured_image_url: typeof body.featuredImageUrl === 'string' ? body.featuredImageUrl : null,
      status: typeof body.status === 'string' ? body.status : 'draft',
      locale: typeof body.locale === 'string' ? body.locale : 'en',
    })
    .select('*')
    .single();
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: toCmsPage(data as Record<string, unknown>) }, { status: 201 });
}
