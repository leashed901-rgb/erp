export type OpsWindow = 'Today' | '7D' | '30D' | 'MTD';
export type ExecPeriod = 'MTD' | 'QTD' | 'YTD' | '12M';
export type ExecCompare = 'prior' | 'plan';

export interface SetupStepItem {
  id: string;
  stepNumber: number;
  title: string;
  subtitle: string;
  icon: string;
  completed: boolean;
  ctaLabel: string;
  fields: {
    key: string;
    label: string;
    value: string;
    hint?: string;
  }[];
}

export interface CreateActionOption {
  label: string;
  icon: string;
  domainGroup: string;
  favorite?: boolean;
}

export interface IntegrationVital {
  name: string;
  role: string;
  status: 'Synced' | 'Healthy' | 'SLA warning' | 'For review';
  metricLabel: string;
  metricValue: string;
  slaPct: string;
  lastSync: string;
  openCount: number;
  targetDomain: 'orders' | 'finance' | 'catalog';
  targetScreen: string;
}

export interface SmartSuggestion {
  id: string;
  category: 'Bills & AP' | 'Banking' | 'Preflight' | 'Tax & 1099' | 'Collections';
  title: string;
  detail: string;
  impact: string;
  actionLabel: string;
  icon: string;
  targetDomain: 'finance' | 'dashboard' | 'orders' | 'catalog';
  targetScreen: string;
  createTrigger?: string;
}

export interface MonthlyGmvPoint {
  month: string;
  shortLabel: string;
  gmv: number;
  netRevenue: number;
  grossProfit: number;
  cogs: number;
  stripeFees: number;
  adSpend: number;
  refunds: number;
  orders: number;
}

export interface WaterfallBridgeItem {
  label: string;
  amount: number;
  pctOfGmv: number;
  kind: 'gross' | 'deduction' | 'subtotal' | 'cogs' | 'net';
  note: string;
}

export interface CategoryMarginRow {
  category: string;
  coaAccount: string;
  orders: number;
  units: number;
  gmv: number;
  cogs: number;
  grossProfit: number;
  marginPct: number;
  returnRatePct: number;
  sharePct: number;
}

export interface ChannelPerformanceRow {
  channel: string;
  settlementAccount: string;
  orders: number;
  gmv: number;
  takeRatePct: number;
  fees: number;
  netContribution: number;
  growthPct: string;
  sharePct: number;
  status: 'Active' | 'Healthy' | 'For review';
}

export interface SupplierMarginRow {
  supplier: string;
  routedOrders: number;
  blankAndPrintCogs: number;
  avgTurnaround: string;
  reprintRatePct: number;
  slaPct: number;
  grossMarginPct: number;
  status: 'Healthy' | 'SLA warning';
}

export interface CohortRow {
  cohort: string;
  customers: number;
  cac: string;
  ltv: string;
  m0: number;
  m1: number;
  m2: number;
  m3: number;
  m4: number;
  m5: number;
}

export interface TopSkuAnalyticsRow {
  sku: string;
  name: string;
  category: string;
  supplier: string;
  units: number;
  gmv: number;
  marginPct: number;
  cvrPct: number;
  rmaPct: number;
  status: 'Published' | 'SLA warning';
}

export interface AttributionChannelRow {
  channel: string;
  campaignCount: number;
  spend: number;
  sessions: number;
  orders: number;
  attributedGmv: number;
  roas: number;
  cac: number;
  sharePct: number;
}

export type ExplorerDatasetKey =
  | 'orders_gmv'
  | 'sku_velocity'
  | 'customer_cohorts'
  | 'seller_ledger';

export interface ExplorerRow {
  id: string;
  dimension: string;
  secondaryDim: string;
  segment: string;
  orders: number;
  gmv: number;
  discountsAndRefunds: number;
  netRevenue: number;
  cogs: number;
  grossProfit: number;
  marginPct: number;
  varianceAmount: number;
  status: string;
  createdBy: string;
  createdOn: string;
  modifiedBy: string;
  modifiedOn: string;
}

export interface SavedExplorerView {
  id: string;
  name: string;
  dataset: ExplorerDatasetKey;
  tab: string;
  divideBy1000: boolean;
}

export interface AttentionQueueItem {
  id: string;
  /** Real source record this item was derived from (when live) */
  refKind?: 'flag' | 'task' | 'conversation';
  refId?: string;
  code: string;
  title: string;
  category: 'Orders & SLA' | 'Finance & Bills' | 'Catalog & Preflight' | 'Support & RMA';
  severity: 'Critical' | 'SLA warning' | 'For review';
  entity: string;
  owner: string;
  impactAmount: number;
  slaRemaining: string;
  createdOn: string;
  modifiedBy: string;
  status: 'SLA breach' | 'Critical' | 'For review' | 'SLA warning' | 'Snoozed' | 'Resolved';
  targetDomain: 'orders' | 'finance' | 'catalog' | 'support';
  targetScreen: string;
  summary: string;
}

export interface CustomerQueueItem {
  id: string;
  name: string;
  email: string;
  queueBucket: 'Needs follow-up' | 'Overdue balance' | 'RMA & Refunds' | 'At risk' | 'VIP / High LTV';
  orders: number;
  ltv: number;
  balance: number;
  lastOrder: string;
  marketingConsent: 'Yes' | 'No';
  source: 'Storefront' | 'B2B Invoice' | 'Marketplace' | 'Social Shop';
  reason: string;
  owner: string;
  createdOn: string;
  status: 'Needs follow-up' | 'Overdue' | 'RMA open' | 'At risk' | 'VIP' | 'Resolved';
}

export interface SellerQueueItem {
  id: string;
  seller: string;
  contactEmail: string;
  role: 'Marketplace Seller' | 'POD Supplier' | 'Design Partner' | '1099 Contractor';
  stage: 'Onboarding & KYB' | 'Catalog review' | 'SLA & Quality' | 'Payouts & 1099';
  gmvOrSpend: number;
  takeOrMarginPct: number;
  openItems: string;
  slaPct: number;
  w9Status: 'Verified' | 'Pending W-9' | 'Exempt (Corp)';
  payoutHold: number;
  updatedOn: string;
  status: 'Pending KYB' | 'Catalog review' | 'SLA warning' | 'Pending W-9' | 'On hold' | 'Approved';
}

export const INITIAL_SETUP_STEPS: SetupStepItem[] = [
  {
    id: 'profile',
    stepNumber: 1,
    title: 'Business profile',
    subtitle: 'Legal entity, industry, tax classification & fiscal calendar.',
    icon: 'apartment',
    completed: true,
    ctaLabel: 'Review profile',
    fields: [
      { key: 'legalName', label: 'Legal business name', value: 'Unsaid' },
      { key: 'years', label: 'Years in business', value: '3 years (est. 2023)' },
      { key: 'industry', label: 'Industry', value: 'Print-on-Demand & Multi-Seller Commerce' },
      { key: 'taxType', label: 'Tax classification', value: 'Delaware C-Corp / Multi-State Nexus' },
      { key: 'revenueBand', label: 'Annual GMV band', value: '$5,000,000 – $10,000,000' },
    ],
  },
  {
    id: 'bank',
    stepNumber: 2,
    title: 'Connect bank & payout feeds',
    subtitle: 'Operating bank accounts, Stripe clearing & Shopify settlements.',
    icon: 'account_balance',
    completed: true,
    ctaLabel: 'Manage feeds',
    fields: [
      { key: 'primaryBank', label: 'Operating checking', value: 'Mercury Checking •9910 ($194,680.00)' },
      { key: 'cardAccount', label: 'Corporate card', value: 'Chase Ink Reserve •4421' },
      { key: 'stripeFeed', label: 'Processor clearing', value: 'Stripe Clearing (Auto-split fees)' },
      { key: 'shopifyFeed', label: 'Storefront payouts', value: 'Shopify Payments (T+2 settlement)' },
    ],
  },
  {
    id: 'payments',
    stepNumber: 3,
    title: 'Set up customer payments',
    subtitle: 'Enable ACH, card processing, QR payment links & deposit rules.',
    icon: 'payments',
    completed: true,
    ctaLabel: 'Payment settings',
    fields: [
      { key: 'ach', label: 'ACH bank transfer', value: 'Enabled · Free standard settlement' },
      { key: 'cards', label: 'Credit, debit & Apple Pay', value: 'Enabled · 2.9% + $0.30' },
      { key: 'links', label: 'Payment links & QR', value: 'Active on Invoices & B2B Quotes' },
      { key: 'lateFees', label: 'Automated reminders', value: '3 days before & 7 days past due' },
    ],
  },
  {
    id: 'branding',
    stepNumber: 4,
    title: 'Invoice & payor branding',
    subtitle: 'Configure brand color, logo lockup, default terms & payor portal.',
    icon: 'palette',
    completed: false,
    ctaLabel: 'Complete branding',
    fields: [
      { key: 'brandColor', label: 'Primary brand hex', value: '#0A6400', hint: 'Applied to Email, Payor & PDF views' },
      { key: 'logoAsset', label: 'Company wordmark', value: 'unsaid-mark-2026.svg' },
      { key: 'defaultTerms', label: 'Default invoice terms', value: 'Net 30 · 25% deposit on custom runs' },
      { key: 'customerNote', label: 'Default footer note', value: 'Thank you for partnering with Unsaid.' },
    ],
  },
  {
    id: 'goals',
    stepNumber: 5,
    title: 'Operating & margin goals',
    subtitle: 'Set Q4 GMV targets, gross margin guardrails & supplier SLA thresholds.',
    icon: 'flag',
    completed: false,
    ctaLabel: 'Set Q4 goals',
    fields: [
      { key: 'monthlyGmvTarget', label: 'Monthly GMV target', value: '$525,000' },
      { key: 'grossMarginFloor', label: 'Gross margin guardrail', value: '56.0% minimum after blank + print COGS' },
      { key: 'slaTarget', label: 'Supplier SLA target', value: '98.5% shipped within 48h' },
      { key: 'arDaysTarget', label: 'Target DSO (days to pay)', value: '14.0 days' },
    ],
  },
];

export const ALL_CREATE_ACTION_OPTIONS: CreateActionOption[] = [
  { label: 'Invoice', icon: 'receipt_long', domainGroup: 'Customers', favorite: true },
  { label: 'Sales order', icon: 'shopping_cart_checkout', domainGroup: 'Support & Orders', favorite: true },
  { label: 'Receive payment', icon: 'price_check', domainGroup: 'Customers', favorite: true },
  { label: 'Payment link', icon: 'link', domainGroup: 'Customers', favorite: false },
  { label: 'Expense', icon: 'credit_card', domainGroup: 'Vendors & Suppliers', favorite: true },
  { label: 'Bill', icon: 'description', domainGroup: 'Vendors & Suppliers', favorite: true },
  { label: 'Pay bills', icon: 'account_balance_wallet', domainGroup: 'Vendors & Suppliers', favorite: false },
  { label: 'Purchase order', icon: 'shopping_bag', domainGroup: 'Vendors & Suppliers', favorite: true },
  { label: 'Product', icon: 'checkroom', domainGroup: 'Catalog & Marketing', favorite: true },
  { label: 'Design', icon: 'palette', domainGroup: 'Catalog & Marketing', favorite: false },
  { label: 'Discount code', icon: 'sell', domainGroup: 'Catalog & Marketing', favorite: false },
  { label: 'Customer', icon: 'person_add', domainGroup: 'Customers', favorite: true },
  { label: 'Vendor', icon: 'domain_add', domainGroup: 'Vendors & Suppliers', favorite: false },
  { label: 'Add supplier', icon: 'factory', domainGroup: 'Vendors & Suppliers', favorite: false },
  { label: 'Add contractor', icon: 'engineering', domainGroup: 'Team', favorite: false },
  { label: 'Return/RMA', icon: 'assignment_return', domainGroup: 'Support & Orders', favorite: false },
  { label: 'Task', icon: 'task', domainGroup: 'Other (books)', favorite: false },
  { label: 'Reconcile', icon: 'fact_check', domainGroup: 'Other (books)', favorite: false },
];

export const DEFAULT_PINNED_CREATE_ACTIONS: string[] = [
  'Invoice',
  'Sales order',
  'Receive payment',
  'Purchase order',
  'Expense',
  'Product',
  'Customer',
];

