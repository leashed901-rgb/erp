'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import { DomainKey } from '@/data/shellData';
import RowMenu, { RowMenuItem, BulkBar } from '@/components/ListPrimitives';

export const WAREHOUSE_TABS = ['All', 'Ready to Ship', 'Local Pickup', 'Unfulfilled'] as const;
export const DROPSHIP_TABS = ['All', 'In production', 'In transit', 'Delivered'] as const;

export interface FulfillmentRow {
  id: string;
  customer: string;
  items: string;
  type: 'Ship' | 'Pickup';
  shipBy: string;
  pastSla: boolean;
  status: 'Ready' | 'Unfulfilled' | 'Shipped' | 'Picked up';
}

export interface DropShipRow {
  id: string;
  customer: string;
  supplier: string;
  supplierInitial: string;
  tracking: string;
  eta: string;
  status: 'In production' | 'In transit' | 'Delivered';
}
import { orderMutations } from '@/hooks/useOrdersApi';
import type { Order } from '@/lib/orderTypes';
import styles from './OrdersPages.module.css';

type WhRow = FulfillmentRow & { docId: string };
type DsRow = DropShipRow & { poId: string; orderId: string };

interface OrdersScreenProps {
  onNavigate: (domain: DomainKey, screenId: string) => void;
  onToast: (msg: string) => void;
  onCreate?: (label: string) => void;
  onOpenCreateFlyout?: () => void;
}

const AVATAR_COLORS: Record<string, string> = {
  A: styles.avatarBlue, B: styles.avatarGreen, N: styles.avatarTeal,
  O: styles.avatarMaroon, M: styles.avatarNavy, L: styles.avatarMaroon,
  P: styles.avatarBlue, G: styles.avatarGreen,
};

export function FulfillmentQueue({ onToast, onNavigate }: OrdersScreenProps) {
  const [whTab, setWhTab] = useState<string>('All');
  const [dsTab, setDsTab] = useState<string>('All');
  const [whSearch, setWhSearch] = useState('');
  const [dsSearch, setDsSearch] = useState('');
  const [whSelected, setWhSelected] = useState<Set<string>>(new Set());
  const [dsSelected, setDsSelected] = useState<Set<string>>(new Set());
  const [whRows, setWhRows] = useState<WhRow[]>([]);
  const [dsRows, setDsRows] = useState<DsRow[]>([]);

  // REAL data: warehouse queue from erp_orders (open orders), drop-ship
  // queue from fulfillment_orders via the fulfillment API.
  const load = useCallback(() => {
    fetch('/api/v1/orders')
      .then((r) => r.json())
      .then((json) => {
        const open = ((json.data || []) as Order[]).filter((o) => ['New', 'Ready to ship', 'Needs attention', 'In production'].includes(o.displayStatus));
        setWhRows(open.map((o) => {
          const slaPast = o.slaDueAt ? new Date(o.slaDueAt) < new Date() : false;
          return {
            docId: o.id,
            id: `#${o.orderNumber}`,
            customer: o.customerName || (o.customerEmail ? o.customerEmail.split('@')[0] : '—'),
            items: `${o.itemCount} item${o.itemCount === 1 ? '' : 's'}`,
            type: o.fulfillmentMethod === 'pickup' ? 'Pickup' : 'Ship',
            shipBy: o.slaDueAt ? (slaPast ? 'Past SLA' : new Date(o.slaDueAt).toLocaleDateString()) : '—',
            pastSla: slaPast,
            status: o.displayStatus === 'Ready to ship' ? 'Ready' : 'Unfulfilled',
          } as WhRow;
        }));
      })
      .catch(() => {});
    fetch('/api/v1/orders/fulfillment')
      .then((r) => r.json())
      .then((json) => {
        const pos = (json.purchaseOrders || []) as Record<string, unknown>[];
        setDsRows(pos.map((p) => {
          const raw = String(p.status || '');
          // fulfillment_orders vocabulary: draft/submitted/in_production/
          // shipped/delivered (the table's check constraint — 'received'
          // is not a status; the supplier receiving the order is 'submitted').
          const status: DsRow['status'] = raw === 'delivered' ? 'Delivered' : raw === 'shipped' ? 'In transit' : 'In production';
          const supplier = String(p.supplierName || 'Supplier');
          return {
            poId: String(p.id),
            orderId: String(p.orderId),
            id: `#${String(p.externalId || p.orderId).slice(0, 12)}`,
            customer: String(p.customerName || '—'),
            supplier,
            supplierInitial: supplier[0]?.toUpperCase() || 'S',
            tracking: String(p.trackingNumber || '—'),
            eta: '',
            status,
          } as DsRow;
        }));
      })
      .catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);

  const whFiltered = useMemo(() => {
    return whRows.filter((row) => {
      if (whTab === 'All') return true;
      if (whTab === 'Ready to Ship') return row.status === 'Ready' && row.type === 'Ship';
      if (whTab === 'Local Pickup') return row.status === 'Ready' && row.type === 'Pickup';
      if (whTab === 'Unfulfilled') return row.status === 'Unfulfilled';
      return true;
    }).filter((row) => !whSearch.trim() || row.id.toLowerCase().includes(whSearch.toLowerCase()) || row.customer.toLowerCase().includes(whSearch.toLowerCase()));
  }, [whRows, whTab, whSearch]);

  const dsFiltered = useMemo(() => {
    return dsRows.filter((row) => {
      if (dsTab === 'All') return true;
      return row.status === dsTab;
    }).filter((row) => !dsSearch.trim() || row.id.toLowerCase().includes(dsSearch.toLowerCase()) || row.customer.toLowerCase().includes(dsSearch.toLowerCase()));
  }, [dsRows, dsTab, dsSearch]);

  const toggleWhSelect = (id: string) =>
    setWhSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleDsSelect = (id: string) =>
    setDsSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const whMenuItems = (row: WhRow): RowMenuItem[] => {
    const items: RowMenuItem[] = [
      { label: 'View order', icon: 'open_in_new', onClick: () => onToast(`Viewing ${row.id}`) },
      { label: 'Report a problem', icon: 'report_problem', onClick: async () => {
        try { await orderMutations.reportProblem(row.docId, { subject: `Problem reported for order ${row.id}` }); onToast(`Problem reported for ${row.id} — ticket created`); load(); }
        catch { onToast(`Could not report problem for ${row.id}`); }
      } },
      { label: 'Print packing slip', icon: 'receipt', dividerBefore: true, onClick: async () => {
        try { await orderMutations.createBatch({ orderIds: [row.docId], includeLabels: false }); onToast(`Packing slip batch created for ${row.id}`); }
        catch { onToast(`Could not create slip for ${row.id}`); }
      } },
      { label: 'Print shipping label', icon: 'print', onClick: async () => {
        try { await orderMutations.createLabel(row.docId, {}); onToast(`Label created for ${row.id}`); }
        catch { onToast(`Could not create label for ${row.id}`); }
      } },
    ];
    if (row.type === 'Ship' && row.status !== 'Shipped') {
      items.push({ label: 'Mark shipped', icon: 'local_shipping', onClick: async () => {
        try { await orderMutations.markShipped(row.docId, {}); onToast(`Marked ${row.id} shipped`); load(); }
        catch { onToast(`Could not mark ${row.id} shipped`); }
      } });
    }
    if (row.type === 'Pickup' && row.status !== 'Picked up') {
      items.push({ label: 'Mark picked up', icon: 'storefront', onClick: async () => {
        try { await orderMutations.markShipped(row.docId, {}); onToast(`Marked ${row.id} picked up`); load(); }
        catch { onToast(`Could not mark ${row.id} picked up`); }
      } });
    }
    return items;
  };

  const dsMenuItems = (row: DsRow): RowMenuItem[] => [
    { label: 'View order', icon: 'open_in_new', onClick: () => onToast(`Viewing ${row.id}`) },
    { label: 'Track shipment', icon: 'local_shipping', onClick: () => onToast(row.tracking !== '—' ? `${row.id} tracking: ${row.tracking}` : `${row.id} has no tracking number yet`) },
    { label: 'Sync tracking now', icon: 'refresh', onClick: () => { load(); onToast(`Tracking refreshed for ${row.id}`); } },
    { label: 'Mark in transit', icon: 'local_shipping', dividerBefore: true, onClick: async () => {
      try { await orderMutations.setFulfillmentStatus(row.poId, 'shipped'); onToast(`Marked ${row.id} in transit`); load(); }
      catch { onToast(`Could not update ${row.id}`); }
    } },
    { label: 'Mark delivered', icon: 'package', onClick: async () => {
      try { await orderMutations.setFulfillmentStatus(row.poId, 'delivered'); onToast(`Marked ${row.id} delivered`); load(); }
      catch { onToast(`Could not update ${row.id}`); }
    } },
    { label: 'Report a problem', icon: 'report_problem', danger: true, dividerBefore: true, onClick: async () => {
      try { await orderMutations.reportProblem(row.orderId, { subject: `Problem reported for drop-ship order ${row.id}` }); onToast(`Problem reported for ${row.id} — ticket created`); }
      catch { onToast(`Could not report problem for ${row.id}`); }
    } },
  ];

  return (
    <div className={styles.container}>
      <div className={styles.contextHeader}>
        <div className={styles.contextLeft}>
          <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#5a6355' }}>local_shipping</span>
          <span className={styles.contextLabel}>Orders</span>
          <span className={styles.contextSep}>/</span>
          <span className={styles.contextActive}>Fulfillment Queue</span>
        </div>
      </div>

      <div className={styles.pageBody}>
        <div className={styles.pageHeader}>
          <div>
            <h1 className={styles.pageTitle}>Fulfillment Queue</h1>
            <p className={styles.pageSubtitle}>Two fulfillment tracks: physical shipments from your warehouse, and drop-shipped orders from suppliers.</p>
          </div>
          <div className={styles.headerActions}>
            <button className={styles.btnSecondary} onClick={() => { load(); onToast('Tracking refreshed from fulfillment data'); }}>
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>refresh</span>
              Sync tracking
            </button>
            <button className={styles.btnSecondary} onClick={() => onNavigate('orders', 'batch-slips')}>
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>receipt</span>
              Batch slips
            </button>
            <button className={styles.btnSecondary} onClick={() => onToast('Pick list — opening')}>
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>checklist</span>
              Pick list
            </button>
          </div>
        </div>

        {/* KPI tiles */}
        <div className={styles.kpiGrid}>
          <button className={styles.kpiTile} onClick={() => onToast('Drill into warehouse queue')}>
            <div className={styles.kpiValue} style={{ color: '#6b1e28' }}>{whRows.length}</div>
            <div className={styles.kpiLabel}>Warehouse queue</div>
            <div className={styles.kpiDelta} style={{ color: '#ba1a1a' }}>{whRows.filter((r) => r.pastSla).length} past SLA</div>
          </button>
          <button className={styles.kpiTile} onClick={() => onToast('Drill into drop ship queue')}>
            <div className={styles.kpiValue} style={{ color: '#0077c5' }}>{dsRows.length}</div>
            <div className={styles.kpiLabel}>Drop ship queue</div>
            <div className={styles.kpiDelta}>{dsRows.filter((r) => r.status === 'In transit').length} in transit</div>
          </button>
          <button className={styles.kpiTile} onClick={() => onToast('Drill into awaiting receipt')}>
            <div className={styles.kpiValue}>{dsRows.filter((r) => r.status === 'Delivered').length}</div>
            <div className={styles.kpiLabel}>Awaiting customer receipt</div>
            <div className={styles.kpiDelta}>Delivered, needs confirm</div>
          </button>
          <button className={styles.kpiTile} onClick={() => onToast('Drill into ship today')}>
            <div className={styles.kpiValue} style={{ color: '#ba1a1a' }}>{whRows.filter((r) => r.status === 'Ready').length}</div>
            <div className={styles.kpiLabel}>Ship today</div>
            <div className={styles.kpiDelta} style={{ color: '#ba1a1a' }}>By 4:00 PM carrier cutoff</div>
          </button>
        </div>

        {/* ── Warehouse queue ── */}
        <div className={styles.queueSection}>
          <div className={styles.queueHeader}>
            <div>
              <h2 className={styles.queueTitle}>Warehouse queue</h2>
              <p className={styles.queueSub}>Physical shipments picked, packed, and shipped from your warehouse.</p>
            </div>
          </div>

          <div className={styles.tableCard}>
            <div className={styles.viewTabsBar}>
              {WAREHOUSE_TABS.map((tab) => (
                <button key={tab} className={`${styles.viewTab} ${whTab === tab ? styles.viewTabActive : ''}`} onClick={() => setWhTab(tab)}>
                  {tab}
                  {tab === 'All' && <span className={styles.viewTabCount}>{whRows.length}</span>}
                  {tab === 'Ready to Ship' && <span className={styles.viewTabCount}>{whRows.filter((r) => r.status === 'Ready' && r.type === 'Ship').length}</span>}
                  {tab === 'Local Pickup' && <span className={styles.viewTabCount}>{whRows.filter((r) => r.status === 'Ready' && r.type === 'Pickup').length}</span>}
                  {tab === 'Unfulfilled' && <span className={styles.viewTabCount}>{whRows.filter((r) => r.status === 'Unfulfilled').length}</span>}
                </button>
              ))}
            </div>

            <div className={styles.filterBar}>
              <div className={styles.filterInputWrap}>
                <span className={`material-symbols-outlined ${styles.filterInputIcon}`}>search</span>
                <input className={styles.filterInput} placeholder="Scan or search order #…" type="text" value={whSearch} onChange={(e) => setWhSearch(e.target.value)} />
              </div>
              <span className={styles.filterCount}>
                {whSelected.size > 0 ? `${whSelected.size} selected` : `${whFiltered.length} of ${whRows.length}`}
              </span>
            </div>

            {whSelected.size > 0 && (
              <BulkBar
                selectedIds={Array.from(whSelected)}
                onClear={() => setWhSelected(new Set())}
                actions={[
                  { label: 'Print slips', icon: 'receipt', onClick: async () => { const ids = whRows.filter((r) => whSelected.has(r.id)).map((r) => r.docId); try { await orderMutations.createBatch({ orderIds: ids, includeLabels: false }); onToast(`Slip batch created for ${ids.length} orders`); } catch { onToast('Could not create slip batch'); } setWhSelected(new Set()); } },
                  { label: 'Print labels', icon: 'print', onClick: async () => { const ids = whRows.filter((r) => whSelected.has(r.id)).map((r) => r.docId); try { await orderMutations.createBatch({ orderIds: ids, includeLabels: true }); onToast(`Labels created for ${ids.length} orders`); } catch { onToast('Could not create labels'); } setWhSelected(new Set()); } },
                  { label: 'Mark shipped', icon: 'local_shipping', onClick: async () => { const rows = whRows.filter((r) => whSelected.has(r.id)); await Promise.all(rows.map((r) => orderMutations.markShipped(r.docId, {}).catch(() => {}))); onToast(`Marked ${rows.length} shipped`); setWhSelected(new Set()); load(); } },
                  { label: 'Mark picked up', icon: 'storefront', onClick: async () => { const rows = whRows.filter((r) => whSelected.has(r.id)); await Promise.all(rows.map((r) => orderMutations.markShipped(r.docId, {}).catch(() => {}))); onToast(`Marked ${rows.length} picked up`); setWhSelected(new Set()); load(); } },
                ]}
              />
            )}

            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.checkCell}><input type="checkbox" checked={whSelected.size === whFiltered.length && whFiltered.length > 0} onChange={() => setWhSelected((prev) => prev.size === whFiltered.length ? new Set() : new Set(whFiltered.map(r => r.id)))} /></th>
                  <th>Order</th>
                  <th>Customer</th>
                  <th>Items to pick</th>
                  <th>Type</th>
                  <th>Ship by</th>
                  <th>Status</th>
                  <th className={styles.actionCell}></th>
                </tr>
              </thead>
              <tbody>
                {whFiltered.map((row) => (
                  <tr key={row.id} className={`${styles.tableRow} ${whSelected.has(row.id) ? styles.tableRowSelected : ''}`}>
                    <td className={styles.checkCell}><input type="checkbox" checked={whSelected.has(row.id)} onChange={() => toggleWhSelect(row.id)} /></td>
                    <td><strong>{row.id}</strong></td>
                    <td>
                      <div className={styles.cellName}>
                        <span className={`${styles.avatar} ${AVATAR_COLORS[row.customer[0]] || styles.avatarBlue}`}>{row.customer[0]}</span>
                        {row.customer}
                      </div>
                    </td>
                    <td style={{ fontSize: 12, color: '#5a6355' }}>{row.items}</td>
                    <td>{row.type}</td>
                    <td style={{ color: row.pastSla ? '#ba1a1a' : '#1a1c1e', fontWeight: row.pastSla ? 700 : 400 }}>{row.shipBy}</td>
                    <td><span className={styles.statusPill} data-status={row.status === 'Ready' ? 'Ready to Ship' : row.status}>{row.status}</span></td>
                    <td className={styles.actionCell}><RowMenu items={whMenuItems(row)} /></td>
                  </tr>
                ))}
                {whFiltered.length === 0 && <tr><td colSpan={8} className={styles.emptyState}>No orders in warehouse queue.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Drop ship queue ── */}
        <div className={styles.queueSection}>
          <div className={styles.queueHeader}>
            <div>
              <h2 className={styles.queueTitle}>Drop ship queue</h2>
              <p className={styles.queueSub}>Orders routed to suppliers for direct fulfillment. Track and confirm lifecycle.</p>
            </div>
            <button className={styles.btnSecondary} onClick={() => { load(); onToast('Tracking refreshed from fulfillment data'); }}>
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>refresh</span>
              Sync tracking
            </button>
          </div>

          <div className={styles.tableCard}>
            <div className={styles.viewTabsBar}>
              {DROPSHIP_TABS.map((tab) => (
                <button key={tab} className={`${styles.viewTab} ${dsTab === tab ? styles.viewTabActive : ''}`} onClick={() => setDsTab(tab)}>
                  {tab}
                  {tab === 'All' && <span className={styles.viewTabCount}>{dsRows.length}</span>}
                  {tab === 'In production' && <span className={styles.viewTabCount}>{dsRows.filter((r) => r.status === 'In production').length}</span>}
                  {tab === 'In transit' && <span className={styles.viewTabCount}>{dsRows.filter((r) => r.status === 'In transit').length}</span>}
                  {tab === 'Delivered' && <span className={styles.viewTabCount}>{dsRows.filter((r) => r.status === 'Delivered').length}</span>}
                </button>
              ))}
            </div>

            <div className={styles.filterBar}>
              <div className={styles.filterInputWrap}>
                <span className={`material-symbols-outlined ${styles.filterInputIcon}`}>search</span>
                <input className={styles.filterInput} placeholder="Filter by order, supplier, tracking #…" type="text" value={dsSearch} onChange={(e) => setDsSearch(e.target.value)} />
              </div>
              <select className={styles.filterSelect} defaultValue="All">
                <option>All</option>
                <option>Printful</option>
                <option>Gelato</option>
                <option>Printify</option>
              </select>
              <span className={styles.filterCount}>
                {dsSelected.size > 0 ? `${dsSelected.size} selected` : `${dsFiltered.length} of ${dsRows.length}`}
              </span>
            </div>

            {dsSelected.size > 0 && (
              <BulkBar
                selectedIds={Array.from(dsSelected)}
                onClear={() => setDsSelected(new Set())}
                actions={[
                  { label: 'Mark in transit', icon: 'local_shipping', onClick: async () => { const rows = dsRows.filter((r) => dsSelected.has(r.id)); await Promise.all(rows.map((r) => orderMutations.setFulfillmentStatus(r.poId, 'shipped').catch(() => {}))); onToast(`Marked ${rows.length} in transit`); setDsSelected(new Set()); load(); } },
                  { label: 'Mark delivered', icon: 'package', onClick: async () => { const rows = dsRows.filter((r) => dsSelected.has(r.id)); await Promise.all(rows.map((r) => orderMutations.setFulfillmentStatus(r.poId, 'delivered').catch(() => {}))); onToast(`Marked ${rows.length} delivered`); setDsSelected(new Set()); load(); } },
                ]}
              />
            )}

            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.checkCell}><input type="checkbox" checked={dsSelected.size === dsFiltered.length && dsFiltered.length > 0} onChange={() => setDsSelected((prev) => prev.size === dsFiltered.length ? new Set() : new Set(dsFiltered.map(r => r.id)))} /></th>
                  <th>Order</th>
                  <th>Customer</th>
                  <th>Supplier</th>
                  <th>Tracking / ETA</th>
                  <th>Lifecycle</th>
                  <th className={styles.actionCell}></th>
                </tr>
              </thead>
              <tbody>
                {dsFiltered.map((row) => (
                  <tr key={row.id} className={`${styles.tableRow} ${dsSelected.has(row.id) ? styles.tableRowSelected : ''}`}>
                    <td className={styles.checkCell}><input type="checkbox" checked={dsSelected.has(row.id)} onChange={() => toggleDsSelect(row.id)} /></td>
                    <td><strong>{row.id}</strong></td>
                    <td>
                      <div className={styles.cellName}>
                        <span className={`${styles.avatar} ${AVATAR_COLORS[row.customer[0]] || styles.avatarBlue}`}>{row.customer[0]}</span>
                        {row.customer}
                      </div>
                    </td>
                    <td>
                      <div className={styles.cellName}>
                        <span className={`${styles.avatar} ${AVATAR_COLORS[row.supplierInitial] || styles.avatarBlue}`} style={{ width: 24, height: 24, fontSize: 10 }}>{row.supplierInitial}</span>
                        {row.supplier}
                      </div>
                    </td>
                    <td>
                      <button className={styles.trackingChip} onClick={() => window.open(`https://tools.usps.com/go/TrackConfirmAction?tLabels=${row.tracking}`, '_blank')}>
                        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>local_shipping</span>
                        {row.tracking}
                        {row.eta && <span style={{ color: '#5a6355', marginLeft: 4 }}>· {row.eta}</span>}
                      </button>
                    </td>
                    <td><span className={styles.statusPill} data-status={row.status}>{row.status}</span></td>
                    <td className={styles.actionCell}><RowMenu items={dsMenuItems(row)} /></td>
                  </tr>
                ))}
                {dsFiltered.length === 0 && <tr><td colSpan={7} className={styles.emptyState}>No orders in drop ship queue.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

export default FulfillmentQueue;
