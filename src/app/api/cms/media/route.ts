import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { toMediaAsset } from '@/lib/cmsTypes';

/* Media library (doc 25): cms_media_assets. Assets are added by URL —
   the file itself lives on the CDN / storage the URL points to; the row
   is the library record the page editor and banner pickers read. */

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q');
  let query = supabaseAdmin()
    .from('cms_media_assets')
    .select('*')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .order('created_at', { ascending: false })
    .limit(200);
  if (q) query = query.or(`title.ilike.%${q}%,alt_text.ilike.%${q}%,tags.ilike.%${q}%`);
  const { data, error } = await query;
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: (data || []).map((r) => toMediaAsset(r as Record<string, unknown>)) });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const url = typeof body.url === 'string' ? body.url.trim() : '';
  if (!url) return err('VALIDATION', 'url is required', 400);
  // mime_type is NOT NULL and tags is text[] — the add-by-URL form sends
  // neither, so infer the mime from the extension and split tags.
  const ext = url.split('?')[0].split('.').pop()?.toLowerCase();
  const mimeByExt: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', avif: 'image/avif', mp4: 'video/mp4' };
  const tags = Array.isArray(body.tags) ? body.tags.filter((t) => typeof t === 'string')
    : typeof body.tags === 'string' && body.tags.trim() ? body.tags.split(',').map((t) => t.trim()).filter(Boolean)
    : [];
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('cms_media_assets')
    .insert({
      tenant_id: DEFAULT_TENANT_ID,
      media_id: typeof body.mediaId === 'string' ? body.mediaId : `media-${Date.now()}`,
      url,
      cdn_url: typeof body.cdnUrl === 'string' ? body.cdnUrl : null,
      mime_type: typeof body.mimeType === 'string' ? body.mimeType : mimeByExt[ext || ''] || 'application/octet-stream',
      file_size: typeof body.fileSize === 'number' ? body.fileSize : null,
      width: typeof body.width === 'number' ? body.width : null,
      height: typeof body.height === 'number' ? body.height : null,
      alt_text: typeof body.altText === 'string' ? body.altText : null,
      title: typeof body.title === 'string' ? body.title : null,
      caption: typeof body.caption === 'string' ? body.caption : null,
      source: typeof body.source === 'string' ? body.source : 'upload',
      tags,
      status: typeof body.status === 'string' ? body.status : 'published',
      created_by: 'admin',
    })
    .select('*')
    .single();
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: toMediaAsset(data as Record<string, unknown>) }, { status: 201 });
}
