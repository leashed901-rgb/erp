'use client';
/**
 * usePlatformData — the modern client-side data layer (2026 practice):
 *
 * 1. INSTANT RENDER: every hook returns cached (or empty) data on the first
 *    render. The screen paints immediately; nothing waits on the database.
 * 2. BACKGROUND REFRESH: data is revalidated after paint via useEffect.
 *    When it lands, state updates and the table fills in place.
 * 3. DATABASE ON SAVE ONLY: mutations are optimistic — the UI updates the
 *    moment the user clicks Save; the fetch to Supabase happens behind it
 *    and reconciles (or rolls back + toasts) when it settles.
 * 4. NEVER CRASHES ON HTML: the fetch helper checks content-type before
 *    parsing, so a 500 HTML page degrades to an error state instead of
 *    "Unexpected token '<'".
 */

import { useState, useEffect, useCallback, useRef } from 'react';

/* ────────────────────────────────────────────────────────────
   Types
   ──────────────────────────────────────────────────────────── */

export interface UnifiedParty {
  id: string;
  source: 'crm_customers' | 'acct_vendors' | 'suppliers' | 'crm_leads' | 'sellers';
  name: string;
  email: string | null;
  phone: string | null;
  roles: string[];
  company: string | null;
  city: string | null;
  state: string | null;
  balance: number;
  lifetimeValue: number;
  lifecycleStage: string | null;
  terms: number | null;
  is1099: boolean;
  w9Received: boolean;
  isActive: boolean;
  orderingStatus: string | null;
  sellerType?: string | null;
  sellerStatus?: string | null;
  website?: string | null;
  commissionRate?: number | null;
  addedAt: string;
  lastActivity: string | null;
}

export interface CrmCustomer {
  id: string;
  customer_type: string;
  lifecycle_stage: string;
  lifecycle_status: string;
  first_name: string | null;
  last_name: string | null;
  preferred_name?: string | null;
  company_name: string | null;
  email: string | null;
  phone: string | null;
  mobile_phone?: string | null;
  address_line1: string | null;
  address_line2?: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country: string;
  marketing_email_opt_in?: boolean | null;
  marketing_sms_opt_in?: boolean | null;
  outstanding_balance: number;
  lifetime_value: number;
  total_visits: number;
  total_spend_30d: number;
  last_activity_at: string | null;
  is_active: boolean;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  notes?: CrmNote[];
  tasks?: CrmTask[];
  activity?: CrmActivity[];
  segments?: string[];
}

export interface CrmActivity {
  id: string;
  customer_id: string | null;
  activity_type: string;
  description: string | null;
  created_at: string;
}

/** Unified party detail — the full source-table row for ANY party type
 *  (customer / vendor / supplier / lead / seller) in one shape. Returned by
 *  GET /api/parties/[id]?source=… */
export interface PartyDetail {
  id: string;
  source: string;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  roles: string[];
  first_name: string | null;
  last_name: string | null;
  balance: number;
  lifetimeValue: number;
  lifecycleStage: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country: string | null;
  preferred_name: string | null;
  mobile_phone: string | null;
  marketing_email_opt_in: boolean | null;
  marketing_sms_opt_in: boolean | null;
  customer_type: string | null;
  lifecycle_status: string | null;
  total_visits: number | null;
  total_spend_30d: number | null;
  last_activity_at: string | null;
  outstanding_balance: number | null;
  payment_terms_days: number | null;
  is_1099_vendor: boolean | null;
  w9_received_at: string | null;
  vendor_number: string | null;
  tax_number: string | null;
  currency: string | null;
  ap_account_id: string | null;
  tax_form_type: string | null;
  kind: string | null;
  ordering_status: string | null;
  api_base_url: string | null;
  catalog_source: string | null;
  lead_source: string | null;
  lead_type: string | null;
  status: string | null;
  first_contact_at: string | null;
  next_follow_up_at: string | null;
  lead_notes: string | null;
  /* Sellers (source='sellers') — canonical sellers row + profile join */
  seller_type?: string | null;
  slug?: string | null;
  website?: string | null;
  commission_rate?: number | null;
  operations_paused?: boolean | null;
  tax_id_last4?: string | null;
  seller_profile_id?: string | null;
  applicant_type?: string | null;
  tax_form_status?: string | null;
  recorded_earnings?: number | null;
  open_violations?: number;
  pending_appeals?: number;
  notes?: CrmNote[];
  tasks?: CrmTask[];
  activity?: CrmActivity[];
  created_at: string;
  updated_at: string;
}

export interface CrmLead {
  id: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  lead_source: string | null;
  status: string;
  conversion_date: string | null;
  customer_id: string | null;
  lead_type?: string | null;
  first_contact_at?: string | null;
  last_activity_at?: string | null;
  next_follow_up_at?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

export interface CrmSegment {
  id: string;
  name: string;
  description: string | null;
  segment_type: string;
  is_active: boolean;
  member_count: number;
}

export interface CrmNote {
  id: string;
  customer_id: string | null;
  body: string;
  note_type: string;
  created_at: string;
}

export interface CrmTask {
  id: string;
  customer_id: string | null;
  title: string;
  task_type?: string | null;
  priority: string;
  status: string;
  due_at: string | null;
  created_at: string;
}

/* ────────────────────────────────────────────────────────────
   Deals & Pipelines (crm_deals, crm_pipelines, crm_pipeline_stages)
   ──────────────────────────────────────────────────────────── */

export interface PipelineStage {
  id: string;
  pipeline_id: string;
  name: string;
  sort_order: number;
  probability: number | null;
  stage_kind: string | null; // open | won | lost
  rotting_days: number | null;
  created_at: string;
}

export interface Pipeline {
  id: string;
  name: string;
  description: string | null;
  is_default: boolean;
  is_active: boolean;
  currency: string;
  stages?: PipelineStage[];
  created_at: string;
}

export interface Deal {
  id: string;
  deal_number: string;
  name: string;
  pipeline_id: string;
  stage_id: string;
  status: string; // open, won, lost
  customer_id: string | null;
  lead_id: string | null;
  owner_staff_id: string | null;
  amount: number;
  currency: string;
  probability: number;
  expected_close_date: string | null;
  source: string | null;
  notes: string | null;
  lost_reason: string | null;
  won_at: string | null;
  lost_at: string | null;
  stage_entered_at: string;
  created_at: string;
  updated_at: string;
}

/* ────────────────────────────────────────────────────────────
   Lead scoring (crm_lead_scoring_rules, crm_lead_score_bands)
   ──────────────────────────────────────────────────────────── */

export interface ScoringRule {
  id: string;
  field: string;        // has_email, has_phone, inbound, engaged_7d, stale, source_equals
  operator: string;     // eq, ne, gt, lt, exists, not_exists, contains
  value: string | null;
  points: number;       // can be negative (e.g. stale −20)
  is_active: boolean;
  label?: string | null;
  created_at?: string;
}

export interface ScoreBand {
  id: string;
  label: string;        // hot, warm, cold
  min_score: number;
  max_score: number;
  color?: string | null;
}

/** Invoice row (the unified shape from /api/v1/documents?type=Invoice). */
export interface InvoiceRow {
  id: string;
  invoice_number: string;
  customer_id: string | null;
  customer_name?: string | null;
  invoice_date: string | null;
  due_date: string | null;
  status: string;       // DRAFT, OPEN, PAID, VOID, OVERDUE
  total: number;
  open_balance: number;
  subtotal?: number;
  tax_total?: number;
  currency: string;
  sent_at?: string | null;
  paid_at?: string | null;
  voided_at?: string | null;
  posted_at?: string | null;
  void_reason?: string | null;
  source_system?: string | null;
}

/** Estimate row (from /api/estimates). */
export interface EstimateRow {
  id: string;
  number: string;
  customer_id: string | null;
  customer_name?: string | null;
  issue_date: string | null;
  expiry_date: string | null;
  status: string;       // draft, sent, accepted, declined, expired, converted
  subtotal: number;
  tax_total: number;
  total: number;
  currency: string;
  notes?: string | null;
  terms?: string | null;
  converted_at?: string | null;
  converted_to_invoice_id?: string | null;
}

/* ────────────────────────────────────────────────────────────
   Banking (acct_bank_transactions, acct_bank_rules, acct_reconciliations)
   ──────────────────────────────────────────────────────────── */

export interface BankTransaction {
  id: string;
  bank_account_id: string | null;
  posted_at: string | null;
  description: string | null;
  payee?: string | null;
  amount: number;
  currency: string;
  status: string;       // review, matched, categorized, excluded
  category?: string | null;
  matched_document_id?: string | null;
  matched_document_type?: string | null;
  created_at?: string;
}

export interface BankRule {
  id: string;
  name: string;
  condition_field: string;   // description, payee, amount
  condition_op: string;      // contains, eq, gt, lt
  condition_value: string;
  action: string;            // categorize, set_payee, tag, mark_transfer, exclude
  action_value?: string | null;
  priority: number;
  is_active: boolean;
  created_at?: string;
}

export interface Reconciliation {
  id: string;
  bank_account_id: string;
  statement_ending_balance: number;
  statement_ending_date: string | null;
  service_charge: number;
  interest_earned: number;
  status: string;       // in_progress, completed
  started_at: string | null;
  finished_at: string | null;
  created_at?: string;
}

/* ────────────────────────────────────────────────────────────
   Chart of Accounts + Journal (acct_chart_of_accounts, acct_journal_entries)
   ──────────────────────────────────────────────────────────── */

export interface Account {
  id: string;
  code: string;
  name: string;
  account_type: string;        // asset, liability, equity, revenue, expense
  normal_balance: string;      // debit, credit
  subtype: string | null;
  description: string | null;
  currency: string;
  is_control_account: boolean;
  is_reconcilable: boolean;
  is_posting_allowed: boolean;
  is_system: boolean;
  is_active: boolean;
  detail_type: string | null;
  sort_order: number | null;
  parent_account_id: string | null;
  opening_balance: number | null;
  created_at: string;
}

/** Tax summary (business tax cockpit). */
export interface TaxSummary {
  year: number;
  revenue: number;
  deductible_expenses: number;
  taxable_income: number;
  estimated_tax: number;
  deduction_categories: Array<{ category: string; amount: number; count: number; percent_deductible: number }>;
  depreciable_assets: Array<{ id: string; name: string; cost: number; accumulated_depreciation: number; net_book_value: number }>;
  contractor_count: number;
  alerts: { uncategorized: number; missing_w9: number; unreconciled: number };
}

/** Sales tax jurisdiction. */
export interface TaxJurisdiction {
  id: string;
  code: string;
  name: string;
  country: string;
  state: string | null;
  locality: string | null;
  registration_number: string | null;
}

/** Sales tax rate / code. */
export interface TaxCode {
  id: string;
  code: string;
  name: string;
  rate: number;
  jurisdiction_id: string | null;
  recoverable_percent: number | null;
  is_compound: boolean | null;
}

/** Sales tax filing. */
export interface TaxFiling {
  id: string;
  period_start: string;
  period_end: string;
  status: string;        // draft, filed, paid
  jurisdiction_id: string | null;
  taxable_sales: number | null;
  tax_collected: number | null;
  tax_remitted: number | null;
  confirmation_ref: string | null;
  created_at: string;
}

export interface CrmStats {
  total_customers: number;
  active_customers: number;
  total_leads: number;
  open_leads: number;
  total_segments: number;
  total_notes: number;
  open_tasks: number;
  total_tags: number;
  open_ar: number;
  lifetime_value: number;
}

/* ── Catalog products — the global Catalog list + the ProductProfile page ── */

export interface CatalogProductSummary {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  short_description: string | null;
  status: string; // draft | published | archived
  category: { id: string; name: string; slug: string } | null;
  brand: string | null;
  tags: string[];
  is_featured: boolean;
  is_new: boolean;
  is_best_seller: boolean;
  is_house_favorite: boolean;
  fulfillment_type: string;
  variant_count: number;
  active_variant_count: number;
  price_min: number | null;
  price_max: number | null;
  units_sold: number;
  order_count: number;
  revenue: number;
  created_at: string;
  updated_at: string;
  published_at: string | null;
}

export interface ProductVariantRow {
  id: string;
  sku: string;
  size: string | null;
  color: string | null;
  price: number;
  compare_at_price: number | null;
  is_active: boolean;
  status: string;
  in_stock: boolean | null;
  stock_quantity: number | null;
  reorder_level: number | null;
  weight_lb: number | null;
  updated_at: string;
}

export interface ProductOrderRow {
  id: string;
  order_number: string;
  placed_at: string | null;
  customer_name: string;
  customer_email: string | null;
  destination: string;
  status: string;
  shipping_method: string | null;
  shipping_cost: number | null;
  order_total: number;
  qty: number;
  line_total: number;
}

export interface ProductDesignRow {
  id: string;
  name: string;
  status: string;
  retail_price: number | null;
  product_type: string | null;
  garment_color: string | null;
  publications: number;
  sample_mockup: string | null;
  latest_published_at: string | null;
}

export interface ProductDetail {
  product: CatalogProductSummary & {
    details: string | null;
    specifications: string | null;
    directions: string | null;
    warnings: string | null;
    owner_type: string;
    supplier_id: string | null;
    preferred_supplier_id: string | null;
  };
  variants: ProductVariantRow[];
  orders: ProductOrderRow[];
  shipping: {
    observed: { method: string; orders: number; avg_cost: number; last_used: string | null }[];
    supplier_rates: {
      supplier_name: string; profile_name: string; method_name: string;
      origin_country: string | null; first_item_cost: number | null;
      additional_item_cost: number | null; min_days: number | null; max_days: number | null;
    }[];
  };
  pricing: {
    variant_prices: { variant_id: string; sku: string; size: string | null; color: string | null; price: number; compare_at_price: number | null }[];
    design_prices: { design_id: string; name: string; retail_price: number | null }[];
  };
  designs: ProductDesignRow[];
  stats: {
    variant_count: number;
    active_variant_count: number;
    price_min: number | null;
    price_max: number | null;
    units_sold: number;
    order_count: number;
    revenue: number;
    design_count: number;
  };
}

/* ────────────────────────────────────────────────────────────
   Resilient fetch — never throws on HTML/non-JSON responses
   ──────────────────────────────────────────────────────────── */

type FetchResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; status: number };

export async function fetchJson<T>(url: string, init?: RequestInit): Promise<FetchResult<T>> {
  try {
    const res = await fetch(url, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
    });
    const ctype = res.headers.get('content-type') || '';
    if (!ctype.includes('application/json')) {
      // HTML error page / proxy hiccup — degrade gracefully, never crash
      return { ok: false, error: `Server returned ${ctype || 'unknown content type'} (${res.status})`, status: res.status };
    }
    const json = await res.json();
    if (!res.ok) {
      return { ok: false, error: json?.error?.message || `Request failed (${res.status})`, status: res.status };
    }
    return { ok: true, data: json as T };
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : 'Network error', status: 0 };
  }
}

/* ────────────────────────────────────────────────────────────
   Module-level cache — instant renders on revisit
   ──────────────────────────────────────────────────────────── */

interface CacheEntry { data: unknown; at: number }
const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<unknown>>();

function readCache<T>(key: string): T | undefined {
  return cache.get(key)?.data as T | undefined;
}
function writeCache(key: string, data: unknown) {
  cache.set(key, { data, at: Date.now() });
}

/** Remove a party/customer from every cache key (after delete/archive). */
function evictFromAllCaches(match: (item: { id: string }) => boolean) {
  for (const [key, entry] of cache.entries()) {
    if (Array.isArray(entry.data)) {
      writeCache(key, (entry.data as { id: string }[]).filter(i => !match(i)));
    }
  }
}

/* ────────────────────────────────────────────────────────────
   useList — cache-first list hook (the workhorse)
   ──────────────────────────────────────────────────────────── */

export function useList<T extends { id: string }>(
  key: string,
  url: string,
  transform?: (raw: unknown) => T[],
  options?: { enabled?: boolean },
): { data: T[]; loaded: boolean; error: string | null; refresh: () => void; setData: (d: T[]) => void } {
  const enabled = options?.enabled !== false;
  // First render: cached data or [] — the screen paints IMMEDIATELY
  const [data, setData] = useState<T[]>(() => readCache<T[]>(key) ?? []);
  const [loaded, setLoaded] = useState<boolean>(() => cache.has(key));
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const mounted = useRef(true);

  const refresh = useCallback(() => setTick(t => t + 1), []);

  useEffect(() => {
    mounted.current = true;
    if (!enabled) return;

    // Background revalidation (stale-while-revalidate). Dedupes concurrent
    // mounts on the same key so we don't fire duplicate requests. State is
    // only set from the async continuation — never synchronously.
    let p = inflight.get(url) as Promise<void> | undefined;
    if (!p) {
      p = (async () => {
        const res = await fetchJson<{ data: unknown }>(url);
        if (res.ok) {
          const items = transform ? transform(res.data.data) : (res.data.data as T[]);
          writeCache(key, items);
        }
        inflight.delete(url);
      })();
      inflight.set(url, p);
    }
    p.then(() => {
      if (!mounted.current) return;
      const fresh = readCache<T[]>(key);
      if (fresh) { setData(fresh); setLoaded(true); setError(null); }
    });

    return () => { mounted.current = false; };
  }, [key, url, tick, enabled]);

  return { data, loaded, error, refresh, setData };
}

/* ────────────────────────────────────────────────────────────
   Party hooks (unified list across customers/vendors/suppliers/leads)
   ──────────────────────────────────────────────────────────── */

export function useParties(role?: string, q?: string) {
  const params = new URLSearchParams();
  if (role && role !== 'all') params.set('role', role);
  if (q) params.set('q', q);
  const url = `/api/parties${params.toString() ? '?' + params.toString() : ''}`;
  return useList<UnifiedParty>(`parties:${role || 'all'}:${q || ''}`, url);
}

/* ────────────────────────────────────────────────────────────
   CRM entity hooks
   ──────────────────────────────────────────────────────────── */

export function useCrmCustomers(q?: string, status?: string) {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (status && status !== 'all') params.set('status', status);
  const url = `/api/crm/customers${params.toString() ? '?' + params.toString() : ''}`;
  return useList<CrmCustomer>(`crmCustomers:${q || ''}:${status || ''}`, url);
}

export function useCrmLeads(status?: string) {
  const params = new URLSearchParams();
  if (status && status !== 'all') params.set('status', status);
  const url = `/api/crm/leads${params.toString() ? '?' + params.toString() : ''}`;
  return useList<CrmLead>(`crmLeads:${status || ''}`, url);
}

/** Deals — optionally scoped to a customer, lead, or pipeline. */
export function useDeals(filters?: { customerId?: string; leadId?: string; pipelineId?: string }) {
  const params = new URLSearchParams();
  if (filters?.customerId) params.set('customer_id', filters.customerId);
  if (filters?.leadId) params.set('lead_id', filters.leadId);
  if (filters?.pipelineId) params.set('pipeline_id', filters.pipelineId);
  const url = `/api/crm/deals${params.toString() ? '?' + params.toString() : ''}`;
  const key = `crmDeals:${filters?.customerId || ''}:${filters?.leadId || ''}:${filters?.pipelineId || ''}`;
  return useList<Deal>(key, url);
}

/** All pipelines (with their stages if the API joins them). */
export function usePipelines() {
  return useList<Pipeline>('crmPipelines', '/api/crm/pipelines');
}

/** Stages for one pipeline. */
export function usePipelineStages(pipelineId: string | null) {
  const url = pipelineId ? `/api/crm/pipeline-stages?pipeline_id=${pipelineId}` : '/api/crm/pipeline-stages';
  return useList<PipelineStage>(`crmStages:${pipelineId || 'all'}`, url, undefined, { enabled: !!pipelineId });
}

/** Lead scoring rules (crm_lead_scoring_rules). */
export function useScoringRules() {
  return useList<ScoringRule>('crmScoringRules', '/api/crm/lead-scoring-rules');
}

/** Score bands (crm_lead_score_bands) — hot/warm/cold thresholds. */
export function useScoreBands() {
  return useList<ScoreBand>('crmScoreBands', '/api/crm/lead-score-bands');
}

/** Invoices — from /api/v1/documents?type=Invoice (acct_ar_invoices). */
export function useInvoices(filters?: { customerId?: string }) {
  const params = new URLSearchParams();
  if (filters?.customerId) params.set('customer_id', filters.customerId);
  const url = `/api/v1/documents?type=Invoice${params.toString() ? '&' + params.toString() : ''}`;
  return useList<InvoiceRow>(`invoices:${filters?.customerId || 'all'}`, url);
}

/** Estimates — from /api/estimates (acct_estimates). */
export function useEstimates(filters?: { customerId?: string }) {
  const params = new URLSearchParams();
  if (filters?.customerId) params.set('customer_id', filters.customerId);
  const url = `/api/estimates${params.toString() ? '?' + params.toString() : ''}`;
  return useList<EstimateRow>(`estimates:${filters?.customerId || 'all'}`, url);
}

/** Bank transactions — from /api/bank-transactions (acct_bank_transactions). */
export function useBankTransactions(filters?: { accountId?: string; status?: string }) {
  const params = new URLSearchParams();
  if (filters?.accountId) params.set('account_id', filters.accountId);
  if (filters?.status && filters.status !== 'all') params.set('status', filters.status);
  const url = `/api/bank-transactions${params.toString() ? '?' + params.toString() : ''}`;
  const key = `bankTxns:${filters?.accountId || 'all'}:${filters?.status || 'all'}`;
  return useList<BankTransaction>(key, url);
}

/** Bank rules — from /api/bank-rules (acct_bank_rules). */
export function useBankRules() {
  return useList<BankRule>('bankRules', '/api/bank-rules');
}

/** Reconciliations — from /api/reconciliations (acct_reconciliations). */
export function useReconciliations(accountId?: string) {
  const params = new URLSearchParams();
  if (accountId) params.set('account_id', accountId);
  const url = `/api/reconciliations${params.toString() ? '?' + params.toString() : ''}`;
  return useList<Reconciliation>(`reconciliations:${accountId || 'all'}`, url);
}

/** Chart of Accounts — from /api/accounts (acct_chart_of_accounts). */
export function useAccounts(filters?: { type?: string; active?: boolean; q?: string }) {
  const params = new URLSearchParams();
  if (filters?.type && filters.type !== 'all') params.set('type', filters.type);
  if (filters?.active) params.set('active', 'true');
  if (filters?.q) params.set('q', filters.q);
  const url = `/api/accounts${params.toString() ? '?' + params.toString() : ''}`;
  const key = `accounts:${filters?.type || 'all'}:${filters?.active ? 'active' : 'all'}:${filters?.q || ''}`;
  return useList<Account>(key, url);
}

/** Tax summary — from /api/tax/summary. Not a list — fetches a single summary object. */
export function useTaxSummary(year?: number) {
  const [data, setData] = useState<TaxSummary | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    const y = year || new Date().getFullYear();
    fetch(`/api/tax/summary?year=${y}`)
      .then((r) => r.json())
      .then((json) => { if (!cancelled && json.data) { setData(json.data); setError(null); } else if (!cancelled && json.error) { setError(json.error.message); } })
      .catch((e) => { if (!cancelled) setError(String(e)); })
      .finally(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, [year, tick]);

  return { data, loaded, error, refresh };
}

/** Sales tax jurisdictions — from /api/sales-tax/jurisdictions. */
export function useTaxJurisdictions() {
  return useList<TaxJurisdiction>('taxJurisdictions', '/api/sales-tax/jurisdictions');
}

/** Sales tax rates/codes — from /api/sales-tax/rates. */
export function useTaxRates() {
  return useList<TaxCode>('taxRates', '/api/sales-tax/rates');
}

/** Sales tax filings — from /api/sales-tax/filings. */
export function useTaxFilings() {
  return useList<TaxFiling>('taxFilings', '/api/sales-tax/filings');
}

export function useCrmSegments() {
  return useList<CrmSegment>('crmSegments', '/api/crm/segments');
}

export function useProducts(q?: string, status?: string) {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (status && status !== 'all') params.set('status', status);
  const url = `/api/products${params.toString() ? '?' + params.toString() : ''}`;
  return useList<CatalogProductSummary>(`products:${q || ''}:${status || ''}`, url);
}

export function useProductCategories() {
  return useList<{ id: string; name: string; slug: string; parent_id: string | null }>(
    'productCategories', '/api/products/categories');
}

export function useCrmNotes(customerId: string | null) {
  // Cache-first scoped notes. `enabled` gates the fetch so no customerId
  // means no request — the hook just returns an empty list.
  const { data, loaded, refresh, setData } = useList<CrmNote>(
    `crmNotes:${customerId || 'none'}`,
    customerId ? `/api/crm/notes?customer_id=${customerId}` : '/api/crm/notes',
    undefined,
    { enabled: !!customerId },
  );
  return customerId
    ? { data, loaded, refresh, setData }
    : { data: EMPTY_NOTES, loaded: true, refresh, setData };
}
const EMPTY_NOTES: CrmNote[] = [];

export function useCrmTasks(customerId?: string, status?: string) {
  const params = new URLSearchParams();
  if (customerId) params.set('customer_id', customerId);
  if (status && status !== 'all') params.set('status', status);
  const url = `/api/crm/tasks${params.toString() ? '?' + params.toString() : ''}`;
  return useList<CrmTask>(`crmTasks:${customerId || ''}:${status || ''}`, url);
}

/** Single customer with notes/tasks/activity — cache-first like the lists. */
export function useCrmCustomer(id: string | null): {
  data: CrmCustomer | null;
  loaded: boolean;
  refresh: () => void;
} {
  const key = `crmCustomer:${id || 'none'}`;
  const url = id ? `/api/crm/customers/${id}` : '';
  const [data, setData] = useState<CrmCustomer | null>(() => readCache<CrmCustomer>(key) ?? null);
  const [loaded, setLoaded] = useState<boolean>(() => cache.has(key));
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick(t => t + 1), []);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    if (!url) return; // no id → no fetch; the null case is derived below
    let p = inflight.get(url) as Promise<void> | undefined;
    if (!p) {
      p = (async () => {
        const res = await fetchJson<{ data: unknown }>(url);
        if (res.ok) writeCache(key, res.data.data);
        inflight.delete(url);
      })();
      inflight.set(url, p);
    }
    p.then(() => {
      if (!mounted.current) return;
      const fresh = readCache<CrmCustomer>(key);
      if (fresh) { setData(fresh); setLoaded(true); }
    });
    return () => { mounted.current = false; };
  }, [key, url, tick]);

  // No selection → null data without touching stale state.
  if (!id) return { data: null, loaded: true, refresh };
  return { data, loaded, refresh };
}

/** useParty — the unified single-party fetch. Works for ANY party type
 *  (customer / vendor / supplier / lead) via the `source` discriminator.
 *  This is what PartyProfile reads — one profile page for all party types. */
export function useParty(id: string | null, source: string | null): {
  data: PartyDetail | null;
  loaded: boolean;
  refresh: () => void;
} {
  const key = `party:${source || 'none'}:${id || 'none'}`;
  const url = id && source ? `/api/parties/${id}?source=${source}` : '';
  const [data, setData] = useState<PartyDetail | null>(() => readCache<PartyDetail>(key) ?? null);
  const [loaded, setLoaded] = useState<boolean>(() => cache.has(key));
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick(t => t + 1), []);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    if (!url) return;
    let p = inflight.get(url) as Promise<void> | undefined;
    if (!p) {
      p = (async () => {
        const res = await fetchJson<{ data: unknown }>(url);
        if (res.ok) writeCache(key, res.data.data);
        inflight.delete(url);
      })();
      inflight.set(url, p);
    }
    p.then(() => {
      if (!mounted.current) return;
      const fresh = readCache<PartyDetail>(key);
      if (fresh) { setData(fresh); setLoaded(true); }
    });
    return () => { mounted.current = false; };
  }, [key, url, tick]);

  if (!id || !source) return { data: null, loaded: true, refresh };
  return { data, loaded, refresh };
}

/** useProduct — the single-product fetch behind the ProductProfile page
 *  (product + variants + orders + shipping + pricing + designs in one). */
export function useProduct(id: string | null): {
  data: ProductDetail | null;
  loaded: boolean;
  refresh: () => void;
} {
  const key = `product:${id || 'none'}`;
  const url = id ? `/api/products/${id}` : '';
  const [data, setData] = useState<ProductDetail | null>(() => readCache<ProductDetail>(key) ?? null);
  const [loaded, setLoaded] = useState<boolean>(() => cache.has(key));
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick(t => t + 1), []);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    if (!url) return;
    let p = inflight.get(url) as Promise<void> | undefined;
    if (!p) {
      p = (async () => {
        const res = await fetchJson<{ data: unknown }>(url);
        if (res.ok) writeCache(key, res.data.data);
        inflight.delete(url);
      })();
      inflight.set(url, p);
    }
    p.then(() => {
      if (!mounted.current) return;
      const fresh = readCache<ProductDetail>(key);
      if (fresh) { setData(fresh); setLoaded(true); }
    });
    return () => { mounted.current = false; };
  }, [key, url, tick]);

  if (!id) return { data: null, loaded: true, refresh };
  return { data, loaded, refresh };
}

/** Stats hook — cache-first like the lists. */
export function useCrmStats(): { data: CrmStats | null; refresh: () => void } {
  const [data, setData] = useState<CrmStats | null>(() => readCache<CrmStats>('crmStats') ?? null);
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick(t => t + 1), []);

  useEffect(() => {
    let mounted = true;
    fetchJson<{ data: CrmStats }>('/api/crm/stats').then(res => {
      if (res.ok && mounted) {
        writeCache('crmStats', res.data.data);
        setData(res.data.data);
      }
    });
    return () => { mounted = false; };
  }, [tick]);

  return { data, refresh };
}

/* ────────────────────────────────────────────────────────────
   Mutations — optimistic; Supabase is hit ONLY on save
   ──────────────────────────────────────────────────────────── */

export function usePlatformMutations(onToast?: (m: string) => void) {
  const toast = onToast || (() => {});

  /** Create a party (routes to the right table by role). */
  const createParty = useCallback(async (
    input: Record<string, unknown> & { role: string },
  ): Promise<{ ok: boolean; data?: any; error?: string }> => {
    const res = await fetchJson<{ data: any }>('/api/parties', { method: 'POST', body: JSON.stringify(input) });
    if (res.ok) {
      toast(`${input.role === 'vendor' ? 'Vendor' : input.role === 'supplier' ? 'Supplier' : input.role === 'lead' ? 'Lead' : input.role === 'seller' ? 'Seller' : 'Customer'} created`);
      return { ok: true, data: res.data.data };
    }
    toast(`Save failed: ${res.error}`);
    return { ok: false, error: res.error };
  }, [toast]);

  const createCustomer = useCallback(async (input: Partial<CrmCustomer> & { first_name?: string | null }) => {
    const res = await fetchJson<{ data: CrmCustomer }>('/api/crm/customers', { method: 'POST', body: JSON.stringify(input) });
    if (res.ok) toast('Customer created');
    else toast(`Save failed: ${res.error}`);
    return res;
  }, [toast]);

  const updateCustomer = useCallback(async (id: string, updates: Partial<CrmCustomer>) => {
    const res = await fetchJson<{ data: CrmCustomer }>(`/api/crm/customers/${id}`, { method: 'PATCH', body: JSON.stringify(updates) });
    if (res.ok) toast('Saved');
    else toast(`Save failed: ${res.error}`);
    return res;
  }, [toast]);

  const archiveCustomer = useCallback(async (id: string) => {
    const res = await fetchJson<{ data: any }>(`/api/crm/customers/${id}`, { method: 'DELETE' });
    if (res.ok) { evictFromAllCaches(i => i.id === id); toast('Customer archived'); }
    else toast(`Archive failed: ${res.error}`);
    return res;
  }, [toast]);

  const createLead = useCallback(async (input: Partial<CrmLead>) => {
    const res = await fetchJson<{ data: CrmLead }>('/api/crm/leads', { method: 'POST', body: JSON.stringify(input) });
    if (res.ok) toast('Lead created');
    else toast(`Save failed: ${res.error}`);
    return res;
  }, [toast]);

  const updateLead = useCallback(async (id: string, updates: Partial<CrmLead>) => {
    const res = await fetchJson<{ data: CrmLead; converted_customer?: any }>(`/api/crm/leads/${id}`, { method: 'PATCH', body: JSON.stringify(updates) });
    if (res.ok) {
      if (updates.status === 'converted' && res.data.converted_customer) {
        toast('Lead converted — customer created');
      } else {
        toast('Saved');
      }
    } else toast(`Save failed: ${res.error}`);
    return res;
  }, [toast]);

  const deleteLead = useCallback(async (id: string) => {
    const res = await fetchJson<{ data: any }>(`/api/crm/leads/${id}`, { method: 'DELETE' });
    if (res.ok) { evictFromAllCaches(i => i.id === id); toast('Lead deleted'); }
    else toast(`Delete failed: ${res.error}`);
    return res;
  }, [toast]);

  const createNote = useCallback(async (input: { customer_id?: string; body: string; note_type?: string }) => {
    const res = await fetchJson<{ data: CrmNote }>('/api/crm/notes', { method: 'POST', body: JSON.stringify(input) });
    if (res.ok) toast('Note added');
    else toast(`Save failed: ${res.error}`);
    return res;
  }, [toast]);

  const updateNote = useCallback(async (id: string, updates: Partial<Pick<CrmNote, 'body' | 'note_type'>>) => {
    const res = await fetchJson<{ data: CrmNote }>(`/api/crm/notes/${id}`, { method: 'PATCH', body: JSON.stringify(updates) });
    if (res.ok) toast('Note saved');
    else toast(`Save failed: ${res.error}`);
    return res;
  }, [toast]);

  const deleteNote = useCallback(async (id: string) => {
    const res = await fetchJson<{ data: { id: string; deleted: boolean } }>(`/api/crm/notes/${id}`, { method: 'DELETE' });
    if (res.ok) toast('Note deleted');
    else toast(`Delete failed: ${res.error}`);
    return res;
  }, [toast]);

  const createTask = useCallback(async (input: Partial<CrmTask>) => {
    const res = await fetchJson<{ data: CrmTask }>('/api/crm/tasks', { method: 'POST', body: JSON.stringify(input) });
    if (res.ok) toast('Task created');
    else toast(`Save failed: ${res.error}`);
    return res;
  }, [toast]);

  const updateTask = useCallback(async (id: string, updates: Partial<Pick<CrmTask, 'title' | 'priority' | 'due_at' | 'status'>>) => {
    const res = await fetchJson<{ data: CrmTask }>(`/api/crm/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(updates) });
    if (res.ok) toast('Task saved');
    else toast(`Save failed: ${res.error}`);
    return res;
  }, [toast]);

  const deleteTask = useCallback(async (id: string) => {
    const res = await fetchJson<{ data: { id: string; deleted: boolean } }>(`/api/crm/tasks/${id}`, { method: 'DELETE' });
    if (res.ok) toast('Task deleted');
    else toast(`Delete failed: ${res.error}`);
    return res;
  }, [toast]);

  // ── Deals & Pipelines ──
  const createDeal = useCallback(async (input: Partial<Deal> & { name: string; pipeline_id: string; stage_id: string; amount: number }) => {
    const res = await fetchJson<{ data: Deal }>('/api/crm/deals', { method: 'POST', body: JSON.stringify(input) });
    if (res.ok) toast('Deal created');
    else toast(`Save failed: ${res.error}`);
    return res;
  }, [toast]);

  const updateDeal = useCallback(async (id: string, updates: Partial<Deal>) => {
    const res = await fetchJson<{ data: Deal }>(`/api/crm/deals/${id}`, { method: 'PATCH', body: JSON.stringify(updates) });
    if (res.ok) toast('Deal saved');
    else toast(`Save failed: ${res.error}`);
    return res;
  }, [toast]);

  const deleteDeal = useCallback(async (id: string) => {
    const res = await fetchJson<{ data: { id: string; deleted: boolean } }>(`/api/crm/deals/${id}`, { method: 'DELETE' });
    if (res.ok) { evictFromAllCaches(i => i.id === id); toast('Deal deleted'); }
    else toast(`Delete failed: ${res.error}`);
    return res;
  }, [toast]);

  const createPipeline = useCallback(async (input: Partial<Pipeline> & { name: string }) => {
    const res = await fetchJson<{ data: Pipeline }>('/api/crm/pipelines', { method: 'POST', body: JSON.stringify(input) });
    if (res.ok) toast('Pipeline created');
    else toast(`Save failed: ${res.error}`);
    return res;
  }, [toast]);

  const updatePipeline = useCallback(async (id: string, updates: Partial<Pipeline>) => {
    const res = await fetchJson<{ data: Pipeline }>(`/api/crm/pipelines/${id}`, { method: 'PATCH', body: JSON.stringify(updates) });
    if (res.ok) toast('Pipeline saved');
    else toast(`Save failed: ${res.error}`);
    return res;
  }, [toast]);

  const createPipelineStage = useCallback(async (input: Partial<PipelineStage> & { pipeline_id: string; name: string; sort_order: number }) => {
    const res = await fetchJson<{ data: PipelineStage }>('/api/crm/pipeline-stages', { method: 'POST', body: JSON.stringify(input) });
    if (res.ok) toast('Stage created');
    else toast(`Save failed: ${res.error}`);
    return res;
  }, [toast]);

  // ── Lead scoring rules ──
  const createScoringRule = useCallback(async (input: Partial<ScoringRule> & { field: string; operator: string; points: number }) => {
    const res = await fetchJson<{ data: ScoringRule }>('/api/crm/lead-scoring-rules', { method: 'POST', body: JSON.stringify(input) });
    if (res.ok) toast('Scoring rule created');
    else toast(`Save failed: ${res.error}`);
    return res;
  }, [toast]);

  const updateScoringRule = useCallback(async (id: string, updates: Partial<ScoringRule>) => {
    const res = await fetchJson<{ data: ScoringRule }>(`/api/crm/lead-scoring-rules/${id}`, { method: 'PATCH', body: JSON.stringify(updates) });
    if (res.ok) toast('Rule updated');
    else toast(`Save failed: ${res.error}`);
    return res;
  }, [toast]);

  const deleteScoringRule = useCallback(async (id: string) => {
    const res = await fetchJson<{ data: { id: string; deleted: boolean } }>(`/api/crm/lead-scoring-rules/${id}`, { method: 'DELETE' });
    if (res.ok) toast('Rule deleted');
    else toast(`Delete failed: ${res.error}`);
    return res;
  }, [toast]);

  const createScoreBand = useCallback(async (input: Partial<ScoreBand> & { label: string; min_score: number }) => {
    const res = await fetchJson<{ data: ScoreBand }>('/api/crm/lead-score-bands', { method: 'POST', body: JSON.stringify(input) });
    if (res.ok) toast('Score band created');
    else toast(`Save failed: ${res.error}`);
    return res;
  }, [toast]);

  // ── Invoice actions (wrap acct_send_invoice / acct_void_invoice / etc.) ──
  const sendInvoice = useCallback(async (id: string) => {
    const res = await fetchJson<{ data: unknown }>(`/api/invoices/${id}/send`, { method: 'POST', body: JSON.stringify({}) });
    if (res.ok) toast('Invoice sent');
    else toast(`Send failed: ${res.error}`);
    return res;
  }, [toast]);

  const voidInvoice = useCallback(async (id: string, reason?: string) => {
    const res = await fetchJson<{ data: unknown }>(`/api/invoices/${id}/void`, { method: 'POST', body: JSON.stringify({ reason: reason || 'Voided by user' }) });
    if (res.ok) toast('Invoice voided');
    else toast(`Void failed: ${res.error}`);
    return res;
  }, [toast]);

  const markInvoicePaid = useCallback(async (id: string, opts?: { amount?: number; method?: string; reference?: string }) => {
    const res = await fetchJson<{ data: unknown }>(`/api/invoices/${id}/mark-paid`, { method: 'POST', body: JSON.stringify(opts || {}) });
    if (res.ok) toast('Invoice marked paid');
    else toast(`Mark paid failed: ${res.error}`);
    return res;
  }, [toast]);

  const postInvoice = useCallback(async (id: string) => {
    const res = await fetchJson<{ data: unknown }>(`/api/invoices/${id}/post`, { method: 'POST', body: JSON.stringify({}) });
    if (res.ok) toast('Invoice posted');
    else toast(`Post failed: ${res.error}`);
    return res;
  }, [toast]);

  // ── Estimate convert (wraps acct_convert_estimate) ──
  const convertEstimate = useCallback(async (id: string) => {
    const res = await fetchJson<{ data: unknown; invoice_id?: string; invoice_number?: string }>(`/api/estimates/${id}/convert`, { method: 'POST', body: JSON.stringify({}) });
    if (res.ok) {
      const inv = (res.data as { invoice_number?: string } | undefined)?.invoice_number;
      toast(inv ? `Estimate converted → invoice ${inv}` : 'Estimate converted → invoice');
    } else toast(`Convert failed: ${res.error}`);
    return res;
  }, [toast]);

  // ── Bank transactions (categorize / match / exclude) ──
  const categorizeBankTxn = useCallback(async (id: string, category: string) => {
    const res = await fetchJson<{ data: unknown }>(`/api/bank-transactions/${id}`, { method: 'PATCH', body: JSON.stringify({ category, status: 'categorized' }) });
    if (res.ok) toast('Transaction categorized');
    else toast(`Categorize failed: ${res.error}`);
    return res;
  }, [toast]);

  const excludeBankTxn = useCallback(async (id: string) => {
    const res = await fetchJson<{ data: unknown }>(`/api/bank-transactions/${id}`, { method: 'PATCH', body: JSON.stringify({ excluded: true }) });
    if (res.ok) toast('Transaction excluded');
    else toast(`Exclude failed: ${res.error}`);
    return res;
  }, [toast]);

  const matchBankTxn = useCallback(async (id: string, documentId: string, documentType?: string) => {
    const res = await fetchJson<{ data: unknown }>(`/api/bank-transactions/${id}/match`, { method: 'POST', body: JSON.stringify({ document_id: documentId, document_type: documentType }) });
    if (res.ok) toast('Transaction matched');
    else toast(`Match failed: ${res.error}`);
    return res;
  }, [toast]);

  // ── Bank rules ──
  const createBankRule = useCallback(async (input: Partial<BankRule> & { name: string; condition_field: string; action: string }) => {
    const res = await fetchJson<{ data: BankRule }>('/api/bank-rules', { method: 'POST', body: JSON.stringify(input) });
    if (res.ok) toast('Bank rule created');
    else toast(`Save failed: ${res.error}`);
    return res;
  }, [toast]);

  const updateBankRule = useCallback(async (id: string, updates: Partial<BankRule>) => {
    const res = await fetchJson<{ data: BankRule }>(`/api/bank-rules/${id}`, { method: 'PATCH', body: JSON.stringify(updates) });
    if (res.ok) toast('Rule updated');
    else toast(`Save failed: ${res.error}`);
    return res;
  }, [toast]);

  const deleteBankRule = useCallback(async (id: string) => {
    const res = await fetchJson<{ data: { id: string; deleted: boolean } }>(`/api/bank-rules/${id}`, { method: 'DELETE' });
    if (res.ok) toast('Rule deleted');
    else toast(`Delete failed: ${res.error}`);
    return res;
  }, [toast]);

  // ── Reconciliations ──
  const startReconciliation = useCallback(async (input: { bank_account_id: string; statement_ending_balance: number; statement_ending_date?: string; service_charge?: number; interest_earned?: number }) => {
    const res = await fetchJson<{ data: unknown }>('/api/reconciliations', { method: 'POST', body: JSON.stringify(input) });
    if (res.ok) toast('Reconciliation started');
    else toast(`Start failed: ${res.error}`);
    return res;
  }, [toast]);

  const finishReconciliation = useCallback(async (id: string) => {
    const res = await fetchJson<{ data: unknown }>(`/api/reconciliations/${id}/finish`, { method: 'POST', body: JSON.stringify({}) });
    if (res.ok) toast('Reconciliation finished');
    else toast(`Finish failed: ${res.error}`);
    return res;
  }, [toast]);

  // ── Bills (approve — wraps acct_decide_bill) ──
  const approveBill = useCallback(async (id: string, decision?: 'approve' | 'reject') => {
    const res = await fetchJson<{ data: unknown }>(`/api/v1/documents/${id}/approve`, { method: 'POST', body: JSON.stringify({ decision: decision || 'approve' }) });
    if (res.ok) toast(decision === 'reject' ? 'Bill rejected' : 'Bill approved → Unpaid');
    else toast(`Approve failed: ${res.error}`);
    return res;
  }, [toast]);

  // ── Contractor invite (wraps acct_invite_contractor) ──
  const inviteContractor = useCallback(async (input: { email: string; name?: string; party_id?: string }) => {
    const res = await fetchJson<{ data: unknown }>('/api/contractors/invite', { method: 'POST', body: JSON.stringify(input) });
    if (res.ok) toast(`W-9 invite sent to ${input.email}`);
    else toast(`Invite failed: ${res.error}`);
    return res;
  }, [toast]);

  // ── Chart of Accounts ──
  const createAccount = useCallback(async (input: Partial<Account> & { code: string; name: string; account_type: string }) => {
    const res = await fetchJson<{ data: Account }>('/api/accounts', { method: 'POST', body: JSON.stringify(input) });
    if (res.ok) toast(`Account ${input.code} created`);
    else toast(`Save failed: ${res.error}`);
    return res;
  }, [toast]);

  const updateAccount = useCallback(async (id: string, updates: Partial<Account>) => {
    const res = await fetchJson<{ data: Account }>(`/api/accounts/${id}`, { method: 'PATCH', body: JSON.stringify(updates) });
    if (res.ok) toast('Account saved');
    else toast(`Save failed: ${res.error}`);
    return res;
  }, [toast]);

  const deleteAccount = useCallback(async (id: string, hard?: boolean) => {
    const url = `/api/accounts/${id}${hard ? '?hard=true' : ''}`;
    const res = await fetchJson<{ data: unknown }>(url, { method: 'DELETE' });
    if (res.ok) toast(hard ? 'Account deleted' : 'Account deactivated');
    else toast(`Delete failed: ${res.error}`);
    return res;
  }, [toast]);

  const seedAccounts = useCallback(async () => {
    const res = await fetchJson<{ data: { seeded: number; total: number; message?: string } }>('/api/accounts/seed', { method: 'POST', body: JSON.stringify({}) });
    if (res.ok) toast(res.data?.message || `Seeded ${res.data?.seeded || 0} accounts`);
    else toast(`Seed failed: ${res.error}`);
    return res;
  }, [toast]);

  // ── Business Tax ──
  const generate1099s = useCallback(async (year?: number) => {
    const res = await fetchJson<{ data: unknown }>('/api/tax/1099s/generate', { method: 'POST', body: JSON.stringify({ year }) });
    if (res.ok) toast('1099s generated');
    else toast(`Generate failed: ${res.error}`);
    return res;
  }, [toast]);

  // ── Sales Tax ──
  const createTaxJurisdiction = useCallback(async (input: { code: string; name: string; country?: string; state?: string }) => {
    const res = await fetchJson<{ data: unknown }>('/api/sales-tax/jurisdictions', { method: 'POST', body: JSON.stringify(input) });
    if (res.ok) toast(`Jurisdiction ${input.name} created`);
    else toast(`Save failed: ${res.error}`);
    return res;
  }, [toast]);

  const createTaxRate = useCallback(async (input: { code: string; name: string; rate: number }) => {
    const res = await fetchJson<{ data: unknown }>('/api/sales-tax/rates', { method: 'POST', body: JSON.stringify(input) });
    if (res.ok) toast(`Tax code ${input.code} created`);
    else toast(`Save failed: ${res.error}`);
    return res;
  }, [toast]);

  const prepareTaxFiling = useCallback(async (input: { period_start: string; period_end: string; jurisdiction_id?: string }) => {
    const res = await fetchJson<{ data: unknown }>('/api/sales-tax/filings', { method: 'POST', body: JSON.stringify(input) });
    if (res.ok) toast('Sales tax filing prepared');
    else toast(`Prepare failed: ${res.error}`);
    return res;
  }, [toast]);

  const calculateTax = useCallback(async (input: { amount: number; jurisdiction_id?: string; tax_code?: string }) => {
    const res = await fetchJson<{ data: { tax: number; rate: number; total: number } }>('/api/sales-tax/calculate', { method: 'POST', body: JSON.stringify(input) });
    if (!res.ok) toast(`Calculate failed: ${res.error}`);
    return res;
  }, [toast]);

  // ── Lead convert/rescore (dedicated RPC routes) ──
  const convertLead = useCallback(async (id: string) => {
    const res = await fetchJson<{ data: unknown; customer_id?: string }>(`/api/crm/leads/${id}/convert`, { method: 'POST', body: JSON.stringify({}) });
    if (res.ok) toast('Lead converted → customer created');
    else toast(`Convert failed: ${res.error}`);
    return res;
  }, [toast]);

  const rescoreLead = useCallback(async (id: string) => {
    const res = await fetchJson<{ data: unknown; score?: number }>(`/api/crm/leads/${id}/rescore`, { method: 'POST', body: JSON.stringify({}) });
    if (res.ok) toast('Lead rescored');
    else toast(`Rescore failed: ${res.error}`);
    return res;
  }, [toast]);

  return {
    createParty, createCustomer, updateCustomer, archiveCustomer,
    createLead, updateLead, deleteLead, convertLead, rescoreLead,
    createNote, updateNote, deleteNote,
    createTask, updateTask, deleteTask,
    createDeal, updateDeal, deleteDeal,
    createPipeline, updatePipeline, createPipelineStage,
    createScoringRule, updateScoringRule, deleteScoringRule, createScoreBand,
    sendInvoice, voidInvoice, markInvoicePaid, postInvoice,
    convertEstimate,
    categorizeBankTxn, excludeBankTxn, matchBankTxn,
    createBankRule, updateBankRule, deleteBankRule,
    startReconciliation, finishReconciliation,
    approveBill,
    inviteContractor,
    createAccount, updateAccount, deleteAccount, seedAccounts,
    generate1099s,
    createTaxJurisdiction, createTaxRate, prepareTaxFiling, calculateTax,
  };
}

/** Back-compat alias for screens importing the old name. */
export const useCrmMutations = usePlatformMutations;
