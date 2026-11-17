import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { toCmsPage } from '@/lib/cmsTypes';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const sb = supabaseAdmin();
  const { data: page } = await sb.from('cms_pages').select('*').eq('tenant_id', DEFAULT_TENANT_ID).eq('id', id).maybeSingle();
  if (!page) return err('NOT_FOUND', 'Page not found', 404);
  const { data: revisions } = await sb
    .from('cms_page_revisions')
    .select('*')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('page_id', id)
    .order('version', { ascending: false })
    .limit(50);
  const { data: seo } = await sb.from('cms_seo').select('*').eq('tenant_id', DEFAULT_TENANT_ID).eq('page_id', id).maybeSingle();
  return NextResponse.json({
    data: {
      page: toCmsPage(page as Record<string, unknown>),
      revisions: revisions || [],
      seo: seo || null,
    },
  });
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const sb = supabaseAdmin();
  const { data: current } = await sb.from('cms_pages').select('*').eq('tenant_id', DEFAULT_TENANT_ID).eq('id', id).maybeSingle();
  if (!current) return err('NOT_FOUND', 'Page not found', 404);
  const cur = current as Record<string, unknown>;

  const patch: Record<string, unknown> = {};
  if (typeof body.title === 'string') patch.title = body.title;
  if (typeof body.slug === 'string') patch.slug = body.slug;
  if (typeof body.body === 'string') patch.body = body.body;
  if (Array.isArray(body.blocks)) patch.blocks = body.blocks;
  if (typeof body.excerpt === 'string') patch.excerpt = body.excerpt;
  if (typeof body.featuredImageUrl === 'string') patch.featured_image_url = body.featuredImageUrl;
  if (typeof body.status === 'string') {
    patch.status = body.status;
    if (body.status === 'published' && !cur.published_at) patch.published_at = new Date().toISOString();
  }
  if (typeof body.scheduledFor === 'string') patch.scheduled_for = body.scheduledFor;
  if (!Object.keys(patch).length) return err('VALIDATION', 'nothing to update', 400);

  /* Snapshot the current version as a revision before overwriting. */
  const nextVersion = (typeof cur.version === 'number' ? cur.version : 1) + 1;
  const { error: revErr } = await sb.from('cms_page_revisions').insert({
    tenant_id: DEFAULT_TENANT_ID,
    page_id: id,
    version: cur.version ?? 1,
    title: cur.title,
    body: cur.body,
    blocks: cur.blocks ?? [],
    change_note: typeof body.changeNote === 'string' ? body.changeNote : null,
  });
  if (revErr) return err('INTERNAL', revErr.message, 500);
  patch.version = nextVersion;

  const { data, error } = await sb
    .from('cms_pages')
    .update(patch)
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('id', id)
    .select('*')
    .single();
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: toCmsPage(data as Record<string, unknown>) });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const sb = supabaseAdmin();
  const { error } = await sb.from('cms_pages').delete().eq('tenant_id', DEFAULT_TENANT_ID).eq('id', id);
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: { id, deleted: true } });
}
