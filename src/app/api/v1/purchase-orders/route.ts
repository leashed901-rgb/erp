import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { toPurchaseOrder } from '@/lib/purchaseDto';

const err = (code: string, message: string, status: number) =>
  NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });

async function vendorNames(sb: ReturnType<typeof supabaseAdmin>, ids: string[]) {
  const map = new Map<string, string>();
  if (!ids.length) return map;
  const { data } = await sb.from('acct_vendors').select('id,display_name').in('id', ids);
  (data || []).forEach((v) => map.set(String(v.id), String(v.display_name || '')));
  return map;
}

/** GET /api/v1/purchase-orders — PO list (doc 15): supplier, dates,
 *  status, total, received % from erp_purchase_order_lines. */
export async function GET(req: NextRequest) {
  const q = (new URL(req.url).searchParams.get('q') || '').toLowerCase();
  const sb = supabaseAdmin();
  const { data: pos, error } = await sb
    .from('erp_purchase_orders')
    .select('*')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .order('order_date', { ascending: false })
    .limit(200);
  if (error) return err('INTERNAL', error.message, 500);

  const ids = (pos || []).map((p) => p.id as string);
  const linesByPo = new Map<string, Record<string, unknown>[]>();
  if (ids.length) {
    const { data: lines } = await sb.from('erp_purchase_order_lines').select('*').in('purchase_order_id', ids);
    (lines || []).forEach((l) => {
      const arr = linesByPo.get(l.purchase_order_id as string) || [];
      arr.push(l as Record<string, unknown>);
      linesByPo.set(l.purchase_order_id as string, arr);
    });
  }
  const names = await vendorNames(sb, [...new Set((pos || []).map((p) => p.vendor_id as string).filter(Boolean))]);
  let dtos = (pos || []).map((p) => toPurchaseOrder(p as Record<string, unknown>, names.get(p.vendor_id as string) || null, linesByPo.get(p.id as string) || []));
  if (q) dtos = dtos.filter((d) => d.poNumber.toLowerCase().includes(q) || (d.vendorName || '').toLowerCase().includes(q));
  return NextResponse.json({ data: dtos });
}

/** POST /api/v1/purchase-orders — registry create.purchase_order →
 *  erp_purchase_orders (+ lines). */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return err('VALIDATION', 'Invalid JSON', 400); }
  const lines = (body.lines as Record<string, unknown>[] | undefined) || [];
  if (!body.vendorId) return err('VALIDATION', 'vendorId is required', 400);
  if (!lines.length) return err('VALIDATION', 'at least one line is required', 400);
  const sb = supabaseAdmin();

  let poNumber = body.poNumber ? String(body.poNumber) : '';
  if (!poNumber) {
    const { data: seq } = await sb.rpc('erp_next_document_number', { p_tenant_id: DEFAULT_TENANT_ID, p_kind: 'purchase_order' });
    poNumber = typeof seq === 'string' && seq ? seq : `PO-${Date.now().toString(36).toUpperCase()}`;
  }
  const subtotal = lines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.unitCost) || 0), 0);
  const { data: po, error } = await sb
    .from('erp_purchase_orders')
    .insert({
      tenant_id: DEFAULT_TENANT_ID,
      po_number: poNumber,
      vendor_id: body.vendorId ? String(body.vendorId) : null,
      status: 'draft',
      order_date: body.orderDate ? String(body.orderDate) : new Date().toISOString().slice(0, 10),
      expected_date: body.expectedDate ? String(body.expectedDate) : null,
      currency: body.currency ? String(body.currency) : 'USD',
      subtotal,
      total: subtotal,
      warehouse_id: body.warehouseId ? String(body.warehouseId) : null,
      notes: body.notes ? String(body.notes) : null,
    })
    .select('*')
    .single();
  if (error) return err('INTERNAL', error.message, 500);

  if (lines.length) {
    const { error: lineErr } = await sb.from('erp_purchase_order_lines').insert(lines.map((l) => ({
      tenant_id: DEFAULT_TENANT_ID,
      purchase_order_id: po.id,
      sku_id: l.skuId ? String(l.skuId) : null,
      description: l.description ? String(l.description) : null,
      quantity: Number(l.quantity) || 0,
      quantity_ordered: Number(l.quantity) || 0,
      quantity_received: 0,
      unit_cost: Number(l.unitCost) || 0,
      line_total: (Number(l.quantity) || 0) * (Number(l.unitCost) || 0),
    })));
    if (lineErr) return err('INTERNAL', lineErr.message, 500);
  }
  return NextResponse.json({ data: { id: po.id, poNumber: po.po_number } }, { status: 201 });
}
