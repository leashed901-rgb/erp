import type { PurchaseOrderDef, PurchaseOrderLine, GoodsReceipt } from './purchasingTypes';

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export function poDisplayStatus(status: string): PurchaseOrderDef['displayStatus'] {
  switch (status) {
    case 'draft': return 'Draft';
    case 'sent': case 'confirmed': case 'approved': return 'Confirmed';
    case 'partially_received': case 'receiving': return 'Receiving';
    case 'received': return 'Received';
    case 'closed': return 'Closed';
    case 'cancelled': case 'canceled': return 'Cancelled';
    default: return 'Draft';
  }
}

export function toPurchaseOrder(
  p: Record<string, unknown>,
  vendorName: string | null,
  lines: Record<string, unknown>[],
): PurchaseOrderDef {
  const ordered = lines.reduce((s, l) => s + num(l.quantity_ordered ?? l.quantity), 0);
  const received = lines.reduce((s, l) => s + num(l.quantity_received), 0);
  const expected = (p.expected_date as string) || (p.expected_at as string) || null;
  const status = String(p.status || 'draft');
  return {
    id: String(p.id),
    poNumber: String(p.po_number || ''),
    vendorId: (p.vendor_id as string) || null,
    vendorName,
    status,
    displayStatus: poDisplayStatus(status),
    orderDate: (p.order_date as string) || null,
    expectedDate: expected,
    expectedOverdue: Boolean(expected && new Date(expected) < new Date() && !['received', 'closed', 'cancelled'].includes(status)),
    receivedAt: (p.received_at as string) || null,
    currency: String(p.currency || 'USD'),
    subtotal: num(p.subtotal),
    taxTotal: num(p.tax_total),
    shippingTotal: num(p.shipping_total),
    total: num(p.total),
    apBillId: (p.ap_bill_id as string) || null,
    warehouseId: (p.warehouse_id as string) || null,
    itemCount: ordered,
    receivedPct: ordered > 0 ? Math.round((received / ordered) * 100) : 0,
    linkedOrderIds: [],
    notes: (p.notes as string) || null,
  };
}

export function toPurchaseOrderLine(l: Record<string, unknown>): PurchaseOrderLine {
  return {
    id: String(l.id),
    purchaseOrderId: String(l.purchase_order_id),
    skuId: (l.sku_id as string) || null,
    sku: (l.sku as string) || null,
    description: (l.description as string) || null,
    quantityOrdered: num(l.quantity_ordered ?? l.quantity),
    quantityReceived: num(l.quantity_received),
    unitCost: num(l.unit_cost),
    lineTotal: num(l.line_total),
    taxAmount: num(l.tax_amount),
  };
}

export function toGoodsReceipt(r: Record<string, unknown>, lines: Record<string, unknown>[]): GoodsReceipt {
  return {
    id: String(r.id),
    receiptNumber: (r.receipt_number as string) || null,
    purchaseOrderId: String(r.purchase_order_id),
    warehouseId: (r.warehouse_id as string) || null,
    status: String(r.status || ''),
    receivedAt: (r.received_at as string) || null,
    notes: (r.notes as string) || null,
    lines: lines.map((l) => ({
      id: String(l.id),
      purchaseOrderLineId: (l.purchase_order_line_id as string) || null,
      quantityReceived: num(l.quantity_received),
      unitCost: num(l.unit_cost),
    })),
  };
}
