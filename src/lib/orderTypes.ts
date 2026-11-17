/* Orders & fulfillment DTOs (doc 14). Shapes the API routes return and
   the orders components consume. */

export interface Order {
  id: string;
  orderNumber: string;
  channel: string | null; // sales_channel / marketplace_name
  customerId: string | null;
  customerName: string | null;
  customerEmail: string | null;
  status: string; // raw erp_orders.status
  /* Spec tab vocabulary (pages-2): All · New · Needs attention ·
     In production · Ready to ship · Shipped · Delivered · Returned ·
     Canceled. 'New' = draft, unpaid, nothing started; 'In production' =
     an open fulfillment order / dropship PO is working the order. */
  displayStatus: 'New' | 'Needs attention' | 'In production' | 'Ready to ship' | 'Shipped' | 'Delivered' | 'Returned' | 'Canceled';
  inProduction: boolean;
  fulfillmentMethod: string | null;
  orderDate: string | null;
  promisedAt: string | null;
  slaDueAt: string | null;
  currency: string;
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  shippingTotal: number;
  total: number;
  amountPaid: number;
  amountRefunded: number;
  balanceDue: number;
  paymentStatus: 'paid' | 'partial' | 'unpaid' | 'refunded';
  onHold: boolean;
  holdReason: string | null;
  needsAttention: boolean;
  attentionReason: string | null;
  itemCount: number;
  thumbnailUrl: string | null;
  trackingNumber: string | null;
  invoiceId: string | null;
}

export interface OrderLine {
  id: string;
  orderId: string;
  sku: string | null;
  name: string | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  thumbnailUrl: string | null;
  fulfillmentStatus: string | null;
}

export interface Shipment {
  id: string;
  shipmentNumber: string;
  status: string;
  carrierId: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
  shippedAt: string | null;
  labelUrl: string | null;
}

export interface TrackingEvent {
  id: string;
  shipmentId: string;
  eventCode: string;
  description: string | null;
  location: string | null;
  eventAt: string;
}

export interface OrderNote {
  id: string;
  body: string;
  noteType: string | null;
  createdAt: string;
}

export interface OrderDetail extends Order {
  lines: OrderLine[];
  shipments: Shipment[];
  trackingEvents: TrackingEvent[];
  notes: OrderNote[];
}

export interface ShippingLabel {
  id: string;
  orderId: string | null;
  carrier: string | null;
  service: string | null;
  trackingNumber: string | null;
  labelUrl: string | null;
  status: string | null;
  createdAt: string;
}

export interface BatchSlip {
  id: string;
  batchNumber: string;
  orderCount: number;
  status: string | null;
  createdAt: string;
}

export interface Carrier {
  id: string;
  name: string;
  code: string | null;
  isActive: boolean;
}

export interface ShippingMethod {
  id: string;
  carrierId: string | null;
  name: string;
  code: string | null;
  isActive: boolean;
}
