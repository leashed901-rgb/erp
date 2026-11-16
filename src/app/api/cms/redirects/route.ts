import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { toRedirect } from '@/lib/cmsTypes';

/* Redirects (doc 25) over cms_redirects. */

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

export async function GET() {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('cms_redirects')
    .select('*')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .order('created_at', { ascending: false })
    .limit(300);
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: (data || []).map((r) => toRedirect(r as Record<string, unknown>)) });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const fromUrl = typeof body.fromUrl === 'string' ? body.fromUrl.trim() : '';
  const toUrl = typeof body.toUrl === 'string' ? body.toUrl.trim() : '';
  if (!fromUrl || !toUrl) return err('VALIDATION', 'fromUrl and toUrl are required', 400);
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('cms_redirects')
    .insert({
      tenant_id: DEFAULT_TENANT_ID,
      from_url: fromUrl,
      to_url: toUrl,
      status_code: typeof body.statusCode === 'number' ? body.statusCode : 301,
      active: body.active !== false,
    })
    .select('*')
    .single();
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: toRedirect(data as Record<string, unknown>) }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return err('VALIDATION', 'id query param required', 400);
  const sb = supabaseAdmin();
  const { error } = await sb.from('cms_redirects').delete().eq('tenant_id', DEFAULT_TENANT_ID).eq('id', id);
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: { id, deleted: true } });
}
