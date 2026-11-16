import type { Order, OrderLine, Shipment, TrackingEvent } from './orderTypes';

/* Row → DTO mappers for the orders API (doc 14), shared by the list,
   detail, and purchasing routes. */

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export function displayStatusFor(o: Record<string, unknown>): Order['displayStatus'] {
  const s = String(o.status || '');
  if (s === 'cancelled' || s === 'canceled') return 'Canceled';
  if (s === 'returned') return 'Returned';
  if (s === 'closed' || s === 'delivered') return 'Delivered';
  // Needs attention wins over the shipped state: the order has a problem
  // (flagged, or on hold) and the Needs attention tab + the list sort
  // (needs-attention first) must surface it.
  if (o.needs_attention || o.on_hold) return 'Needs attention';
  if (s === 'fulfilled' || s === 'shipped' || s === 'in_transit' || s === 'partially_shipped') return 'Shipped';
  if (o.in_production) return 'In production';
  if (num(o.amount_paid) > 0) return 'Ready to ship';
  return 'New';
}

export function toOrder(o: Record<string, unknown>, itemCount = 0, thumbnailUrl: string | null = null): Order {
  const total = num(o.total);
  const paid = num(o.amount_paid);
  const refunded = num(o.amount_refunded);
  const meta = (o.metadata || {}) as Record<string, unknown>;
  return {
    id: String(o.id),
    orderNumber: String(o.order_number || ''),
    channel: (o.marketplace_name as string) || (o.sales_channel as string) || null,
    customerId: (o.crm_customer_id as string) || null,
    customerName: (meta.customer_name as string) || null,
    customerEmail: (o.customer_email as string) || null,
    status: String(o.status || ''),
    displayStatus: displayStatusFor(o),
    fulfillmentMethod: (o.fulfillment_method as string) || null,
    orderDate: (o.order_date as string) || null,
    promisedAt: (o.promised_at as string) || null,
    slaDueAt: (o.sla_due_at as string) || null,
    currency: String(o.currency || 'USD'),
    subtotal: num(o.subtotal),
    discountTotal: num(o.discount_total),
    taxTotal: num(o.tax_total),
    shippingTotal: num(o.shipping_total),
    total,
    amountPaid: paid,
    amountRefunded: refunded,
    balanceDue: num(o.balance_due),
    paymentStatus: refunded >= total && total > 0 ? 'refunded' : paid >= total && total > 0 ? 'paid' : paid > 0 ? 'partial' : 'unpaid',
    onHold: Boolean(o.on_hold),
    holdReason: (o.hold_reason as string) || null,
    needsAttention: Boolean(o.needs_attention),
    attentionReason: (o.attention_reason as string) || null,
    inProduction: Boolean(o.in_production),
    itemCount,
    thumbnailUrl,
    trackingNumber: (meta.tracking_number as string) || null,
    invoiceId: (meta.invoice_id as string) || null,
  };
}

export function toOrderLine(l: Record<string, unknown>): OrderLine {
  const meta = (l.metadata || {}) as Record<string, unknown>;
  return {
    id: String(l.id),
    orderId: String(l.order_id),
    sku: (l.sku as string) || null,
    name: (l.name as string) || (l.description as string) || null,
    quantity: num(l.quantity),
    unitPrice: num(l.unit_price),
    lineTotal: num(l.line_total ?? num(l.quantity) * num(l.unit_price)),
    thumbnailUrl: (meta.thumbnail_url as string) || (meta.design_thumbnail_url as string) || null,
    fulfillmentStatus: (l.fulfillment_status as string) || null,
  };
}

export function toShipment(s: Record<string, unknown>): Shipment {
  return {
    id: String(s.id),
    shipmentNumber: String(s.shipment_number || ''),
    status: String(s.status || ''),
    carrierId: (s.carrier_id as string) || null,
    trackingNumber: (s.tracking_number as string) || null,
    trackingUrl: (s.tracking_url as string) || null,
    shippedAt: (s.shipped_at as string) || null,
    labelUrl: (s.label_url as string) || null,
  };
}

export function toTrackingEvent(e: Record<string, unknown>): TrackingEvent {
  return {
    id: String(e.id),
    shipmentId: String(e.shipment_id),
    eventCode: String(e.event_code || ''),
    description: (e.description as string) || null,
    location: (e.location as string) || null,
    eventAt: String(e.event_at || ''),
  };
}
