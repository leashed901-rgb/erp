/**
 * contracts.ts — the type contracts for the Unified Platform.
 * Every component, config, API request, and API response uses these types.
 * Derived from the Master Spec (Part A component map + Part B build spec).
 *
 * Rule: configs drive the UI. Write ~10 generic components once, then
 * ~40 small ViewDef/DrawerDef/DocumentDef configs instead of 40
 * hand-built screens.
 */

// ═══════════════════════════════════════════════════════════════
// PART 1 — Shared entity types (the five entity families)
// ═══════════════════════════════════════════════════════════════

export type PartyRole = 'Customer' | 'Vendor' | 'Supplier' | 'Contractor' | 'Seller' | 'Lead' | 'Stakeholder';

export interface Party {
  id: string;
  name: string;
  displayName: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  roles: PartyRole[];
  balance: number;
  lifetimeValue: number;
  lifecycleStage: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  country: string | null;
  source: string;
  [key: string]: unknown;
}

export type ItemType = 'Product' | 'Service' | 'Blank' | 'Bundle' | 'GiftCard' | 'Subscription' | 'DesignLinked';
export type FulfillmentType = 'Stock' | 'POD' | 'SupplierFulfilled' | 'Digital' | 'Bundle';

export interface Item {
  id: string;
  name: string;
  sku: string | null;
  type: ItemType;
  fulfillmentType: FulfillmentType;
  category: string | null;
  price: number;
  cost: number | null;
  margin: number | null;
  stock: number | null;
  status: 'Draft' | 'Published' | 'Archived';
  supplierId: string | null;
  designId: string | null;
  channels: string[];
  image: string | null;
  [key: string]: unknown;
}

export type DocumentType =
  | 'Invoice' | 'Estimate' | 'SalesReceipt' | 'CreditMemo' | 'SalesOrder'
  | 'Bill' | 'Expense' | 'Check' | 'PurchaseOrder' | 'VendorCredit'
  | 'JournalEntry' | 'RMA';

export type DocumentStatus =
  | 'Draft' | 'Sent' | 'Unpaid' | 'Overdue' | 'Paid' | 'Deposited'
  | 'ForReview' | 'Approved' | 'Shipped' | 'Delivered' | 'Returned'
  | 'PartiallyReceived' | 'Received' | 'Closed' | 'Void' | 'Open'
  | 'Converted' | 'Declined' | 'Pending' | 'Requested' | 'Fulfilled'
  | 'Printed' | 'Applied' | 'Posted';

export interface DocumentLine {
  id: string;
  itemId: string | null;
  description: string;
  qty: number;
  rate: number;
  amount: number;
  taxRate: number;
  account: string;
  tags: string[];
}

export interface Document {
  id: string;
  type: DocumentType;
  number: string;
  partyId: string;
  status: DocumentStatus;
  date: string;
  dueDate: string;
  lines: DocumentLine[];
  subtotal: number;
  tax: number;
  shipping: number;
  total: number;
  amountPaid: number;
  balance: number;
  memo: string;
  notes: string;
  tags: string[];
  attachments: string[];
  orderId: string | null;
  poId: string | null;
  channelId: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  activity: ActivityEntry[];
}

export type MoneyMovementType = 'Payment' | 'PaymentLink' | 'Deposit' | 'Transfer' | 'Settlement' | 'Refund';

export interface MoneyMovement {
  id: string;
  type: MoneyMovementType;
  amount: number;
  date: string;
  method: string;
  fromAccount: string;
  toAccount: string;
  partyId: string | null;
  documentId: string | null;
  reference: string;
  status: 'Cleared' | 'Pending' | 'Failed';
  memo: string;
  createdBy: string;
}

export type AccountType = 'Bank' | 'CreditCard' | 'Loan' | 'LineOfCredit' | 'Asset' | 'Liability' | 'Equity' | 'Income' | 'COGS' | 'Expense';

export interface Account {
  id: string;
  name: string;
  number: string;
  type: AccountType;
  detailType: string;
  balance: number;
  bankBalance: number | null;
  isActive: boolean;
  parentId: string | null;
  openingBalance: number | null;
}

// ═══════════════════════════════════════════════════════════════
// PART 2 — Pill vocabulary (spec §1.6)
// ═══════════════════════════════════════════════════════════════

export type PillType = 'status' | 'relation' | 'party' | 'channel' | 'alert' | 'tag' | 'fulfillment';

export interface Pill {
  type: PillType;
  label: string;
  color?: string;
  // For relation/party pills — the target to open on click
  targetType?: string;
  targetId?: string;
  // For status pills — next legal states
  nextStates?: string[];
  // For alert pills — the fix surface to open
  fixSurface?: SurfaceRequest;
}

// ═══════════════════════════════════════════════════════════════
// PART 3 — Surface types (spec §1.2)
// ═══════════════════════════════════════════════════════════════

export type SurfaceType = 'peek' | 'modal' | 'drawer' | 'page' | 'workspace' | 'studio';

export interface SurfaceRequest {
  type: SurfaceType;
  /** The entity/document type to render */
  entity: string;
  /** The specific record ID (null = create new) */
  id?: string | null;
  /** Width for drawers: 480 (standard) or 720 (wide) */
  width?: 480 | 720;
  /** The envelope to prefill from */
  envelope?: Envelope;
  /** For modals: which modal variant */
  variant?: string;
  /** For document pages: which DocumentDef config */
  documentType?: DocumentType;
  /** For table views: which ViewDef */
  viewId?: string;
  /** Active tab inside the surface */
  activeTab?: string;
  /** Dirty state — guards close */
  dirty?: boolean;
}

// ═══════════════════════════════════════════════════════════════
// PART 4 — Context Envelope (spec §1.3)
// ═══════════════════════════════════════════════════════════════

export interface Envelope {
  origin_module: string;
  origin_record_id: string | null;
  origin_tab_id: string | null;
  party_id: string | null;
  order_id: string | null;
  item_id: string | null;
  design_id: string | null;
  account_id: string | null;
  channel_id: string | null;
  currency: string;
  date_range: { start: string | null; end: string | null };
  return_to: string | null;
}

// ═══════════════════════════════════════════════════════════════
// PART 5 — ViewDef (config-driven table, spec §B.5)
// ═══════════════════════════════════════════════════════════════

export type ColumnKind = 'text' | 'date' | 'money' | 'status' | 'party' | 'pill' | 'count' | 'image' | 'tag';

export interface ViewColumn {
  id: string;
  label: string;
  kind: ColumnKind;
  sortable?: boolean;
  defaultVisible?: boolean;
  align?: 'left' | 'right' | 'center';
  width?: string;
  // For party columns: which role to filter
  roleFilter?: PartyRole;
}

export interface StatusTab {
  id: string;
  label: string;
  filter: Record<string, unknown>;
  count?: number;
}

export interface ViewFilter {
  id: string;
  label: string;
  kind: 'party' | 'date_range' | 'tag' | 'select' | 'text';
  options?: { value: string; label: string }[];
}

export interface ViewDef {
  id: string;
  entity: string;
  /** For document views (invoices, bills, etc.) */
  documentType?: DocumentType;
  title: string;
  columns: ViewColumn[];
  defaultSort: string;
  statusTabs?: StatusTab[];
  filters?: ViewFilter[];
  /** What opens on row click: 'drawer' for records, 'page' for documents */
  rowClick: 'drawer' | 'page';
  bulkActions?: string[];
  supportsImport?: boolean;
  supportsExport?: boolean;
  totalsFooter?: string[];
  /** API endpoint for list data */
  apiPath: string;
}

// ═══════════════════════════════════════════════════════════════
// PART 6 — DrawerDef (config-driven record drawers, spec §B.2.5)
// ═══════════════════════════════════════════════════════════════

export type FieldType = 'text' | 'email' | 'phone' | 'number' | 'money' | 'date' | 'select' | 'textarea' | 'checkbox' | 'tags' | 'picker';

export interface DrawerField {
  id: string;
  label: string;
  type: FieldType;
  required?: boolean;
  placeholder?: string;
  options?: { value: string; label: string }[];
  /** For picker fields: which entity to search */
  pickerEntity?: string;
  pickerRole?: PartyRole;
  /** Tier 3 fields: require change preview before save */
  impactTier?: 1 | 2 | 3 | 4;
}

export interface DrawerSection {
  id: string;
  label: string;
  fields: DrawerField[];
  /** Optional slot for custom React content */
  slot?: string;
}

export interface DrawerDef {
  id: string;
  entity: string;
  title: string;
  width: 480 | 720;
  sections: DrawerSection[];
  /** Footer buttons */
  saveAndNew?: boolean;
  saveAndPush?: boolean;
  /** API paths */
  apiPath: string;
  /** Role-specific sections that show conditionally */
  roleSections?: Record<PartyRole, DrawerSection[]>;
}

// ═══════════════════════════════════════════════════════════════
// PART 7 — DocumentDef (config-driven Document Engine, spec §B.4.4)
// ═══════════════════════════════════════════════════════════════

export interface DocumentLineColumn {
  key: string;
  label: string;
  width?: string;
  align?: 'left' | 'right';
}

export interface DocumentDef {
  type: DocumentType;
  label: string;
  numberPrefix: string;
  partyLabel: string;
  partyRole: PartyRole;
  dateLabel: string;
  dueLabel: string;
  lineColumns: DocumentLineColumn[];
  statuses: DocumentStatus[];
  canRecordPayment: boolean;
  canSend: boolean;
  canPrint: boolean;
  showShipTo: boolean;
  showPaymentOptions: boolean;
  primaryAction: string;
  /** API path for CRUD */
  apiPath: string;
  /** Which views to show as tabs inside the document page */
  views: ('edit' | 'email' | 'payor' | 'pdf')[];
}

// ═══════════════════════════════════════════════════════════════
// PART 8 — Menu / right-click grammar (spec §1.7)
// ═══════════════════════════════════════════════════════════════

export interface MenuAction {
  id: string;
  label: string;
  icon?: string;
  /** Which section of the 8-part grammar */
  section: 'open' | 'create' | 'communicate' | 'money' | 'print' | 'organize' | 'danger';
  /** What happens on click */
  surface?: SurfaceRequest;
  /** Or: a direct API call */
  action?: { method: string; path: string; body?: unknown };
  /** Requires confirmation dialog */
  confirm?: { title: string; message: string; requireReason?: boolean };
  /** Permission required to show this action */
  permission?: string;
  /** Sub-menu items */
  children?: MenuAction[];
  /** Separator before this item */
  separator?: boolean;
  /** Disabled state */
  disabled?: boolean;
}

// ═══════════════════════════════════════════════════════════════
// PART 9 — Create actions (spec Part 3)
// ═══════════════════════════════════════════════════════════════

export interface CreateAction {
  id: string;
  label: string;
  icon: string;
  group: 'Customers' | 'Vendors' | 'Team' | 'Books' | 'Catalog' | 'Marketing' | 'Support & Orders';
  surface: SurfaceType;
  /** What entity/documentType to create */
  entity: string;
  documentType?: DocumentType;
  /** Envelope fields to prefill */
  envelopeKeys: string[];
  /** Permission required */
  permission?: string;
}

// ═══════════════════════════════════════════════════════════════
// PART 10 — API types (spec §B.4)
// ═══════════════════════════════════════════════════════════════

export interface ListQuery {
  cursor?: string;
  limit?: number;
  sort?: string;
  order?: 'asc' | 'desc';
  filters?: Record<string, unknown>;
  q?: string;
}

export interface ListResponse<T> {
  data: T[];
  nextCursor: string | null;
  meta: {
    total: number;
    tabCounts?: Record<string, number>;
    summary?: Record<string, number>;
  };
}

export interface ApiError {
  error: {
    code: string;
    message: string;
    fields?: Record<string, string>;
    requestId: string;
  };
}

export interface ActivityEntry {
  id: string;
  date: string;
  type: string;
  text: string;
  actor: string;
  before?: unknown;
  after?: unknown;
}

export interface ImpactSummary {
  tier: 1 | 2 | 3 | 4;
  usedIn: { type: string; id: string; label: string }[];
  impactCounts: Record<string, number>;
}

export interface ChangePreview {
  fields: { key: string; label: string; before: unknown; after: unknown }[];
  propagates: string[];
}

export interface PeekCard {
  type: string;
  id: string;
  title: string;
  subtitle?: string;
  fields: { label: string; value: string }[];
  pills: Pill[];
  actions: MenuAction[];
}

export interface SearchResult {
  type: string;
  id: string;
  title: string;
  subtitle?: string;
  pill?: Pill;
}

export interface SearchResponse {
  results: SearchResult[];
  facets?: Record<string, { value: string; count: number }[]>;
}
