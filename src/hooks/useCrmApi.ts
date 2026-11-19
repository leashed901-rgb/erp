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
import type {
  CrmDealRow,
  CrmPipelineRow,
  CrmPipelineStageRow,
  CrmDealStageHistoryRow,
  CrmPipelineSummaryRow,
  CrmLeadScoringRuleRow,
  CrmLeadScoreBandRow,
} from '@/lib/crmTypes';

/** Canonical DTO names from the CRM module docs (01–03), re-exported
 *  so screens import Deal / Pipeline / Lead / ScoringRule / ScoreBand
 *  from the same file they get the hooks from. */
export type { Deal, Pipeline, PipelineStage, Lead, ScoringRule, ScoreBand } from '@/lib/crmTypes';

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
  // Doc 07 vendor enrichment (present when the row is a pay-side party):
  contractorW9Status?: string | null;
  track1099?: boolean;
  vendorKind?: string | null;
  openBalance?: number;
  ytdPaid?: number;
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
  score?: number | null;
  priority?: string | null;
  scored_at?: string | null;
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
  standard_cost: number | null;
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
    income_account_id: string | null;
    cogs_account_id: string | null;
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
          const items = transform ? transform(res.data) : (res.data.data as T[]);
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

export function useCrmSegments() {
  return useList<CrmSegment>('crmSegments', '/api/crm/segments');
}

/* ────────────────────────────────────────────────────────────
   Deals + pipelines (doc 02) — same cache-first pattern
   ──────────────────────────────────────────────────────────── */

export function useCrmDeals(pipelineId?: string, customerId?: string) {
  const params = new URLSearchParams();
  if (pipelineId) params.set('pipeline_id', pipelineId);
  if (customerId) params.set('customer_id', customerId);
  const url = `/api/crm/deals${params.toString() ? '?' + params.toString() : ''}`;
  return useList<CrmDealRow>(`crmDeals:${pipelineId || ''}:${customerId || ''}`, url);
}

export function useCrmPipelines() {
  return useList<CrmPipelineRow>('crmPipelines', '/api/crm/pipelines');
}

export function useCrmPipelineStages(pipelineId?: string) {
  const url = pipelineId
    ? `/api/crm/pipeline-stages?pipeline_id=${encodeURIComponent(pipelineId)}`
    : '/api/crm/pipeline-stages';
  return useList<CrmPipelineStageRow>(`crmPipelineStages:${pipelineId || 'all'}`, url);
}

/** Stage-history timeline for one deal (the deal drawer). Gated like
 *  useCrmNotes: no dealId → no request, empty list. */
export function useDealStageHistory(dealId: string | null) {
  const { data, loaded, refresh } = useList<CrmDealStageHistoryRow>(
    `dealStageHistory:${dealId || 'none'}`,
    dealId ? `/api/crm/deals/${dealId}/stage-history` : '/api/crm/deals/none/stage-history',
    undefined,
    { enabled: !!dealId },
  );
  return dealId
    ? { data, loaded, refresh }
    : { data: EMPTY_HISTORY, loaded: true, refresh };
}
const EMPTY_HISTORY: CrmDealStageHistoryRow[] = [];

/** Pipeline summary report rows (crm_v_pipeline_summary via the API).
 *  The view's rows have no id column, so this uses the direct
 *  cache-first fetch pattern (like useCrmStats) instead of useList. */
export function usePipelineSummary(pipelineId?: string): {
  data: CrmPipelineSummaryRow[];
  loaded: boolean;
  refresh: () => void;
} {
  const key = `pipelineSummary:${pipelineId || 'all'}`;
  const url = pipelineId
    ? `/api/crm/pipelines/summary?pipeline_id=${encodeURIComponent(pipelineId)}`
    : '/api/crm/pipelines/summary';
  const [data, setData] = useState<CrmPipelineSummaryRow[]>(
    () => readCache<CrmPipelineSummaryRow[]>(key) ?? [],
  );
  const [loaded, setLoaded] = useState<boolean>(() => cache.has(key));
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick(t => t + 1), []);

  useEffect(() => {
    let mounted = true;
    fetchJson<{ data: CrmPipelineSummaryRow[] }>(url).then(res => {
      if (res.ok && mounted) {
        writeCache(key, res.data.data);
        setData(res.data.data);
        setLoaded(true);
      }
    });
    return () => { mounted = false; };
  }, [key, url, tick]);

  return { data, loaded, refresh };
}

/* ────────────────────────────────────────────────────────────
   Lead scoring (doc 03) — rules + the tenant's score bands
   ──────────────────────────────────────────────────────────── */

export function useLeadScoringRules() {
  return useList<CrmLeadScoringRuleRow>('leadScoringRules', '/api/crm/lead-scoring-rules');
}

/** The tenant's score-band thresholds (one row per tenant).
 *  Cache-first like useCrmStats; data is null until bands are set. */
export function useLeadScoreBands(): { data: CrmLeadScoreBandRow | null; refresh: () => void } {
  const [data, setData] = useState<CrmLeadScoreBandRow | null>(
    () => readCache<CrmLeadScoreBandRow>('leadScoreBands') ?? null,
  );
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick(t => t + 1), []);

  useEffect(() => {
    let mounted = true;
    fetchJson<{ data: CrmLeadScoreBandRow | null }>('/api/crm/lead-score-bands').then(res => {
      if (res.ok && mounted) {
        writeCache('leadScoreBands', res.data.data);
        setData(res.data.data);
      }
    });
    return () => { mounted = false; };
  }, [tick]);

  return { data, refresh };
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

  /* ── Deals + pipelines (doc 02) ── */

  const createDeal = useCallback(async (input: Partial<CrmDealRow> & { name: string }) => {
    const res = await fetchJson<{ data: CrmDealRow }>('/api/crm/deals', { method: 'POST', body: JSON.stringify(input) });
    if (res.ok) toast('Deal created');
    else toast(`Save failed: ${res.error}`);
    return res;
  }, [toast]);

  const updateDeal = useCallback(async (id: string, updates: Partial<CrmDealRow>) => {
    const res = await fetchJson<{ data: CrmDealRow }>(`/api/crm/deals/${id}`, { method: 'PATCH', body: JSON.stringify(updates) });
    if (res.ok) toast('Deal saved');
    else toast(`Save failed: ${res.error}`);
    return res;
  }, [toast]);

  const deleteDeal = useCallback(async (id: string) => {
    const res = await fetchJson<{ data: any }>(`/api/crm/deals/${id}`, { method: 'DELETE' });
    if (res.ok) { evictFromAllCaches(i => i.id === id); toast('Deal deleted'); }
    else toast(`Delete failed: ${res.error}`);
    return res;
  }, [toast]);

  /** Kanban drag: moves the deal through crm_move_deal so the stage
   *  history row is written too (a plain PATCH would skip it). */
  const moveDeal = useCallback(async (id: string, stageId: string, lostReason?: string) => {
    const res = await fetchJson<{ data: CrmDealRow }>(`/api/crm/deals/${id}/move`, {
      method: 'POST',
      body: JSON.stringify({ stage_id: stageId, ...(lostReason ? { lost_reason: lostReason } : {}) }),
    });
    if (res.ok) toast('Deal moved');
    else toast(`Move failed: ${res.error}`);
    return res;
  }, [toast]);

  const createPipeline = useCallback(async (input: Partial<CrmPipelineRow> & { name: string }) => {
    const res = await fetchJson<{ data: CrmPipelineRow }>('/api/crm/pipelines', { method: 'POST', body: JSON.stringify(input) });
    if (res.ok) toast('Pipeline created');
    else toast(`Save failed: ${res.error}`);
    return res;
  }, [toast]);

  const updatePipeline = useCallback(async (id: string, updates: Partial<CrmPipelineRow>) => {
    const res = await fetchJson<{ data: CrmPipelineRow }>(`/api/crm/pipelines/${id}`, { method: 'PATCH', body: JSON.stringify(updates) });
    if (res.ok) toast('Pipeline saved');
    else toast(`Save failed: ${res.error}`);
    return res;
  }, [toast]);

  const deletePipeline = useCallback(async (id: string) => {
    const res = await fetchJson<{ data: any }>(`/api/crm/pipelines/${id}`, { method: 'DELETE' });
    if (res.ok) { evictFromAllCaches(i => i.id === id); toast('Pipeline deleted'); }
    else toast(`Delete failed: ${res.error}`);
    return res;
  }, [toast]);

  const createPipelineStage = useCallback(async (input: Partial<CrmPipelineStageRow> & { pipeline_id: string; name: string }) => {
    const res = await fetchJson<{ data: CrmPipelineStageRow }>('/api/crm/pipeline-stages', { method: 'POST', body: JSON.stringify(input) });
    if (res.ok) toast('Stage created');
    else toast(`Save failed: ${res.error}`);
    return res;
  }, [toast]);

  const updatePipelineStage = useCallback(async (id: string, updates: Partial<CrmPipelineStageRow>) => {
    const res = await fetchJson<{ data: CrmPipelineStageRow }>(`/api/crm/pipeline-stages/${id}`, { method: 'PATCH', body: JSON.stringify(updates) });
    if (res.ok) toast('Stage saved');
    else toast(`Save failed: ${res.error}`);
    return res;
  }, [toast]);

  const deletePipelineStage = useCallback(async (id: string) => {
    const res = await fetchJson<{ data: any }>(`/api/crm/pipeline-stages/${id}`, { method: 'DELETE' });
    if (res.ok) { evictFromAllCaches(i => i.id === id); toast('Stage deleted'); }
    else toast(`Delete failed: ${res.error}`);
    return res;
  }, [toast]);

  /* ── Lead scoring + conversion (doc 03) ── */

  /** Recalculate a lead's score (crm_score_lead applies the rules). */
  const rescoreLead = useCallback(async (id: string) => {
    const res = await fetchJson<{ data: { lead_id: string; score: number } }>(`/api/crm/leads/${id}/rescore`, { method: 'POST' });
    if (res.ok) toast(`Lead rescored: ${res.data.data.score}`);
    else toast(`Rescore failed: ${res.error}`);
    return res;
  }, [toast]);

  /** Convert a lead (crm_convert_lead: role added, deal opened). */
  const convertLead = useCallback(async (id: string, opts?: { deal_name?: string; amount?: number; pipeline_id?: string }) => {
    const res = await fetchJson<{ data: { lead_id: string; deal_id: string } }>(`/api/crm/leads/${id}/convert`, {
      method: 'POST',
      body: JSON.stringify(opts || {}),
    });
    if (res.ok) toast('Lead converted — deal created');
    else toast(`Convert failed: ${res.error}`);
    return res;
  }, [toast]);

  const createScoringRule = useCallback(async (input: Partial<CrmLeadScoringRuleRow> & { name: string; field: string; operator: string; points: number }) => {
    const res = await fetchJson<{ data: CrmLeadScoringRuleRow }>('/api/crm/lead-scoring-rules', { method: 'POST', body: JSON.stringify(input) });
    if (res.ok) toast('Scoring rule created');
    else toast(`Save failed: ${res.error}`);
    return res;
  }, [toast]);

  const updateScoringRule = useCallback(async (id: string, updates: Partial<CrmLeadScoringRuleRow>) => {
    const res = await fetchJson<{ data: CrmLeadScoringRuleRow }>(`/api/crm/lead-scoring-rules/${id}`, { method: 'PATCH', body: JSON.stringify(updates) });
    if (res.ok) toast('Scoring rule saved');
    else toast(`Save failed: ${res.error}`);
    return res;
  }, [toast]);

  const deleteScoringRule = useCallback(async (id: string) => {
    const res = await fetchJson<{ data: any }>(`/api/crm/lead-scoring-rules/${id}`, { method: 'DELETE' });
    if (res.ok) { evictFromAllCaches(i => i.id === id); toast('Scoring rule deleted'); }
    else toast(`Delete failed: ${res.error}`);
    return res;
  }, [toast]);

  const updateScoreBands = useCallback(async (input: { hot_min: number; warm_min: number }) => {
    const res = await fetchJson<{ data: CrmLeadScoreBandRow }>('/api/crm/lead-score-bands', { method: 'PATCH', body: JSON.stringify(input) });
    if (res.ok) { writeCache('leadScoreBands', res.data.data); toast('Score bands saved'); }
    else toast(`Save failed: ${res.error}`);
    return res;
  }, [toast]);

  return {
    createParty, createCustomer, updateCustomer, archiveCustomer,
    createLead, updateLead, deleteLead,
    createNote, updateNote, deleteNote,
    createTask, updateTask, deleteTask,
    createDeal, updateDeal, deleteDeal, moveDeal,
    createPipeline, updatePipeline, deletePipeline,
    createPipelineStage, updatePipelineStage, deletePipelineStage,
    rescoreLead, convertLead,
    createScoringRule, updateScoringRule, deleteScoringRule, updateScoreBands,
  };
}

/** Back-compat alias for screens importing the old name. */
export const useCrmMutations = usePlatformMutations;

// Re-export hooks that moved to useCrmDomain (agents A+B refactored)
export { useDeals, usePipelines, usePipelineStages } from './useCrmDomain';
