import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { toContentBlock } from '@/lib/cmsTypes';

/* Content blocks (doc 25) over cms_content_blocks. */

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

export async function GET(req: NextRequest) {
  const pageId = req.nextUrl.searchParams.get('pageId');
  const sb = supabaseAdmin();
  let query = sb
    .from('cms_content_blocks')
    .select('*')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .order('sort_order', { ascending: true })
    .limit(300);
  if (pageId) query = query.eq('page_id', pageId);
  const { data, error } = await query;
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: (data || []).map((r) => toContentBlock(r as Record<string, unknown>)) });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const componentType = typeof body.componentType === 'string' ? body.componentType : '';
  if (!componentType) return err('VALIDATION', 'componentType is required', 400);
  const blockId =
    typeof body.blockId === 'string' && body.blockId.trim()
      ? body.blockId.trim()
      : `${componentType}-${Math.random().toString(36).slice(2, 8)}`;
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('cms_content_blocks')
    .insert({
      tenant_id: DEFAULT_TENANT_ID,
      block_id: blockId,
      component_type: componentType,
      props: body.props && typeof body.props === 'object' ? body.props : {},
      slot_id: typeof body.slotId === 'string' ? body.slotId : null,
      page_id: typeof body.pageId === 'string' ? body.pageId : null,
      status: typeof body.status === 'string' ? body.status : 'draft',
      locale: typeof body.locale === 'string' ? body.locale : 'en',
      sort_order: typeof body.sortOrder === 'number' ? body.sortOrder : 0,
    })
    .select('*')
    .single();
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: toContentBlock(data as Record<string, unknown>) }, { status: 201 });
}
