/**
 * Inventory master DTOs — Batch F (doc 28). Canonical acct_* inventory
 * tables: acct_items, acct_item_classifications, acct_inventory_layers,
 * acct_inventory_moves, acct_inventory_layer_draws, acct_estimate_lines,
 * acct_expense_lines.
 *
 * On-hand for an item is ALWAYS the sum of its acct_inventory_moves
 * (the engine's acct_post_inventory_count reads exactly that); the
 * quantity_on_hand column on acct_items is a snapshot, never the truth.
 * Layer value is sum(qty_remaining * unit_cost) over open layers.
 */

export type ItemType =
  | 'inventory' | 'non_inventory' | 'service' | 'bundle'
  | 'gift_card' | 'discount' | 'other_charge';

export type ClassificationLevel =
  | 'department' | 'sub_department' | 'service_type' | 'sku_line';

export type MoveType =
  | 'opening' | 'receipt' | 'receipt_reversal' | 'sale' | 'sale_reversal'
  | 'customer_return' | 'vendor_return' | 'revaluation' | 'adjustment' | 'count';

export interface ItemClassification {
  id: string;
  level: ClassificationLevel;
  parentId: string | null;
  code: string;
  name: string;
  defaultIncomeAccountId: string | null;
  defaultExpenseAccountId: string | null;
  defaultCogsAccountId: string | null;
  defaultAssetAccountId: string | null;
  defaultTaxCategory: string | null;
  sortOrder: number;
  isActive: boolean;
  itemCount?: number;
}

export interface InventoryItem {
  id: string;
  classificationId: string;
  classificationName: string | null;
  classificationCode: string | null;
  itemType: ItemType;
  name: string;
  sku: string | null;
  skuId: string | null;
  skuLabel: string | null;
  productId: string | null;
  catalogItemId: string | null;
  unitOfMeasure: string;
  isSold: boolean;
  isPurchased: boolean;
  salesPrice: number | null;
  purchaseCost: number | null;
  lastUnitCost: number | null;
  incomeAccountId: string | null;
  expenseAccountId: string | null;
  cogsAccountId: string | null;
  inventoryAssetAccountId: string | null;
  preferredVendorId: string | null;
  reorderPoint: number | null;
  costingMethod: string;
  isActive: boolean;
  /** Sum of acct_inventory_moves — the engine's on-hand. */
  onHand: number;
  /** Sum of open layers (qty_remaining * unit_cost). */
  layerValue: number;
  createdAt: string;
}

export interface InventoryLayer {
  id: string;
  itemId: string;
  layerDate: string;
  sourceMoveId: string;
  qtyIn: number;
  qtyRemaining: number;
  unitCost: number;
}

export interface InventoryMove {
  id: string;
  itemId: string;
  moveDate: string;
  moveType: MoveType;
  quantity: number;
  unitCost: number;
  totalCost: number;
  sourceType: string | null;
  sourceId: string | null;
  reference: string | null;
  reason: string | null;
  journalEntryId: string | null;
}

export interface InventoryLayerDraw {
  id: string;
  moveId: string;
  layerId: string;
  layerDate: string | null;
  quantity: number;
  unitCost: number;
}

export interface ItemDetail extends InventoryItem {
  layers: InventoryLayer[];
  moves: InventoryMove[];
  draws: InventoryLayerDraw[];
}

/** One itemised estimate line — acct_estimate_lines (canonical). */
export interface EstimateLine {
  id: string;
  estimateId: string;
  lineNumber: number;
  serviceId: string | null;
  description: string;
  quantity: number;
  unitPrice: number;
  discountAmount: number;
  taxAmount: number;
  lineTotal: number;
}

/** One expense-report line — acct_expense_lines. */
export interface ExpenseLine {
  id: string;
  expenseReportId: string;
  expenseDate: string;
  merchant: string | null;
  description: string;
  amount: number;
  taxAmount: number;
  expenseAccountId: string;
  receiptUri: string | null;
  receiptHash: string | null;
}
