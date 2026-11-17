import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

/**
 * DELETE /api/products/listings/map/[id] — remove a listing map
 * (registry `listing.unmap` → `listing_unmap`). Re-publishes the node by
 * default so the product links drop with the map.
 */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data, error } = await supabaseAdmin().rpc('listing_unmap', {
    p_map: id,
    p_publish: true,
  });
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data });
}
