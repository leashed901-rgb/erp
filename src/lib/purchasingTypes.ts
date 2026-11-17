/* Purchasing DTOs (doc 15). */

export interface PurchaseOrderLine {
  id: string;
  purchaseOrderId: string;
  skuId: string | null;
  sku: string | null;
  description: string | null;
  quantityOrdered: number;
  quantityReceived: number;
  unitCost: number;
  lineTotal: number;
  taxAmount: number;
}

export interface PurchaseOrderDef {
  id: string;
  poNumber: string;
  vendorId: string | null;
  vendorName: string | null;
  status: string; // raw erp_purchase_orders.status
  displayStatus: 'Draft' | 'Confirmed' | 'Receiving' | 'Received' | 'Closed' | 'Cancelled';
  orderDate: string | null;
  expectedDate: string | null;
  expectedOverdue: boolean;
  receivedAt: string | null;
  currency: string;
  subtotal: number;
  taxTotal: number;
  shippingTotal: number;
  total: number;
  apBillId: string | null;
  warehouseId: string | null;
  itemCount: number;
  receivedPct: number; // 0-100 across lines
  linkedOrderIds: string[];
  notes: string | null;
}

export interface PurchaseOrderDetail extends PurchaseOrderDef {
  lines: PurchaseOrderLine[];
  receipts: GoodsReceipt[];
}

export interface GoodsReceipt {
  id: string;
  receiptNumber: string | null;
  purchaseOrderId: string;
  warehouseId: string | null;
  status: string;
  receivedAt: string | null;
  notes: string | null;
  lines: { id: string; purchaseOrderLineId: string | null; quantityReceived: number; unitCost: number }[];
}
