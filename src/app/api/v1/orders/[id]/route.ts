import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { toOrder, toOrderLine, toShipment, toTrackingEvent } from '@/lib/orderDto';
import type { OrderDetail } from '@/lib/orderTypes';

const err = (code: string, message: string, status: number) =>
  NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });

/** GET /api/v1/orders/[id] — order detail (doc 14): lines, shipments,
 *  tracking events, notes for the detail page + right rail. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = supabaseAdmin();
  const { data: order, error } = await sb
    .from('erp_orders')
    .select('*')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('id', id)
    .maybeSingle();
  if (error) return err('INTERNAL', error.message, 500);
  if (!order) return err('NOT_FOUND', 'Order not found', 404);

  // Shipments link to the order through fulfillment orders:
  // erp_fulfillment_orders.order_id → erp_shipments.fulfillment_id.
  const { data: fuls } = await sb.from('erp_fulfillment_orders').select('id').eq('tenant_id', DEFAULT_TENANT_ID).eq('order_id', id);
  const fulIds = (fuls || []).map((f) => f.id as string);
  const [lines, shipments, notes] = await Promise.all([
    sb.from('erp_order_lines').select('*').eq('order_id', id).order('created_at', { ascending: true }),
    fulIds.length
      ? sb.from('erp_shipments').select('*').eq('tenant_id', DEFAULT_TENANT_ID).in('fulfillment_id', fulIds).order('created_at', { ascending: false })
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    sb.from('erp_order_notes').select('*').eq('order_id', id).order('created_at', { ascending: false }),
  ]);
  const shipRows = (shipments.data || []) as Record<string, unknown>[];
  const shipIds = shipRows.map((s) => s.id as string);
  let events: Record<string, unknown>[] = [];
  if (shipIds.length) {
    const { data: ev } = await sb
      .from('erp_tracking_events')
      .select('*')
      .in('shipment_id', shipIds)
      .order('event_at', { ascending: false });
    events = (ev || []) as Record<string, unknown>[];
  }

  const lineRows = (lines.data || []) as Record<string, unknown>[];
  const itemCount = lineRows.reduce((s, l) => s + (Number(l.quantity) || 0), 0);
  const detail: OrderDetail = {
    ...toOrder(order as Record<string, unknown>, itemCount),
    lines: lineRows.map(toOrderLine),
    shipments: shipRows.map((s) => toShipment(s as Record<string, unknown>)),
    trackingEvents: events.map(toTrackingEvent),
    notes: ((notes.data || []) as Record<string, unknown>[]).map((n) => ({
      id: String(n.id),
      body: String(n.body || ''),
      noteType: (n.note_type as string) || null,
      createdAt: String(n.created_at || ''),
    })),
  };
  return NextResponse.json({ data: detail });
}
