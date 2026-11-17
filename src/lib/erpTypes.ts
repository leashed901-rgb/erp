/**
 * erpTypes.ts — the doc 16/17/18 record shapes.
 * StockRecord / StockMovement / CycleCount / ReplenishmentRule (doc 16),
 * ReturnRequest / ReturnResolution (doc 17),
 * CatalogItem / Variant / ChannelListing / PublishState (doc 18).
 * Every field maps to a real table column or RPC result — nothing invented.
 */

export interface StockRecord {
  variantId: string;
  productId: string;
  product: string;
  sku: string;
  skuId: string | null;
  size: string | null;
  color: string | null;
  price: number | null;
  fulfillmentType: string | null;
  /** POD / digital / supplier-fulfilled variants never carry stock. */
  trackInventory: boolean;
  warehouseId: string | null;
  warehouse: string | null;
  bin: string | null;
  onHand: number;
  reserved: number;
  available: number;
  reorderPoint: number | null;
  incomingQty: number;
  /** On-hand value at standard cost; null when no cost is recorded. */
  value: number | null;
  stockSource: 'ledger' | 'variant';
  status: 'In stock' | 'Low stock' | 'Out of stock' | 'Overstock' | 'Negative';
}

export interface StockMovement {
  id: string;
  occurredAt: string;
  movementType: string;
  warehouse: string | null;
  quantity: number;
  runningOnHand: number | null;
  unitCost: number | null;
  sourceType: string | null;
  reference: string | null;
  reason: string | null;
  affectsStock: boolean;
}

export interface CycleCount {
  id: string;
  countNumber: string;
  warehouseId: string;
  warehouseName: string | null;
  locationId: string | null;
  countType: string;
  status: string;
  scheduledFor: string | null;
  startedAt: string | null;
  submittedAt: string | null;
  postedAt: string | null;
  lines: CycleCountLine[];
}

export interface CycleCountLine {
  id: string;
  skuId: string;
  sku: string | null;
  product: string | null;
  locationId: string;
  expectedQuantity: number;
  countedQuantity: number | null;
  varianceQuantity: number | null;
}

export interface ReplenishmentRule {
  id: string;
  skuId: string;
  sku: string | null;
  product: string | null;
  warehouseId: string;
  warehouse: string | null;
  method: string;
  reorderPoint: number;
  safetyStock: number;
  maximumStock: number | null;
  economicOrderQuantity: number | null;
  leadTimeDays: number;
  preferredVendorId: string | null;
  preferredVendor: string | null;
  isActive: boolean;
}

export interface ReturnRequest {
  id: string;
  rmaNumber: string;
  orderId: string;
  orderNumber: string | null;
  customerId: string | null;
  customer: string | null;
  status: string;
  reasonCode: string | null;
  requestedAt: string;
  approvedAt: string | null;
  receivedAt: string | null;
  completedAt: string | null;
  notes: string | null;
  lines: ReturnLine[];
  inspections: ReturnInspection[];
  refunds: ReturnRefund[];
}

export interface ReturnLine {
  id: string;
  orderLineId: string;
  skuId: string;
  description: string | null;
  quantityRequested: number;
  quantityApproved: number;
  quantityReceived: number;
  disposition: string | null;
  refundAmount: number;
}

export interface ReturnInspection {
  id: string;
  returnLineId: string;
  conditionCode: string | null;
  disposition: string | null;
  notes: string | null;
  inspectedAt: string;
}

export interface ReturnRefund {
  id: string;
  amount: number;
  currency: string;
  status: string;
  processedAt: string | null;
}

export type ReturnResolution = 'refund' | 'exchange' | 'store_credit' | 'repair';

export interface CatalogItem {
  id: string;
  name: string;
  slug: string;
  status: string;
  fulfillmentType: string | null;
  supplier: string | null;
  price: number | null;
  variantCount: number;
}

export interface Variant {
  id: string;
  productId: string;
  sku: string | null;
  size: string | null;
  color: string | null;
  price: number | null;
  compareAtPrice: number | null;
  isActive: boolean;
  status: string | null;
}

export interface ChannelListing {
  id: string;
  channelId: string;
  channelCode: string;
  channelName: string;
  published: boolean;
  syncStatus: string;
  syncError: string | null;
  lastSyncedAt: string | null;
  externalUrl: string | null;
}

export type PublishState = 'draft' | 'published' | 'archived';
