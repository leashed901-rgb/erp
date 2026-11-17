import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

/** GET /api/v1/inventory/cycle-counts/[id] — one session with its lines. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data: session, error } = await supabaseAdmin()
    .from('erp_inventory_count_sessions')
    .select('*')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('id', id)
    .single();
  if (error || !session) return err('NOT_FOUND', 'Count session not found', 404);
  const { data: lines } = await supabaseAdmin()
    .from('erp_inventory_count_lines')
    .select('id,sku_id,location_id,expected_quantity,counted_quantity,variance_quantity,unit_cost,counted_at')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('count_session_id', id);
  // NOTE: erp_inventory_count_lines has no created_at column — do not
  // order by it (PostgREST 400s and this returns zero lines).
  const skuIds = [...new Set(((lines ?? []) as { sku_id: string }[]).map((l) => l.sku_id))];
  const { data: skus } = await supabaseAdmin()
    .from('erp_product_skus')
    .select('id,sku,product_id,variant_id')
    .in('id', skuIds.length ? skuIds : ['00000000-0000-0000-0000-000000000000']);
  const skuById = new Map(((skus ?? []) as { id: string; sku: string; product_id: string; variant_id: string | null }[]).map((s) => [s.id, s]));
  const productIds = [...new Set([...skuById.values()].map((s) => s.product_id))];
  const { data: products } = await supabaseAdmin()
    .from('products')
    .select('id,name')
    .in('id', productIds.length ? productIds : ['00000000-0000-0000-0000-000000000000']);
  const nameByProduct = new Map(((products ?? []) as { id: string; name: string }[]).map((p) => [p.id, p.name]));
  const { data: wh } = await supabaseAdmin()
    .from('erp_warehouses')
    .select('id,name')
    .eq('id', session.warehouse_id)
    .maybeSingle();
  return NextResponse.json({
    data: {
      ...session,
      warehouse: wh?.name ?? null,
      lines: (lines ?? []).map((l) => {
        const s = skuById.get(l.sku_id);
        return {
          ...l,
          sku: s?.sku ?? null,
          product: s ? (nameByProduct.get(s.product_id) ?? null) : null,
        };
      }),
    },
  });
}

/**
 * DELETE /api/v1/inventory/cycle-counts/[id] — delete a draft session
 * (and its lines). Posted sessions are ledger history and cannot be deleted.
 */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data: session } = await supabaseAdmin()
    .from('erp_inventory_count_sessions')
    .select('status')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('id', id)
    .maybeSingle();
  if (!session) return err('NOT_FOUND', 'Count session not found', 404);
  if (session.status === 'posted') {
    return err('VALIDATION', 'A posted count is ledger history and cannot be deleted', 400);
  }
  await supabaseAdmin().from('erp_inventory_count_lines').delete().eq('count_session_id', id);
  const { error } = await supabaseAdmin()
    .from('erp_inventory_count_sessions')
    .delete()
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('id', id);
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: { id, deleted: true } });
}
