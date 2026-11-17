import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

/**
 * POST /api/products/[id]/reprice — reprice variants (doc 18, registry
 * `product.reprice` → `app_reprice_variants`).
 * Body: { variant_ids: string[], price?: number, percent?: number,
 *         set_compare_at?: boolean, round_to_99?: boolean }.
 * Exactly one of price / percent is required (the RPC enforces it).
 * variant_ids defaults to all active variants of the product when omitted.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return err('VALIDATION', 'Invalid JSON', 400);
  }
  let variantIds = (body.variant_ids as string[] | undefined) ?? [];
  if (variantIds.length === 0) {
    const { data: variants } = await supabaseAdmin()
      .from('product_variants')
      .select('id')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .eq('product_id', id)
      .eq('is_active', true);
    variantIds = ((variants ?? []) as { id: string }[]).map((v) => v.id);
  }
  if (variantIds.length === 0) return err('VALIDATION', 'No variants to reprice', 400);
  const { data: count, error } = await supabaseAdmin().rpc('app_reprice_variants', {
    p_variant_ids: variantIds,
    p_price: body.price != null ? Number(body.price) : null,
    p_percent: body.percent != null ? Number(body.percent) : null,
    p_set_compare_at: !!body.set_compare_at,
    p_round_to_99: !!body.round_to_99,
  });
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: { repriced: count, variant_ids: variantIds } });
}
