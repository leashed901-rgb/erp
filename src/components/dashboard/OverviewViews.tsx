'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  ALL_CREATE_ACTION_OPTIONS,
  AttentionQueueItem,
  ExecCompare,
  ExecPeriod,
  OpsWindow,
  SetupStepItem,
} from '@/data/dashboardData';
import { DemoRow, DomainKey } from '@/data/shellData';
import StatusPill from '@/components/StatusPill';
import { exportToCsv } from '@/lib/csvExport';
import {
  OrderRow,
  PnlTotals,
  aov,
  byChannel,
  channelLabel,
  fmtInt,
  fmtUsd,
  fmtUsd2,
  inRange,
  isoDay,
  loadKpiTargets,
  isActiveOrder,
  loadBills,
  loadCount,
  loadOrders,
  loadOverview,
  loadParties,
  loadPnl,
  loadProducts,
  loadReturns,
  loadTickets,
  monthStart,
  orderGmv,
  orderRefunds,
  pctChange,
  quarterStart,
  stageBuckets,
  yearStart,
  CHANNEL_FILLS,
} from './dashboardAnalytics';
import styles from './DashboardScreens.module.css';

function CreateActionsStrip({
  pinnedLabels,
  onCreate,
  onOpenCustomize,
  onOpenCreateFlyout,
}: {
  pinnedLabels: string[];
  onCreate: (label: string) => void;
  onOpenCustomize: () => void;
  onOpenCreateFlyout: () => void;
}) {
  return (
    <div className={styles.createActionsRow}>
      <span className={styles.createActionsLabel}>Create actions:</span>
      {pinnedLabels.map((label) => {
        const meta = ALL_CREATE_ACTION_OPTIONS.find((o) => o.label === label);
        return (
          <button
            key={label}
            type="button"
            className={styles.createChip}
            onClick={() => onCreate(label)}
          >
            <span className={`material-symbols-outlined ${styles.icon16}`}>
              {meta?.icon || 'add'}
            </span>
            {label}
          </button>
        );
      })}
      <button
        type="button"
        className={styles.customizeActionsBtn}
        onClick={onOpenCustomize}
        title="Select up to 10 actions"
      >
        <span className={`material-symbols-outlined ${styles.icon14}`}>tune</span>
        Customize ({pinnedLabels.length}/10)
      </button>
      <button
        type="button"
        className={styles.showAllChip}
        onClick={onOpenCreateFlyout}
      >
        <span className={`material-symbols-outlined ${styles.icon16}`}>apps</span>
        Show all
      </button>
    </div>
  );
}

/* ── Analytics switcher + views (master account overview) ── */
type AnalyticsViewKey = 'gmv' | 'orders' | 'products' | 'support' | 'analytics';

const ANALYTICS_BUTTONS: { key: AnalyticsViewKey; label: string; icon: string }[] = [
  { key: 'gmv', label: 'GMV', icon: 'trending_up' },
  { key: 'orders', label: 'Orders', icon: 'local_shipping' },
  { key: 'products', label: 'Products', icon: 'inventory_2' },
  { key: 'support', label: 'Support', icon: 'support_agent' },
  { key: 'analytics', label: 'Analytics', icon: 'bar_chart' },
];

type Kpi = { label: string; value: string; delta: string; tone: 'pos' | 'neg' | 'neutral' };

function KpiGrid({ kpis }: { kpis: Kpi[] }) {
  return (
    <div className={styles.analyticsKpiGrid}>
      {kpis.map((k) => (
        <div key={k.label} className={styles.analyticsKpiCard}>
          <span className={styles.analyticsKpiLabel}>{k.label}</span>
          <span className={styles.analyticsKpiValue}>{k.value}</span>
          <span
            className={`${styles.analyticsKpiDelta} ${
              k.tone === 'pos'
                ? styles.analyticsKpiDeltaPos
                : k.tone === 'neg'
                  ? styles.analyticsKpiDeltaNeg
                  : styles.analyticsKpiDeltaNeutral
            }`}
          >
            {k.delta}
          </span>
        </div>
      ))}
    </div>
  );
}

function BarRows({
  rows,
  format,
}: {
  rows: { name: string; value: number; fill: string; note: string }[];
  format: (v: number) => string;
}) {
  const maxVal = Math.max(1, ...rows.map((r) => r.value));
  if (rows.length === 0) {
    return <p className={styles.analyticsViewSub}>No data in this period yet.</p>;
  }
  return (
    <>
      {rows.map((c) => (
        <div key={c.name} className={styles.analyticsBarRow}>
          <span className={styles.analyticsBarLabel}>{c.name}</span>
          <div className={styles.analyticsBarTrack}>
            <div
              className={`${styles.analyticsBarFill} ${
                styles[`analyticsBarFill${c.fill}` as keyof typeof styles] || styles.analyticsBarFillGreen
              }`}
              style={{ width: `${(c.value / maxVal) * 100}%` }}
            />
          </div>
          <span className={styles.analyticsBarValue}>
            {format(c.value)} · {c.note}
          </span>
        </div>
      ))}
    </>
  );
}

function useMonthOrders() {
  const [orders, setOrders] = useState<OrderRow[] | null>(null);
  const [pnl, setPnl] = useState<PnlTotals | null>(null);
  useEffect(() => {
    let live = true;
    const now = new Date();
    const from = monthStart(now);
    void (async () => {
      const [os, p] = await Promise.all([
        loadOrders(),
        loadPnl(isoDay(from), isoDay(now)),
      ]);
      if (!live) return;
      setOrders(os.filter((o) => inRange(o.orderDate, from, now)));
      setPnl(p);
    })();
    return () => {
      live = false;
    };
  }, []);
  return { orders, pnl };
}

function AnalyticsSwitcher({
  active,
  onChange,
  onNavigate,
  onToast,
}: {
  active: AnalyticsViewKey;
  onChange: (key: AnalyticsViewKey) => void;
  onNavigate: (domain: DomainKey, screenId: string) => void;
  onToast: (msg: string) => void;
}) {
  const { orders, pnl } = useMonthOrders();
  return (
    <div>
      <div className={styles.analyticsSwitcher}>
        {ANALYTICS_BUTTONS.map((btn) => (
          <button
            key={btn.key}
            type="button"
            className={`${styles.analyticsBtn} ${
              active === btn.key ? styles.analyticsBtnActive : ''
            }`}
            onClick={() => onChange(btn.key)}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
              {btn.icon}
            </span>
            {btn.label}
          </button>
        ))}
        <button
          type="button"
          className={styles.analyticsBtn}
          style={{ marginLeft: 'auto' }}
          onClick={() => {
            const list = orders ?? [];
            const gmv = orderGmv(list);
            const a = aov(list);
            const cols = [
              { key: 'label', label: 'Metric' },
              { key: 'value', label: 'Value' },
              { key: 'delta', label: 'Delta' },
            ];
            const rows: Record<string, unknown>[] = [
              { label: 'GMV (MTD)', value: fmtUsd(gmv), delta: `${list.filter(isActiveOrder).length} orders` },
              { label: 'Net Revenue (P&L, MTD)', value: pnl ? fmtUsd(pnl.income) : '—', delta: 'Ledger' },
              { label: 'Gross Profit (P&L, MTD)', value: pnl ? fmtUsd(pnl.grossProfit) : '—', delta: pnl && pnl.income ? `${((pnl.grossProfit / pnl.income) * 100).toFixed(1)}% margin` : '—' },
              { label: 'Net Operating Income (P&L, MTD)', value: pnl ? fmtUsd(pnl.net) : '—', delta: 'Ledger' },
              { label: 'AOV', value: a != null ? fmtUsd2(a) : '—', delta: 'Orders with value' },
              { label: 'Orders (MTD)', value: String(list.filter(isActiveOrder).length), delta: `${list.length - list.filter(isActiveOrder).length} cancelled` },
            ];
            exportToCsv(rows, cols, 'analytics-snapshot');
            onToast(`Exported ${rows.length} records to CSV`);
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>download</span>
          Export
        </button>
      </div>
      {active === 'gmv' && <GmvAnalyticsView onNavigate={onNavigate} />}
      {active === 'orders' && <OrdersAnalyticsView onNavigate={onNavigate} />}
      {active === 'products' && <ProductsAnalyticsView onNavigate={onNavigate} />}
      {active === 'support' && <SupportAnalyticsView onNavigate={onNavigate} />}
      {active === 'analytics' && <AnalyticsDetailView onNavigate={onNavigate} />}
    </div>
  );
}

function monthLabel(): string {
  // Use a fixed format that doesn't depend on timezone — avoids hydration
  // mismatch (server UTC vs client local). Format: "Nov 2026"
  const d = new Date();
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[d.getMonth()]} ${d.getFullYear()}`;
}

function GmvAnalyticsView({ onNavigate }: { onNavigate: (d: DomainKey, s: string) => void }) {
  const { orders, pnl } = useMonthOrders();
  const list = orders ?? [];
  const gmv = orderGmv(list);
  const active = list.filter(isActiveOrder);
  const a = aov(list);
  const totalChannel = byChannel(list).reduce((s, c) => s + c.value, 0) || 1;
  const kpis: Kpi[] = [
    { label: 'GMV (MTD)', value: orders ? fmtUsd(gmv) : '…', delta: `${active.length} orders`, tone: 'neutral' },
    { label: 'Net Revenue', value: pnl ? fmtUsd(pnl.income) : '…', delta: 'P&L · ledger income', tone: 'neutral' },
    { label: 'Gross Profit', value: pnl ? fmtUsd(pnl.grossProfit) : '…', delta: pnl && pnl.income ? `${((pnl.grossProfit / pnl.income) * 100).toFixed(1)}% margin` : '—', tone: 'neutral' },
    { label: 'Contribution', value: pnl ? fmtUsd(pnl.net) : '…', delta: 'Net operating income · P&L', tone: 'neutral' },
    { label: 'AOV', value: a != null ? fmtUsd2(a) : '—', delta: `Refunds ${fmtUsd(orderRefunds(list))}`, tone: 'neutral' },
    { label: 'Orders', value: fmtInt(active.length), delta: `${list.length - active.length} cancelled`, tone: 'neutral' },
  ];
  return (
    <div className={styles.analyticsView}>
      <h3 className={styles.analyticsViewTitle}>GMV &amp; Margin Analytics</h3>
      <p className={styles.analyticsViewSub}>
        Gross merchandise volume from live orders; revenue and profit from the ledger P&amp;L. MTD · {monthLabel()}.
      </p>
      <KpiGrid kpis={kpis} />
      <h4 className={styles.analyticsViewTitle} style={{ fontSize: 13, marginBottom: 10 }}>
        GMV by channel
      </h4>
      <BarRows
        rows={byChannel(list).map((c, i) => ({
          name: c.name,
          value: c.value,
          fill: CHANNEL_FILLS[i % CHANNEL_FILLS.length],
          note: `${Math.round((c.value / totalChannel) * 100)}%`,
        }))}
        format={(v) => fmtUsd(v)}
      />
      <button
        type="button"
        className={styles.analyticsBtn}
        style={{ marginTop: 12 }}
        onClick={() => onNavigate('reports', 'report-exec-gmv')}
      >
        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>open_in_new</span>
        Open full GMV report
      </button>
    </div>
  );
}

function OrdersAnalyticsView({ onNavigate }: { onNavigate: (d: DomainKey, s: string) => void }) {
  const { orders } = useMonthOrders();
  const [returns, setReturns] = useState<{ total: number; open: number; refunded: number } | null>(null);
  useEffect(() => {
    let live = true;
    void loadReturns().then((rs) => {
      if (!live) return;
      const open = rs.filter((r) => !['refunded', 'closed', 'completed', 'rejected'].includes(r.status)).length;
      setReturns({ total: rs.length, open, refunded: rs.filter((r) => r.status === 'refunded').length });
    });
    return () => {
      live = false;
    };
  }, []);
  const list = orders ?? [];
  const active = list.filter(isActiveOrder);
  const unfulfilled = active.filter((o) => (o.displayStatus || '').toLowerCase().includes('unfulfilled')).length;
  const onHold = active.filter((o) => o.onHold).length;
  const stages = stageBuckets(list);
  const kpis: Kpi[] = [
    { label: 'Orders (MTD)', value: fmtInt(active.length), delta: `${list.length} incl. cancelled`, tone: 'neutral' },
    { label: 'Unfulfilled', value: fmtInt(unfulfilled), delta: `${onHold} on hold`, tone: unfulfilled > 0 ? 'neg' : 'neutral' },
    { label: 'Avg cycle time', value: '—', delta: 'No ship-time source yet', tone: 'neutral' },
    { label: 'On-time ship', value: '—', delta: 'No SLA due dates set', tone: 'neutral' },
    { label: 'Returns', value: returns ? fmtInt(returns.total) : '…', delta: active.length ? `${((returns?.total ?? 0) / Math.max(1, active.length) * 100).toFixed(1)}% of orders` : '—', tone: 'neutral' },
    { label: 'Open RMAs', value: returns ? fmtInt(returns.open) : '…', delta: `${returns?.refunded ?? 0} refunded`, tone: returns && returns.open > 0 ? 'neg' : 'neutral' },
  ];
  return (
    <div className={styles.analyticsView}>
      <h3 className={styles.analyticsViewTitle}>Orders Analytics</h3>
      <p className={styles.analyticsViewSub}>
        Fulfillment pipeline and return health from live orders. MTD · {monthLabel()}.
      </p>
      <KpiGrid kpis={kpis} />
      <h4 className={styles.analyticsViewTitle} style={{ fontSize: 13, marginBottom: 10 }}>
        Order-to-Cash pipeline volume
      </h4>
      <BarRows
        rows={stages.map((s, i) => ({
          name: s.name,
          value: s.orders.length,
          fill: CHANNEL_FILLS[i % CHANNEL_FILLS.length],
          note: 'orders',
        }))}
        format={(v) => fmtInt(v)}
      />
      <button
        type="button"
        className={styles.analyticsBtn}
        style={{ marginTop: 12 }}
        onClick={() => onNavigate('orders', 'orders-overview')}
      >
        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>open_in_new</span>
        Open Orders overview
      </button>
    </div>
  );
}

function ProductsAnalyticsView({ onNavigate }: { onNavigate: (d: DomainKey, s: string) => void }) {
  const [products, setProducts] = useState<import('./dashboardAnalytics').ProductRow[] | null>(null);
  useEffect(() => {
    let live = true;
    void loadProducts().then((ps) => {
      if (live) setProducts(ps);
    });
    return () => {
      live = false;
    };
  }, []);
  const list = products ?? [];
  const published = list.filter((p) => p.status === 'published').length;
  const drafts = list.filter((p) => p.status === 'draft').length;
  const types = new Set(list.map((p) => p.fulfillment_type || '—'));
  const top = [...list]
    .sort((x, y) => (Number(y.revenue) || 0) - (Number(x.revenue) || 0) || (Number(y.units_sold) || 0) - (Number(x.units_sold) || 0))
    .slice(0, 5);
  const kpis: Kpi[] = [
    { label: 'Active SKUs', value: products ? fmtInt(list.length) : '…', delta: list.length >= 500 ? 'First 500 catalog rows' : 'Catalog rows loaded', tone: 'neutral' },
    { label: 'Published', value: fmtInt(published), delta: list.length ? `${((published / list.length) * 100).toFixed(1)}% of loaded` : '—', tone: 'neutral' },
    { label: 'In review', value: fmtInt(drafts), delta: 'Draft status', tone: drafts > 0 ? 'neg' : 'neutral' },
    { label: 'Avg margin', value: '—', delta: 'No product cost source', tone: 'neutral' },
    { label: 'Variants', value: fmtInt(list.reduce((s, p) => s + (Number(p.variant_count) || 0), 0)), delta: 'Across loaded products', tone: 'neutral' },
    { label: 'Channels live', value: fmtInt(types.size), delta: [...types].join(' · ') || '—', tone: 'neutral' },
  ];
  return (
    <div className={styles.analyticsView}>
      <h3 className={styles.analyticsViewTitle}>Products &amp; Variants Analytics</h3>
      <p className={styles.analyticsViewSub}>
        Catalog health from the live product table. Prices are variant ranges; margins need a cost source the catalog does not carry.
      </p>
      <KpiGrid kpis={kpis} />
      <table className={styles.analyticsTable}>
        <thead>
          <tr>
            <th>Product</th>
            <th>SKU</th>
            <th>Supplier</th>
            <th>Price</th>
            <th>Margin</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {top.map((p) => (
            <tr key={p.id}>
              <td><strong>{p.name}</strong></td>
              <td>—</td>
              <td>{p.brand || '—'}</td>
              <td>{p.price_min != null ? (p.price_max != null && p.price_max !== p.price_min ? `${fmtUsd2(Number(p.price_min))}–${fmtUsd2(Number(p.price_max))}` : fmtUsd2(Number(p.price_min))) : '—'}</td>
              <td>—</td>
              <td>
                <span
                  className={p.status === 'published' ? styles.analyticsKpiDeltaPos : styles.analyticsKpiDeltaNeg}
                  style={{ fontWeight: 600 }}
                >
                  {p.status.charAt(0).toUpperCase() + p.status.slice(1)}
                </span>
              </td>
            </tr>
          ))}
          {products && top.length === 0 && (
            <tr><td colSpan={6}>No products in the catalog yet.</td></tr>
          )}
        </tbody>
      </table>
      <button
        type="button"
        className={styles.analyticsBtn}
        style={{ marginTop: 12 }}
        onClick={() => onNavigate('catalog', 'catalog-overview')}
      >
        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>open_in_new</span>
        Open Catalog overview
      </button>
    </div>
  );
}

function SupportAnalyticsView({ onNavigate }: { onNavigate: (d: DomainKey, s: string) => void }) {
  const [data, setData] = useState<{
    open: number; total: number; urgent: number; high: number; breached: number; withDue: number;
    csat: number | null; replyHrs: number | null; rmasOpen: number;
    attention: number; conversations: number; appeals: number;
  } | null>(null);
  useEffect(() => {
    let live = true;
    void (async () => {
      const [tickets, returns, attention, conversations, appeals] = await Promise.all([
        loadTickets(),
        loadReturns(),
        loadCount('/api/crm/needs-attention'),
        loadCount('/api/crm/conversations?status=open'),
        loadCount('/api/sellers/appeals'),
      ]);
      if (!live) return;
      const openT = tickets.filter((t) => !['closed', 'resolved'].includes(t.status));
      const replied = tickets.filter((t) => t.first_public_reply_at);
      const replyHrs = replied.length
        ? replied.reduce((s, t) => s + (new Date(t.first_public_reply_at as string).getTime() - new Date(t.created_at).getTime()) / 3600000, 0) / replied.length
        : null;
      const csatRows = tickets.filter((t) => t.csat_score != null);
      setData({
        open: openT.length,
        total: tickets.length,
        urgent: openT.filter((t) => t.priority === 'urgent').length,
        high: openT.filter((t) => t.priority === 'high').length,
        breached: tickets.filter((t) => t.first_response_breached_at).length,
        withDue: tickets.length,
        csat: csatRows.length ? csatRows.reduce((s, t) => s + Number(t.csat_score), 0) / csatRows.length : null,
        replyHrs,
        rmasOpen: returns.filter((r) => !['refunded', 'closed', 'completed', 'rejected'].includes(r.status)).length,
        attention,
        conversations,
        appeals,
      });
    })();
    return () => {
      live = false;
    };
  }, []);
  const kpis: Kpi[] = [
    { label: 'Open tickets', value: data ? fmtInt(data.open) : '…', delta: `${data?.total ?? 0} total`, tone: data && data.open > 0 ? 'neg' : 'neutral' },
    { label: 'Median reply', value: data?.replyHrs != null ? `${data.replyHrs.toFixed(1)}h` : '—', delta: 'First public reply', tone: 'neutral' },
    { label: 'SLA health', value: data && data.withDue > 0 ? `${(((data.withDue - data.breached) / data.withDue) * 100).toFixed(1)}%` : '—', delta: `${data?.breached ?? 0} breached`, tone: 'neutral' },
    { label: 'CSAT', value: data?.csat != null ? `${data.csat.toFixed(1)}/5` : '—', delta: 'No CSAT responses yet', tone: 'neutral' },
    { label: 'Escalations', value: data ? fmtInt(data.urgent) : '…', delta: `${data?.high ?? 0} high priority`, tone: data && data.urgent > 0 ? 'neg' : 'neutral' },
    { label: 'RMAs open', value: data ? fmtInt(data.rmasOpen) : '…', delta: 'Returns not yet settled', tone: 'neutral' },
  ];
  const queues = [
    { name: 'Attention Queue', value: data?.attention ?? 0, fill: 'Maroon' },
    { name: 'Customer Queue', value: data?.conversations ?? 0, fill: 'Navy' },
    { name: 'Seller Queue', value: data?.appeals ?? 0, fill: 'Teal' },
  ];
  return (
    <div className={styles.analyticsView}>
      <h3 className={styles.analyticsViewTitle}>Support Analytics</h3>
      <p className={styles.analyticsViewSub}>
        Ticket volume, SLA performance, and queue health from live support data.
      </p>
      <KpiGrid kpis={kpis} />
      <h4 className={styles.analyticsViewTitle} style={{ fontSize: 13, marginBottom: 10 }}>
        Queue volume
      </h4>
      <BarRows
        rows={queues.map((q) => ({ ...q, note: 'items' }))}
        format={(v) => fmtInt(v)}
      />
      <button
        type="button"
        className={styles.analyticsBtn}
        style={{ marginTop: 12 }}
        onClick={() => onNavigate('support', 'support-overview')}
      >
        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>open_in_new</span>
        Open Support overview
      </button>
    </div>
  );
}

function AnalyticsDetailView({ onNavigate }: { onNavigate: (d: DomainKey, s: string) => void }) {
  const { orders } = useMonthOrders();
  const list = orders ?? [];
  const a = aov(list);
  const gmv = orderGmv(list);
  const totalChannel = byChannel(list).reduce((s, c) => s + c.value, 0) || 1;
  const kpis: Kpi[] = [
    { label: 'Sessions (MTD)', value: '—', delta: 'No traffic source connected', tone: 'neutral' },
    { label: 'Conversion', value: '—', delta: 'No traffic source connected', tone: 'neutral' },
    { label: 'AOV', value: a != null ? fmtUsd2(a) : '—', delta: 'From live orders', tone: 'neutral' },
    { label: 'Bounce', value: '—', delta: 'No traffic source connected', tone: 'neutral' },
    { label: 'GMV (MTD)', value: orders ? fmtUsd(gmv) : '…', delta: 'From live orders', tone: 'neutral' },
    { label: 'Cart abandon', value: '—', delta: 'No traffic source connected', tone: 'neutral' },
  ];
  return (
    <div className={styles.analyticsView}>
      <h3 className={styles.analyticsViewTitle}>Analytics Overview</h3>
      <p className={styles.analyticsViewSub}>
        Traffic analytics are not connected to this platform yet — sessions, conversion and bounce are not measured. Order-derived metrics below are live. MTD · {monthLabel()}.
      </p>
      <KpiGrid kpis={kpis} />
      <h4 className={styles.analyticsViewTitle} style={{ fontSize: 13, marginBottom: 10 }}>
        GMV by sales channel
      </h4>
      <BarRows
        rows={byChannel(list).map((c, i) => ({
          name: c.name,
          value: c.value,
          fill: CHANNEL_FILLS[i % CHANNEL_FILLS.length],
          note: `${Math.round((c.value / totalChannel) * 100)}%`,
        }))}
        format={(v) => fmtUsd(v)}
      />
      <button
        type="button"
        className={styles.analyticsBtn}
        style={{ marginTop: 12 }}
        onClick={() => onNavigate('reports', 'analytics')}
      >
        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>open_in_new</span>
        Open full Analytics
      </button>
    </div>
  );
}

/* 1. Operations Vitals View (/admin) */
export function OperationsVitalsView({
  setupSteps,
  pinnedCreateActions,
  attentionItems,
  onOpenSetupWizard,
  onOpenCustomizeCreate,
  onResolveAttentionItem,
  onNavigate,
  onCreate,
  onOpenCreateFlyout,
  onOpenPeek,
  onToast,
}: {
  setupSteps: SetupStepItem[];
  pinnedCreateActions: string[];
  attentionItems: AttentionQueueItem[];
  onOpenSetupWizard: (stepIdx: number) => void;
  onOpenCustomizeCreate: () => void;
  onResolveAttentionItem: (id: string) => void;
  onNavigate: (domain: DomainKey, screenId: string) => void;
  onCreate: (label: string) => void;
  onOpenCreateFlyout: () => void;
  onOpenPeek: (row: DemoRow, family: string) => void;
  onToast: (msg: string) => void;
}) {
  const [windowMode, setWindowMode] = useState<OpsWindow>('Today');
  const [dismissedSuggestions, setDismissedSuggestions] = useState<string[]>([]);
  const [analyticsView, setAnalyticsView] = useState<AnalyticsViewKey>('gmv');
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [overview, setOverview] = useState<import('./dashboardAnalytics').OverviewDto | null>(null);
  const [bills, setBills] = useState<import('./dashboardAnalytics').BillDto[]>([]);
  const [ticketsOpen, setTicketsOpen] = useState(0);
  const [ticketsUrgent, setTicketsUrgent] = useState(0);
  const [returnsOpen, setReturnsOpen] = useState(0);
  const [returnsTotal, setReturnsTotal] = useState(0);
  const [parties, setParties] = useState<import('./dashboardAnalytics').PartyDto[]>([]);

  useEffect(() => {
    let live = true;
    void (async () => {
      const [os, ov, bs, ts, rs, ps] = await Promise.all([
        loadOrders(),
        loadOverview(),
        loadBills(),
        loadTickets(),
        loadReturns(),
        loadParties(),
      ]);
      if (!live) return;
      setOrders(os);
      setOverview(ov);
      setBills(bs);
      const openT = ts.filter((t) => !['closed', 'resolved'].includes(t.status));
      setTicketsOpen(openT.length);
      setTicketsUrgent(openT.filter((t) => t.priority === 'urgent').length);
      setReturnsOpen(rs.filter((r) => !['refunded', 'closed', 'completed', 'rejected'].includes(r.status)).length);
      setReturnsTotal(rs.length);
      setParties(ps);
    })();
    return () => {
      live = false;
    };
  }, []);

  const now = new Date();
  const windowFrom =
    windowMode === 'Today'
      ? new Date(now.getFullYear(), now.getMonth(), now.getDate())
      : windowMode === '7D'
        ? new Date(now.getTime() - 7 * 86400000)
        : windowMode === '30D'
          ? new Date(now.getTime() - 30 * 86400000)
          : monthStart(now);
  const winOrders = orders.filter((o) => inRange(o.orderDate, windowFrom, now));
  const winActive = winOrders.filter(isActiveOrder);
  /* Unfulfilled = the funnel's 'Unfulfilled & Preflight' bucket: no order
   * displayStatus ever contains the word 'unfulfilled' (the vocabulary is
   * New / Needs attention / In production / Ready to ship / Shipped …),
   * so filtering on that word always returned 0. */
  const funnelStages = stageBuckets(winOrders);
  const unfulfilled =
    funnelStages.find((b) => b.name === 'Unfulfilled & Preflight')?.orders ?? [];
  const onHold = winActive.filter((o) => o.onHold);
  const flagged = winActive.filter((o) => o.needsAttention);
  const openBills = bills.filter((b) => !['paid', 'void'].includes(b.status));
  const openAp = openBills.reduce((s, b) => s + (Number(b.total) || 0) - (Number(b.amountPaid) || 0), 0);
  const overdueBills = openBills.filter((b) => b.dueDate && new Date(b.dueDate).getTime() < now.getTime());
  const w9Pending = parties.filter((p) => p.roles.includes('vendor') && p.is1099 && !p.w9Received);

  type Tile = {
    id: string; label: string; value: string; delta: string;
    tone: 'pos' | 'warn' | 'neg' | 'neutral'; subtext: string;
    targetDomain: 'orders' | 'finance' | 'catalog' | 'support' | 'dashboard'; targetScreen: string;
  };
  const vitals: Tile[] = [
    {
      id: 'unfulfilled', label: 'Unfulfilled orders', value: fmtInt(unfulfilled.length),
      delta: `${fmtInt(winActive.length)} orders placed · ${fmtUsd(orderGmv(winOrders))} GMV`,
      tone: unfulfilled.length > 0 ? 'warn' : 'pos',
      subtext: `${fmtInt(onHold.length)} on hold in window`,
      targetDomain: 'orders', targetScreen: 'fulfillment-queue',
    },
    {
      id: 'attention', label: 'Orders needing attention', value: fmtInt(flagged.length),
      delta: flagged.length > 0 ? 'Flagged on the order record' : 'Nothing flagged',
      tone: flagged.length > 0 ? 'neg' : 'pos',
      subtext: flagged[0]?.orderNumber ? `First: ${flagged[0].orderNumber}` : 'All clear',
      targetDomain: 'orders', targetScreen: 'orders',
    },
    {
      id: 'returns', label: 'Open RMAs & returns', value: fmtInt(returnsOpen),
      delta: `${fmtInt(returnsTotal)} returns all time`,
      tone: returnsOpen > 0 ? 'warn' : 'pos',
      subtext: 'Returns & claims workspace',
      targetDomain: 'orders', targetScreen: 'returns',
    },
    {
      id: 'bills', label: 'Intake & bills', value: fmtInt(openBills.length),
      delta: `${fmtUsd(openAp)} open AP`,
      tone: overdueBills.length > 0 ? 'neg' : openBills.length > 0 ? 'warn' : 'pos',
      subtext: `${fmtInt(overdueBills.length)} overdue · ${overview?.receiptsForReview ?? 0} receipts to review`,
      targetDomain: 'finance', targetScreen: 'bills',
    },
    {
      id: 'bank', label: 'Bank feed', value: fmtInt(overview?.uncategorizedCount ?? 0),
      delta: `${overview?.reviewCount ?? 0} waiting in review`,
      tone: (overview?.uncategorizedCount ?? 0) > 0 ? 'warn' : 'pos',
      subtext: overview ? `${fmtUsd2(overview.bankBalance)} across ${overview.bankAccountCount} accounts` : '—',
      targetDomain: 'finance', targetScreen: 'bank',
    },
    {
      id: 'tickets', label: 'Open tickets', value: fmtInt(ticketsOpen),
      delta: `${fmtInt(ticketsUrgent)} urgent`,
      tone: ticketsUrgent > 0 ? 'neg' : ticketsOpen > 0 ? 'warn' : 'pos',
      subtext: 'Support workspace',
      targetDomain: 'support', targetScreen: 'tickets',
    },
  ];

  const funnelTones: ('maroon' | 'navy' | 'blue' | 'teal' | 'green')[] = ['maroon', 'navy', 'blue', 'teal', 'green'];
  const funnelTotal = Math.max(1, funnelStages.reduce((s, b) => s + b.orders.length, 0));
  const funnel = funnelStages.map((b, i) => {
    const ages = b.orders.map((o) => (now.getTime() - new Date(o.orderDate).getTime()) / 86400000);
    const avgAge = ages.length ? `${(ages.reduce((s, x) => s + x, 0) / ages.length).toFixed(1)}d avg age` : '—';
    return {
      stage: b.name,
      count: b.orders.length,
      gmv: fmtUsd(orderGmv(b.orders)),
      avgAge,
      pctOfTotal: Math.round((b.orders.length / funnelTotal) * 100),
      tone: funnelTones[i % funnelTones.length],
      targetDomain: 'orders' as const,
      targetScreen: 'orders',
    };
  });

  const suppliers = parties.filter((p) => p.roles.includes('supplier'));
  const integrations: {
    name: string; role: string; lastSync: string; metricValue: string; slaPct: string;
    status: 'Synced' | 'Healthy' | 'SLA warning' | 'For review';
    targetDomain: 'orders' | 'finance' | 'catalog'; targetScreen: string;
  }[] = [
    {
      name: overview?.bankAccountNames?.join(' · ') || 'Bank accounts',
      role: 'Bank feed', lastSync: 'Live balances',
      metricValue: overview ? fmtUsd2(overview.bankBalance) : '—', slaPct: '—',
      status: 'Synced', targetDomain: 'finance', targetScreen: 'bank',
    },
    {
      name: suppliers.length ? suppliers.map((s) => s.displayName).join(' · ') : 'POD suppliers',
      role: 'Supplier catalogs', lastSync: 'Directory',
      metricValue: `${suppliers.length} suppliers`, slaPct: '—',
      status: 'Healthy', targetDomain: 'catalog', targetScreen: 'catalog-overview',
    },
    {
      name: 'Receipts inbox',
      role: 'Receipt intake · OCR', lastSync: 'Live inbox',
      metricValue: `${overview?.receiptsForReview ?? 0} to review`, slaPct: '—',
      status: (overview?.receiptsForReview ?? 0) > 0 ? 'For review' : 'Healthy',
      targetDomain: 'finance', targetScreen: 'receipts',
    },
    {
      name: 'Chart of accounts',
      role: 'Ledger structure', lastSync: 'Live',
      metricValue: `${overview?.coaCount ?? 0} active accounts`, slaPct: '—',
      status: 'Synced', targetDomain: 'finance', targetScreen: 'coa',
    },
  ];

  type Suggestion = {
    id: string; category: string; title: string; detail: string; impact: string;
    actionLabel: string; icon: string;
    targetDomain: 'finance' | 'dashboard' | 'orders' | 'catalog'; targetScreen: string;
  };
  const suggestions: Suggestion[] = [];
  if (openBills.length > 0) {
    suggestions.push({
      id: 'sug-bills', category: 'Bills & AP',
      title: `Pay ${openBills.length} open bill${openBills.length === 1 ? '' : 's'}`,
      detail: `Next due: ${openBills[0].billNumber} · ${openBills[0].vendorName} · due ${openBills[0].dueDate || '—'}`,
      impact: `${fmtUsd(openAp)} open AP`, actionLabel: 'Open Pay Bills', icon: 'payments',
      targetDomain: 'finance', targetScreen: 'bills',
    });
  }
  if ((overview?.uncategorizedCount ?? 0) > 0) {
    suggestions.push({
      id: 'sug-bank', category: 'Banking',
      title: `Categorize ${overview?.uncategorizedCount} bank line${overview?.uncategorizedCount === 1 ? '' : 's'}`,
      detail: `${overview?.reviewCount ?? 0} transactions are waiting in the review queue`,
      impact: 'Keeps the ledger current', actionLabel: 'Review bank feed', icon: 'account_balance',
      targetDomain: 'finance', targetScreen: 'bank',
    });
  }
  if (flagged.length > 0) {
    suggestions.push({
      id: 'sug-flagged', category: 'Preflight',
      title: `Review ${flagged.length} flagged order${flagged.length === 1 ? '' : 's'}`,
      detail: flagged[0] ? `${flagged[0].orderNumber} is flagged for attention` : '',
      impact: 'Blocks fulfillment until cleared', actionLabel: 'Open orders', icon: 'flag',
      targetDomain: 'orders', targetScreen: 'orders',
    });
  }
  if (w9Pending.length > 0) {
    suggestions.push({
      id: 'sug-w9', category: 'Tax & 1099',
      title: `Collect W-9s from ${w9Pending.length} contractor${w9Pending.length === 1 ? '' : 's'}`,
      detail: w9Pending.map((p) => p.displayName).join(' · '),
      impact: 'Required before 1099 filing', actionLabel: 'Open vendors', icon: 'description',
      targetDomain: 'finance', targetScreen: 'vendors',
    });
  }
  const activeSuggestions = suggestions.filter((s) => !dismissedSuggestions.includes(s.id));

  const openAttention = attentionItems.filter((i) => i.status !== 'Resolved');

  const getToneClass = (tone: Tile['tone']) => {
    if (tone === 'pos') return styles.kpiDeltaPos;
    if (tone === 'warn') return styles.kpiDeltaWarn;
    if (tone === 'neg') return styles.kpiDeltaNeg;
    return styles.kpiDeltaNeutral;
  };

  const getFunnelFillClass = (tone: (typeof funnelTones)[number]) => {
    if (tone === 'maroon') return styles.fillMaroon;
    if (tone === 'navy') return styles.fillNavy;
    if (tone === 'blue') return styles.fillBlue;
    if (tone === 'teal') return styles.fillTeal;
    return styles.fillPrimary;
  };

  const todayLabel = now.toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  });

  return (
    <div className={styles.container}>
      <div className={styles.headerBlock}>
        <div className={styles.headerRow}>
          <div>
            <h1 className={styles.title}>Dashboard</h1>
            <p className={styles.subtitle}>
              Unsaid · Fulfillment SLAs, preflight gates, intake queues &amp; banking feeds · {todayLabel}
            </p>
          </div>
          <div className={styles.toolbarRight}>
            <div className={styles.segmented}>
              {(['Today', '7D', '30D', 'MTD'] as OpsWindow[]).map((w) => (
                <button
                  key={w}
                  type="button"
                  className={`${styles.segBtn} ${
                    windowMode === w ? styles.segBtnBlueActive : ''
                  }`}
                  onClick={() => setWindowMode(w)}
                >
                  {w}
                </button>
              ))}
            </div>
            <button
              type="button"
              className={styles.btnSecondary}
              onClick={() => {
                const cols = [
                  { key: 'id', label: 'Metric ID' },
                  { key: 'label', label: 'Metric' },
                  { key: 'value', label: 'Value' },
                  { key: 'delta', label: 'Delta' },
                  { key: 'tone', label: 'Tone' },
                  { key: 'subtext', label: 'Subtext' },
                ];
                exportToCsv(vitals as unknown as Record<string, unknown>[], cols, 'operations-vitals');
                onToast(`Exported ${vitals.length} records to CSV`);
              }}
            >
              <span className={`material-symbols-outlined ${styles.icon16}`}>
                download
              </span>
              Export
            </button>
          </div>
        </div>
      </div>

      {/* Analytics switcher — replaces create actions on master overview. */}
      <AnalyticsSwitcher
        active={analyticsView}
        onChange={setAnalyticsView}
        onNavigate={onNavigate}
        onToast={onToast}
      />

      {/* 6 Operations Vitals KPIs — computed live for the selected window */}
      <div className={styles.kpiGrid6}>
        {vitals.map((tile) => (
          <button
            key={tile.id}
            type="button"
            className={`${styles.kpiCard} ${styles.kpiCardClickable}`}
            onClick={() => onNavigate(tile.targetDomain, tile.targetScreen)}
          >
            <div className={styles.kpiTopRow}>
              <span className={styles.kpiLabel}>{tile.label}</span>
              <span className={`material-symbols-outlined ${styles.icon14}`}>
                open_in_new
              </span>
            </div>
            <div className={styles.kpiValue}>{tile.value ?? '—'}</div>
            {tile.delta ? <div className={getToneClass(tile.tone)}>{tile.delta}</div> : <div className={getToneClass(tile.tone)}>&nbsp;</div>}
            <div className={styles.kpiSubtext}>{tile.subtext}</div>
          </button>
        ))}
      </div>

      {/* Row 1: Fulfillment & Order-to-Cash Funnel + Supplier & Integration Health */}
      <div className={styles.grid12}>
        <div className={`${styles.panelCard} ${styles.span7}`}>
          <div className={styles.panelHeader}>
            <div>
              <h2 className={styles.panelTitle}>
                Order-to-Cash &amp; POD Fulfillment Pipeline
              </h2>
              <p className={styles.panelSubtitle}>
                Click any stage to open the live operational list view
              </p>
            </div>
            <button
              type="button"
              className={styles.btnLinkGreen}
              onClick={() => onNavigate('orders', 'orders')}
            >
              All orders →
            </button>
          </div>

          <div className={styles.funnelList}>
            {funnel.map((st) => (
              <button
                key={st.stage}
                type="button"
                className={styles.funnelRowBtn}
                onClick={() => onNavigate(st.targetDomain, st.targetScreen)}
              >
                <div className={styles.funnelTopLine}>
                  <span className={styles.funnelStageName}>{st.stage}</span>
                  <div className={styles.funnelRightStats}>
                    <span className={styles.funnelCountStrong}>
                      {st.count.toLocaleString()} orders
                    </span>
                    <span className={styles.funnelMuted}>{st.gmv}</span>
                    <span className={styles.badgeNeutral}>{st.avgAge}</span>
                  </div>
                </div>
                  <div className={styles.barTrack}>
                    <svg className={styles.barSvg} aria-hidden="true">
                      <rect
                        className={getFunnelFillClass(st.tone)}
                        x="0"
                        y="0"
                        width={`${st.pctOfTotal}%`}
                        height="10"
                        rx="3"
                      />
                    </svg>
                  </div>
                </button>
            ))}
          </div>
        </div>

        <div className={`${styles.panelCard} ${styles.span5}`}>
          <div className={styles.panelHeader}>
            <div>
              <h2 className={styles.panelTitle}>Suppliers, Feeds &amp; Intake Inbox</h2>
              <p className={styles.panelSubtitle}>
                Live directory and feed status from the platform
              </p>
            </div>
            <button
              type="button"
              className={styles.btnGhostSm}
              onClick={() =>
                onToast('Copied forwarding address: receipts@unsaid.app')
              }
            >
              <span className={`material-symbols-outlined ${styles.icon14}`}>
                content_copy
              </span>
              Copy intake email
            </button>
          </div>

          <div className={styles.vitalList}>
            {integrations.map((v) => (
              <div key={v.name} className={styles.vitalRow}>
                <div className={styles.vitalInfo}>
                  <div className={styles.vitalName}>{v.name}</div>
                  <div className={styles.vitalMeta}>
                    {v.role} · {v.lastSync}
                  </div>
                </div>
                <div className={styles.vitalRight}>
                  <div className={styles.vitalStatCol}>
                    <div className={styles.vitalStatVal}>{v.metricValue}</div>
                    <div className={styles.vitalStatSub}>SLA {v.slaPct}</div>
                  </div>
                  <StatusPill status={v.status} />
                  <button
                    type="button"
                    className={styles.btnGhostSm}
                    onClick={() => onNavigate(v.targetDomain, v.targetScreen)}
                  >
                    Open
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Row 2: Business at a Glance Suggestions + Urgent Attention Snapshot */}
      <div className={styles.grid12}>
        <div className={`${styles.panelCard} ${styles.span6}`}>
          <div className={styles.panelHeader}>
            <div>
              <h2 className={styles.panelTitle}>
                Business at a glance — Suggested actions
              </h2>
              <p className={styles.panelSubtitle}>
                Derived from live bills, bank feed, order flags and vendor W-9 status
              </p>
            </div>
            {dismissedSuggestions.length > 0 && (
              <button
                type="button"
                className={styles.btnGhostSm}
                onClick={() => setDismissedSuggestions([])}
              >
                Restore all
              </button>
            )}
          </div>

          <div className={styles.suggestionList}>
            {activeSuggestions.map((sug) => (
              <div key={sug.id} className={styles.suggestionItem}>
                <div className={styles.suggestionLeft}>
                  <div className={styles.suggestionIconBox}>
                    <span className={`material-symbols-outlined ${styles.icon16}`}>
                      {sug.icon}
                    </span>
                  </div>
                  <div>
                    <div className={styles.suggestionCat}>{sug.category}</div>
                    <div className={styles.suggestionTitle}>{sug.title}</div>
                    <div className={styles.suggestionDetail}>{sug.detail}</div>
                    <span className={styles.suggestionImpact}>{sug.impact}</span>
                  </div>
                </div>
                <div className={styles.suggestionRight}>
                  <button
                    type="button"
                    className={styles.btnSecondary}
                    onClick={() => onNavigate(sug.targetDomain, sug.targetScreen)}
                  >
                    {sug.actionLabel}
                  </button>
                  <button
                    type="button"
                    className={styles.btnLinkGreen}
                    onClick={() =>
                      setDismissedSuggestions((prev) => [...prev, sug.id])
                    }
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            ))}
            {activeSuggestions.length === 0 && (
              <p className={styles.analyticsViewSub}>
                Nothing needs action right now — no open bills, uncategorized bank lines, flagged orders or missing W-9s.
              </p>
            )}
          </div>
        </div>

        <div className={`${styles.panelCard} ${styles.span6}`}>
          <div className={styles.panelHeader}>
            <div>
              <h2 className={styles.panelTitle}>
                Attention Queue Snapshot ({openAttention.length} open)
              </h2>
              <p className={styles.panelSubtitle}>
                Highest-urgency SLA, preflight, AR &amp; RMA exceptions
              </p>
            </div>
            <button
              type="button"
              className={styles.btnLinkGreen}
              onClick={() => onNavigate('dashboard', 'attention')}
            >
              Open Attention Queue →
            </button>
          </div>

          <div className={styles.suggestionList}>
            {openAttention.slice(0, 5).map((item) => (
              <div key={item.id} className={styles.suggestionItem}>
                <div className={styles.suggestionLeft}>
                  <div className={styles.suggestionIconBox}>
                    <span className={`material-symbols-outlined ${styles.icon16}`}>
                      {item.category?.toLowerCase().includes('sla') ? 'priority_high' :
                       item.category?.toLowerCase().includes('rma') ? 'keyboard_return' :
                       item.category?.toLowerCase().includes('ar') ? 'payments' :
                       item.category?.toLowerCase().includes('preflight') ? 'verified' :
                       'priority_high'}
                    </span>
                  </div>
                  <div>
                    <div className={styles.suggestionCat}>{item.category}</div>
                    <div className={styles.suggestionTitle}>{item.code} · {item.title}</div>
                    <div className={styles.suggestionDetail}>{item.entity} · {item.summary}</div>
                    <span className={styles.suggestionImpact}>SLA: {item.slaRemaining}</span>
                  </div>
                </div>
                <div className={styles.suggestionRight}>
                  <button
                    type="button"
                    className={styles.btnSecondary}
                    onClick={() => {
                      onResolveAttentionItem(item.id);
                      onToast(`Resolved ${item.code}`);
                    }}
                  >
                    Resolve
                  </button>
                  <button
                    type="button"
                    className={styles.btnLinkGreen}
                    onClick={() =>
                      onOpenPeek(
                        {
                          code: item.code,
                          title: item.title,
                          category: item.category,
                          entity: item.entity,
                          exposure: `$${item.impactAmount.toLocaleString()}`,
                          sla: item.slaRemaining,
                          summary: item.summary,
                          status: item.status,
                        },
                        'attention'
                      )
                    }
                  >
                    Peek
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* 2. Executive GMV & Margins View (/dashboard) */
export function ExecutiveGmvView({
  pinnedCreateActions,
  onOpenCustomizeCreate,
  onNavigate,
  onCreate,
  onOpenCreateFlyout,
  onOpenPeek,
  onToast,
}: {
  pinnedCreateActions: string[];
  onOpenCustomizeCreate: () => void;
  onNavigate: (domain: DomainKey, screenId: string) => void;
  onCreate: (label: string) => void;
  onOpenCreateFlyout: () => void;
  onOpenPeek: (row: DemoRow, family: string) => void;
  onToast: (msg: string) => void;
}) {
  const [period, setPeriod] = useState<ExecPeriod>('MTD');
  const [compareMode, setCompareMode] = useState<ExecCompare>('prior');
  const [inThousands, setInThousands] = useState<boolean>(false);
  const [selectedMonthIdx, setSelectedMonthIdx] = useState<number>(11);

  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [overview, setOverview] = useState<import('./dashboardAnalytics').OverviewDto | null>(null);
  const [parties, setParties] = useState<import('./dashboardAnalytics').PartyDto[]>([]);
  const [pnl, setPnl] = useState<PnlTotals | null>(null);
  const [priorPnl, setPriorPnl] = useState<PnlTotals | null>(null);
  const [monthPnls, setMonthPnls] = useState<(PnlTotals | null)[]>([]);
  const [kpiTargets, setKpiTargets] = useState<import('./dashboardAnalytics').KpiTarget[]>([]);
  const [arOpen, setArOpen] = useState(0);
  const [paid30, setPaid30] = useState(0);
  const [deposited, setDeposited] = useState(0);

  const now = useMemo(() => new Date(), []);
  const range = useMemo(() => {
    if (period === 'QTD') return { from: quarterStart(now), to: now, label: 'Quarter to date' };
    if (period === 'YTD') return { from: yearStart(now), to: now, label: 'Year to date' };
    if (period === '12M') return { from: new Date(now.getFullYear(), now.getMonth() - 11, 1), to: now, label: 'Last 12 months' };
    return { from: monthStart(now), to: now, label: 'Month to date' };
  }, [period, now]);

  useEffect(() => {
    let live = true;
    void (async () => {
      const [os, ov, ps, kt] = await Promise.all([loadOrders(), loadOverview(), loadParties(), loadKpiTargets()]);
      if (!live) return;
      setOrders(os);
      setOverview(ov);
      setParties(ps);
      setKpiTargets(kt);
      // Monthly P&L for the trailing 12 months (chart + inspector).
      const months: { from: Date; to: Date }[] = [];
      for (let i = 11; i >= 0; i--) {
        const from = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const to = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
        months.push({ from, to });
      }
      const pnls = await Promise.all(months.map((m) => loadPnl(isoDay(m.from), isoDay(m.to))));
      if (live) setMonthPnls(pnls);
      // AR / receipts for the pay funnel.
      try {
        const [invRes, rcpRes] = await Promise.all([
          fetch('/api/v1/documents?type=Invoice'),
          fetch('/api/v1/documents?type=SalesReceipt'),
        ]);
        const inv = invRes.ok ? ((await invRes.json()) as { data?: Record<string, unknown>[] }) : { data: [] };
        const rcp = rcpRes.ok ? ((await rcpRes.json()) as { data?: Record<string, unknown>[] }) : { data: [] };
        if (!live) return;
        const open = (inv.data ?? [])
          .filter((r) => !['paid', 'void', 'written_off'].includes(String(r.status)))
          .reduce((s, r) => s + Math.max(0, Number(r.total || 0) - Number(r.amount_paid || 0) - Number(r.amount_credited || 0)), 0);
        setArOpen(open);
        const since = now.getTime() - 30 * 86400000;
        const receipts = rcp.data ?? [];
        setPaid30(
          receipts
            .filter((r) => new Date(String(r.receipt_date || r.created_at || '')).getTime() >= since)
            .reduce((s, r) => s + (Number(r.amount) || 0), 0)
        );
        setDeposited(
          receipts
            .filter((r) => String(r.status) === 'settled')
            .reduce((s, r) => s + (Number(r.amount) || 0), 0)
        );
      } catch {
        /* pay funnel stays at 0 */
      }
    })();
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let live = true;
    void (async () => {
      const span = range.to.getTime() - range.from.getTime();
      const priorFrom = new Date(range.from.getTime() - span);
      const [p, pp] = await Promise.all([
        loadPnl(isoDay(range.from), isoDay(range.to)),
        loadPnl(isoDay(priorFrom), isoDay(range.from)),
      ]);
      if (!live) return;
      setPnl(p);
      setPriorPnl(pp);
    })();
    return () => {
      live = false;
    };
  }, [range]);

  const fmtMoney = (val: number) => {
    const absVal = Math.abs(val);
    if (inThousands) {
      const k = (absVal / 1000).toLocaleString('en-US', {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      });
      return val < 0 ? `($${k}K)` : `$${k}K`;
    }
    const full = Math.round(absVal).toLocaleString('en-US');
    return val < 0 ? `($${full})` : `$${full}`;
  };

  const periodOrders = orders.filter((o) => inRange(o.orderDate, range.from, range.to));
  const priorSpan = range.to.getTime() - range.from.getTime();
  const priorOrders = orders.filter((o) =>
    inRange(o.orderDate, new Date(range.from.getTime() - priorSpan), range.from)
  );
  const gmvTotal = orderGmv(periodOrders);
  const gmvPrior = orderGmv(priorOrders);
  const periodAov = aov(periodOrders);
  const refundsTotal = orderRefunds(periodOrders);

  // Plan mode reads platform_kpi_targets: the target whose period
  // matches the selected range (month/quarter/year starting on the
  // range's first day). No matching target -> 'No plan set'.
  const planTargetFor = (metric: string): number | null => {
    const periodType = period === 'MTD' ? 'month' : period === 'QTD' ? 'quarter' : period === 'YTD' ? 'year' : '';
    if (!periodType) return null;
    const startDay = isoDay(range.from);
    const t = kpiTargets.find((x) => x.metricCode === metric && x.periodType === periodType && x.periodStart === startDay);
    return t ? t.targetValue : null;
  };
  const deltaFor = (cur: number, prior: number | undefined, metric?: string) => {
    if (compareMode === 'plan') {
      if (!metric) return 'No plan connected';
      const target = planTargetFor(metric);
      if (target == null) return 'No plan set';
      if (target === 0) return 'Plan $0';
      return `${Math.round((cur / target) * 100)}% of plan`;
    }
    return prior !== undefined ? pctChange(cur, prior) : '—';
  };

  // Trailing-12-month series: GMV/refunds/orders from orders, P&L from the ledger.
  const series = useMemo(() => {
    const out: {
      month: string; shortLabel: string; gmv: number; netRevenue: number;
      grossProfit: number; cogs: number; expenses: number; net: number;
      refunds: number; orders: number;
    }[] = [];
    for (let i = 11; i >= 0; i--) {
      const from = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const to = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
      const mo = orders.filter((o) => inRange(o.orderDate, from, to));
      const p = monthPnls[11 - i];
      out.push({
        month: from.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
        shortLabel: from.toLocaleDateString('en-US', { month: 'short' }),
        gmv: orderGmv(mo),
        netRevenue: p?.income ?? 0,
        grossProfit: p?.grossProfit ?? 0,
        cogs: p?.cogs ?? 0,
        expenses: p?.expenses ?? 0,
        net: p?.net ?? 0,
        refunds: orderRefunds(mo),
        orders: mo.filter(isActiveOrder).length,
      });
    }
    return out;
  }, [orders, monthPnls, now]);

  const selectedMonth = series[Math.min(selectedMonthIdx, series.length - 1)] ?? series[series.length - 1];
  const selectedGrossMarginPct =
    selectedMonth && selectedMonth.netRevenue > 0
      ? ((selectedMonth.grossProfit / selectedMonth.netRevenue) * 100).toFixed(1)
      : '—';
  const selectedContribPct =
    selectedMonth && selectedMonth.netRevenue > 0
      ? ((selectedMonth.net / selectedMonth.netRevenue) * 100).toFixed(1)
      : '—';

  const maxChartGmv = Math.max(
    100,
    ...series.map((pt) => Math.max(pt.gmv, pt.netRevenue, pt.grossProfit))
  );
  const chartBaseY = 192;
  const chartPlotHeight = 162;

  const incomeBase = pnl && pnl.income > 0 ? pnl.income : 0;
  const waterfall: { label: string; amount: number; pctOfGmv: number; kind: 'gross' | 'deduction' | 'subtotal' | 'cogs' | 'net'; note: string }[] = pnl
    ? [
        { label: 'Net Recognized Revenue', amount: pnl.income, pctOfGmv: incomeBase ? 100 : 0, kind: 'net', note: 'Ledger income · P&L total' },
        { label: 'Cost of Goods Sold', amount: -pnl.cogs, pctOfGmv: incomeBase ? (pnl.cogs / incomeBase) * 100 : 0, kind: 'cogs', note: 'COGS accounts · subtype cogs' },
        { label: 'Gross Profit', amount: pnl.grossProfit, pctOfGmv: incomeBase ? (pnl.grossProfit / incomeBase) * 100 : 0, kind: 'subtotal', note: 'Revenue − COGS' },
        { label: 'Operating Expenses', amount: -pnl.expenses, pctOfGmv: incomeBase ? (pnl.expenses / incomeBase) * 100 : 0, kind: 'deduction', note: 'All expense accounts · P&L total' },
        { label: 'Net Operating Income', amount: pnl.net, pctOfGmv: incomeBase ? (pnl.net / incomeBase) * 100 : 0, kind: 'gross', note: 'Bottom line for the period' },
      ]
    : [];

  const accountRows = (pnl?.subs ?? []).filter((s) => s.amount !== 0);
  const channels = byChannel(periodOrders).map((c) => {
    const chOrders = periodOrders.filter((o) => isActiveOrder(o) && channelLabel(o.channel) === c.name);
    const chRefunds = chOrders.reduce((s, o) => s + (Number(o.amountRefunded) || 0), 0);
    return { ...c, refunds: chRefunds, net: c.value - chRefunds };
  });
  const suppliers = parties.filter((p) => p.roles.includes('supplier'));

  return (
    <div className={styles.container}>
      <div className={styles.headerBlock}>
        <div className={styles.breadcrumb}>
          <span>Dashboard</span>
          <span className={styles.breadcrumbSep}>/</span>
          <span>Overview</span>
        </div>
        <div className={styles.headerRow}>
          <div>
            <h1 className={styles.title}>Executive GMV &amp; Margins</h1>
            <p className={styles.subtitle}>
              {range.label} · Gross merchandise volume from live orders, margins from the ledger P&amp;L
            </p>
          </div>

          <div className={styles.toolbarRight}>
            <div className={styles.segmented}>
              {(['MTD', 'QTD', 'YTD', '12M'] as ExecPeriod[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  className={`${styles.segBtn} ${
                    period === p ? styles.segBtnBlueActive : ''
                  }`}
                  onClick={() => setPeriod(p)}
                >
                  {p}
                </button>
              ))}
            </div>

            <div className={styles.segmented}>
              <button
                type="button"
                className={`${styles.segBtn} ${
                  compareMode === 'prior' ? styles.segBtnActive : ''
                }`}
                onClick={() => setCompareMode('prior')}
              >
                vs Prior
              </button>
              <button
                type="button"
                className={`${styles.segBtn} ${
                  compareMode === 'plan' ? styles.segBtnActive : ''
                }`}
                onClick={() => setCompareMode('plan')}
              >
                vs Plan
              </button>
            </div>

            <button
              type="button"
              className={styles.btnSecondary}
              onClick={() => setInThousands((prev) => !prev)}
            >
              {inThousands ? 'Scale: $K' : 'Scale: Exact $'}
            </button>

            <button
              type="button"
              className={styles.btnPrimary}
              onClick={() => onNavigate('dashboard', 'explorer')}
            >
              <span className={`material-symbols-outlined ${styles.icon16}`}>
                query_stats
              </span>
              Open Explorer
            </button>
          </div>
        </div>
      </div>

      {/* Shared Customizable Create Actions Row */}
      <CreateActionsStrip
        pinnedLabels={pinnedCreateActions}
        onCreate={onCreate}
        onOpenCustomize={onOpenCustomizeCreate}
        onOpenCreateFlyout={onOpenCreateFlyout}
      />

      {/* 5 Executive KPI Tiles */}
      <div className={styles.kpiGrid5}>
        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>Gross Merchandise Volume (GMV)</span>
          <div className={styles.kpiValue}>{fmtMoney(gmvTotal)}</div>
          <div className={styles.kpiDeltaPos}>{deltaFor(gmvTotal, gmvPrior, 'gmv')}</div>
          <div className={styles.kpiSubtext}>
            {fmtInt(periodOrders.filter(isActiveOrder).length)} orders · {periodAov != null ? `${fmtUsd2(periodAov)} AOV` : '— AOV'}
          </div>
        </div>

        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>Net Recognized Revenue</span>
          <div className={styles.kpiValue}>{pnl ? fmtMoney(pnl.income) : '…'}</div>
          <div className={styles.kpiDeltaPos}>{deltaFor(pnl?.income ?? 0, priorPnl?.income, 'net_revenue')}</div>
          <div className={styles.kpiSubtext}>Ledger income · refunds {fmtMoney(refundsTotal)} on orders</div>
        </div>

        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>Gross Profit &amp; Margin</span>
          <div className={styles.kpiValue}>
            {pnl && pnl.income > 0 ? `${((pnl.grossProfit / pnl.income) * 100).toFixed(1)}%` : '—'}
          </div>
          <div className={styles.kpiDeltaPos}>
            {pnl ? `${fmtMoney(pnl.grossProfit)} (${deltaFor(pnl.grossProfit, priorPnl?.grossProfit, 'gross_profit')})` : '…'}
          </div>
          <div className={styles.kpiSubtext}>Revenue − COGS from the P&amp;L</div>
        </div>

        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>Net Contribution Margin</span>
          <div className={styles.kpiValue}>
            {pnl && pnl.income > 0 ? `${((pnl.net / pnl.income) * 100).toFixed(1)}%` : '—'}
          </div>
          <div className={styles.kpiDeltaPos}>
            {pnl ? `${fmtMoney(pnl.net)} (${deltaFor(pnl.net, priorPnl?.net, 'net_income')})` : '…'}
          </div>
          <div className={styles.kpiSubtext}>Net operating income after all expenses</div>
        </div>

        <button
          type="button"
          className={`${styles.kpiCard} ${styles.kpiCardClickable}`}
          onClick={() => onNavigate('finance', 'bank')}
        >
          <div className={styles.kpiTopRow}>
            <span className={styles.kpiLabel}>Operating Cash &amp; In-Transit</span>
            <span className={`material-symbols-outlined ${styles.icon14}`}>
              open_in_new
            </span>
          </div>
          <div className={styles.kpiValue}>{overview ? fmtMoney(overview.bankBalance) : '…'}</div>
          <div className={styles.kpiDeltaPos}>
            {overview ? `${overview.bankAccountCount} bank accounts` : '—'}
          </div>
          <div className={styles.kpiSubtext}>Click to inspect bank &amp; Stripe feed</div>
        </button>
      </div>

      {/* Interactive 12-Month GMV / Net Revenue / Gross Profit SVG Chart + Month Inspector */}
      <div className={styles.grid12}>
        <div className={`${styles.panelCard} ${styles.span8}`}>
          <div className={styles.panelHeader}>
            <div>
              <h2 className={styles.panelTitle}>
                12-Month GMV, Net Revenue &amp; Gross Profit Trajectory
              </h2>
              <p className={styles.panelSubtitle}>
                Click any month column to inspect unit economics &amp; ledger P&amp;L on the right
              </p>
            </div>
            <span className={styles.badgeNeutral}>
              Selected: {selectedMonth?.month ?? '—'}
            </span>
          </div>

          <div className={styles.chartWrap}>
            <svg
              viewBox="0 0 740 220"
              className={styles.chartSvg}
              role="img"
              aria-label="12-month GMV, Net Revenue, and Gross Profit bar chart"
            >
              {[0, 0.25, 0.5, 0.75, 1].map((tick) => {
                const y = chartBaseY - tick * chartPlotHeight;
                const labelVal = Math.round((maxChartGmv * tick) / 1000);
                return (
                  <g key={tick}>
                    <line
                      x1="44"
                      y1={y}
                      x2="730"
                      y2={y}
                      className={styles.chartGridLine}
                    />
                    <text x="4" y={y + 3} className={styles.chartAxisLabel}>
                      ${labelVal}K
                    </text>
                  </g>
                );
              })}

              {series.map((pt, idx) => {
                const colWidth = 56;
                const colX = 48 + idx * colWidth;
                const gmvH = (pt.gmv / maxChartGmv) * chartPlotHeight;
                const netH = (pt.netRevenue / maxChartGmv) * chartPlotHeight;
                const profH = (pt.grossProfit / maxChartGmv) * chartPlotHeight;
                const isSelected = idx === selectedMonthIdx;

                return (
                  <g key={pt.month} onClick={() => setSelectedMonthIdx(idx)}>
                    {isSelected && (
                      <rect
                        x={colX + 2}
                        y={20}
                        width={colWidth - 6}
                        height={chartBaseY - 16}
                        rx="4"
                        className={styles.chartColSelectedBg}
                      />
                    )}
                    <rect
                      x={colX + 8}
                      y={chartBaseY - gmvH}
                      width="11"
                      height={gmvH}
                      rx="2"
                      className={styles.chartBarGmv}
                    />
                    <rect
                      x={colX + 21}
                      y={chartBaseY - netH}
                      width="11"
                      height={netH}
                      rx="2"
                      className={styles.chartBarNet}
                    />
                    <rect
                      x={colX + 34}
                      y={chartBaseY - profH}
                      width="11"
                      height={profH}
                      rx="2"
                      className={styles.chartBarProfit}
                    />
                    <text
                      x={colX + 26}
                      y={210}
                      textAnchor="middle"
                      className={
                        isSelected
                          ? styles.chartMonthLabelActive
                          : styles.chartMonthLabel
                      }
                    >
                      {pt.shortLabel}
                    </text>
                    <rect
                      x={colX + 2}
                      y={20}
                      width={colWidth - 6}
                      height={195}
                      className={styles.chartColHit}
                    />
                  </g>
                );
              })}
            </svg>
          </div>

          <div className={styles.chartLegend}>
            <span className={styles.legendItem}>
              <span className={styles.dotBlue} />
              Gross Merchandise Volume (GMV)
            </span>
            <span className={styles.legendItem}>
              <span className={styles.dotTeal} />
              Net Recognized Revenue
            </span>
            <span className={styles.legendItem}>
              <span className={styles.dotGreen} />
              Gross Profit (After COGS)
            </span>
          </div>
        </div>

        <div className={`${styles.panelCard} ${styles.span4}`}>
          <div className={styles.panelHeader}>
            <div>
              <h2 className={styles.panelTitle}>{selectedMonth?.month ?? '—'}</h2>
              <p className={styles.panelSubtitle}>
                {selectedMonth ? `${selectedMonth.orders.toLocaleString()} orders · ${selectedMonth.orders > 0 ? fmtUsd2(selectedMonth.gmv / selectedMonth.orders) : '—'} AOV` : '—'}
              </p>
            </div>
            <StatusPill status="Current" />
          </div>

          {selectedMonth && (
            <>
              <div className={styles.inspectorList}>
                <div className={styles.inspectorRow}>
                  <span>Gross Merchandise Volume</span>
                  <strong>{fmtMoney(selectedMonth.gmv)}</strong>
                </div>
                <div className={styles.inspectorRow}>
                  <span>Refunds &amp; RMA credits</span>
                  <span className={styles.tdNeg}>{fmtMoney(-selectedMonth.refunds)}</span>
                </div>
                <div className={styles.inspectorRow}>
                  <span>Net Recognized Revenue</span>
                  <strong>{fmtMoney(selectedMonth.netRevenue)}</strong>
                </div>
                <div className={styles.inspectorRow}>
                  <span>Blank, Print &amp; Ship COGS</span>
                  <span className={styles.tdNeg}>{fmtMoney(-selectedMonth.cogs)}</span>
                </div>
                <div className={styles.inspectorRow}>
                  <span>Gross Profit ({selectedGrossMarginPct}%)</span>
                  <span className={styles.tdPos}>
                    {fmtMoney(selectedMonth.grossProfit)}
                  </span>
                </div>
                <div className={styles.inspectorRow}>
                  <span>Operating Expenses</span>
                  <span className={styles.tdNeg}>{fmtMoney(-selectedMonth.expenses)}</span>
                </div>
                <div className={styles.inspectorRowBold}>
                  <span>Net Operating Income ({selectedContribPct}%)</span>
                  <span className={styles.tdPos}>{fmtMoney(selectedMonth.net)}</span>
                </div>
              </div>

              <div className={styles.payFunnelGrid}>
                <div className={styles.payFunnelStep}>
                  <div className={styles.payFunnelLabel}>AR Not Paid</div>
                  <div className={styles.payFunnelVal}>{fmtMoney(arOpen)}</div>
                </div>
                <div className={styles.payFunnelStep}>
                  <div className={styles.payFunnelLabel}>Paid (30D)</div>
                  <div className={styles.payFunnelVal}>{fmtMoney(paid30)}</div>
                </div>
                <div className={styles.payFunnelStep}>
                  <div className={styles.payFunnelLabel}>Deposited</div>
                  <div className={styles.payFunnelVal}>{fmtMoney(deposited)}</div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* P&L Waterfall + Account & Channel Scorecards */}
      <div className={styles.grid12}>
        <div className={`${styles.panelCard} ${styles.span6}`}>
          <div className={styles.panelHeader}>
            <div>
              <h2 className={styles.panelTitle}>
                Revenue to Net Income Bridge
              </h2>
              <p className={styles.panelSubtitle}>
                Tied directly to the Chart of Accounts via the P&amp;L report
              </p>
            </div>
            <button
              type="button"
              className={styles.btnLinkGreen}
              onClick={() => onNavigate('finance', 'coa')}
            >
              Chart of accounts →
            </button>
          </div>

          <div className={styles.tableScroll}>
            <table className={styles.dataTable}>
              <thead className={styles.thead}>
                <tr>
                  <th className={styles.th}>P&amp;L / Ledger Line</th>
                  <th className={`${styles.th} ${styles.thRight}`}>Amount</th>
                  <th className={`${styles.th} ${styles.thRight}`}>% Revenue</th>
                  <th className={styles.th}>Share</th>
                </tr>
              </thead>
              <tbody>
                {waterfall.map((item) => {
                  const fillCls =
                    item.kind === 'deduction' || item.kind === 'cogs'
                      ? styles.fillMaroon
                      : item.kind === 'net'
                        ? styles.fillPrimary
                        : styles.fillBlue;
                  return (
                    <tr key={item.label} className={styles.tr}>
                      <td className={styles.td}>
                        <div>{item.label}</div>
                        <div className={styles.tdMuted}>{item.note}</div>
                      </td>
                      <td
                        className={`${styles.td} ${styles.tdRight} ${
                          item.amount < 0 ? styles.tdNeg : styles.tdPos
                        }`}
                      >
                        {fmtMoney(item.amount)}
                      </td>
                      <td className={`${styles.td} ${styles.tdRight}`}>
                        {item.pctOfGmv.toFixed(1)}%
                      </td>
                      <td className={styles.td}>
                        <div className={styles.barTrack}>
                          <svg className={styles.barSvg} aria-hidden="true">
                            <rect
                              className={fillCls}
                              x="0"
                              y="0"
                              width={`${Math.min(100, Math.abs(item.pctOfGmv))}%`}
                              height="10"
                              rx="2"
                            />
                          </svg>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {waterfall.length === 0 && (
                  <tr><td className={styles.td} colSpan={4}>No ledger activity in this period.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className={`${styles.panelCard} ${styles.span6}`}>
          <div className={styles.panelHeader}>
            <div>
              <h2 className={styles.panelTitle}>
                Revenue &amp; Cost by Ledger Account
              </h2>
              <p className={styles.panelSubtitle}>
                Click any account row to inspect it in the peek drawer
              </p>
            </div>
            <button
              type="button"
              className={styles.btnGhostSm}
              onClick={() => {
                const cols = [
                  { key: 'label', label: 'Account' },
                  { key: 'section', label: 'Section' },
                  { key: 'amount', label: 'Amount' },
                ];
                exportToCsv(accountRows as unknown as Record<string, unknown>[], cols, 'exec-account-breakdown');
                onToast(`Exported ${accountRows.length} records to CSV`);
              }}
            >
              Export CSV
            </button>
          </div>

          <div className={styles.tableScroll}>
            <table className={styles.dataTable}>
              <thead className={styles.thead}>
                <tr>
                  <th className={styles.th}>Account</th>
                  <th className={styles.th}>Section</th>
                  <th className={`${styles.th} ${styles.thRight}`}>Amount</th>
                  <th className={`${styles.th} ${styles.thRight}`}>Share</th>
                </tr>
              </thead>
              <tbody>
                {accountRows.map((row) => (
                  <tr
                    key={`${row.section}-${row.label}`}
                    className={styles.tr}
                    onClick={() =>
                      onOpenPeek(
                        {
                          name: row.label,
                          section: row.section,
                          amount: fmtMoney(row.amount),
                          status: 'Active',
                        },
                        'category'
                      )
                    }
                  >
                    <td className={styles.td}>{row.label}</td>
                    <td className={styles.td}>{row.section}</td>
                    <td className={`${styles.td} ${styles.tdRight} ${row.amount < 0 ? styles.tdNeg : styles.tdPos}`}>
                      {fmtMoney(row.amount)}
                    </td>
                    <td className={`${styles.td} ${styles.tdRight}`}>
                      {incomeBase > 0 ? `${((Math.abs(row.amount) / incomeBase) * 100).toFixed(1)}%` : '—'}
                    </td>
                  </tr>
                ))}
                {accountRows.length === 0 && (
                  <tr><td className={styles.td} colSpan={4}>No nonzero ledger accounts in this period.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div className={styles.panelHeader}>
            <span className={styles.formLabel}>Sales Channels &amp; POD Suppliers</span>
          </div>

          <div className={styles.vitalList}>
            {channels.map((ch) => (
              <div key={ch.name} className={styles.vitalRow}>
                <div className={styles.vitalInfo}>
                  <div className={styles.vitalName}>{ch.name}</div>
                  <div className={styles.vitalMeta}>
                    {ch.count} orders · refunds {fmtMoney(ch.refunds)}
                  </div>
                </div>
                <div className={styles.vitalRight}>
                  <div className={styles.vitalStatCol}>
                    <div className={styles.vitalStatVal}>{fmtMoney(ch.value)}</div>
                    <div className={styles.vitalStatSub}>
                      Net {fmtMoney(ch.net)}
                    </div>
                  </div>
                  <StatusPill status="Active" />
                </div>
              </div>
            ))}
            {suppliers.map((sup) => (
              <div key={sup.id} className={styles.vitalRow}>
                <div className={styles.vitalInfo}>
                  <div className={styles.vitalName}>Supplier: {sup.displayName}</div>
                  <div className={styles.vitalMeta}>
                    Supplier directory · catalog sync
                  </div>
                </div>
                <div className={styles.vitalRight}>
                  <div className={styles.vitalStatCol}>
                    <div className={styles.vitalStatVal}>—</div>
                    <div className={styles.vitalStatSub}>No routed-order margin source</div>
                  </div>
                  <StatusPill status="Healthy" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
