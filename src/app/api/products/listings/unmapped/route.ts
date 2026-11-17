import { NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/**
 * GET /api/products/listings/unmapped — source categories with products this
 * tenant has not mapped anywhere yet (`listing_unmapped`). The gap report
 * the Listing panel uses to show what still needs a map.
 */
export async function GET() {
  const { data, error } = await supabaseAdmin().rpc('listing_unmapped', {
    p_tenant: DEFAULT_TENANT_ID,
  });
  if (error) {
    return NextResponse.json({ error: { code: 'INTERNAL', message: error.message, requestId: crypto.randomUUID() } }, { status: 500 });
  }
  return NextResponse.json({ data: data ?? [] });
}
