import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

const err = (code: string, message: string, status: number) =>
  NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });

/** POST /api/v1/purchase-orders/[id]/receive — registry po.receive →
 *  erp_receive_purchase_order RPC (doc 15's named API gap). Body:
 *  { lines: [{ lineId, quantityReceived }], warehouseId?, notes? } —
 *  transformed to the RPC's p_lines jsonb. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return err('VALIDATION', 'Invalid JSON', 400); }
  const lines = (body.lines as Record<string, unknown>[] | undefined) || [];
  if (!lines.length) return err('VALIDATION', 'lines is required', 400);
  const { data, error } = await supabaseAdmin().rpc('erp_receive_purchase_order', {
    p_po_id: id,
    // The RPC matches lines on `po_line_id` and reads `quantity`.
    p_lines: lines.map((l) => ({
      po_line_id: l.lineId ? String(l.lineId) : undefined,
      quantity: Number(l.quantityReceived ?? l.quantity) || 0,
      unit_cost: l.unitCost != null ? Number(l.unitCost) : undefined,
    })),
    p_warehouse_id: body.warehouseId ? String(body.warehouseId) : null,
    p_received_at: body.receivedAt ? String(body.receivedAt) : new Date().toISOString(),
    p_notes: body.notes ? String(body.notes) : null,
  });
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data });
}
