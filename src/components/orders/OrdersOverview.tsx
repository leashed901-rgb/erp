'use client';

import { useState, useEffect } from 'react';
import { DomainKey } from '@/data/shellData';
import { exportToCsv } from '@/lib/csvExport';
import styles from './OrdersPages.module.css';

interface OrdersScreenProps {
  onNavigate: (domain: DomainKey, screenId: string) => void;
  onToast: (msg: string) => void;
  onCreate?: (label: string) => void;
  onOpenCreateFlyout?: () => void;
}

/* KPI tiles + pipeline derive from REAL erp_orders data */

const CREATE_ACTIONS = [
  { label: 'Create order', icon: 'add_shopping_cart' },
  { label: 'Report a problem', icon: 'report_problem' },
  { label: 'Create PO', icon: 'shopping_bag' },
  { label: 'Restock', icon: 'sync' },
  { label: 'Batch slips', icon: 'receipt' },
  { label: 'Export', icon: 'download' },
  { label: 'Pick list', icon: 'checklist' },
];

export function OrdersOverview({ onNavigate, onToast, onCreate, onOpenCreateFlyout }: OrdersScreenProps) {
  const [orders, setOrders] = useState<Record<string, unknown>[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/v1/documents?type=SalesOrder')
      .then(r => r.json())
      .then(json => { if (!cancelled) setOrders(json.data || []); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const RECENT_ORDERS = orders.slice(0, 5).map((o: Record<string, unknown>) => ({
    order: `#${String(o.order_number || '').replace('SO-', '')}`,
    customer: o.customer_email ? String(o.customer_email).split('@')[0] : '—',
    supplier: '—',
    total: `$${Number(o.total || 0).toFixed(2)}`,
    status: String(o.status || 'unknown'),
  }));
  const unfulfilled = orders.filter(o => o.status === 'open' || o.status === 'pending');
  const pastSla = orders.filter(o => o.needs_attention === true);
  const shipped = orders.filter(o => o.status === 'fulfilled' || o.status === 'shipped' || o.status === 'delivered');
  const revenueMtd = orders.reduce((s, o) => s + Number(o.total || 0), 0);

  const KPI_TILES = [
    { label: 'Orders (all)', value: String(orders.length), delta: `${orders.length} sales orders`, icon: 'shopping_cart', color: 'qbBlue' },
    { label: 'Needs attention', value: String(pastSla.length), delta: pastSla.length ? `${pastSla.length} need attention` : 'on schedule', icon: 'schedule', color: 'error' },
    { label: 'Shipped / Delivered', value: String(shipped.length), delta: 'All time', icon: 'local_shipping', color: 'qbGreen' },
    { label: 'Revenue (orders)', value: `$${revenueMtd.toLocaleString('en-US', { maximumFractionDigits: 0 })}`, delta: `${orders.length} orders`, icon: 'attach_money', color: 'qbTeal' },
  ];

  const PIPELINE_STAGES = [
    { name: 'Unfulfilled', value: unfulfilled.length, color: '#8a5a00' },
    { name: 'Needs attention', value: pastSla.length, color: '#a50e0e' },
    { name: 'Shipped', value: shipped.length, color: '#4a3fc4' },
    { name: 'Delivered', value: orders.filter(o => o.status === 'delivered').length, color: '#1e5a38' },
  ].map(st => ({ ...st, pct: orders.length ? Math.round((st.value / orders.length) * 100) : 0 }));

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
            <p className={styles.pageSubtitle}>Order pipeline, fulfillment queue, and today&apos;s commitments · November 2026</p>
          </div>
          <div className={styles.headerActions}>
            <button className={styles.btnSecondary} onClick={() => onToast('Date range picker')}>
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>calendar_today</span>
              Nov 2026
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>expand_more</span>
            </button>
            <button className={styles.btnSecondary} onClick={() => {
              const cols = [
                { key: 'order', label: 'Order' },
                { key: 'customer', label: 'Customer' },
                { key: 'supplier', label: 'Supplier' },
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
              onClick={() => onNavigate('orders', 'orders')}
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
              <span className={styles.pipelineMetric}><strong>94%</strong> on-time rate</span>
              <span className={styles.pipelineMetric}><strong>1.8d</strong> avg. fulfillment time</span>
              <span className={styles.pipelineMetric} style={{ color: '#ba1a1a' }}><strong>2</strong> past SLA</span>
            </div>
          </div>

          {/* Needs attention */}
          <div className={styles.panel}>
            <div className={styles.panelHeader}>
              <h2 className={styles.panelTitle}>Needs attention</h2>
              <span className={styles.badgeError}>4 items</span>
            </div>
            <div className={styles.attentionList}>
              {ATTENTION_ITEMS.map((item, idx) => (
                <button
                  key={idx}
                  className={styles.attentionItem}
                  onClick={() => onNavigate('orders', 'orders')}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#ba1a1a' }}>{item.icon}</span>
                  <div className={styles.attentionText}>
                    <div className={styles.attentionTitle}>{item.title}</div>
                    <div className={styles.attentionSub}>{item.sub}</div>
                  </div>
                  <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#5a6355' }}>chevron_right</span>
                </button>
              ))}
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
                  <th>Supplier</th>
                  <th style={{ textAlign: 'right' }}>Total</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {RECENT_ORDERS.map((row) => (
                  <tr key={row.order} className={styles.tableRow} onClick={() => onNavigate('orders', 'order-detail')}>
                    <td><strong>{row.order}</strong></td>
                    <td>{row.customer}</td>
                    <td>{row.supplier}</td>
                    <td style={{ textAlign: 'right' }}>{row.total}</td>
                    <td><span className={styles.statusPill} data-status={row.status}>{row.status}</span></td>
                  </tr>
                ))}
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
          </div>
        </div>
      </div>
    </div>
  );
}

export default OrdersOverview;
