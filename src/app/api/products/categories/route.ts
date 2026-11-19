import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

/**
 * POST /api/products/categories — create a category inline (doc 18: categories
 * are "inline-creatable so the prerequisite never blocks"). Body: { name,
 * parent_id? }. Slug is derived from the name and de-duplicated; level is
 * parent level + 1 (max 5). The drawer used to offer only the existing tree.
 */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return err('VALIDATION', 'Invalid JSON', 400);
  }
  const name = String(body.name || '').trim();
  if (!name) return err('VALIDATION', 'name is required', 400);
  let level = 1;
  if (body.parent_id) {
    const { data: parent } = await supabaseAdmin()
      .from('categories')
      .select('id,level')
      .eq('id', String(body.parent_id))
      .maybeSingle();
    if (!parent) return err('VALIDATION', 'Unknown parent_id', 400);
    level = Number(parent.level) + 1;
    if (level > 5) return err('VALIDATION', 'Categories nest at most 5 levels deep', 400);
  }
  const baseSlug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'category';
  const { data: existing } = await supabaseAdmin()
    .from('categories')
    .select('slug')
    .like('slug', `${baseSlug}%`);
  const taken = new Set(((existing ?? []) as { slug: string }[]).map((r) => r.slug));
  let slug = baseSlug;
  let n = 2;
  while (taken.has(slug)) slug = `${baseSlug}-${n++}`;
  const { data, error } = await supabaseAdmin()
    .from('categories')
    .insert({
      tenant_id: DEFAULT_TENANT_ID,
      parent_id: (body.parent_id as string) || null,
      level,
      name,
      slug,
      description: (body.description as string) || null,
      is_active: true,
    })
    .select('id,name,slug,parent_id')
    .single();
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data }, { status: 201 });
}

/**
 * GET /api/products/categories
 * The category tree for product forms (grouped by parent for select options).
 */
export async function GET() {
  const { data, error } = await supabaseAdmin()
    .from('categories')
    .select('id,name,slug,parent_id')
    .order('name', { ascending: true })
    .limit(500);
  if (error) {
    return NextResponse.json({ error: { code: 'INTERNAL', message: error.message } }, { status: 500 });
  }
  return NextResponse.json({ data: data || [] });
}
