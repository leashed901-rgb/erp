import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { apiError } from '@/lib/podServer';
import { toOrder } from '@/lib/orderDto';

/**
 * POST /api/v1/orders — Create Order (A6). Takes the prefilled envelope
 * from a published product: { productVariantId, designPublicationId?,
 * quantity?, customerEmail? }. The unit price is the variant's set price
 * (the price the user published), never recomputed. Writes a real
 * erp_orders draft row + its erp_order_lines row, resolving the fulfillment
 * route (priority 1) for the supplier_catalog_variant_id.
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      productVariantId?: string;
      designPublicationId?: string;
      quantity?: number;
      customerEmail?: string;
    };
    if (!body.productVariantId) {
      return apiError('productVariantId is required.', 422);
    }
    const quantity = Math.max(1, Math.floor(body.quantity ?? 1));
    const { data: variant, error: vErr } = await supabaseAdmin()
      .from('product_variants')
      .select('id,product_id,price,color,size,sku')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .eq('id', body.productVariantId)
      .single();
    if (vErr || !variant) {
      return apiError(`No variant ${body.productVariantId}.`, 404);
    }
    const unitPrice = variant.price as number;
    const total = Math.round(unitPrice * quantity * 100) / 100;

    // Fulfillment route: chosen supplier priority 1 for this variant.
    const { data: routes } = await supabaseAdmin()
      .from('variant_fulfillment_routes')
      .select('supplier_catalog_variant_id,supplier_id,priority,cost_snapshot,lead_time_days')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .eq('product_variant_id', body.productVariantId)
      .order('priority', { ascending: true })
      .limit(1);
    const route = routes?.[0];

    const orderNumber = `POD-${Date.now().toString(36).toUpperCase()}`;
    const { data: order, error: oErr } = await supabaseAdmin()
      .from('erp_orders')
      .insert({
        id: randomUUID(),
        tenant_id: DEFAULT_TENANT_ID,
        order_number: orderNumber,
        status: 'draft',
        fulfillment_method: 'POD',
        currency: 'USD',
        subtotal: total,
        total,
        customer_email: body.customerEmail ?? null,
        metadata: {},
        notes: `POD order from published variant ${variant.sku ?? variant.id}`,
      })
      .select('id,order_number,status,total')
      .single();
    if (oErr || !order) {
      return apiError(`Order insert failed: ${oErr?.message ?? 'unknown'}.`);
    }
    // The line goes to erp_order_lines (the live order world) — NOT the
    // legacy order_items table (0 rows; nothing reads it). sku_id IS the
    // product_variant id, which is what the POD route resolution keys on.
    const { data: product } = await supabaseAdmin()
      .from('products')
      .select('name')
      .eq('id', variant.product_id as string)
      .single();
    const { data: item, error: iErr } = await supabaseAdmin()
      .from('erp_order_lines')
      .insert({
        id: randomUUID(),
        tenant_id: DEFAULT_TENANT_ID,
        order_id: order.id,
        sku_id: body.productVariantId,
        description: (product?.name as string) || variant.sku || 'POD item',
        design_publication_id: body.designPublicationId ?? null,
        supplier_catalog_variant_id: route?.supplier_catalog_variant_id ?? null,
        quantity,
        unit_price: unitPrice,
        line_total: total,
        status: 'pending',
      })
      .select('id')
      .single();
    if (iErr || !item) {
      return apiError(`Order item insert failed: ${iErr?.message ?? 'unknown'}.`);
    }
    return NextResponse.json(
      {
        orderId: order.id,
        orderNumber: order.order_number,
        status: order.status,
        total: order.total,
        fulfillmentRoute: route
          ? {
              supplierCatalogVariantId: route.supplier_catalog_variant_id,
              costSnapshot: route.cost_snapshot,
              leadTimeDays: route.lead_time_days,
            }
          : null,
      },
      { status: 201 },
    );
  } catch (err) {
    return apiError(err instanceof Error ? err.message : 'Failed to create order.');
  }
}

/* ── GET /api/v1/orders — orders list (doc 14 gap). Reads erp_orders
   with per-order line counts; displayStatus follows the OrdersList tab
   vocabulary. Sort: needs-attention first, then date desc. ── */
export async function GET(req: NextRequest) {
  try {
    const sp = new URL(req.url).searchParams;
    const q = (sp.get('q') || '').toLowerCase();
    const { data: orders, error } = await supabaseAdmin()
      .from('erp_orders')
      .select('*')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .order('needs_attention', { ascending: false })
      .order('order_date', { ascending: false })
      .limit(200);
    if (error) return apiError(error.message);

    const ids = (orders || []).map((o) => o.id as string);
    const counts = new Map<string, number>();
    const thumbs = new Map<string, string>();
    const inProduction = new Set<string>();
    if (ids.length) {
      const { data: lines } = await supabaseAdmin()
        .from('erp_order_lines')
        .select('order_id,quantity,design_file_snapshot_url')
        .in('order_id', ids);
      (lines || []).forEach((l) => {
        counts.set(l.order_id as string, (counts.get(l.order_id as string) || 0) + (Number(l.quantity) || 0));
        const t = l.design_file_snapshot_url as string | undefined;
        if (t && !thumbs.has(l.order_id as string)) thumbs.set(l.order_id as string, t);
      });
      // In production = an open warehouse fulfillment order, or an open
      // dropship / POD fulfillment PO, is working the order.
      const [{ data: fuls }, { data: pos }] = await Promise.all([
        supabaseAdmin().from('erp_fulfillment_orders').select('order_id').in('order_id', ids)
          .not('status', 'in', '("cancelled","shipped","delivered","closed","completed")'),
        supabaseAdmin().from('fulfillment_orders').select('order_id').in('order_id', ids)
          .in('status', ['pending', 'processing', 'in_transit']),
      ]);
      (fuls || []).forEach((f) => inProduction.add(f.order_id as string));
      (pos || []).forEach((p) => inProduction.add(p.order_id as string));
    }

    let dtos = (orders || []).map((o) => toOrder({ ...(o as Record<string, unknown>), in_production: inProduction.has(o.id as string) }, counts.get(o.id as string) || 0, thumbs.get(o.id as string) || null));
    if (q) dtos = dtos.filter((d) => d.orderNumber.toLowerCase().includes(q) || (d.customerEmail || '').toLowerCase().includes(q) || (d.customerName || '').toLowerCase().includes(q));
    return NextResponse.json({ data: dtos });
  } catch (err) {
    return apiError(err instanceof Error ? err.message : 'Failed to list orders.');
  }
}
