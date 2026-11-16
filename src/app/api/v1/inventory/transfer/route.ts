import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { resolveOrCreateSku } from '@/lib/erpStock';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

/**
 * POST /api/v1/inventory/transfer — move stock between warehouses
 * (doc 16, registry `inventory.transfer` → `erp_transfer_stock`).
 * Body: { from_warehouse_id, to_warehouse_id, lines: [{ variant_id, quantity }],
 *         receive_now?, notes? }. Lines are resolved to ERP SKUs first; the
 * RPC validates on-hand in the source warehouse and writes both movements
 * (out + in when receive_now). Returns the transfer id + number.
 */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return err('VALIDATION', 'Invalid JSON', 400);
  }
  const fromId = String(body.from_warehouse_id || '');
  const toId = String(body.to_warehouse_id || '');
  const lines = (body.lines as { variant_id?: string; sku_id?: string; quantity?: number }[] | undefined) ?? [];
  if (!fromId || !toId) return err('VALIDATION', 'from_warehouse_id and to_warehouse_id are required', 400);
  if (fromId === toId) return err('VALIDATION', 'Pick two different warehouses', 400);
  if (lines.length === 0) return err('VALIDATION', 'Add at least one SKU to transfer', 400);
  try {
    const rpcLines = [];
    for (const l of lines) {
      const qty = Number(l.quantity);
      if (!Number.isFinite(qty) || qty <= 0) return err('VALIDATION', 'Transfer quantities must be positive', 400);
      let skuId = l.sku_id;
      if (!skuId && l.variant_id) skuId = (await resolveOrCreateSku(String(l.variant_id))).id;
      if (!skuId) return err('VALIDATION', 'Each line needs a variant_id or sku_id', 400);
      rpcLines.push({ sku_id: skuId, quantity: qty });
    }
    const { data: transferId, error } = await supabaseAdmin().rpc('erp_transfer_stock', {
      p_tenant_id: DEFAULT_TENANT_ID,
      p_from_warehouse: fromId,
      p_to_warehouse: toId,
      p_lines: rpcLines,
      p_receive_now: body.receive_now !== false,
      p_notes: (body.notes as string) || null,
    });
    if (error) return err('INTERNAL', error.message, 500);
    const { data: tr } = await supabaseAdmin()
      .from('erp_inventory_transfers')
      .select('id,transfer_number,status')
      .eq('id', transferId)
      .single();
    return NextResponse.json({ data: tr ?? { id: transferId } }, { status: 201 });
  } catch (e) {
    return err('INTERNAL', e instanceof Error ? e.message : 'Transfer failed', 500);
  }
}
