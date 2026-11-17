import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/* Shipping labels (doc 14: fulfillment.print_label →
   commerce_shipping_labels). In the schema a label hangs off a
   SHIPMENT (erp_shipments), and shipments hang off fulfillment
   orders — so an order's labels resolve order → fulfillment orders →
   shipments → labels. */

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

interface LabelRow {
  id: string; shipment_id: string; label_type: string | null; label_uri: string | null;
  carrier: string | null; tracking_number: string | null; postage_amount: number | null;
  printed_at: string | null; created_at: string;
}

const toLabel = (r: LabelRow) => ({
  id: r.id,
  shipmentId: r.shipment_id,
  labelType: r.label_type,
  labelUri: r.label_uri,
  carrier: r.carrier,
  trackingNumber: r.tracking_number,
  postageAmount: r.postage_amount != null ? Number(r.postage_amount) : null,
  printedAt: r.printed_at,
  createdAt: r.created_at,
});

export async function shipmentIdsForOrder(sb: ReturnType<typeof supabaseAdmin>, orderId: string): Promise<string[]> {
  const { data: fuls } = await sb.from('erp_fulfillment_orders').select('id').eq('tenant_id', DEFAULT_TENANT_ID).eq('order_id', orderId);
  const fulIds = (fuls || []).map((f) => f.id as string);
  if (!fulIds.length) return [];
  const { data: ships } = await sb.from('erp_shipments').select('id').eq('tenant_id', DEFAULT_TENANT_ID).in('fulfillment_id', fulIds).order('created_at', { ascending: false });
  return (ships || []).map((s) => s.id as string);
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const sb = supabaseAdmin();
  const shipmentIds = await shipmentIdsForOrder(sb, id);
  if (!shipmentIds.length) return NextResponse.json({ data: [] });
  const { data, error } = await sb
    .from('commerce_shipping_labels')
    .select('*')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .in('shipment_id', shipmentIds)
    .order('created_at', { ascending: false });
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: (data as LabelRow[]).map(toLabel) });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const sb = supabaseAdmin();
  let shipmentId = typeof body.shipmentId === 'string' ? body.shipmentId : null;
  if (!shipmentId) {
    const ids = await shipmentIdsForOrder(sb, id);
    shipmentId = ids[0] || null;
  }
  if (!shipmentId) return err('VALIDATION', 'This order has no shipment yet — mark it shipped first, then the label attaches to that shipment.', 422);
  const { data, error } = await sb
    .from('commerce_shipping_labels')
    .insert({
      tenant_id: DEFAULT_TENANT_ID,
      shipment_id: shipmentId,
      label_type: typeof body.labelType === 'string' ? body.labelType : 'shipping',
      label_uri: typeof body.labelUri === 'string' ? body.labelUri : typeof body.labelUrl === 'string' ? body.labelUrl : null,
      carrier: typeof body.carrier === 'string' ? body.carrier : null,
      tracking_number: typeof body.trackingNumber === 'string' ? body.trackingNumber : null,
      postage_amount: typeof body.postageAmount === 'number' ? body.postageAmount : null,
      printed_at: new Date().toISOString(),
    })
    .select('*')
    .single();
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: toLabel(data as LabelRow) }, { status: 201 });
}
