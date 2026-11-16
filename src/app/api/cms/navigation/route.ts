import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { toNavItem, toNavMenu } from '@/lib/cmsTypes';

/* Navigation builder (doc 25): cms_navigation_menus with their
   cms_navigation_items trees. */

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

export async function GET() {
  const sb = supabaseAdmin();
  const { data: menus, error } = await sb
    .from('cms_navigation_menus')
    .select('*')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .order('name', { ascending: true });
  if (error) return err('INTERNAL', error.message, 500);
  const { data: items } = await sb
    .from('cms_navigation_items')
    .select('*')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .order('sort_order', { ascending: true })
    .limit(1000);
  const byMenu = new Map<string, ReturnType<typeof toNavItem>[]>();
  for (const it of items || []) {
    const row = it as Record<string, unknown>;
    const key = String(row.menu_id);
    if (!byMenu.has(key)) byMenu.set(key, []);
    byMenu.get(key)!.push(toNavItem(row));
  }
  return NextResponse.json({
    data: (menus || []).map((m) => toNavMenu(m as Record<string, unknown>, byMenu.get(String((m as Record<string, unknown>).id)) || [])),
  });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const location = typeof body.location === 'string' ? body.location.trim() : '';
  if (!name || !location) return err('VALIDATION', 'name and location are required', 400);
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('cms_navigation_menus')
    .insert({
      tenant_id: DEFAULT_TENANT_ID,
      name,
      location,
      status: typeof body.status === 'string' ? body.status : 'active',
      locale: typeof body.locale === 'string' ? body.locale : 'en',
    })
    .select('*')
    .single();
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: toNavMenu(data as Record<string, unknown>) }, { status: 201 });
}
