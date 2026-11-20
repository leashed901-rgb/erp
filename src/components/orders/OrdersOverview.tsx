'use client';

import { useState, useEffect } from 'react';
import { DomainKey } from '@/data/shellData';
import { exportToCsv } from '@/lib/csvExport';
import type { DocumentType } from '@/lib/platformStore';
import styles from './OrdersPages.module.css';

interface OrdersScreenProps {
  onNavigate: (domain: DomainKey, screenId: string) => void;
  onToast: (msg: string) => void;
  onCreate?: (label: string) => void;
  onOpenCreateFlyout?: () => void;
  onOpenDocument?: (type: DocumentType, id: string | null) => void;
}

/* Orders overview — spec KPIs (kpis-2.md) from GET /api/v1/orders/overview.
   Every number on this page comes from live rows; nothing is hardcoded. */

interface OverviewData {
  kpis: { ordersToday: number; awaitingFulfillment: number; shipmentsInTransit: number; revenueMtd: number; avgOrderValue: number; lateShipments: number };
  pipeline: { New: number; needsAttention: number; inProduction: number; readyToShip: number; shipped: number; delivered: number; returned: number; canceled: number };
  attention: { id: string; orderNumber: string; reason: string }[];
  recent: { id: string; orderNumber: string; customer: string; total: number; status: string; orderDate: string | null }[];
  topProducts: { name: string; units: number; revenue: number }[];
  funnel: { unpaid: number; partial: number; paid: number; refunded: number };
  activity: { orderNumber: string; text: string; time: string }[];
  onTimeRate: number | null;
  avgFulfillmentDays: number | null;
  pastSla: number;
  totalOrders: number;
}

const CREATE_ACTIONS = [
  { label: 'Create order', icon: 'add_shopping_cart' },
  { label: 'Report a problem', icon: 'report_problem' },
  { label: 'Create PO', icon: 'shopping_bag' },
  { label: 'Restock', icon: 'sync' },
  { label: 'Batch slips', icon: 'receipt' },
  { label: 'Export', icon: 'download' },
  { label: 'Pick list', icon: 'checklist' },
];

export function OrdersOverview({ onNavigate, onToast, onCreate, onOpenCreateFlyout, onOpenDocument }: OrdersScreenProps) {
  const [data, setData] = useState<OverviewData | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/v1/orders/overview')
      .then((r) => r.json())
      .then((json) => { if (!cancelled && json.data) setData(json.data as OverviewData); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const k = data?.kpis;
  const KPI_TILES = [
    { label: 'Orders today', value: String(k?.ordersToday ?? '—'), delta: `${data?.totalOrders ?? 0} orders all time`, icon: 'shopping_cart', color: 'qbBlue', screen: 'orders' as const },
    { label: 'Awaiting fulfillment', value: String(k?.awaitingFulfillment ?? '—'), delta: 'New, ready, in production, attention', icon: 'schedule', color: 'error', screen: 'orders' as const },
    { label: 'Shipments in transit', value: String(k?.shipmentsInTransit ?? '—'), delta: 'Open shipments, not delivered', icon: 'local_shipping', color: 'qbGreen', screen: 'fulfillment-queue' as const },
    { label: 'Revenue MTD', value: k ? `$${k.revenueMtd.toLocaleString('en-US', { maximumFractionDigits: 0 })}` : '—', delta: 'Posted revenue lines this month', icon: 'attach_money', color: 'qbTeal', screen: 'orders' as const },
    { label: 'Avg order value', value: k ? `$${k.avgOrderValue.toFixed(2)}` : '—', delta: 'This month', icon: 'receipt_long', color: 'qbBlue', screen: 'orders' as const },
    { label: 'Late shipments', value: String(k?.lateShipments ?? '—'), delta: 'Past SLA date', icon: 'warning', color: 'error', screen: 'fulfillment-queue' as const },
  ];

  const total = data?.totalOrders ?? 0;
  const PIPELINE_STAGES = [
    { name: 'New', value: data?.pipeline.New ?? 0, color: '#8a5a00' },
    { name: 'Needs attention', value: data?.pipeline.needsAttention ?? 0, color: '#a50e0e' },
    { name: 'In production', value: data?.pipeline.inProduction ?? 0, color: '#4a3fc4' },
    { name: 'Ready to ship', value: data?.pipeline.readyToShip ?? 0, color: '#0b6fa4' },
    { name: 'Shipped', value: data?.pipeline.shipped ?? 0, color: '#4a3fc4' },
    { name: 'Delivered', value: data?.pipeline.delivered ?? 0, color: '#1e5a38' },
    { name: 'Returned', value: data?.pipeline.returned ?? 0, color: '#6b7280' },
    { name: 'Canceled', value: data?.pipeline.canceled ?? 0, color: '#6b7280' },
  ].map((st) => ({ ...st, pct: total ? Math.round((st.value / total) * 100) : 0 }));

  const ATTENTION_ITEMS = (data?.attention || []).map((o) => ({
    id: o.id,
    icon: 'error',
    title: `Order ${o.orderNumber} needs attention`,
    sub: o.reason,
  }));

  const RECENT_ORDERS = (data?.recent || []).map((o) => ({
    id: o.id,
    order: `#${o.orderNumber}`,
    customer: o.customer,
    total: `$${o.total.toFixed(2)}`,
    status: o.status,
  }));

  const TOP_PRODUCTS = (data?.topProducts || []).map((p) => ({
    name: p.name, units: p.units, revenue: `$${p.revenue.toFixed(2)}`,
  }));

  const ACTIVITY = (data?.activity || []).map((a) => ({
    icon: a.text.includes('shipped') || a.text.includes('fulfilled') ? 'local_shipping' : a.text.includes('delivered') ? 'check_circle' : 'inventory_2',
    text: a.text,
    time: a.time,
  }));

  const funnel = data?.funnel;
  const monthLabel = new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

  return (
    <div className={styles.container}>
      {/* Context header */}
      <div className={styles.contextHeader}>
        <div className={styles.contextLeft}>
          <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#5a6355' }}>local_shipping</span>
          <span className={styles.contextLabel}>Orders</span>
          <span className={styles.contextSep}>/</span>
          <span className={styles.contextActive}>Overview</span>
        </div>
      </div>

      <div className={styles.pageBody}>
        {/* Page header */}
        <div className={styles.pageHeader}>
          <div>
            <h1 className={styles.pageTitle}>Orders — Overview</h1>
            <p className={styles.pageSubtitle}>Order pipeline, fulfillment queue, and today&apos;s commitments · {monthLabel}</p>
          </div>
          <div className={styles.headerActions}>
            <span className={styles.btnSecondary} style={{ cursor: 'default' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>calendar_today</span>
              {monthLabel}
            </span>
            <button className={styles.btnSecondary} onClick={() => {
              const cols = [
                { key: 'order', label: 'Order' },
                { key: 'customer', label: 'Customer' },
                { key: 'total', label: 'Total' },
                { key: 'status', label: 'Status' },
              ];
              exportToCsv(RECENT_ORDERS as unknown as Record<string, unknown>[], cols, 'orders-overview');
              onToast(`Exported ${RECENT_ORDERS.length} records to CSV`);
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>download</span>
              Export
            </button>
          </div>
        </div>

        {/* KPI tiles */}
        <div className={styles.kpiGrid}>
          {KPI_TILES.map((kpi) => (
            <button
              key={kpi.label}
              className={`${styles.kpiTile} ${styles[`kpiTile${kpi.color}`] || ''}`}
              onClick={() => onNavigate('orders', kpi.screen)}
            >
              <div className={styles.kpiIconRow}>
                <span className={`material-symbols-outlined ${styles.kpiIcon}`} style={{ color: `var(--${kpi.color === 'qbBlue' ? 'qb-blue' : kpi.color === 'qbGreen' ? 'qb-green' : kpi.color === 'qbTeal' ? 'qb-teal' : kpi.color})` }}>
                  {kpi.icon}
                </span>
                <span className="material-symbols-outlined" style={{ fontSize: 14, color: '#5a6355' }}>open_in_new</span>
              </div>
              <div className={styles.kpiValue}>{kpi.value}</div>
              <div className={styles.kpiDelta}>{kpi.delta}</div>
              <div className={styles.kpiLabel}>{kpi.label}</div>
            </button>
          ))}
        </div>

        {/* Payment funnel — Not paid / Partially paid / Paid / Refunded.
            (The spec's "Deposited" step has no backing data in erp_orders,
            so it is not shown as a number.) */}
        {funnel && (
          <div className={styles.createActionsRow}>
            <span className={styles.createActionsLabel}>Payment funnel:</span>
            <span className={styles.createChip} style={{ cursor: 'default' }}>Not paid · {funnel.unpaid}</span>
            <span className={styles.createChip} style={{ cursor: 'default' }}>Partially paid · {funnel.partial}</span>
            <span className={styles.createChip} style={{ cursor: 'default' }}>Paid · {funnel.paid}</span>
            <span className={styles.createChip} style={{ cursor: 'default' }}>Refunded · {funnel.refunded}</span>
          </div>
        )}

        {/* Create actions row */}
        <div className={styles.createActionsRow}>
          <span className={styles.createActionsLabel}>Create actions:</span>
          {CREATE_ACTIONS.map((action) => (
            <button
              key={action.label}
              className={styles.createChip}
              onClick={() => (onCreate ? onCreate(action.label) : onToast(`${action.label} — opening`))}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>{action.icon}</span>
              {action.label}
            </button>
          ))}
          <button className={styles.showAllChip} onClick={() => (onOpenCreateFlyout ? onOpenCreateFlyout() : onToast('Show all create options'))}>
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>apps</span>
            Show all
          </button>
        </div>

        {/* Two-column: Pipeline + Needs attention */}
        <div className={styles.grid2col}>
          {/* Fulfillment pipeline */}
          <div className={`${styles.panel} ${styles.span2}`}>
            <div className={styles.panelHeader}>
              <h2 className={styles.panelTitle}>Fulfillment pipeline</h2>
              <button className={styles.panelLink} onClick={() => onNavigate('orders', 'fulfillment-queue')}>
                View queue
                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>chevron_right</span>
              </button>
            </div>
            <div className={styles.pipelineBars}>
              {PIPELINE_STAGES.map((stage) => (
                <div key={stage.name} className={styles.pipelineRow}>
                  <span className={styles.pipelineLabel}>{stage.name}</span>
                  <div className={styles.pipelineTrack}>
                    <div
                      className={styles.pipelineFill}
                      style={{ width: `${stage.pct}%`, backgroundColor: stage.color }}
                    />
                  </div>
                  <span className={styles.pipelineValue}>{stage.value}</span>
                </div>
              ))}
            </div>
            <div className={styles.pipelineFooter}>
              <span className={styles.pipelineMetric}><strong>{data?.onTimeRate != null ? `${data.onTimeRate}%` : '—'}</strong> on-time rate</span>
              <span className={styles.pipelineMetric}><strong>{data?.avgFulfillmentDays != null ? `${data.avgFulfillmentDays}d` : '—'}</strong> avg. fulfillment time</span>
              <span className={styles.pipelineMetric} style={{ color: '#ba1a1a' }}><strong>{data?.pastSla ?? 0}</strong> past SLA</span>
            </div>
          </div>

          {/* Needs attention */}
          <div className={styles.panel}>
            <div className={styles.panelHeader}>
              <h2 className={styles.panelTitle}>Needs attention</h2>
              <span className={styles.badgeError}>{ATTENTION_ITEMS.length} item{ATTENTION_ITEMS.length === 1 ? '' : 's'}</span>
            </div>
            <div className={styles.attentionList}>
              {ATTENTION_ITEMS.map((item) => (
                <button
                  key={item.id}
                  className={styles.attentionItem}
                  onClick={() => (onOpenDocument ? onOpenDocument('SalesOrder', item.id) : onNavigate('orders', 'orders'))}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#ba1a1a' }}>{item.icon}</span>
                  <div className={styles.attentionText}>
                    <div className={styles.attentionTitle}>{item.title}</div>
                    <div className={styles.attentionSub}>{item.sub}</div>
                  </div>
                  <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#5a6355' }}>chevron_right</span>
                </button>
              ))}
              {ATTENTION_ITEMS.length === 0 && (
                <div className={styles.attentionText} style={{ padding: '8px 0', color: '#5a6355' }}>Nothing needs attention.</div>
              )}
            </div>
          </div>
        </div>

        {/* Two-column: Recent orders + Top products */}
        <div className={styles.grid2col}>
          <div className={`${styles.panel} ${styles.span2}`}>
            <div className={styles.panelHeader}>
              <h2 className={styles.panelTitle}>Recent orders</h2>
              <button className={styles.panelLink} onClick={() => onNavigate('orders', 'orders')}>
                View all
                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>chevron_right</span>
              </button>
            </div>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Customer</th>
                  <th style={{ textAlign: 'right' }}>Total</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {RECENT_ORDERS.map((row) => (
                  <tr key={row.order} className={styles.tableRow} onClick={() => (onOpenDocument ? onOpenDocument('SalesOrder', row.id) : onNavigate('orders', 'orders'))}>
                    <td><strong>{row.order}</strong></td>
                    <td>{row.customer}</td>
                    <td style={{ textAlign: 'right' }}>{row.total}</td>
                    <td><span className={styles.statusPill} data-status={row.status}>{row.status}</span></td>
                  </tr>
                ))}
                {RECENT_ORDERS.length === 0 && (
                  <tr><td colSpan={4} className={styles.emptyState}>No orders yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div className={styles.panel}>
            <div className={styles.panelHeader}>
              <h2 className={styles.panelTitle}>Top products (30d)</h2>
            </div>
            <div className={styles.productList}>
              {TOP_PRODUCTS.map((product) => (
                <div key={product.name} className={styles.productItem}>
                  <div className={styles.productAvatar}>{product.name[0]}</div>
                  <div className={styles.productInfo}>
                    <div className={styles.productName}>{product.name}</div>
                    <div className={styles.productStats}>{product.units} units sold · {product.revenue}</div>
                  </div>
                </div>
              ))}
              {TOP_PRODUCTS.length === 0 && (
                <div className={styles.productStats} style={{ padding: '8px 0' }}>No order lines in the last 30 days.</div>
              )}
            </div>
          </div>
        </div>

        {/* Recent activity */}
        <div className={styles.panel}>
          <div className={styles.panelHeader}>
            <h2 className={styles.panelTitle}>Recent activity</h2>
            <button className={styles.panelLink} onClick={() => onNavigate('orders', 'orders')}>
              View all
              <span className="material-symbols-outlined" style={{ fontSize: 14 }}>chevron_right</span>
            </button>
          </div>
          <div className={styles.activityList}>
            {ACTIVITY.map((item, idx) => (
              <div key={idx} className={styles.activityItem}>
                <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#5a6355' }}>{item.icon}</span>
                <div>
                  <span className={styles.activityText}>{item.text}</span>
                  <span className={styles.activityTime}>{item.time}</span>
                </div>
              </div>
            ))}
            {ACTIVITY.length === 0 && (
              <div className={styles.activityText} style={{ padding: '8px 0', color: '#5a6355' }}>No status changes recorded yet.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default OrdersOverview;
