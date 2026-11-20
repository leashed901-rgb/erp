/**
 * @platform/shared — the cross-package contract types.
 * The five shared records, the API Result envelope, and the storefront
 * order/product payloads. Empty-by-design areas fill in as screens move
 * off seed data (see the documentation package, 06-gap-register.md).
 */

export type Result<T> = { ok: true; data: T } | { ok: false; error: string };

export interface Party {
  id: string;
  tenantId: string;
  kind: 'person' | 'company';
  displayName: string;
  email?: string | null;
  phone?: string | null;
  roles: string[]; // 'customer' | 'vendor' | 'seller' | 'supplier' | …
}

export interface Item {
  id: string;
  tenantId: string;
  sku: string;
  title: string;
  priceCents: number;
  currency: string;
  published: boolean;
}

export interface DocumentRef {
  id: string;
  kind: string; // 'invoice' | 'po' | 'rfq' | 'techpack' | …
  status: string;
  partyId?: string | null;
  totalCents?: number | null;
}

export interface MoneyMovement {
  id: string;
  direction: 'in' | 'out';
  amountCents: number;
  currency: string;
  method: string;
  occurredAt: string;
}

export interface Account {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  accountType: string;
  normalBalance: 'debit' | 'credit';
}

/* ── Storefront API payloads (apps/api) ── */
export interface StorefrontOrderItem {
  productId: string;
  variantId?: string;
  quantity: number;
  unitPriceCents?: number;
}

export interface StorefrontOrderRequest {
  items: StorefrontOrderItem[];
  shipping?: Record<string, unknown>;
  idempotencyKey?: string;
}
