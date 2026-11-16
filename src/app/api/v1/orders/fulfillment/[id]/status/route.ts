import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

const err = (code: string, message: string, status: number) =>
  NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });

/** POST /api/v1/orders/fulfillment/[id]/status — advance a fulfillment
 *  order's lifecycle (fulfillment_orders.status). Backs the drop-ship
 *  queue's Mark in transit / delivered / received actions; tracking
 *  events themselves flow through erp_record_tracking_event via the
 *  carrier sync (doc 14: fulfillment.mark_in_transit). */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return err('VALIDATION', 'Invalid JSON', 400); }
  const status = body.status ? String(body.status) : '';
  if (!status) return err('VALIDATION', 'status is required', 400);
  // fulfillment_orders has a check constraint — only its vocabulary is
  // storable (draft/submitted/in_production/shipped/delivered/failed/
  // cancelled). Reject anything else rather than 500ing on the constraint.
  const ALLOWED = ['draft', 'submitted', 'in_production', 'shipped', 'delivered', 'failed', 'cancelled'];
  if (!ALLOWED.includes(status)) return err('VALIDATION', `status must be one of: ${ALLOWED.join(', ')}`, 422);
  const patch: Record<string, unknown> = { status };
  if (body.trackingNumber) patch.tracking_number = String(body.trackingNumber);
  const { data, error } = await supabaseAdmin()
    .from('fulfillment_orders')
    .update(patch)
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('id', id)
    .select('*')
    .single();
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data });
}
