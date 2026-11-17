import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

/**
 * GET /api/products/listings/nodes — listing categories (`taxonomy_nodes`)
 * with their live product counts.
 */
export async function GET() {
  const { data, error } = await supabaseAdmin()
    .from('taxonomy_nodes')
    .select('id,parent_id,node_type,name,display_name,slug,path,depth,status,product_count,created_at')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .order('path', { ascending: true });
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: data ?? [] });
}

/**
 * POST /api/products/listings/nodes — create a listing category (registry
 * `create.listing_category` → `taxonomy_nodes`). Body: { name, parent_id?,
 * node_type? }. Path is built from the parent path + slug; depth follows.
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
  const nodeType = String(body.node_type || 'category');
  if (!['animal', 'department', 'subcategory', 'category'].includes(nodeType)) {
    return err('VALIDATION', 'node_type must be animal, department, subcategory or category', 400);
  }
  let path = '';
  let depth = 1;
  let parentId = (body.parent_id as string) || null;
  if (parentId) {
    const { data: parent } = await supabaseAdmin()
      .from('taxonomy_nodes')
      .select('id,path,depth')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .eq('id', parentId)
      .maybeSingle();
    if (!parent) return err('VALIDATION', 'Unknown parent_id', 400);
    path = parent.path;
    depth = Number(parent.depth) + 1;
  }
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'category';
  const fullPath = `${path}/${slug}`.replace(/\/+/g, '/');
  const { data: dupe } = await supabaseAdmin()
    .from('taxonomy_nodes')
    .select('id')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('path', fullPath)
    .maybeSingle();
  if (dupe) return err('VALIDATION', `A listing category already exists at ${fullPath}`, 400);
  const { data, error } = await supabaseAdmin()
    .from('taxonomy_nodes')
    .insert({
      tenant_id: DEFAULT_TENANT_ID,
      parent_id: parentId,
      node_type: nodeType,
      name,
      display_name: (body.display_name as string) || name,
      slug,
      path: fullPath,
      depth,
      status: 'published',
      product_count: 0,
    })
    .select('*')
    .single();
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data }, { status: 201 });
}
