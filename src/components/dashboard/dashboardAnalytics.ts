'use client';

/**
 * Live data loaders + aggregation helpers for the dashboard analytics
 * views (OverviewViews / AnalyticsViews). Every number those views show
 * comes from here: ERP orders, the accounting P&L report, support
 * tickets, returns, the product catalog, and the accounting overview.
 * There is no traffic/analytics source in the platform, so session /
 * conversion metrics are intentionally absent — the views render an
 * honest "not connected" state for them.
 */

export interface OrderRow {
  id: string;
  orderNumber: string;
  channel: string | null;
  customerId: string | null;
  customerName: string | null;
  customerEmail: string | null;
  status: string;
  displayStatus: string;
  fulfillmentMethod: string | null;
  orderDate: string;
  total: number;
  amountPaid: number;
  amountRefunded: number;
  discountTotal: number;
  paymentStatus: string;
  onHold: boolean;
  needsAttention: boolean;
  itemCount: number;
}

export interface PnlTotals {
  income: number;
  cogs: number;
  grossProfit: number;
  expenses: number;
  net: number;
  subs: { label: string; amount: number; section: string }[];
}

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export function parseMoney(s: string | undefined): number {
  if (!s) return 0;
  const neg = s.includes('−') || s.startsWith('(');
  const n = Number(s.replace(/[^0-9.]/g, ''));
  if (!Number.isFinite(n)) return 0;
  return neg ? -n : n;
}

export async function loadOrders(): Promise<OrderRow[]> {
  const d = await getJson<{ data?: OrderRow[] } | OrderRow[]>('/api/v1/orders');
  if (!d) return [];
  return Array.isArray(d) ? d : (d.data ?? []);
}

export async function loadPnl(fromISO: string, toISO: string): Promise<PnlTotals | null> {
  const d = await getJson<{ data?: { rows?: { kind: string; label?: string; cells?: string[] }[] } }>(
    `/api/accounting/reports/pnl?from=${fromISO}&to=${toISO}`
  );
  const rows = d?.data?.rows;
  if (!rows) return null;
  const totals: Record<string, number> = {};
  const subs: PnlTotals['subs'] = [];
  let section = '';
  for (const r of rows) {
    if (r.kind === 'section') {
      section = r.cells?.[0] ?? section;
    } else if (r.kind === 'total' || r.kind === 'final') {
      if (r.label) totals[r.label] = parseMoney(r.cells?.[0]);
    } else if (r.kind === 'sub' && r.cells && r.cells.length >= 2) {
      subs.push({ label: r.cells[0], amount: parseMoney(r.cells[1]), section });
    }
  }
  return {
    income: totals['Total income'] ?? 0,
    cogs: totals['Total COGS'] ?? 0,
    grossProfit: totals['Gross profit'] ?? 0,
    expenses: totals['Total expenses'] ?? 0,
    net: totals['Net operating income'] ?? 0,
    subs,
  };
}

export interface TicketRow {
  id: string;
  status: string;
  priority: string;
  category: string | null;
  created_at: string;
  first_public_reply_at: string | null;
  first_response_breached_at: string | null;
  csat_score: number | null;
}

export async function loadTickets(): Promise<TicketRow[]> {
  const d = await getJson<{ data?: TicketRow[] }>('/api/v1/tickets');
  return d?.data ?? [];
}

export interface ReturnRow {
  id: string;
  rma_number: string;
  status: string;
  requested_at: string;
}

export async function loadReturns(): Promise<ReturnRow[]> {
  const d = await getJson<{ data?: ReturnRow[] }>('/api/v1/returns');
  return d?.data ?? [];
}

export interface ProductRow {
  id: string;
  name: string;
  slug: string;
  status: string;
  brand: string | null;
  category: string | null;
  fulfillment_type: string | null;
  price_min: number | null;
  price_max: number | null;
  revenue: number | null;
  units_sold: number | null;
  order_count: number | null;
  variant_count: number | null;
}

export async function loadProducts(): Promise<ProductRow[]> {
  const d = await getJson<{ data?: ProductRow[] }>('/api/products?limit=500');
  return d?.data ?? [];
}

export interface OverviewDto {
  bankBalance: number;
  bankAccountCount: number;
  bankAccountNames: string[];
  reviewCount: number;
  uncategorizedCount: number;
  receiptsForReview: number;
  coaCount: number;
}

export async function loadOverview(): Promise<OverviewDto | null> {
  const d = await getJson<{ data?: OverviewDto }>('/api/accounting/overview');
  return d?.data ?? null;
}

export interface BillDto {
  id: string;
  billNumber: string;
  vendorName: string;
  dueDate: string;
  total: number;
  amountPaid: number;
  status: string;
}

export async function loadBills(): Promise<BillDto[]> {
  const d = await getJson<{ data?: BillDto[] }>('/api/accounting/bills');
  return d?.data ?? [];
}

export interface KpiTarget {
  id: string;
  metricCode: string;
  periodType: string;
  periodStart: string;
  targetValue: number;
  notes: string;
}

export async function loadKpiTargets(): Promise<KpiTarget[]> {
  try {
    const res = await fetch('/api/platform/kpi-targets');
    if (!res.ok) return [];
    const j = (await res.json()) as { data?: KpiTarget[] };
    return j.data ?? [];
  } catch {
    return [];
  }
}

export interface PartyDto {
  id: string;
  displayName: string;
  email: string | null;
  roles: string[];
  source: string;
  is1099?: boolean;
  w9Received?: boolean;
  sellerStatus?: string | null;
}

export async function loadParties(): Promise<PartyDto[]> {
  const d = await getJson<{ data?: PartyDto[] }>('/api/parties');
  return d?.data ?? [];
}

export async function loadCount(url: string): Promise<number> {
  const d = await getJson<{ data?: unknown[] }>(url);
  return d?.data?.length ?? 0;
}

/* ── date helpers (real clock) ── */

export function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function monthStart(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function quarterStart(d: Date): Date {
  return new Date(d.getFullYear(), Math.floor(d.getMonth() / 3) * 3, 1);
}

export function yearStart(d: Date): Date {
  return new Date(d.getFullYear(), 0, 1);
}

export function inRange(iso: string | null | undefined, from: Date, to: Date): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return t >= from.getTime() && t <= to.getTime();
}

/* ── order aggregation ── */

export const isActiveOrder = (o: OrderRow) =>
  o.status !== 'cancelled' && o.status !== 'canceled';

export const orderGmv = (orders: OrderRow[]) =>
  orders.filter(isActiveOrder).reduce((s, o) => s + (Number(o.total) || 0), 0);

export const orderRefunds = (orders: OrderRow[]) =>
  orders.reduce((s, o) => s + (Number(o.amountRefunded) || 0), 0);

export function aov(orders: OrderRow[]): number | null {
  const withValue = orders.filter((o) => isActiveOrder(o) && Number(o.total) > 0);
  if (withValue.length === 0) return null;
  return orderGmv(orders) / withValue.length;
}

export const CHANNEL_FILLS = ['Green', 'Navy', 'Teal', 'Maroon', 'Amber'] as const;

export function channelLabel(raw: string | null | undefined): string {
  const c = (raw || 'website').toLowerCase();
  if (c === 'website') return 'Website';
  if (c === 'manual') return 'Manual';
  return c.charAt(0).toUpperCase() + c.slice(1);
}

export function byChannel(orders: OrderRow[]): { name: string; value: number; count: number }[] {
  const map = new Map<string, { name: string; value: number; count: number }>();
  for (const o of orders) {
    if (!isActiveOrder(o)) continue;
    const name = channelLabel(o.channel);
    const cur = map.get(name) ?? { name, value: 0, count: 0 };
    cur.value += Number(o.total) || 0;
    cur.count += 1;
    map.set(name, cur);
  }
  return [...map.values()].sort((a, b) => b.value - a.value);
}

/** Fulfillment stage buckets shared by the orders view + ops funnel. */
export function stageBuckets(orders: OrderRow[]): { name: string; orders: OrderRow[] }[] {
  const buckets: Record<string, OrderRow[]> = {
    'Unfulfilled & Preflight': [],
    'Routed to POD Supplier': [],
    'In Print & QC': [],
    'Shipped / In-Transit': [],
    'Delivered & Settled': [],
  };
  for (const o of orders) {
    if (!isActiveOrder(o)) continue;
    const s = (o.displayStatus || '').toLowerCase();
    if (s.includes('deliver')) buckets['Delivered & Settled'].push(o);
    else if (s.includes('ship') || s.includes('transit')) buckets['Shipped / In-Transit'].push(o);
    else if (s.includes('print') || s.includes('production') || s.includes('qc')) buckets['In Print & QC'].push(o);
    else if (s.includes('rout')) buckets['Routed to POD Supplier'].push(o);
    else buckets['Unfulfilled & Preflight'].push(o);
  }
  return Object.entries(buckets).map(([name, os]) => ({ name, orders: os }));
}

export const fmtUsd = (n: number) =>
  `${n < 0 ? '−$' : '$'}${Math.round(Math.abs(n)).toLocaleString('en-US')}`;

export const fmtUsd2 = (n: number) =>
  `${n < 0 ? '−' : ''}$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const fmtInt = (n: number) => Math.round(n).toLocaleString('en-US');

export const pctChange = (cur: number, prior: number): string => {
  if (prior === 0) return cur > 0 ? 'New in period' : '—';
  const p = ((cur - prior) / Math.abs(prior)) * 100;
  return `${p >= 0 ? '+' : ''}${p.toFixed(1)}% vs prior`;
};
