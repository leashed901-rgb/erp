import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { toNavItem } from '@/lib/cmsTypes';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const menuId = typeof body.menuId === 'string' ? body.menuId : null;
  const label = typeof body.label === 'string' ? body.label.trim() : '';
  if (!menuId || !label) return err('VALIDATION', 'menuId and label are required', 400);
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('cms_navigation_items')
    .insert({
      tenant_id: DEFAULT_TENANT_ID,
      menu_id: menuId,
      parent_id: typeof body.parentId === 'string' ? body.parentId : null,
      label,
      href: typeof body.href === 'string' ? body.href : null,
      item_type: typeof body.itemType === 'string' ? body.itemType : 'link',
      icon: typeof body.icon === 'string' ? body.icon : null,
      badge: typeof body.badge === 'string' ? body.badge : null,
      sort_order: typeof body.sortOrder === 'number' ? body.sortOrder : 0,
      status: typeof body.status === 'string' ? body.status : 'active',
    })
    .select('*')
    .single();
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: toNavItem(data as Record<string, unknown>) }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const id = typeof body.id === 'string' ? body.id : null;
  if (!id) return err('VALIDATION', 'id is required', 400);
  const patch: Record<string, unknown> = {};
  if (typeof body.label === 'string') patch.label = body.label;
  if (typeof body.href === 'string') patch.href = body.href;
  if (typeof body.sortOrder === 'number') patch.sort_order = body.sortOrder;
  if (typeof body.status === 'string') patch.status = body.status;
  if (typeof body.parentId === 'string' || body.parentId === null) patch.parent_id = body.parentId;
  if (!Object.keys(patch).length) return err('VALIDATION', 'nothing to update', 400);
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('cms_navigation_items')
    .update(patch)
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('id', id)
    .select('*')
    .maybeSingle();
  if (error) return err('INTERNAL', error.message, 500);
  if (!data) return err('NOT_FOUND', 'Item not found', 404);
  return NextResponse.json({ data: toNavItem(data as Record<string, unknown>) });
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return err('VALIDATION', 'id query param required', 400);
  const sb = supabaseAdmin();
  const { error } = await sb.from('cms_navigation_items').delete().eq('tenant_id', DEFAULT_TENANT_ID).eq('id', id);
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: { id, deleted: true } });
}
