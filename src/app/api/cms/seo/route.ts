import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { toSeoEntry } from '@/lib/cmsTypes';

/* SEO surfaces (doc 25) over cms_seo — one row per page/scope,
   upserted on page_id. */

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

export async function GET(req: NextRequest) {
  const pageId = req.nextUrl.searchParams.get('pageId');
  const sb = supabaseAdmin();
  let query = sb.from('cms_seo').select('*').eq('tenant_id', DEFAULT_TENANT_ID).limit(300);
  if (pageId) query = query.eq('page_id', pageId);
  const { data, error } = await query;
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: (data || []).map((r) => toSeoEntry(r as Record<string, unknown>)) });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const pageId = typeof body.pageId === 'string' ? body.pageId : null;
  if (!pageId) return err('VALIDATION', 'pageId is required', 400);
  const sb = supabaseAdmin();
  const { data: existing } = await sb
    .from('cms_seo')
    .select('id')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('page_id', pageId)
    .maybeSingle();
  const fields = {
    meta_title: typeof body.metaTitle === 'string' ? body.metaTitle : null,
    meta_description: typeof body.metaDescription === 'string' ? body.metaDescription : null,
    canonical_url: typeof body.canonicalUrl === 'string' ? body.canonicalUrl : null,
    og_title: typeof body.ogTitle === 'string' ? body.ogTitle : null,
    og_description: typeof body.ogDescription === 'string' ? body.ogDescription : null,
    og_image_url: typeof body.ogImageUrl === 'string' ? body.ogImageUrl : null,
    robots_index: body.robotsIndex !== false,
    robots_follow: body.robotsFollow !== false,
  };
  if (existing) {
    const { data, error } = await sb
      .from('cms_seo')
      .update(fields)
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .eq('id', (existing as { id: string }).id)
      .select('*')
      .single();
    if (error) return err('INTERNAL', error.message, 500);
    return NextResponse.json({ data: toSeoEntry(data as Record<string, unknown>) });
  }
  const { data, error } = await sb
    .from('cms_seo')
    .insert({ tenant_id: DEFAULT_TENANT_ID, page_id: pageId, scope: typeof body.scope === 'string' ? body.scope : 'page', ...fields })
    .select('*')
    .single();
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: toSeoEntry(data as Record<string, unknown>) }, { status: 201 });
}
