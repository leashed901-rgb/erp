'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  ExplorerDatasetKey,
  ExplorerRow,
  SavedExplorerView,
} from '@/data/dashboardData';
import { DemoRow, DomainKey } from '@/data/shellData';
import StatusPill from '@/components/StatusPill';
import { exportToCsv } from '@/lib/csvExport';
import {
  CustomColumnItem,
  ListCustomizeDrawer,
  VisualFormatConfig,
  formatVisualNumber,
} from './DashboardModals';
import {
  OrderRow,
  ProductRow,
  aov,
  byChannel,
  channelLabel,
  fmtUsd2,
  inRange,
  isoDay,
  isActiveOrder,
  loadOrders,
  loadPnl,
  loadProducts,
  loadReturns,
  orderGmv,
  yearStart,
} from './dashboardAnalytics';
import styles from './DashboardScreens.module.css';

/* 1. Analytics Overview (/analytics) */
export function AnalyticsOverviewView({
  onNavigate,
  onOpenPeek,
  onToast,
}: {
  onNavigate: (domain: DomainKey, screenId: string) => void;
  onOpenPeek: (row: DemoRow, family: string) => void;
  onToast: (msg: string) => void;
}) {
  const [range, setRange] = useState<'7D' | '30D' | '90D' | 'YTD'>('30D');
  const [channel, setChannel] = useState<string>('All channels');
  const [focusTab, setFocusTab] = useState<
    'all' | 'conversion' | 'cohorts' | 'skus' | 'attribution'
  >('all');

  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [returnsCount, setReturnsCount] = useState(0);

  useEffect(() => {
    let live = true;
    void (async () => {
      const [os, ps, rs] = await Promise.all([loadOrders(), loadProducts(), loadReturns()]);
      if (!live) return;
      setOrders(os);
      setProducts(ps);
      setReturnsCount(rs.length);
    })();
    return () => {
      live = false;
    };
  }, []);

  const now = new Date();
  const rangeFrom =
    range === '7D'
      ? new Date(now.getTime() - 7 * 86400000)
      : range === '30D'
        ? new Date(now.getTime() - 30 * 86400000)
        : range === '90D'
          ? new Date(now.getTime() - 90 * 86400000)
          : yearStart(now);

  const channelMatch = (o: OrderRow) => {
    const c = (o.channel || 'website').toLowerCase();
    if (channel === 'Storefront') return c === 'website';
    if (channel === 'Marketplace') return c !== 'website' && c !== 'manual';
    if (channel === 'B2B Invoices') return c === 'b2b' || c === 'invoice';
    return true;
  };
  const filtered = orders.filter((o) => inRange(o.orderDate, rangeFrom, now) && channelMatch(o));
  const active = filtered.filter(isActiveOrder);
  const gmv = orderGmv(filtered);
  const a = aov(filtered);

  const buyerKey = (o: OrderRow) => o.customerId || o.customerEmail || 'guest';
  const buyers = new Map<string, number>();
  for (const o of active) buyers.set(buyerKey(o), (buyers.get(buyerKey(o)) ?? 0) + 1);
  const repeatBuyers = [...buyers.values()].filter((n) => n >= 2).length;
  const repeatShare = buyers.size > 0 ? (repeatBuyers / buyers.size) * 100 : 0;

  const getHeatCellClass = (val: number) => {
    if (val === 0) return styles.heatEmpty;
    if (val === 100) return styles.heat100;
    if (val >= 38) return styles.heatHigh;
    if (val >= 30) return styles.heatMid;
    return styles.heatLow;
  };

  const showConversion = focusTab === 'all' || focusTab === 'conversion';
  const showAttribution = focusTab === 'all' || focusTab === 'attribution';
  const showCohorts = focusTab === 'all' || focusTab === 'cohorts';
  const showSkus = focusTab === 'all' || focusTab === 'skus';

  const placed = filtered.length;
  const paid = filtered.filter((o) => o.paymentStatus === 'paid').length;
  const shipped = filtered.filter((o) => {
    const s = (o.displayStatus || '').toLowerCase();
    return s.includes('ship') || s.includes('deliver');
  }).length;
  const delivered = filtered.filter((o) => (o.displayStatus || '').toLowerCase().includes('deliver')).length;
  const funnel = [
    { step: 'Orders placed', count: placed, dropoff: `${filtered.length - active.length} cancelled` },
    { step: 'Paid', count: paid, dropoff: `${placed - paid} not yet paid` },
    { step: 'Shipped / In transit', count: shipped, dropoff: `${paid - shipped} paid, not shipped` },
    { step: 'Delivered & settled', count: delivered, dropoff: `${shipped - delivered} in transit` },
  ].map((s) => ({ ...s, pct: placed > 0 ? (s.count / placed) * 100 : 0 }));

  // Cohorts by first-order month, retention computed from the full order history.
  const cohorts = useMemo(() => {
    const byBuyer = new Map<string, OrderRow[]>();
    for (const o of orders) {
      if (!isActiveOrder(o)) continue;
      const k = o.customerId || o.customerEmail || 'guest';
      const arr = byBuyer.get(k) ?? [];
      arr.push(o);
      byBuyer.set(k, arr);
    }
    const byMonth = new Map<string, { buyers: Set<string>; gmv: number; months: Date[] }>();
    for (const [buyer, os] of byBuyer) {
      const sorted = [...os].sort((x, y) => x.orderDate.localeCompare(y.orderDate));
      const first = new Date(sorted[0].orderDate);
      const key = `${first.getFullYear()}-${String(first.getMonth() + 1).padStart(2, '0')}`;
      const cur = byMonth.get(key) ?? { buyers: new Set<string>(), gmv: 0, months: [] };
      cur.buyers.add(buyer);
      cur.gmv += os.reduce((s, o) => s + (Number(o.total) || 0), 0);
      cur.months = os.map((o) => new Date(o.orderDate));
      byMonth.set(key, cur);
    }
    return [...byMonth.entries()]
      .sort((x, y) => y[0].localeCompare(x[0]))
      .slice(0, 6)
      .map(([key, v]) => {
        const [y, m] = key.split('-').map(Number);
        const retention: number[] = [];
        for (let k = 0; k <= 5; k++) {
          if (k === 0) {
            retention.push(100);
            continue;
          }
          const target = new Date(y, m - 1 + k, 1);
          if (target.getTime() > now.getTime()) {
            retention.push(0);
            continue;
          }
          // Share of this cohort's buyers with any order in month +k —
          // approximated from the cohort's pooled order months.
          const inMonth = v.months.filter(
            (d) => d.getFullYear() === target.getFullYear() && d.getMonth() === target.getMonth()
          ).length;
          retention.push(v.buyers.size > 0 ? Math.round((Math.min(inMonth, v.buyers.size) / v.buyers.size) * 100) : 0);
        }
        return {
          cohort: new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
          customers: v.buyers.size,
          ltv: v.buyers.size > 0 ? fmtUsd2(v.gmv / v.buyers.size) : '$0.00',
          retention,
        };
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders]);

  const topSkus = [...products]
    .sort((x, y) => (Number(y.revenue) || 0) - (Number(x.revenue) || 0) || (Number(y.units_sold) || 0) - (Number(x.units_sold) || 0))
    .slice(0, 8);

  return (
    <div className={styles.container}>
      <div className={styles.headerBlock}>
        <div className={styles.breadcrumb}>
          <span>Dashboard</span>
          <span className={styles.breadcrumbSep}>/</span>
          <span>Analytics</span>
        </div>
        <div className={styles.headerRow}>
          <div>
            <h1 className={styles.title}>Analytics</h1>
            <p className={styles.subtitle}>
              Order pipeline, customer cohorts, SKU velocity &amp; channel attribution from live data — traffic sessions are not connected
            </p>
          </div>
          <div className={styles.toolbarRight}>
            <select
              className={styles.selectControl}
              value={channel}
              onChange={(e) => setChannel(e.target.value)}
            >
              <option value="All channels">All channels</option>
              <option value="Storefront">Storefront (D2C)</option>
              <option value="Marketplace">Marketplace Sellers</option>
              <option value="B2B Invoices">B2B Invoices</option>
            </select>

            <div className={styles.segmented}>
              {(['7D', '30D', '90D', 'YTD'] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  className={`${styles.segBtn} ${
                    range === r ? styles.segBtnBlueActive : ''
                  }`}
                  onClick={() => setRange(r)}
                >
                  {r}
                </button>
              ))}
            </div>

            <button
              type="button"
              className={styles.btnSecondary}
              onClick={() => {
                const cols = [
                  { key: 'slug', label: 'SKU' },
                  { key: 'name', label: 'Name' },
                  { key: 'category', label: 'Category' },
                  { key: 'brand', label: 'Supplier' },
                  { key: 'units_sold', label: 'Units' },
                  { key: 'revenue', label: 'GMV' },
                  { key: 'status', label: 'Status' },
                ];
                exportToCsv(topSkus as unknown as Record<string, unknown>[], cols, 'analytics-overview');
                onToast(`Exported ${topSkus.length} records to CSV`);
              }}
            >
              <span className={`material-symbols-outlined ${styles.icon16}`}>
                download
              </span>
              Export
            </button>

            <button
              type="button"
              className={styles.btnPrimary}
              onClick={() => onNavigate('dashboard', 'explorer')}
            >
              <span className={`material-symbols-outlined ${styles.icon16}`}>
                table_chart
              </span>
              Explore raw data
            </button>
          </div>
        </div>
      </div>

      {/* Sub-navigation Tabs */}
      <div className={styles.tableCard}>
        <div className={styles.viewTabsBar}>
          {[
            ['all', 'All Analytics'],
            ['conversion', 'Traffic & Conversion'],
            ['cohorts', 'Revenue & Cohorts'],
            ['skus', 'Catalog & SKU Velocity'],
            ['attribution', 'Marketing & Attribution'],
          ].map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={`${styles.viewTab} ${
                focusTab === id ? styles.viewTabActive : ''
              }`}
              onClick={() =>
                setFocusTab(
                  id as 'all' | 'conversion' | 'cohorts' | 'skus' | 'attribution'
                )
              }
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* 4 Analytics KPI Cards — all computed from live orders */}
      <div className={styles.kpiGrid4}>
        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>Orders in Range</span>
          <div className={styles.kpiValue}>{active.length.toLocaleString()}</div>
          <div className={styles.kpiDeltaPos}>{placed} placed incl. cancelled</div>
          <div className={styles.kpiSubtext}>{channel} · {range}</div>
        </div>

        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>GMV in Range</span>
          <div className={styles.kpiValue}>{fmtUsd2(gmv)}</div>
          <div className={styles.kpiDeltaPos}>Live ERP orders</div>
          <div className={styles.kpiSubtext}>Cancelled orders excluded</div>
        </div>

        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>Average Order Value</span>
          <div className={styles.kpiValue}>{a != null ? fmtUsd2(a) : '—'}</div>
          <div className={styles.kpiDeltaPos}>Orders with value only</div>
          <div className={styles.kpiSubtext}>GMV ÷ valued orders</div>
        </div>

        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>Repeat Buyer Share</span>
          <div className={styles.kpiValue}>{buyers.size > 0 ? `${repeatShare.toFixed(1)}%` : '—'}</div>
          <div className={styles.kpiDeltaPos}>{repeatBuyers} of {buyers.size} buyers ordered twice+</div>
          <div className={styles.kpiSubtext}>{returnsCount} returns recorded all time</div>
        </div>
      </div>

      {/* Order Funnel + Channel Attribution */}
      {(showConversion || showAttribution) && (
        <div className={styles.grid12}>
          {showConversion && (
            <div
              className={`${styles.panelCard} ${
                showAttribution ? styles.span5 : styles.span8
              }`}
            >
              <div className={styles.panelHeader}>
                <div>
                  <h2 className={styles.panelTitle}>Order Conversion Funnel</h2>
                  <p className={styles.panelSubtitle}>
                    Placed → Paid → Shipped → Delivered (session steps are not measured — no traffic source)
                  </p>
                </div>
                <span className={styles.badgeNeutral}>{channel}</span>
              </div>

              <div className={styles.funnelList}>
                {funnel.map((st) => (
                  <div key={st.step} className={styles.funnelRowBtn}>
                    <div className={styles.funnelTopLine}>
                      <span className={styles.funnelStageName}>{st.step}</span>
                      <div className={styles.funnelRightStats}>
                        <span className={styles.funnelCountStrong}>
                          {st.count.toLocaleString()}
                        </span>
                        <span className={styles.funnelMuted}>
                          {st.pct.toFixed(1)}%
                        </span>
                      </div>
                    </div>
                    <div className={styles.barTrack}>
                      <svg className={styles.barSvg} aria-hidden="true">
                        <rect
                          className={styles.fillTeal}
                          x="0"
                          y="0"
                          width={`${Math.max(0, st.pct)}%`}
                          height="10"
                          rx="3"
                        />
                      </svg>
                    </div>
                    <div className={styles.kpiSubtext}>{st.dropoff}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {showAttribution && (
            <div
              className={`${styles.panelCard} ${
                showConversion ? styles.span7 : styles.span8
              }`}
            >
              <div className={styles.panelHeader}>
                <div>
                  <h2 className={styles.panelTitle}>
                    Sales-Channel Attribution
                  </h2>
                  <p className={styles.panelSubtitle}>
                    Orders and GMV by sales channel — ad spend lives in the Ad Center, not per-channel here
                  </p>
                </div>
                <button
                  type="button"
                  className={styles.btnLinkGreen}
                  onClick={() => onNavigate('marketing', 'social')}
                >
                  Open Marketing →
                </button>
              </div>

              <div className={styles.tableScroll}>
                <table className={styles.dataTable}>
                  <thead className={styles.thead}>
                    <tr>
                      <th className={styles.th}>Channel</th>
                      <th className={`${styles.th} ${styles.thRight}`}>Spend</th>
                      <th className={`${styles.th} ${styles.thRight}`}>Orders</th>
                      <th className={`${styles.th} ${styles.thRight}`}>Attr. GMV</th>
                      <th className={`${styles.th} ${styles.thRight}`}>ROAS</th>
                      <th className={`${styles.th} ${styles.thRight}`}>CAC</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byChannel(filtered).map((ch) => (
                      <tr
                        key={ch.name}
                        className={styles.tr}
                        onClick={() =>
                          onOpenPeek(
                            {
                              name: ch.name,
                              orders: ch.count,
                              attributedGmv: fmtUsd2(ch.value),
                              spend: 'Not tracked per channel',
                              roas: '—',
                              status: 'Active',
                            },
                            'attribution'
                          )
                        }
                      >
                        <td className={styles.td}>
                          <div>{ch.name}</div>
                          <div className={styles.tdMuted}>Sales channel on the order</div>
                        </td>
                        <td className={`${styles.td} ${styles.tdRight}`}>—</td>
                        <td className={`${styles.td} ${styles.tdRight}`}>
                          {ch.count.toLocaleString()}
                        </td>
                        <td className={`${styles.td} ${styles.tdRight} ${styles.tdPos}`}>
                          {fmtUsd2(ch.value)}
                        </td>
                        <td className={`${styles.td} ${styles.tdRight}`}>—</td>
                        <td className={`${styles.td} ${styles.tdRight}`}>—</td>
                      </tr>
                    ))}
                    {byChannel(filtered).length === 0 && (
                      <tr><td className={styles.td} colSpan={6}>No orders in this range and channel.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Cohort Retention Matrix + Top SKUs */}
      {(showCohorts || showSkus) && (
        <div className={styles.grid12}>
          {showCohorts && (
            <div
              className={`${styles.panelCard} ${
                showSkus ? styles.span6 : styles.span8
              }`}
            >
              <div className={styles.panelHeader}>
                <div>
                  <h2 className={styles.panelTitle}>
                    Monthly Customer Retention Cohorts
                  </h2>
                  <p className={styles.panelSubtitle}>
                    Buyers by first-order month; M0 is the acquisition month
                  </p>
                </div>
                <span className={styles.badgeNeutral}>Live orders</span>
              </div>

              <div className={styles.tableScroll}>
                <table className={styles.dataTable}>
                  <thead className={styles.thead}>
                    <tr>
                      <th className={styles.th}>Cohort</th>
                      <th className={`${styles.th} ${styles.thRight}`}>Buyers</th>
                      <th className={`${styles.th} ${styles.thRight}`}>LTV</th>
                      <th className={styles.th}>M0</th>
                      <th className={styles.th}>M1</th>
                      <th className={styles.th}>M2</th>
                      <th className={styles.th}>M3</th>
                      <th className={styles.th}>M4</th>
                      <th className={styles.th}>M5</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cohorts.map((row) => (
                      <tr key={row.cohort} className={styles.tr}>
                        <td className={styles.td}>{row.cohort}</td>
                        <td className={`${styles.td} ${styles.tdRight}`}>
                          {row.customers.toLocaleString()}
                        </td>
                        <td className={`${styles.td} ${styles.tdRight} ${styles.tdPos}`}>
                          {row.ltv}
                        </td>
                        {row.retention.map((val, i) => (
                          <td
                            key={i}
                            className={`${styles.heatCellBase} ${getHeatCellClass(val)}`}
                          >
                            {val > 0 ? `${val}%` : '—'}
                          </td>
                        ))}
                      </tr>
                    ))}
                    {cohorts.length === 0 && (
                      <tr><td className={styles.td} colSpan={9}>No buyers yet — cohorts form from the first orders.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {showSkus && (
            <div
              className={`${styles.panelCard} ${
                showCohorts ? styles.span6 : styles.span8
              }`}
            >
              <div className={styles.panelHeader}>
                <div>
                  <h2 className={styles.panelTitle}>
                    Top Performing SKUs &amp; Designs
                  </h2>
                  <p className={styles.panelSubtitle}>
                    Click any SKU row to inspect catalog economics
                  </p>
                </div>
                <button
                  type="button"
                  className={styles.btnLinkGreen}
                  onClick={() => onNavigate('catalog', 'products')}
                >
                  Catalog →
                </button>
              </div>

              <div className={styles.tableScroll}>
                <table className={styles.dataTable}>
                  <thead className={styles.thead}>
                    <tr>
                      <th className={styles.th}>SKU / Product</th>
                      <th className={styles.th}>Supplier</th>
                      <th className={`${styles.th} ${styles.thRight}`}>Units</th>
                      <th className={`${styles.th} ${styles.thRight}`}>GMV</th>
                      <th className={`${styles.th} ${styles.thRight}`}>Margin</th>
                      <th className={styles.th}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topSkus.map((sku) => (
                      <tr
                        key={sku.id}
                        className={styles.tr}
                        onClick={() =>
                          onOpenPeek(
                            {
                              name: sku.name,
                              category: sku.category || '—',
                              supplier: sku.brand || '—',
                              units: Number(sku.units_sold) || 0,
                              gmv: fmtUsd2(Number(sku.revenue) || 0),
                              margin: '— (no cost source)',
                              status: sku.status,
                            },
                            'catalog'
                          )
                        }
                      >
                        <td className={styles.td}>
                          <div>{sku.name}</div>
                          <div className={styles.tdMuted}>
                            {sku.slug} · {sku.category || 'Uncategorized'}
                          </div>
                        </td>
                        <td className={styles.td}>{sku.brand || '—'}</td>
                        <td className={`${styles.td} ${styles.tdRight}`}>
                          {(Number(sku.units_sold) || 0).toLocaleString()}
                        </td>
                        <td className={`${styles.td} ${styles.tdRight} ${styles.tdPos}`}>
                          {fmtUsd2(Number(sku.revenue) || 0)}
                        </td>
                        <td className={`${styles.td} ${styles.tdRight}`}>—</td>
                        <td className={styles.td}>
                          <StatusPill status={sku.status === 'published' ? 'Published' : sku.status} />
                        </td>
                      </tr>
                    ))}
                    {topSkus.length === 0 && (
                      <tr><td className={styles.td} colSpan={6}>No products in the catalog yet.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* 2. Analytics Explorer View (/analytics/explorer — Ad-hoc Pivot + Full P1 List-System) */
const DEFAULT_EXPLORER_COLUMNS: CustomColumnItem[] = [
  { key: 'dimension', label: 'Primary Dimension', visible: true },
  { key: 'secondaryDim', label: 'Supplier / Method', visible: true },
  { key: 'segment', label: 'Segment', visible: true },
  { key: 'orders', label: 'Orders', visible: true, right: true },
  { key: 'gmv', label: 'GMV', visible: true, right: true },
  { key: 'discountsAndRefunds', label: 'Promos & RMAs', visible: true, right: true },
  { key: 'netRevenue', label: 'Net Revenue', visible: true, right: true },
  { key: 'cogs', label: 'Supplier COGS', visible: true, right: true },
  { key: 'grossProfit', label: 'Gross Profit', visible: true, right: true },
  { key: 'marginPct', label: 'Margin %', visible: true, right: true },
  { key: 'varianceAmount', label: 'vs Plan', visible: true, right: true },
  { key: 'status', label: 'Status', visible: true },
  { key: 'createdBy', label: 'Created by', visible: false },
  { key: 'createdOn', label: 'Created on', visible: false },
  { key: 'modifiedBy', label: 'Modified by', visible: false },
  { key: 'modifiedOn', label: 'Modified on', visible: false },
];

interface SellerRow {
  seller_id: string;
  display_name: string;
  applicant_type: string | null;
  recorded_earnings: number | null;
  tax_form_status: string | null;
}

export function AnalyticsExplorerView({
  onNavigate,
  onOpenPeek,
  onToast,
}: {
  onNavigate: (domain: DomainKey, screenId: string) => void;
  onOpenPeek: (row: DemoRow, family: string) => void;
  onToast: (msg: string) => void;
}) {
  const [dataset, setDataset] = useState<ExplorerDatasetKey>('orders_gmv');
  const [activeTab, setActiveTab] = useState<string>('All rows');
  const [search, setSearch] = useState<string>('');
  const [dateRange, setDateRange] = useState<string>('Last 30 days');
  const [showVisualChart, setShowVisualChart] = useState<boolean>(true);

  // Saved views start empty: there is no saved-view store for the
  // Explorer yet, so nothing is invented. Views saved here live for the
  // session.
  const [savedViews, setSavedViews] = useState<SavedExplorerView[]>([]);
  const [activeSavedId, setActiveSavedId] = useState<string>('');
  const [addingView, setAddingView] = useState<boolean>(false);
  const [newViewName, setNewViewName] = useState<string>('');

  const [sortKey, setSortKey] = useState<keyof ExplorerRow>('gmv');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [openRowMenuId, setOpenRowMenuId] = useState<string | null>(null);
  const [splitMenuOpen, setSplitMenuOpen] = useState<boolean>(false);
  const [customizeOpen, setCustomizeOpen] = useState<boolean>(false);

  const [columns, setColumns] = useState<CustomColumnItem[]>(
    DEFAULT_EXPLORER_COLUMNS
  );
  const [visualCfg, setVisualCfg] = useState<VisualFormatConfig>({
    currencySymbol: true,
    parenthesesNegatives: true,
    decimals: 0,
    divideBy1000: false,
  });

  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [sellers, setSellers] = useState<SellerRow[]>([]);
  const [cogsRate, setCogsRate] = useState(0);

  useEffect(() => {
    let live = true;
    void (async () => {
      const nowD = new Date();
      const [os, ps, pnl] = await Promise.all([
        loadOrders(),
        loadProducts(),
        loadPnl(isoDay(yearStart(nowD)), isoDay(nowD)),
      ]);
      if (!live) return;
      setOrders(os);
      setProducts(ps);
      if (pnl && pnl.income > 0) setCogsRate(pnl.cogs / pnl.income);
      try {
        const res = await fetch('/api/sellers');
        if (res.ok) {
          const j = (await res.json()) as { data?: SellerRow[] } | SellerRow[];
          if (live) setSellers(Array.isArray(j) ? j : (j.data ?? []));
        }
      } catch {
        /* seller dataset stays empty */
      }
    })();
    return () => {
      live = false;
    };
  }, []);

  const datasets = useMemo<Record<ExplorerDatasetKey, ExplorerRow[]>>(() => {
    const nowD = new Date();
    const from =
      dateRange === 'Last 7 days'
        ? new Date(nowD.getTime() - 7 * 86400000)
        : dateRange === 'Q4 2026 QTD'
          ? new Date(nowD.getFullYear(), Math.floor(nowD.getMonth() / 3) * 3, 1)
          : dateRange === 'YTD 2026'
            ? yearStart(nowD)
            : new Date(nowD.getTime() - 30 * 86400000);
    const ranged = orders.filter((o) => inRange(o.orderDate, from, nowD));
    const mk = (
      base: Omit<ExplorerRow, 'cogs' | 'grossProfit' | 'marginPct' | 'varianceAmount'> & { allocateCogs?: boolean }
    ): ExplorerRow => {
      const cogs = base.allocateCogs === false ? 0 : base.netRevenue * cogsRate;
      const grossProfit = base.netRevenue - cogs;
      return {
        ...base,
        cogs: Math.round(cogs * 100) / 100,
        grossProfit: Math.round(grossProfit * 100) / 100,
        marginPct: base.netRevenue > 0 ? Math.round((grossProfit / base.netRevenue) * 1000) / 10 : 0,
        varianceAmount: 0,
      };
    };

    // Orders & GMV — grouped by channel × fulfillment method.
    const ogMap = new Map<string, ExplorerRow>();
    for (const o of ranged) {
      if (!isActiveOrder(o)) continue;
      const dim = channelLabel(o.channel);
      const key = `${dim}|${o.fulfillmentMethod || 'stock'}`;
      const cur = ogMap.get(key) ?? mk({
        id: `og-${key}`, dimension: dim,
        secondaryDim: o.fulfillmentMethod || 'stock',
        segment: 'Orders', orders: 0, gmv: 0, discountsAndRefunds: 0, netRevenue: 0,
        status: 'Live', createdBy: 'Platform', createdOn: o.orderDate.slice(0, 10),
        modifiedBy: 'Platform', modifiedOn: o.orderDate.slice(0, 10),
      });
      cur.orders += 1;
      cur.gmv += Number(o.total) || 0;
      cur.discountsAndRefunds += (Number(o.discountTotal) || 0) + (Number(o.amountRefunded) || 0);
      cur.netRevenue = cur.gmv - cur.discountsAndRefunds;
      cur.cogs = Math.round(cur.netRevenue * cogsRate * 100) / 100;
      cur.grossProfit = Math.round((cur.netRevenue - cur.cogs) * 100) / 100;
      cur.marginPct = cur.netRevenue > 0 ? Math.round((cur.grossProfit / cur.netRevenue) * 1000) / 10 : 0;
      ogMap.set(key, cur);
    }

    // Products & SKUs — catalog rows with recorded revenue.
    const skuRows = [...products]
      .sort((x, y) => (Number(y.revenue) || 0) - (Number(x.revenue) || 0))
      .slice(0, 20)
      .map((p) => mk({
        id: `sku-${p.id}`, dimension: p.name, secondaryDim: p.brand || '—',
        segment: p.category || 'Catalog', orders: Number(p.order_count) || 0,
        gmv: Number(p.revenue) || 0, discountsAndRefunds: 0, netRevenue: Number(p.revenue) || 0,
        status: p.status.charAt(0).toUpperCase() + p.status.slice(1),
        createdBy: 'Catalog', createdOn: '—', modifiedBy: 'Catalog', modifiedOn: '—',
      }));

    // Customer cohorts — one row per buyer.
    const cMap = new Map<string, ExplorerRow>();
    for (const o of orders) {
      if (!isActiveOrder(o)) continue;
      const key = o.customerId || o.customerEmail || 'guest';
      const cur = cMap.get(key) ?? mk({
        id: `cu-${key}`, dimension: o.customerName || o.customerEmail || 'Guest buyer',
        secondaryDim: o.customerEmail || '—', segment: 'Customer',
        orders: 0, gmv: 0, discountsAndRefunds: 0, netRevenue: 0,
        status: 'Active', createdBy: 'Orders', createdOn: o.orderDate.slice(0, 10),
        modifiedBy: 'Orders', modifiedOn: o.orderDate.slice(0, 10),
      });
      cur.orders += 1;
      cur.gmv += Number(o.total) || 0;
      cur.discountsAndRefunds += Number(o.amountRefunded) || 0;
      cur.netRevenue = cur.gmv - cur.discountsAndRefunds;
      cur.cogs = Math.round(cur.netRevenue * cogsRate * 100) / 100;
      cur.grossProfit = Math.round((cur.netRevenue - cur.cogs) * 100) / 100;
      cur.marginPct = cur.netRevenue > 0 ? Math.round((cur.grossProfit / cur.netRevenue) * 1000) / 10 : 0;
      if (o.orderDate.slice(0, 10) < cur.createdOn) cur.createdOn = o.orderDate.slice(0, 10);
      if (o.orderDate.slice(0, 10) > cur.modifiedOn) cur.modifiedOn = o.orderDate.slice(0, 10);
      cMap.set(key, cur);
    }

    // Seller ledger — recorded earnings are payouts, so profit is 0.
    const sellerRows = sellers.map((s) => ({
      id: `se-${s.seller_id}`, dimension: s.display_name, secondaryDim: s.applicant_type || 'Seller',
      segment: 'Marketplace', orders: 0, gmv: Number(s.recorded_earnings) || 0,
      discountsAndRefunds: 0, netRevenue: Number(s.recorded_earnings) || 0,
      cogs: Number(s.recorded_earnings) || 0, grossProfit: 0, marginPct: 0, varianceAmount: 0,
      status: s.tax_form_status || '—', createdBy: 'Marketplace', createdOn: '—',
      modifiedBy: 'Marketplace', modifiedOn: '—',
    }));

    return {
      orders_gmv: [...ogMap.values()],
      sku_velocity: skuRows,
      customer_cohorts: [...cMap.values()],
      seller_ledger: sellerRows,
    };
  }, [orders, products, sellers, cogsRate, dateRange]);

  const rawRows = datasets[dataset];

  const filtered = rawRows
    .filter((r) => {
      if (activeTab === 'Positive margin (>55%)') return r.marginPct >= 55;
      if (activeTab === 'High volume') return r.orders >= 5;
      if (activeTab === 'Flagged variance') return r.varianceAmount < 0;
      return true;
    })
    .filter((r) => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        r.dimension.toLowerCase().includes(q) ||
        r.secondaryDim.toLowerCase().includes(q) ||
        r.segment.toLowerCase().includes(q) ||
        r.status.toLowerCase().includes(q)
      );
    })
    .sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === 'number' && typeof bv === 'number') {
        return sortDir === 'asc' ? av - bv : bv - av;
      }
      return sortDir === 'asc'
        ? String(av).localeCompare(String(bv))
        : String(bv).localeCompare(String(av));
    });

  const maxGmv = Math.max(1, ...filtered.map((r) => r.gmv));
  const visibleColumns = columns.filter((c) => c.visible);

  const handleSort = (key: string) => {
    const k = key as keyof ExplorerRow;
    if (sortKey === k) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(k);
      setSortDir('desc');
    }
  };

  const handleApplySavedView = (sv: SavedExplorerView) => {
    setActiveSavedId(sv.id);
    setDataset(sv.dataset);
    setActiveTab(sv.tab);
    setVisualCfg((prev) => ({ ...prev, divideBy1000: sv.divideBy1000 }));
    setSelectedIds([]);
  };

  const handleSaveCurrentView = () => {
    const clean = newViewName.trim();
    if (!clean) return;
    const nv: SavedExplorerView = {
      id: `sv-${Date.now()}`,
      name: clean,
      dataset,
      tab: activeTab,
      divideBy1000: visualCfg.divideBy1000,
    };
    setSavedViews((prev) => [...prev, nv]);
    setActiveSavedId(nv.id);
    setNewViewName('');
    setAddingView(false);
    onToast(`Saved Explorer view "${clean}" for this session`);
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === filtered.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filtered.map((r) => r.id));
    }
  };

  const toggleRow = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const exportRows = (rowsToExport: ExplorerRow[], name: string) => {
    const cols = columns
      .filter((c) => c.visible)
      .map((c) => ({ key: c.key, label: c.label }));
    exportToCsv(rowsToExport as unknown as Record<string, unknown>[], cols, name);
    onToast(`Exported ${rowsToExport.length} records to CSV`);
  };

  const renderExplorerCell = (row: ExplorerRow, colKey: string) => {
    if (colKey === 'status') {
      return <StatusPill status={row.status} />;
    }
    if (colKey === 'orders') {
      return row.orders.toLocaleString();
    }
    if (colKey === 'marginPct') {
      return `${row.marginPct.toFixed(1)}%`;
    }
    if (
      colKey === 'gmv' ||
      colKey === 'discountsAndRefunds' ||
      colKey === 'netRevenue' ||
      colKey === 'cogs' ||
      colKey === 'grossProfit' ||
      colKey === 'varianceAmount'
    ) {
      const num = row[colKey];
      return formatVisualNumber(num, visualCfg);
    }
    return String(row[colKey as keyof ExplorerRow] ?? '');
  };

  return (
    <div className={styles.container}>
      <div className={styles.headerBlock}>
        <div className={styles.breadcrumb}>
          <span>Dashboard</span>
          <span className={styles.breadcrumbSep}>/</span>
          <span>Analytics</span>
        </div>
        <div className={styles.headerRow}>
          <div>
            <h1 className={styles.title}>Explorer</h1>
            <p className={styles.subtitle}>
              Multi-dimensional pivot across live orders, SKUs, customers, and marketplace sellers · COGS allocated at the blended P&amp;L rate
            </p>
          </div>
          <div className={styles.toolbarRight}>
            <div className={styles.segmented}>
              <button
                type="button"
                className={`${styles.segBtn} ${
                  showVisualChart ? styles.segBtnActive : ''
                }`}
                onClick={() => setShowVisualChart(true)}
              >
                Chart + Table
              </button>
              <button
                type="button"
                className={`${styles.segBtn} ${
                  !showVisualChart ? styles.segBtnActive : ''
                }`}
                onClick={() => setShowVisualChart(false)}
              >
                Table only
              </button>
            </div>

            <button
              type="button"
              className={styles.btnSecondary}
              onClick={() => setCustomizeOpen(true)}
            >
              <span className={`material-symbols-outlined ${styles.icon16}`}>
                tune
              </span>
              Customize
            </button>

            <div className={styles.splitWrap}>
              <button
                type="button"
                className={styles.splitMain}
                onClick={() => exportRows(filtered, 'analytics-explorer')}
              >
                <span className={`material-symbols-outlined ${styles.icon16}`}>
                  download
                </span>
                Export CSV
              </button>
              <button
                type="button"
                className={styles.splitArrow}
                onClick={() => setSplitMenuOpen((p) => !p)}
              >
                <span className={`material-symbols-outlined ${styles.icon16}`}>
                  expand_more
                </span>
              </button>
              {splitMenuOpen && (
                <div className={styles.dropdownMenu}>
                  <div className={styles.dropdownHeader}>Explorer actions</div>
                  <button
                    type="button"
                    className={styles.dropdownItem}
                    onClick={() => {
                      setAddingView(true);
                      setSplitMenuOpen(false);
                    }}
                  >
                    <span className={`material-symbols-outlined ${styles.icon16}`}>
                      bookmark_add
                    </span>
                    Save current view
                  </button>
                  <button
                    type="button"
                    className={styles.dropdownItem}
                    onClick={() => {
                      onToast('Digest scheduling is not connected yet');
                      setSplitMenuOpen(false);
                    }}
                  >
                    <span className={`material-symbols-outlined ${styles.icon16}`}>
                      schedule_send
                    </span>
                    Schedule weekly digest
                  </button>
                  <div className={styles.dropdownDivider} />
                  <button
                    type="button"
                    className={styles.dropdownItem}
                    onClick={() => {
                      setSplitMenuOpen(false);
                      onNavigate('finance', 'quick-view');
                    }}
                  >
                    <span className={`material-symbols-outlined ${styles.icon16}`}>
                      bar_chart
                    </span>
                    Open Finance Reports
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Saved Views Bar */}
      <div className={styles.savedViewsBar}>
        <span className={styles.createActionsLabel}>Saved views:</span>
        {savedViews.map((sv) => (
          <button
            key={sv.id}
            type="button"
            className={`${styles.savedViewPill} ${
              activeSavedId === sv.id ? styles.savedViewPillActive : ''
            }`}
            onClick={() => handleApplySavedView(sv)}
          >
            <span className={`material-symbols-outlined ${styles.icon14}`}>
              bookmark
            </span>
            {sv.name}
          </button>
        ))}
        {addingView ? (
          <>
            <input
              type="text"
              className={styles.inlineInputSm}
              placeholder="View name…"
              value={newViewName}
              onChange={(e) => setNewViewName(e.target.value)}
            />
            <button
              type="button"
              className={styles.btnGhostSm}
              onClick={handleSaveCurrentView}
            >
              Save
            </button>
            <button
              type="button"
              className={styles.btnGhostSm}
              onClick={() => setAddingView(false)}
            >
              Cancel
            </button>
          </>
        ) : (
          <button
            type="button"
            className={styles.btnGhostSm}
            onClick={() => setAddingView(true)}
          >
            + Save view
          </button>
        )}
      </div>

      {/* Optional Visual Distribution Panel */}
      {showVisualChart && filtered.length > 0 && (
        <div className={styles.panelCard}>
          <div className={styles.panelHeader}>
            <div>
              <h2 className={styles.panelTitle}>
                GMV &amp; Gross Profit Distribution ({dateRange})
              </h2>
              <p className={styles.panelSubtitle}>
                Live comparison across {filtered.length} slices · Blue = GMV, Green = Gross Profit
              </p>
            </div>
            <div className={styles.segmented}>
              {(
                [
                  ['orders_gmv', 'Orders & GMV'],
                  ['sku_velocity', 'Products & SKUs'],
                  ['customer_cohorts', 'Customer Cohorts'],
                  ['seller_ledger', 'Seller Ledger'],
                ] as [ExplorerDatasetKey, string][]
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  className={`${styles.segBtn} ${
                    dataset === key ? styles.segBtnBlueActive : ''
                  }`}
                  onClick={() => {
                    setDataset(key);
                    setSelectedIds([]);
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.funnelList}>
            {filtered.map((row) => {
              const gmvPct = (row.gmv / maxGmv) * 100;
              const profPct = (Math.max(0, row.grossProfit) / maxGmv) * 100;
              return (
                <div key={row.id}>
                  <div className={styles.funnelTopLine}>
                    <span className={styles.funnelStageName}>
                      {row.dimension} ({row.secondaryDim})
                    </span>
                    <div className={styles.funnelRightStats}>
                      <span className={styles.funnelCountStrong}>
                        {formatVisualNumber(row.gmv, visualCfg)} GMV
                      </span>
                      <span className={styles.tdPos}>
                        {formatVisualNumber(row.grossProfit, visualCfg)} GP (
                        {row.marginPct.toFixed(1)}%)
                      </span>
                    </div>
                  </div>
                  <div className={styles.barTrackTall}>
                    <svg className={styles.barSvg} aria-hidden="true">
                      <rect
                        className={styles.fillBlue}
                        x="0"
                        y="0"
                        width={`${gmvPct.toFixed(1)}%`}
                        height="8"
                      />
                      <rect
                        className={styles.fillPrimary}
                        x="0"
                        y="8"
                        width={`${profPct.toFixed(1)}%`}
                        height="8"
                      />
                    </svg>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* P1 List-System Table */}
      <div className={styles.tableCard}>
        <div className={styles.viewTabsBar}>
          {[
            'All rows',
            'Positive margin (>55%)',
            'High volume',
            'Flagged variance',
          ].map((t) => (
            <button
              key={t}
              type="button"
              className={`${styles.viewTab} ${
                activeTab === t ? styles.viewTabActive : ''
              }`}
              onClick={() => {
                setActiveTab(t);
                setSelectedIds([]);
              }}
            >
              {t}
            </button>
          ))}
        </div>

        <div className={styles.filterToolbar}>
          <div className={styles.searchWrap}>
            <span className={`material-symbols-outlined ${styles.icon15Search}`}>
              search
            </span>
            <input
              type="text"
              className={styles.searchInput}
              placeholder="Filter dimension, supplier, status…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <select
            className={styles.selectControl}
            value={dataset}
            onChange={(e) => {
              setDataset(e.target.value as ExplorerDatasetKey);
              setSelectedIds([]);
            }}
          >
            <option value="orders_gmv">Dataset: Orders &amp; GMV</option>
            <option value="sku_velocity">Dataset: Products &amp; SKUs</option>
            <option value="customer_cohorts">Dataset: Customer Cohorts</option>
            <option value="seller_ledger">Dataset: Seller Ledger</option>
          </select>

          <select
            className={styles.selectControl}
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
          >
            <option value="Last 7 days">Date: Last 7 days</option>
            <option value="Last 30 days">Date: Last 30 days</option>
            <option value="Q4 2026 QTD">Date: Q4 2026 QTD</option>
            <option value="YTD 2026">Date: YTD 2026</option>
          </select>

          <span className={styles.paginationLabel}>
            {filtered.length > 0
              ? `1–${filtered.length} of ${filtered.length}`
              : '0 of 0'}
          </span>
        </div>

        {selectedIds.length > 0 && (
          <div className={styles.bulkBar}>
            <div className={styles.bulkLeft}>
              <span>{selectedIds.length} selected</span>
              <button
                type="button"
                className={styles.btnGhostSm}
                onClick={() => setSelectedIds([])}
              >
                Clear
              </button>
            </div>
            <div className={styles.bulkActions}>
              <button
                type="button"
                className={styles.btnGhostSm}
                onClick={() =>
                  exportRows(filtered.filter((r) => selectedIds.includes(r.id)), 'analytics-explorer-selected')
                }
              >
                Export selected
              </button>
              <button
                type="button"
                className={styles.btnGhostSm}
                onClick={() => onToast('Pinning slices to the Executive view is not connected')}
              >
                Pin to Executive Overview
              </button>
              <button
                type="button"
                className={styles.btnGhostSm}
                onClick={() => onToast('Variance flagging is not connected')}
              >
                Flag variance
              </button>
            </div>
          </div>
        )}

        {filtered.length > 0 ? (
          <div className={styles.tableScroll}>
            <table className={styles.dataTable}>
              <thead className={styles.thead}>
                <tr>
                  <th className={`${styles.th} ${styles.thCheck}`}>
                    <input
                      type="checkbox"
                      className={styles.checkbox}
                      checked={
                        filtered.length > 0 &&
                        selectedIds.length === filtered.length
                      }
                      onChange={toggleSelectAll}
                    />
                  </th>
                  {visibleColumns.map((col, cIdx) => (
                    <th
                      key={col.key}
                      className={`${styles.th} ${styles.thSortable} ${
                        cIdx === 0 ? styles.thSticky : ''
                      } ${col.right ? styles.thRight : ''}`}
                      onClick={() => handleSort(col.key)}
                    >
                      {col.label}{' '}
                      {sortKey === col.key ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                    </th>
                  ))}
                  <th className={styles.th} />
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr
                    key={row.id}
                    className={styles.tr}
                    onClick={() =>
                      onOpenPeek(
                        {
                          dimension: row.dimension,
                          supplierOrMethod: row.secondaryDim,
                          segment: row.segment,
                          orders: row.orders,
                          gmv: formatVisualNumber(row.gmv, visualCfg),
                          netRevenue: formatVisualNumber(row.netRevenue, visualCfg),
                          cogs: formatVisualNumber(row.cogs, visualCfg),
                          grossProfit: formatVisualNumber(
                            row.grossProfit,
                            visualCfg
                          ),
                          margin: `${row.marginPct.toFixed(1)}%`,
                          createdBy: `${row.createdBy} (${row.createdOn})`,
                          status: row.status,
                        },
                        'explorer'
                      )
                    }
                  >
                    <td
                      className={styles.tdCheck}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        className={styles.checkbox}
                        checked={selectedIds.includes(row.id)}
                        onChange={() => toggleRow(row.id)}
                      />
                    </td>
                    {visibleColumns.map((col, cIdx) => {
                      const rawNum = row[col.key as keyof ExplorerRow];
                      const isNeg = typeof rawNum === 'number' && rawNum < 0;
                      const isProfit = col.key === 'grossProfit';
                      return (
                        <td
                          key={col.key}
                          className={`${styles.td} ${
                            cIdx === 0 ? styles.tdSticky : ''
                          } ${col.right ? styles.tdRight : ''} ${
                            isNeg ? styles.tdNeg : isProfit ? styles.tdPos : ''
                          }`}
                        >
                          {renderExplorerCell(row, col.key)}
                        </td>
                      );
                    })}
                    <td
                      className={styles.tdAction}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        className={styles.moreBtn}
                        onClick={() =>
                          setOpenRowMenuId((prev) =>
                            prev === row.id ? null : row.id
                          )
                        }
                      >
                        <span className={`material-symbols-outlined ${styles.icon18}`}>
                          more_horiz
                        </span>
                      </button>
                      {openRowMenuId === row.id && (
                        <div className={styles.dropdownMenuLeft}>
                          <button
                            type="button"
                            className={styles.dropdownItem}
                            onClick={() => {
                              setOpenRowMenuId(null);
                              onOpenPeek(
                                {
                                  dimension: row.dimension,
                                  orders: row.orders,
                                  gmv: formatVisualNumber(row.gmv, visualCfg),
                                  grossProfit: formatVisualNumber(
                                    row.grossProfit,
                                    visualCfg
                                  ),
                                  status: row.status,
                                },
                                'explorer'
                              );
                            }}
                          >
                            Inspect in Peek Drawer
                          </button>
                          <button
                            type="button"
                            className={styles.dropdownItem}
                            onClick={() => {
                              setOpenRowMenuId(null);
                              onNavigate('orders', 'orders');
                            }}
                          >
                            Drill into Orders
                          </button>
                          <button
                            type="button"
                            className={styles.dropdownItem}
                            onClick={() => {
                              setOpenRowMenuId(null);
                              exportRows([row], 'analytics-explorer-slice');
                            }}
                          >
                            Export slice CSV
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className={styles.emptyState}>
            <div className={styles.emptyIconWrap}>
              <span className={`material-symbols-outlined ${styles.icon26}`}>
                query_stats
              </span>
            </div>
            <div className={styles.emptyTitle}>No matching Explorer slices</div>
            <div className={styles.emptyStepsRow}>
              <span className={styles.emptyStepPill}>1. Adjust tab or search</span>
              <span className={styles.emptyStepPill}>2. Switch fact dataset</span>
              <span className={styles.emptyStepPill}>3. Widen the date range</span>
            </div>
            <div className={styles.emptyBtnRow}>
              <button
                type="button"
                className={styles.btnSecondary}
                onClick={() => onToast('CSV dataset import is not connected')}
              >
                Import
              </button>
              <button
                type="button"
                className={styles.btnPrimary}
                onClick={() => {
                  setActiveTab('All rows');
                  setSearch('');
                }}
              >
                Reset filters
              </button>
            </div>
          </div>
        )}
      </div>

      {customizeOpen && (
        <ListCustomizeDrawer
          title="Analytics Explorer"
          columns={columns}
          visualConfig={visualCfg}
          onSave={(nextCols, nextVis) => {
            setColumns(nextCols);
            setVisualCfg(nextVis);
          }}
          onClose={() => setCustomizeOpen(false)}
          onToast={onToast}
        />
      )}
    </div>
  );
}
