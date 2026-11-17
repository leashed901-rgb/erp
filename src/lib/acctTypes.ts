/* Accounting DTOs (finance/accounting wiring) — the acct_* engine's
   tables mapped to the shapes the accounting screens render. */

export type AcctUiType = 'Asset' | 'Liability' | 'Equity' | 'Income' | 'Expense';

export interface CoaAccount {
  id: string;
  entityId: string;
  parentAccountId: string | null;
  code: string;
  name: string;
  /** Raw acct_chart_of_accounts.account_type (asset, contra_asset, …) */
  rawType: string;
  type: AcctUiType;
  normalBalance: 'debit' | 'credit';
  detail: string;
  detailText: string;
  description: string | null;
  /** UI tax-line label stored in metadata.taxLine; '—' when unmapped */
  tax: string;
  /** GL balance: opening + posted, non-reversal journal movement */
  balance: number;
  /** Linked bank-feed balance when a bank account points at this GL account */
  bankBalance: number | null;
  isActive: boolean;
  isSystem: boolean;
  openingBalance: number;
}

export interface BankAccountDto {
  id: string;
  name: string;
  institutionName: string | null;
  accountType: string;
  accountKind: string;
  maskedNumber: string | null;
  glAccountId: string;
  isActive: boolean;
  lastSyncAt: string | null;
  balance: number;
  counts: { review: number; categorized: number; excluded: number; total: number };
}

export interface BankTxnDto {
  id: string;
  bankAccountId: string;
  date: string;
  description: string;
  payee: string | null;
  amount: number;
  type: 'income' | 'expense';
  status: 'review' | 'categorized' | 'excluded';
  rawStatus: string;
  matchStatus: string;
  categoryAccountId: string | null;
  categoryLabel: string | null;
  suggestedAccountId: string | null;
  suggestedLabel: string | null;
  suggestedRuleId: string | null;
  matchedLabel: string | null;
  excludedReason: string | null;
  hasReceipt: boolean;
  memo: string | null;
}

export interface BankRuleCondition {
  id?: string;
  field: string;
  operator: string;
  value: string;
  value2: string | null;
  caseSensitive: boolean;
}

export interface BankRuleDto {
  id: string;
  name: string;
  priority: number;
  appliesTo: string;
  matchMode: string;
  txnType: string;
  bankAccountIds: string[];
  autoConfirm: boolean;
  isActive: boolean;
  timesApplied: number;
  lastAppliedAt: string | null;
  conditions: (BankRuleCondition & { id: string })[];
  splits: { id: string; lineNo: number; accountId: string; accountName: string | null; percent: number | null; fixedAmount: number | null }[];
  categoryAccountId: string | null;
  categoryLabel: string | null;
}

export interface MatchCandidate {
  journalLineId: string;
  description: string;
  amount: number;
  date: string;
  entryNo: number | null;
}

export interface ReceiptDto {
  id: string;
  ref: string;
  fileName: string | null;
  source: string;
  rawStatus: string;
  status: 'review' | 'reviewed';
  vendorName: string | null;
  vendorId: string | null;
  amount: number | null;
  taxAmount: number | null;
  date: string;
  paymentAccountId: string | null;
  paymentAccountLabel: string | null;
  categoryAccountId: string | null;
  categoryLabel: string | null;
  createdSpendId: string | null;
  createdBillId: string | null;
  matchedBankTransactionId: string | null;
  extractionStatus: string | null;
  notes: string | null;
  ocrScore: number | null;
  hasAttachment: boolean;
  createdAt: string;
}

export interface ReceiptMatchCandidate {
  bankTransactionId: string;
  description: string;
  date: string;
  amount: number;
  bankAccountName: string | null;
}

export interface OverviewDto {
  entityName: string | null;
  reviewCount: number;
  reviewOldestDate: string | null;
  uncategorizedCount: number;
  uncategorizedTotal: number;
  bankBalance: number;
  bankAccountCount: number;
  bankAccountNames: string[];
  lastReconciledDate: string | null;
  lastReconciledStatus: string | null;
  coaCount: number;
  activeRuleCount: number;
  taxCodeCount: number;
  receiptsForReview: number;
  kpis: {
    cashPosition: number;
    revenueMtd: number;
    expensesMtd: number;
    netIncomeYtd: number;
    unpostedDrafts: number;
    closeProgress: { done: number; total: number } | null;
    trialBalance: { debits: number; credits: number; balanced: boolean };
  };
  receiptsPreview: { id: string; vendorName: string; date: string; amount: number | null; paymentAccountLabel: string | null; isNew: boolean }[];
  reviewFeed: { id: string; date: string; description: string; amount: number; suggestedLabel: string | null; suggestedAccountId: string | null }[];
  activity: { id: string; kind: string; title: string; detail: string; at: string }[];
}

export interface ReportRowDto {
  kind: 'section' | 'sub' | 'total' | 'final';
  label?: string;
  cells: string[];
}

export interface ReportDto {
  id: string;
  title: string;
  range: string;
  columns: string[];
  rows: ReportRowDto[];
}

export interface SavedViewDto {
  id: string;
  name: string;
  from: string;
  to: string;
  config: Record<string, unknown>;
  savedAt: string;
}

export interface RegisterLine {
  date: string;
  description: string;
  /** Signed by the account's normal balance: + increases the balance */
  amount: number;
  entryNo: number;
  source: string;
}

const TYPE_TO_UI: Record<string, AcctUiType> = {
  asset: 'Asset',
  contra_asset: 'Asset',
  liability: 'Liability',
  contra_liability: 'Liability',
  equity: 'Equity',
  contra_equity: 'Equity',
  revenue: 'Income',
  contra_revenue: 'Income',
  income: 'Income',
  expense: 'Expense',
  contra_expense: 'Expense',
};

export const UI_TYPE_TO_RAW: Record<AcctUiType, string> = {
  Asset: 'asset',
  Liability: 'liability',
  Equity: 'equity',
  Income: 'revenue',
  Expense: 'expense',
};

export const UI_TYPE_NORMAL_BALANCE: Record<AcctUiType, 'debit' | 'credit'> = {
  Asset: 'debit',
  Liability: 'credit',
  Equity: 'credit',
  Income: 'credit',
  Expense: 'debit',
};

/* Curated slug → label map so real detail types land on the drawer's
   own vocabulary where the mockup defines one; anything else is
   humanized generically. */
const DETAIL_LABELS: Record<string, string> = {
  checking: 'Checking',
  savings: 'Savings',
  cash_on_hand: 'Cash and cash equivalents',
  processor_clearing: 'Cash and cash equivalents',
  undeposited_funds: 'Cash and cash equivalents',
  accounts_receivable: 'Accounts receivable',
  inventory: 'Inventory',
  accounts_payable: 'Accounts payable',
  credit_card: 'Credit card',
  sales_tax_payable: 'Sales tax payable',
  payroll_liabilities: 'Payroll liabilities',
  line_of_credit: 'Loan',
  notes_payable: 'Loan',
  opening_balance_equity: 'Opening balance equity',
  retained_earnings: 'Retained earnings',
  owner_contributions: "Owner's equity",
  owner_draw: "Owner's equity",
  common_stock: "Owner's equity",
  preferred_stock: "Owner's equity",
  additional_paid_in_capital: "Owner's equity",
  sales_of_product: 'Sales of product income',
  service: 'Sales of services',
  discounts: 'Discounts',
  shipping: 'Shipping income',
  interest: 'Interest income',
  supplies_materials_cogs: 'Cost of goods sold',
  advertising: 'Advertising',
  bank_charges: 'Bank charges & fees',
  insurance: 'Insurance',
  legal_professional: 'Legal & professional',
  meals: 'Meals & entertainment',
  office: 'Office/General Administrative',
  supplies: 'Office/General Administrative',
  rent: 'Rent or lease',
  travel: 'Travel',
  utilities: 'Utilities',
};

export function detailLabel(slug: string | null | undefined): string {
  if (!slug) return '—';
  if (DETAIL_LABELS[slug]) return DETAIL_LABELS[slug];
  const s = slug.replace(/_/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function detailSlug(label: string | null | undefined): string | null {
  if (!label) return null;
  for (const [slug, l] of Object.entries(DETAIL_LABELS)) if (l === label) return slug;
  return label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

export function toCoaAccount(
  r: Record<string, unknown>,
  balance: number,
  bankBalance: number | null,
): CoaAccount {
  const rawType = String(r.account_type || 'asset');
  const detail = detailLabel((r.detail_type as string) || (r.subtype as string) || null);
  const meta = (r.metadata && typeof r.metadata === 'object' ? r.metadata : {}) as Record<string, unknown>;
  return {
    id: String(r.id),
    entityId: String(r.entity_id || ''),
    parentAccountId: (r.parent_account_id as string) || null,
    code: String(r.code || ''),
    name: String(r.name || ''),
    rawType,
    type: TYPE_TO_UI[rawType] || 'Asset',
    normalBalance: (r.normal_balance as 'debit' | 'credit') || 'debit',
    detail,
    detailText: detail,
    description: (r.description as string) || null,
    tax: typeof meta.taxLine === 'string' && meta.taxLine ? meta.taxLine : '—',
    balance: Math.round(balance * 100) / 100,
    bankBalance: bankBalance != null ? Math.round(bankBalance * 100) / 100 : null,
    isActive: r.is_active !== false,
    isSystem: r.is_system === true,
    openingBalance: Number(r.opening_balance || 0),
  };
}
