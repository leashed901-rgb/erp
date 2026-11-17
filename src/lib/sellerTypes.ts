/* Marketplace seller types (doc 21). Seller, SellerProfile,
   SellerViolation and SellerAppeal already live in
   hooks/useSellersApi.ts; the settlements types formalized here are
   the ones the doc names as missing. Money crosses the API in
   dollars; seller_settlements stores cents. */

export interface SellerSettlement {
  id: string;
  tenantId: string;
  sellerId: string;
  orderId: string;
  sellerOrderId: string | null;
  via: string | null;
  state: string; // pending|settled|partially_reversed|reversed
  pendingReason: string | null;
  items: number;
  shipping: number;
  discount: number;
  gross: number;
  commission: number;
  fees: number;
  net: number;
  currency: string;
  stripeAccountId: string | null;
  stripeTransferId: string | null;
  stripeChargeId: string | null;
  executeAfter: string | null;
  executedAt: string | null;
  createdAt: string;
}

export interface SellerSettlementReversal {
  id: string;
  tenantId: string;
  settlementId: string;
  orderId: string;
  sellerId: string;
  stripeRefundId: string;
  stripeReversalId: string | null;
  amount: number;
  commissionReversed: number;
  netReversed: number;
  state: string; // recorded|transfer_reversed|no_transfer
  createdAt: string;
}

type Row = Record<string, unknown>;
const cents = (v: unknown) => (v != null && !Number.isNaN(Number(v)) ? Number(v) / 100 : 0);

export function toSellerSettlement(r: Row): SellerSettlement {
  return {
    id: String(r.id),
    tenantId: String(r.tenant_id || ''),
    sellerId: String(r.seller_id || ''),
    orderId: String(r.order_id || ''),
    sellerOrderId: (r.seller_order_id as string) || null,
    via: (r.via as string) || null,
    state: String(r.state || 'pending'),
    pendingReason: (r.pending_reason as string) || null,
    items: cents(r.items_cents),
    shipping: cents(r.shipping_cents),
    discount: cents(r.discount_cents),
    gross: cents(r.gross_cents),
    commission: cents(r.commission_cents),
    fees: cents(r.fees_cents),
    net: cents(r.net_cents),
    currency: String(r.currency || 'USD'),
    stripeAccountId: (r.stripe_account_id as string) || null,
    stripeTransferId: (r.stripe_transfer_id as string) || null,
    stripeChargeId: (r.stripe_charge_id as string) || null,
    executeAfter: (r.execute_after as string) || null,
    executedAt: (r.executed_at as string) || null,
    createdAt: String(r.created_at || ''),
  };
}

export function toSellerSettlementReversal(r: Row): SellerSettlementReversal {
  return {
    id: String(r.id),
    tenantId: String(r.tenant_id || ''),
    settlementId: String(r.settlement_id || ''),
    orderId: String(r.order_id || ''),
    sellerId: String(r.seller_id || ''),
    stripeRefundId: String(r.stripe_refund_id || ''),
    stripeReversalId: (r.stripe_reversal_id as string) || null,
    amount: cents(r.amount_cents),
    commissionReversed: cents(r.commission_reversed_cents),
    netReversed: cents(r.net_reversed_cents),
    state: String(r.state || 'recorded'),
    createdAt: String(r.created_at || ''),
  };
}
