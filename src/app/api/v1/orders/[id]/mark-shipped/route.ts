import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

const err = (code: string, message: string, status: number) =>
  NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });

/** POST /api/v1/orders/[id]/mark-shipped — registry
 *  fulfillment.mark_shipped → erp_mark_shipped RPC (doc 14). */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* all fields optional */ }
  const { data, error } = await supabaseAdmin().rpc('erp_mark_shipped', {
    p_order_id: id,
    p_carrier_id: body.carrierId ? String(body.carrierId) : null,
    p_tracking_number: body.trackingNumber ? String(body.trackingNumber) : null,
    p_tracking_url: body.trackingUrl ? String(body.trackingUrl) : null,
    p_shipped_at: body.shippedAt ? String(body.shippedAt) : new Date().toISOString(),
    p_lines: body.lines ?? null,
    p_warehouse_id: body.warehouseId ? String(body.warehouseId) : null,
    p_label_url: body.labelUrl ? String(body.labelUrl) : null,
  });
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data });
}
