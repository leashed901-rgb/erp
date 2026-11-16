/**
 * Accounting types — the REAL Supabase tables for invoices, receipts,
 * estimates, bills, payment transactions, and sales orders.
 *
 * These are the source of truth for all financial documents. The
 * platformStore (Zustand) is a client-side cache; these tables are
 * where data actually lives.
 *
 * Schema verified against the live database via the REST API.
 */

// ── Invoices ──────────────────────────────────────────────────
export interface Invoice {
  id: string;
  tenant_id: string;
  customerId: string;
  bookingId: string | null;
  number: string;
  status: string; // OPEN, PAID, VOID, DRAFT, OVERDUE
  subtotal: number;
  depositPaid: number;
  balanceDue: number;
  total: number;
  amount_paid: number;
  currency: string;
  dueDate: string | null;
  sentAt: string | null;
  paidAt: string | null;
  notes: string | null;
  ar_account_id: string | null;
  tax_id: string | null;
  stripeInvoiceId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface InvoiceItem {
  id: string;
  tenant_id: string;
  invoiceId: string;
  description: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  createdAt: string;
}

// ── Receipts (sales receipts — POS / instant payment) ─────────
export interface Receipt {
  id: string;
  tenant_id: string;
  number: string;
  customer_id: string;
  receipt_date: string;
  kind: string; // sale, refund
  amount: number;
  currency: string;
  method: string; // cash, check, card, stripe, etc.
  deposit_account_id: string | null;
  revenue_account_id: string | null;
  notes: string | null;
  journal_id: string | null;
  created_at: string;
}

// ── Estimates ─────────────────────────────────────────────────
// Reconciled with acct_estimates (canonical) — the legacy `estimates`
// table served by /api/estimates carries the same shape under the
// `number` / `issue_date` names; both are kept so the two list routes
// stay readable through one type. Canonical fields are the acct_* ones.
export interface Estimate {
  id: string;
  tenant_id: string;
  /** acct_estimates.estimate_number (legacy `estimates`.number) */
  number: string;
  estimate_number?: string;
  customer_id: string;
  /** acct_estimates.issue_date (legacy `estimates`.issue_date) */
  issue_date: string;
  estimate_date?: string;
  expiry_date: string | null;
  status: string; // draft, sent, accepted, declined, expired, converted
  currency: string;
  exchange_rate: number;
  subtotal: number;
  tax_total: number;
  total: number;
  notes: string | null;
  terms: string | null;
  converted_invoice_id: string | null;
  /** acct_estimates.lines — the estimate's lines as stored JSON */
  lines?: EstimateLine[];
  sent_at: string | null;
  viewed_at: string | null;
  accepted_at: string | null;
  declined_at: string | null;
  created_at: string;
  updated_at: string;
}

/** One estimate line — acct_estimate_lines (canonical). */
export interface EstimateLine {
  id?: string;
  estimate_id?: string;
  line_number: number;
  service_id: string | null;
  description: string;
  quantity: number;
  unit_price: number;
  discount_amount: number;
  tax_amount: number;
  line_total: number;
}

// ── Bills (vendor invoices — AP) ──────────────────────────────
export interface Bill {
  id: string;
  tenant_id: string;
  number: string;
  vendor_id: string;
  issue_date: string;
  due_date: string | null;
  status: string; // draft, approved, unpaid, overdue, paid, void
  currency: string;
  exchange_rate: number;
  subtotal: number;
  tax_total: number;
  total: number;
  amount_paid: number;
  ap_account_id: string | null;
  notes: string | null;
  journal_id: string | null;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
}

/** A bill as stored in the canonical table — acct_ap_bills.
 *  This is the BillDef the Bills screen renders: number/date/party come
 *  from the acct_* column names (bill_number, bill_date, vendor_id), the
 *  review funnel from review_status + approval_status, and the payment
 *  funnel from payment_approval_status. open_balance is GENERATED in the
 *  DB (total - amount_paid - amount_credited) — read-only here. */
export interface BillDef {
  id: string;
  tenant_id: string;
  entity_id: string;
  vendor_id: string;
  bill_number: string;
  bill_date: string;
  due_date: string;
  currency: string;
  exchange_rate: number;
  subtotal: number;
  tax_total: number;
  discount_total: number;
  total: number;
  amount_paid: number;
  amount_credited: number;
  open_balance: number;
  status: string; // draft, unpaid, overdue, paid, void
  memo: string | null;
  source: string; // manual, upload, email, scan
  review_status: string; // ready, needs_review, reviewed
  approval_status: string; // not_required, pending, approved, declined
  payment_approval_status: string; // not_required, pending, approved, declined
  recurring_bill_id: string | null;
  inbox_id: string | null;
  purchase_order_id: string | null;
  posted_journal_id: string | null;
  voided_at: string | null;
  void_reason: string | null;
  created_at: string;
  updated_at: string;
}

/** One row of the spend family — acct_spend_transactions with txn_kind.
 *  Bills, expenses and checks are all spend rows; txn_kind is the only
 *  thing that differs. A bill's spend row is the payment-side record;
 *  the bill itself lives in acct_ap_bills (BillDef). */
export interface SpendRecord {
  id: string;
  tenant_id: string;
  entity_id: string;
  txn_kind: 'bill' | 'expense' | 'check' | 'vendor_credit' | 'card_credit' | string;
  payee_vendor_id: string | null;
  payee_customer_id: string | null;
  payee_name: string | null;
  bank_account_id: string;
  payment_date: string;
  payment_method: string | null;
  ref_no: string | null;
  check_number: number | null;
  print_status: string;
  memo: string | null;
  currency: string;
  subtotal: number;
  tax_total: number;
  total: number;
  status: string; // draft, posted
  posted_journal_id: string | null;
  created_at: string;
  updated_at: string;
}

/** One approval step on a bill — acct_ap_approvals.
 *  Decision D-1 resolved: approvals live here (one row per approver per
 *  stage), NOT in a separate acct_workflows table — the registry RPC
 *  acct_decide_bill writes this table, and acct_ap_approvals.status is
 *  the source of truth for where a bill sits in review. */
export interface ApprovalSummary {
  id: string;
  tenant_id: string;
  bill_id: string | null;
  purchase_order_id: string | null;
  approver_id: string | null;
  sequence_no: number;
  status: 'pending' | 'approved' | 'declined' | string;
  acted_at: string | null;
  comments: string | null;
  stage: 'bill' | 'payment';
}

// ── Payment transactions ──────────────────────────────────────
export interface PaymentTransaction {
  id: string;
  tenant_id: string;
  customer_id: string;
  booking_id: string | null;
  order_id: string | null;
  invoice_id: string | null;
  provider: string; // stripe, cash, check, ach, etc.
  provider_transaction_id: string | null;
  transaction_type: string; // PAYMENT, REFUND
  status: string; // PENDING, SUCCEEDED, PROCESSING, FAILED, CANCELLED
  amount: number;
  currency: string;
  failure_code: string | null;
  failure_message: string | null;
  metadata: Record<string, unknown> | null;
  processed_at: string | null;
  created_at: string;
  updated_at: string;
  deposit_account_id: string | null;
  ar_account_id: string | null;
  connected_account_id: string | null;
  application_fee_amount: number | null;
}

// ── Sales orders ──────────────────────────────────────────────
export interface SalesOrder {
  id: string;
  tenant_id: string;
  number: string;
  customer_id: string;
  issue_date: string;
  expected_date: string | null;
  status: string; // draft, open, fulfilled, closed
  currency: string;
  subtotal: number;
  tax_total: number;
  total: number;
  notes: string | null;
  converted_invoice_id: string | null;
  created_at: string;
  updated_at: string;
  erp_order_id: string | null;
}

// ── Unified transaction row for the customer profile table ────
// Combines invoices, receipts, estimates, bills, sales orders into
// one shape the Transaction List tab can render uniformly.
export interface CustomerTransaction {
  id: string;
  type: 'Invoice' | 'Receipt' | 'Estimate' | 'Bill' | 'SalesOrder' | 'Payment';
  number: string;
  date: string;
  total: number;
  status: string;
  balance: number;
  memo: string | null;
}

/* ── Docs 07/08/09 — vendors, banking, chart of accounts ────────────
 *  These are the DB shapes (acct_* tables + RPCs), distinct from the
 *  store types in contracts.ts (Account/AccountType there are the
 *  platformStore shapes). D-2: DB account_type is 'revenue', never
 *  'income'; COGS is subtype 'cogs' on an expense account. */

/** Doc 07 — pay-side parties. W9Status mirrors the Vendors screen
 *  pills: on file / requested / missing. */
export type W9Status = 'Completed' | 'Invited' | 'Missing' | null;

export interface VendorProfile {
  id: string;
  vendor_number: string;
  legal_name: string;
  display_name?: string | null;
  company_name?: string | null;
  email?: string | null;
  phone?: string | null;
  vendor_kind: 'vendor' | 'contractor' | string;
  is_1099_vendor: boolean;
  w9_received_at?: string | null;
  contractorW9Status?: W9Status;
  is_active: boolean;
  payment_terms_days: number;
  openBalance: number;
  ytdPaid: number;
}

export interface SupplierProfile {
  id: string;
  name: string;
  slug: string;
  kind: string;
  catalog_source: string;
  api_base_url?: string | null;
  ordering_status: string;
}

export interface ContractorProfile extends VendorProfile {
  vendor_kind: 'contractor';
  invite?: {
    id: string;
    email: string;
    status: string;
    expires_at: string;
    sent_at: string;
    completed_at?: string | null;
  } | null;
}

/** Doc 08 — bank transactions (the For review queue). review_status is
 *  the DB value; ui_status is the screen tab (review/categorized/
 *  excluded). */
export interface BankTransaction {
  id: string;
  bank_account_id: string;
  transaction_date: string;
  posted_date?: string | null;
  amount: number;
  currency: string;
  description?: string | null;
  payee?: string | null;
  reference?: string | null;
  match_status: string;
  matched_journal_line_id?: string | null;
  review_status: string;
  ui_status: 'review' | 'categorized' | 'excluded';
  txn_type?: string | null;
  category_account_id?: string | null;
  category_name?: string | null;
  category_code?: string | null;
  payee_vendor_id?: string | null;
  payee_customer_id?: string | null;
  transfer_bank_account_id?: string | null;
  memo?: string | null;
  suggested_rule_id?: string | null;
  posted_journal_id?: string | null;
  matched_doc_type?: string | null;
  matched_doc_id?: string | null;
  excluded_reason?: string | null;
}

export interface MatchCandidate {
  journal_line_id: string;
  journal_entry_id: string;
  entry_no: number;
  posting_date: string;
  amount: number;
  memo?: string | null;
  source: string;
  day_diff: number;
  line_description?: string | null;
  account_code?: string | null;
  account_name?: string | null;
}

export interface BankRule {
  id: string;
  name: string;
  priority: number;
  applies_to: string;
  match_mode: string;
  txn_type: string;
  memo?: string | null;
  auto_confirm: boolean;
  is_active: boolean;
  times_applied: number;
  last_applied_at?: string | null;
  condition_keyword?: string | null;
  condition_field?: string;
  condition_operator?: string;
  category_account_id?: string | null;
  category_name?: string | null;
  category_code?: string | null;
}

export interface Reconciliation {
  id: string;
  bank_account_id: string;
  bank_account_name?: string | null;
  as_of_date: string;
  statement_balance: number;
  gl_balance: number;
  outstanding_deposits: number;
  outstanding_payments: number;
  adjustments: number;
  difference: number;
  status: 'open' | 'in_progress' | 'reconciled' | 'reopened' | 'closed';
  beginning_balance: number;
  service_charge_amount: number;
  interest_earned_amount: number;
  completed_at?: string | null;
  summary?: ReconciliationSummary | null;
}

export interface ReconciliationSummary {
  beginning_balance: number;
  cleared_deposits: number;
  cleared_payments: number;
  cleared_balance: number;
  statement_ending_balance: number;
  difference: number;
  uncleared_count: number;
}

export interface SettlementSplit {
  id: string;
  settlement_id: string;
  kind: 'gross' | 'fee' | 'refund' | 'dispute' | 'net';
  amount: number;
  account_id?: string | null;
}

/** Doc 09 — chart of accounts (DB shape). account_type is the CHECK
 *  vocabulary: asset/liability/equity/revenue/expense/contra-asset, contra-liability, contra-equity, statistical. */
export interface ChartAccount {
  id: string;
  code: string;
  name: string;
  account_type: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense' | 'contra_asset' | 'contra_liability' | 'contra_equity' | 'statistical';
  subtype?: string | null;
  description?: string | null;
  currency?: string | null;
  parent_account_id?: string | null;
  is_control_account: boolean;
  is_reconcilable: boolean;
  is_posting_allowed: boolean;
  is_system: boolean;
  is_active: boolean;
  normal_balance: 'debit' | 'credit';
  balance: number;
  detail_type?: string | null;
}

export interface JournalLine {
  id?: string;
  line_no: number;
  account_id: string;
  account_code?: string | null;
  account_name?: string | null;
  description?: string | null;
  debit: number;
  credit: number;
  cleared_status?: string | null;
}

export interface JournalEntry {
  id: string;
  entry_no: number;
  entry_date: string;
  posting_date: string;
  source: string;
  reference?: string | null;
  memo?: string | null;
  currency: string;
  total_debit: number;
  total_credit: number;
  status: 'draft' | 'posted' | 'reversed' | string;
  is_adjusting: boolean;
  is_closing: boolean;
  reversal_of_id?: string | null;
  reversed_by_id?: string | null;
  lines?: JournalLine[];
}
