import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

/**
 * POST /api/products/listings/publish — apply the taxonomy map
 * (registry `listing.publish` → `listing_publish`). Body: { node_id? }.
 * Writes `product_taxonomy_links` from the active maps, removes stale
 * map-sourced links, and refreshes each node's product_count. Returns
 * { nodes, added, removed, unchanged }.
 */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const { data, error } = await supabaseAdmin().rpc('listing_publish', {
    p_tenant: DEFAULT_TENANT_ID,
    p_node: (body.node_id as string) || null,
  });
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data });
}
