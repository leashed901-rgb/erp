import { NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import type { Carrier, ShippingMethod } from '@/lib/orderTypes';

const err = (code: string, message: string, status: number) =>
  NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });

/** GET /api/v1/shipping/carriers — carriers + their services for the
 *  Shipping settings screen (erp_carriers / erp_shipping_methods), plus
 *  the rate profiles (shipping_profiles), the average purchased-label
 *  cost (commerce_shipping_labels.postage_amount) and the on-time
 *  delivery rate (delivered shipments vs the order's sla_due_at). */
export async function GET() {
  const sb = supabaseAdmin();
  const [carriers, methods, profiles, labels, shipments] = await Promise.all([
    sb.from('erp_carriers').select('*').eq('tenant_id', DEFAULT_TENANT_ID).order('name', { ascending: true }),
    sb.from('erp_shipping_methods').select('*').eq('tenant_id', DEFAULT_TENANT_ID).order('name', { ascending: true }),
    sb.from('shipping_profiles').select('*').eq('tenant_id', DEFAULT_TENANT_ID).order('method_name', { ascending: true }),
    sb.from('commerce_shipping_labels').select('postage_amount').eq('tenant_id', DEFAULT_TENANT_ID).not('postage_amount', 'is', null),
    sb.from('erp_shipments').select('id,status,delivered_at,fulfillment_id').eq('tenant_id', DEFAULT_TENANT_ID).eq('status', 'delivered'),
  ]);
  if (carriers.error) return err('INTERNAL', carriers.error.message, 500);
  if (methods.error) return err('INTERNAL', methods.error.message, 500);
  if (profiles.error) return err('INTERNAL', profiles.error.message, 500);
  if (labels.error) return err('INTERNAL', labels.error.message, 500);
  if (shipments.error) return err('INTERNAL', shipments.error.message, 500);
  const priced = (labels.data || []).map((l) => Number(l.postage_amount)).filter((n) => Number.isFinite(n) && n > 0);
  const avgLabelCost = priced.length ? priced.reduce((a, b) => a + b, 0) / priced.length : null;
  // On-time: delivered shipments whose order had an SLA, delivered by it.
  let onTimeRate: number | null = null;
  const delivered = shipments.data || [];
  if (delivered.length) {
    const foIds = [...new Set(delivered.map((s) => s.fulfillment_id as string).filter(Boolean))];
    const { data: fos } = await sb.from('erp_fulfillment_orders').select('id,order_id').in('id', foIds.length ? foIds : ['00000000-0000-0000-0000-000000000000']);
    const orderIds = [...new Set((fos || []).map((f) => f.order_id as string).filter(Boolean))];
    const { data: orders } = await sb.from('erp_orders').select('id,sla_due_at').in('id', orderIds.length ? orderIds : ['00000000-0000-0000-0000-000000000000']);
    const slaByOrder = new Map((orders || []).map((o) => [o.id as string, o.sla_due_at as string | null]));
    const foOrder = new Map((fos || []).map((f) => [f.id as string, f.order_id as string]));
    let withSla = 0;
    let onTime = 0;
    for (const s of delivered) {
      const sla = slaByOrder.get(foOrder.get(s.fulfillment_id as string) || '');
      if (!sla || !s.delivered_at) continue;
      withSla++;
      if (new Date(s.delivered_at as string).getTime() <= new Date(sla).getTime()) onTime++;
    }
    onTimeRate = withSla ? onTime / withSla : null;
  }
  return NextResponse.json({
    data: {
      carriers: ((carriers.data || []) as Record<string, unknown>[]).map((c): Carrier => ({
        id: String(c.id),
        name: String(c.name || ''),
        code: (c.code as string) || null,
        isActive: c.is_active !== false,
      })),
      methods: ((methods.data || []) as Record<string, unknown>[]).map((m): ShippingMethod => ({
        id: String(m.id),
        carrierId: (m.carrier_id as string) || null,
        name: String(m.name || ''),
        code: (m.code as string) || null,
        isActive: m.is_active !== false,
      })),
      profiles: ((profiles.data || []) as Record<string, unknown>[]).map((p) => ({
        id: String(p.id),
        methodName: (p.method_name as string) || '',
        firstItemCost: (p.first_item_cost as number | null) ?? null,
        additionalItemCost: (p.additional_item_cost as number | null) ?? null,
        minDays: (p.min_days as number | null) ?? null,
        maxDays: (p.max_days as number | null) ?? null,
      })),
      avgLabelCost,
      onTimeRate,
    },
  });
}
