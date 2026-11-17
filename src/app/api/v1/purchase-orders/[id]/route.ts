import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { toPurchaseOrder, toPurchaseOrderLine, toGoodsReceipt } from '@/lib/purchaseDto';
import type { PurchaseOrderDetail } from '@/lib/purchasingTypes';

const err = (code: string, message: string, status: number) =>
  NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });

/** GET /api/v1/purchase-orders/[id] — PO detail with lines + receipts
 *  (the 3-way match view: PO ↔ receipt ↔ bill via apBillId). */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = supabaseAdmin();
  const { data: po, error } = await sb
    .from('erp_purchase_orders')
    .select('*')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('id', id)
    .maybeSingle();
  if (error) return err('INTERNAL', error.message, 500);
  if (!po) return err('NOT_FOUND', 'Purchase order not found', 404);

  const [lines, receipts, vendor] = await Promise.all([
    sb.from('erp_purchase_order_lines').select('*').eq('purchase_order_id', id).order('created_at', { ascending: true }),
    sb.from('erp_goods_receipts').select('*').eq('purchase_order_id', id).order('created_at', { ascending: false }),
    po.vendor_id
      ? sb.from('acct_vendors').select('display_name').eq('id', po.vendor_id as string).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const receiptRows = (receipts.data || []) as Record<string, unknown>[];
  const receiptLines = new Map<string, Record<string, unknown>[]>();
  if (receiptRows.length) {
    const { data: rl } = await sb.from('erp_goods_receipt_lines').select('*').in('receipt_id', receiptRows.map((r) => r.id as string));
    (rl || []).forEach((l) => {
      const arr = receiptLines.get(l.receipt_id as string) || [];
      arr.push(l as Record<string, unknown>);
      receiptLines.set(l.receipt_id as string, arr);
    });
  }

  const lineRows = (lines.data || []) as Record<string, unknown>[];
  const skuIds = [...new Set(lineRows.map((l) => l.sku_id).filter(Boolean))] as string[];
  if (skuIds.length) {
    const { data: skus } = await sb.from('erp_product_skus').select('id, sku').in('id', skuIds);
    const skuById = new Map(((skus || []) as Record<string, unknown>[]).map((r) => [String(r.id), String(r.sku || '')]));
    lineRows.forEach((l) => { if (l.sku_id) l.sku = skuById.get(String(l.sku_id)) || null; });
  }
  const detail: PurchaseOrderDetail = {
    ...toPurchaseOrder(po as Record<string, unknown>, (vendor.data?.display_name as string) || null, lineRows),
    lines: lineRows.map(toPurchaseOrderLine),
    receipts: receiptRows.map((r) => toGoodsReceipt(r, receiptLines.get(r.id as string) || [])),
  };
  return NextResponse.json({ data: detail });
}

const PO_STATUSES = ['draft', 'sent', 'confirmed', 'approved', 'partially_received', 'receiving', 'received', 'closed', 'cancelled'];

/** PATCH /api/v1/purchase-orders/[id] — header + status edits, and a
 *  full line replace while nothing has been received yet (lines lock
 *  once receiving starts so the 3-way match stays intact). */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return err('VALIDATION', 'Invalid JSON', 400); }
  const sb = supabaseAdmin();
  const { data: po, error: readErr } = await sb
    .from('erp_purchase_orders')
    .select('id, shipping_total, tax_total')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('id', id)
    .maybeSingle();
  if (readErr) return err('INTERNAL', readErr.message, 500);
  if (!po) return err('NOT_FOUND', 'Purchase order not found', 404);

  const updates: Record<string, unknown> = {};
  if (typeof body.vendorId === 'string') updates.vendor_id = body.vendorId;
  if (typeof body.orderDate === 'string') updates.order_date = body.orderDate;
  if (typeof body.expectedDate === 'string' || body.expectedDate === null) updates.expected_date = body.expectedDate;
  if (typeof body.notes === 'string') updates.notes = body.notes;
  if (typeof body.status === 'string') {
    if (!PO_STATUSES.includes(body.status)) return err('VALIDATION', `Unknown status ${body.status}`, 400);
    updates.status = body.status;
  }

  const lines = body.lines as Record<string, unknown>[] | undefined;
  if (Array.isArray(lines)) {
    const { data: existing } = await sb
      .from('erp_purchase_order_lines')
      .select('quantity_received')
      .eq('purchase_order_id', id);
    if ((existing || []).some((l) => Number((l as Record<string, unknown>).quantity_received) > 0)) {
      return err('CONFLICT', 'Lines are locked — receiving has started on this purchase order', 409);
    }
    const { error: delErr } = await sb.from('erp_purchase_order_lines').delete().eq('purchase_order_id', id);
    if (delErr) return err('INTERNAL', delErr.message, 500);
    if (lines.length) {
      const { error: insErr } = await sb.from('erp_purchase_order_lines').insert(lines.map((l) => ({
        tenant_id: DEFAULT_TENANT_ID,
        purchase_order_id: id,
        sku_id: l.skuId ? String(l.skuId) : null,
        description: l.description ? String(l.description) : null,
        quantity: Number(l.quantity) || 0,
        quantity_ordered: Number(l.quantity) || 0,
        quantity_received: 0,
        unit_cost: Number(l.unitCost) || 0,
        line_total: (Number(l.quantity) || 0) * (Number(l.unitCost) || 0),
      })));
      if (insErr) return err('INTERNAL', insErr.message, 500);
    }
    const subtotal = lines.reduce((sum, l) => sum + (Number(l.quantity) || 0) * (Number(l.unitCost) || 0), 0);
    updates.subtotal = subtotal;
    updates.total = subtotal + Number(po.shipping_total || 0) + Number(po.tax_total || 0);
  }

  if (Object.keys(updates).length) {
    const { error: updErr } = await sb.from('erp_purchase_orders').update(updates).eq('tenant_id', DEFAULT_TENANT_ID).eq('id', id);
    if (updErr) return err('INTERNAL', updErr.message, 500);
  }
  return NextResponse.json({ data: { id, updated: true } });
}
