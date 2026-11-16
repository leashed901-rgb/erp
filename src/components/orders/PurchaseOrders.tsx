'use client';

import { useState, useEffect } from 'react';
import { DomainKey } from '@/data/shellData';
import RowMenu, { RowMenuItem, BulkBar } from '@/components/ListPrimitives';

export const PO_TABS = ['All', 'Draft', 'Confirmed', 'Receiving', 'Received'] as const;

export interface PurchaseOrderRow {
  docId: string;
  id: string;
  supplier: string;
  supplierInitial: string;
  items: string;
  ordered: string;
  expected: string;
  expectedDate: string | null;
  expectedOverdue: boolean;
  total: string;
  status: 'Draft' | 'Confirmed' | 'Receiving' | 'Received' | 'Overdue';
  /** Raw displayStatus from the DTO (Draft/Confirmed/Receiving/Received/Closed/Cancelled) — the mapped `status` above collapses Closed→Received and Cancelled→Draft for the tab vocabulary. */
  displayStatus: 'Draft' | 'Confirmed' | 'Receiving' | 'Received' | 'Closed' | 'Cancelled';
}
import { exportToCsv } from '@/lib/csvExport';
import { usePurchaseOrders, usePurchaseOrder, purchaseMutations } from '@/hooks/usePurchasingApi';
import { orderMutations } from '@/hooks/useOrdersApi';
import styles from './OrdersPages.module.css';

interface OrdersScreenProps {
  onNavigate: (domain: DomainKey, screenId: string) => void;
  onToast: (msg: string) => void;
  onCreate?: (label: string) => void;
  onOpenCreateFlyout?: () => void;
  onOpenPeek?: (title: string, details: Record<string, string | number>) => void;
  onOpenDocument?: (type: import('@/lib/platformStore').DocumentType, id: string | null) => void;
}

const AVATAR_COLORS: Record<string, string> = {
  P: styles.avatarBlue,
  G: styles.avatarGreen,
};

export function PurchaseOrders({ onToast, onCreate, onOpenCreateFlyout, onOpenPeek, onOpenDocument }: OrdersScreenProps) {
  const [allPOs, setAllPOs] = useState<PurchaseOrderRow[]>([]);
  const [activeTab, setActiveTab] = useState<string>('All');
  const [search, setSearch] = useState('');
  const [supplierFilter, setSupplierFilter] = useState('All');
  // Quick filter driven by the KPI tiles (was: each tile fired a toast and
  // filtered nothing). Combines with the status tab + search + supplier.
  const [quickFilter, setQuickFilter] = useState<'all' | 'open' | 'due-week' | 'overdue' | 'received30d'>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [poMenuOpen, setPoMenuOpen] = useState(false);
  const [receiveFor, setReceiveFor] = useState<PurchaseOrderRow | null>(null);
  const [receiveQty, setReceiveQty] = useState<Record<string, string>>({});
  const { data: poDtos, refresh } = usePurchaseOrders();
  const { data: receiveDetail } = usePurchaseOrder(receiveFor?.docId || null);

  // REAL data from erp_purchase_orders via GET /api/v1/purchase-orders (doc 15).
  useEffect(() => {
    const rows: PurchaseOrderRow[] = (poDtos || []).map((d) => ({
      docId: d.id,
      id: d.poNumber || d.id.substring(0, 12),
      supplier: d.vendorName || '—',
      supplierInitial: (d.vendorName || 'S')[0]?.toUpperCase() || 'S',
      items: `${d.itemCount} item${d.itemCount === 1 ? '' : 's'} · ${d.receivedPct}% received`,
      ordered: d.orderDate ? d.orderDate.slice(5).replace('-', '/') : '—',
      expected: d.expectedDate ? d.expectedDate.slice(5).replace('-', '/') : '—',
      expectedDate: d.expectedDate,
      expectedOverdue: d.expectedOverdue,
      total: `$${d.total.toFixed(2)}`,
      status: (d.displayStatus === 'Closed' ? 'Received' : d.displayStatus === 'Cancelled' ? 'Draft' : d.displayStatus) as PurchaseOrderRow['status'],
      displayStatus: d.displayStatus,
    }));
    setAllPOs(rows);
  }, [poDtos]);

  useEffect(() => {
    if (!receiveDetail) return;
    const init: Record<string, string> = {};
    receiveDetail.lines.forEach((l) => { init[l.id] = String(Math.max(0, l.quantityOrdered - l.quantityReceived)); });
    setReceiveQty(init);
  }, [receiveDetail]);

  const submitReceive = async () => {
    if (!receiveFor || !receiveDetail) return;
    const lines = receiveDetail.lines
      .map((l) => ({ lineId: l.id, quantityReceived: Number(receiveQty[l.id]) || 0, unitCost: l.unitCost }))
      .filter((l) => l.quantityReceived > 0);
    if (!lines.length) { onToast('Enter a quantity for at least one line'); return; }
    try {
      await purchaseMutations.receive(receiveFor.docId, { lines, warehouseId: receiveDetail.warehouseId || undefined });
      onToast(`Received items for PO ${receiveFor.id}`);
      setReceiveFor(null);
      refresh();
    } catch { onToast(`Receiving failed for PO ${receiveFor.id}`); }
  };

  const suppliers = Array.from(new Set(allPOs.map((r) => r.supplier).filter((s) => s && s !== '—'))).sort();
  const filtered = allPOs.filter((row) => {
    if (activeTab !== 'All' && row.status !== activeTab) return false;
    if (supplierFilter !== 'All' && row.supplier !== supplierFilter) return false;
    if (quickFilter === 'open' && ['Received', 'Closed', 'Cancelled'].includes(row.displayStatus)) return false;
    if (quickFilter === 'due-week' && !(row.expectedDate && new Date(row.expectedDate) <= new Date(Date.now() + 7 * 86400000) && !['Received', 'Closed', 'Cancelled'].includes(row.displayStatus))) return false;
    if (quickFilter === 'overdue' && !row.expectedOverdue) return false;
    if (quickFilter === 'received30d' && !['Received', 'Closed'].includes(row.displayStatus)) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return row.id.toLowerCase().includes(q) || row.supplier.toLowerCase().includes(q);
  });

  const toggleSelect = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleSelectAll = () =>
    setSelected((prev) => {
      if (prev.size === filtered.length) return new Set();
      return new Set(filtered.map((r) => r.id));
    });

  const rowMenuItems = (row: PurchaseOrderRow): RowMenuItem[] => [
    { label: 'View PO', icon: 'open_in_new', onClick: () => (onOpenPeek ? onOpenPeek(`PO ${row.id} — ${row.supplier}`, {
      'PO No.': row.id,
      Supplier: row.supplier,
      Items: row.items,
      Ordered: row.ordered,
      Expected: row.expected,
      Total: row.total,
      Status: row.status,
    }) : onToast(`Viewing ${row.id}`)) },
    { label: 'Edit', icon: 'edit', onClick: () => (onOpenDocument ? onOpenDocument('PurchaseOrder', row.docId) : onToast(`Editing ${row.id}`)) },
    { label: 'Duplicate', icon: 'content_copy', onClick: async () => {
      try {
        const res = await fetch(`/api/v1/purchase-orders/${row.docId}`).then((r) => r.json());
        const d = res.data;
        await purchaseMutations.create({
          vendorId: d.vendorId, expectedDate: d.expectedDate, currency: d.currency, notes: d.notes,
          lines: (d.lines || []).map((l: Record<string, unknown>) => ({ skuId: l.skuId, description: l.description, quantity: l.quantityOrdered, unitCost: l.unitCost })),
        });
        onToast(`PO duplicated — copy of ${row.id} created as draft`);
        refresh();
      } catch { onToast(`Could not duplicate PO ${row.id}`); }
    } },
    { label: 'Send to supplier', icon: 'send', dividerBefore: true, onClick: async () => {
      try { await purchaseMutations.send(row.docId, {}); onToast(`PO ${row.id} sent to ${row.supplier}`); refresh(); }
      catch { onToast(`Could not send PO ${row.id}`); }
    } },
    { label: 'Receive items…', icon: 'inventory', onClick: () => setReceiveFor(row) },
    { label: 'Create bill', icon: 'receipt_long', onClick: async () => {
      try { await purchaseMutations.createBill(row.docId, {}); onToast(`Bill created from PO ${row.id}`); refresh(); }
      catch { onToast(`Could not create bill from PO ${row.id} — receive items first`); }
    } },
    { label: 'Print PO', icon: 'print', onClick: () => (onOpenDocument ? onOpenDocument('PurchaseOrder', row.docId) : window.print()) },
    { label: 'Report a problem…', icon: 'report_problem', dividerBefore: true, onClick: async () => {
      try { await orderMutations.reportProblem(row.docId, { subject: `Problem reported for PO ${row.id}` }); onToast(`Problem reported for PO ${row.id} — ticket created`); }
      catch { onToast(`Could not report problem for PO ${row.id}`); }
    } },
    { label: 'Cancel PO', icon: 'block', danger: true, onClick: async () => {
      try {
        await fetch(`/api/v1/documents/${row.docId}/void?type=PurchaseOrder`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason: 'Cancelled by user' }) });
        onToast(`PO ${row.id} cancelled`);
        refresh();
      } catch { onToast(`Could not cancel PO ${row.id}`); }
    } },
  ];

  return (
    <div className={styles.container}>
      <div className={styles.contextHeader}>
        <div className={styles.contextLeft}>
          <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#5a6355' }}>local_shipping</span>
          <span className={styles.contextLabel}>Orders</span>
          <span className={styles.contextSep}>/</span>
          <span className={styles.contextActive}>Purchase orders</span>
        </div>
      </div>

      <div className={styles.pageBody}>
        <div className={styles.pageHeader}>
          <div>
            <h1 className={styles.pageTitle}>Purchase orders</h1>
            <p className={styles.pageSubtitle}>Restock inventory from suppliers · receive against open POs</p>
          </div>
          <div className={styles.headerActions}>
            <div className={`${styles.splitBtn} relative`}>
              <button className={styles.splitBtnMain} onClick={() => (onCreate ? onCreate('Purchase order') : onToast('New PO — opening drawer'))}>
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add</span>
                New PO
              </button>
              <button className={styles.splitBtnArrow} aria-label="PO options" onClick={() => setPoMenuOpen(v => !v)}>
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>expand_more</span>
              </button>
              {poMenuOpen && (
                <div className="row-menu open" style={{ position: 'absolute', right: 0, top: '100%', marginTop: 4, zIndex: 60 }} onClick={() => setPoMenuOpen(false)}>
                  <div className="menu-header">New PO</div>
                  <button onClick={() => onCreate?.('Purchase order')}><span className="material-symbols-outlined">shopping_bag</span>Blank PO</button>
                  <button onClick={() => onCreate?.('Restock suggestions')}><span className="material-symbols-outlined">sync</span>From restock suggestions</button>
                  <button onClick={() => onCreate?.('Purchase order')}><span className="material-symbols-outlined">receipt_long</span>From sales orders</button>
                </div>
              )}
            </div>
            <button className={styles.btnSecondary} onClick={() => (onCreate ? onCreate('Restock suggestions') : onToast('Restock suggestions — opening'))}>
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>sync</span>
              Restock
            </button>
            <button className={styles.btnSecondary} onClick={() => {
              // Receive is per-PO: open the receive workspace for the first
              // open PO (was: opened a blank PO create via the flyout).
              const open = allPOs.find((r) => !['Received', 'Closed', 'Cancelled'].includes(r.displayStatus));
              if (!open) { onToast('No open PO to receive against'); return; }
              setReceiveFor(open);
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>inventory</span>
              Receive items
            </button>
            <button className={styles.btnSecondary} onClick={() => {
              const cols = [
                { key: 'id', label: 'PO' },
                { key: 'supplier', label: 'Supplier' },
                { key: 'items', label: 'Items' },
                { key: 'ordered', label: 'Ordered' },
                { key: 'expected', label: 'Expected' },
                { key: 'total', label: 'Total' },
                { key: 'status', label: 'Status' },
              ];
              exportToCsv(filtered as unknown as Record<string, unknown>[], cols, 'purchase-orders');
              onToast(`Exported ${filtered.length} records to CSV`);
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>download</span>
              Export
            </button>
          </div>
        </div>

        {/* KPI tiles — each filters the list in place (was: toast only). */}
        <div className={styles.kpiGrid}>
          <button className={styles.kpiTile} onClick={() => { setActiveTab('All'); setQuickFilter('open'); }}>
            <div className={styles.kpiValue}>{(poDtos || []).filter((p) => !['Received', 'Closed', 'Cancelled'].includes(p.displayStatus)).length}</div>
            <div className={styles.kpiLabel}>Open POs</div>
            <div className={styles.kpiDelta}>${(poDtos || []).filter((p) => !['Received', 'Closed', 'Cancelled'].includes(p.displayStatus)).reduce((s, p) => s + p.total, 0).toLocaleString()} committed</div>
          </button>
          <button className={styles.kpiTile} onClick={() => { setActiveTab('All'); setQuickFilter('due-week'); }}>
            <div className={styles.kpiValue}>{(poDtos || []).filter((p) => p.expectedDate && new Date(p.expectedDate) <= new Date(Date.now() + 7 * 86400000) && !['Received', 'Closed', 'Cancelled'].includes(p.displayStatus)).length}</div>
            <div className={styles.kpiLabel}>Expected this week</div>
            <div className={styles.kpiDelta}>${(poDtos || []).filter((p) => p.expectedDate && new Date(p.expectedDate) <= new Date(Date.now() + 7 * 86400000) && !['Received', 'Closed', 'Cancelled'].includes(p.displayStatus)).reduce((s, p) => s + p.total, 0).toLocaleString()} in transit</div>
          </button>
          <button className={styles.kpiTile} onClick={() => { setActiveTab('All'); setQuickFilter('overdue'); }}>
            <div className={styles.kpiValue} style={{ color: '#ba1a1a' }}>{(poDtos || []).filter((p) => p.expectedOverdue).length}</div>
            <div className={styles.kpiLabel}>Overdue receiving</div>
            <div className={styles.kpiDelta} style={{ color: '#ba1a1a' }}>{(poDtos || []).find((p) => p.expectedOverdue)?.vendorName || 'None overdue'}</div>
          </button>
          <button className={styles.kpiTile} onClick={() => { setActiveTab('All'); setQuickFilter('received30d'); }}>
            <div className={styles.kpiValue} style={{ color: '#1e5a38' }}>${(poDtos || []).filter((p) => ['Received', 'Closed'].includes(p.displayStatus)).reduce((s, p) => s + p.total, 0).toLocaleString()}</div>
            <div className={styles.kpiLabel}>Received (30d)</div>
            <div className={styles.kpiDelta}>{(poDtos || []).filter((p) => ['Received', 'Closed'].includes(p.displayStatus)).length} POs fulfilled</div>
          </button>
        </div>

        {/* Create actions */}
        <div className={styles.createActionsRow}>
          <span className={styles.createActionsLabel}>Create actions:</span>
          <button className={styles.createChip} onClick={() => (onCreate ? onCreate('Purchase order') : onToast('New PO — opening'))}><span className="material-symbols-outlined" style={{ fontSize: 16 }}>shopping_bag</span>Purchase order</button>
          <button className={styles.createChip} onClick={() => (onCreate ? onCreate('Restock suggestions') : onToast('Restock suggestions — opening'))}><span className="material-symbols-outlined" style={{ fontSize: 16 }}>sync</span>Restock suggestions</button>
          <button className={styles.createChip} onClick={() => (onCreate ? onCreate('Receive items') : onToast('Receive items — opening'))}><span className="material-symbols-outlined" style={{ fontSize: 16 }}>inventory</span>Receive items</button>
          <button className={styles.createChip} onClick={() => (onCreate ? onCreate('Add supplier') : onToast('Add supplier — opening'))}><span className="material-symbols-outlined" style={{ fontSize: 16 }}>factory</span>Add supplier</button>
          <button className={styles.showAllChip} onClick={() => (onOpenCreateFlyout ? onOpenCreateFlyout() : onToast('Show all create options'))}><span className="material-symbols-outlined" style={{ fontSize: 16 }}>apps</span>Show all</button>
        </div>

        {/* Table */}
        <div className={styles.tableCard}>
          <div className={styles.viewTabsBar}>
            {PO_TABS.map((tab) => (
              <button
                key={tab}
                className={`${styles.viewTab} ${activeTab === tab ? styles.viewTabActive : ''}`}
                onClick={() => setActiveTab(tab)}
              >
                {tab}
              </button>
            ))}
          </div>

          <div className={styles.filterBar}>
            <div className={styles.filterInputWrap}>
              <span className={`material-symbols-outlined ${styles.filterInputIcon}`}>search</span>
              <input
                className={styles.filterInput}
                placeholder="Filter by PO #, supplier…"
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <select className={styles.filterSelect} value={supplierFilter} onChange={(e) => setSupplierFilter(e.target.value)}>
              <option value="All">All suppliers</option>
              {suppliers.map((s) => (<option key={s} value={s}>{s}</option>))}
            </select>
            {quickFilter !== 'all' && (
              <button className={styles.filterBtn} onClick={() => setQuickFilter('all')}>
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>close</span>
                Clear filter
              </button>
            )}
            <span className={styles.filterCount}>
              {selected.size > 0 ? `${selected.size} selected` : `${filtered.length} of ${allPOs.length}`}
            </span>
          </div>

          {selected.size > 0 && (
            <BulkBar
              selectedIds={Array.from(selected)}
              onClear={() => setSelected(new Set())}
              actions={[
                { label: 'Send to supplier', icon: 'send', onClick: async () => { const rows = filtered.filter((r) => selected.has(r.id)); await Promise.all(rows.map((r) => purchaseMutations.send(r.docId, {}).catch(() => {}))); onToast(`Sent ${rows.length} POs to suppliers`); setSelected(new Set()); refresh(); } },
                { label: 'Create bills', icon: 'receipt_long', onClick: async () => { const rows = filtered.filter((r) => selected.has(r.id)); await Promise.all(rows.map((r) => purchaseMutations.createBill(r.docId, {}).catch(() => {}))); onToast(`Bill creation attempted for ${rows.length} POs`); setSelected(new Set()); refresh(); } },
                { label: 'Print', icon: 'print', onClick: () => { window.print(); setSelected(new Set()); } },
                { label: 'Cancel POs', icon: 'block', danger: true, onClick: async () => { const rows = filtered.filter((r) => selected.has(r.id)); await Promise.all(rows.map((r) => fetch(`/api/v1/documents/${r.docId}/void?type=PurchaseOrder`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason: 'Cancelled by user' }) }).catch(() => {}))); onToast(`Cancelled ${rows.length} POs`); setSelected(new Set()); refresh(); } },
              ]}
            />
          )}

          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.checkCell}><input type="checkbox" checked={selected.size === filtered.length && filtered.length > 0} onChange={toggleSelectAll} /></th>
                <th>PO</th>
                <th>Supplier</th>
                <th>Items</th>
                <th>Ordered</th>
                <th>Expected</th>
                <th style={{ textAlign: 'right' }}>Total</th>
                <th>Status</th>
                <th className={styles.actionCell}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr key={row.id} className={`${styles.tableRow} ${selected.has(row.id) ? styles.tableRowSelected : ''}`} onClick={() => (onOpenPeek ? onOpenPeek(`PO ${row.id} — ${row.supplier}`, {
                  'PO No.': row.id,
                  Supplier: row.supplier,
                  Items: row.items,
                  Ordered: row.ordered,
                  Expected: row.expected,
                  Total: row.total,
                  Status: row.status,
                }) : onToast(`Viewing ${row.id}`))}>
                  <td className={styles.checkCell}><input type="checkbox" checked={selected.has(row.id)} onChange={() => toggleSelect(row.id)} /></td>
                  <td><strong>{row.id}</strong></td>
                  <td>
                    <div className={styles.cellName}>
                      <span className={`${styles.avatar} ${AVATAR_COLORS[row.supplierInitial] || styles.avatarBlue}`}>{row.supplierInitial}</span>
                      {row.supplier}
                    </div>
                  </td>
                  <td>{row.items}</td>
                  <td>{row.ordered}</td>
                  <td style={{ color: row.expectedOverdue ? '#ba1a1a' : '#1a1c1e', fontWeight: row.expectedOverdue ? 700 : 400 }}>{row.expected}</td>
                  <td style={{ textAlign: 'right', color: row.expectedOverdue ? '#ba1a1a' : '#1a1c1e' }}>{row.total}</td>
                  <td>
                    <span className={styles.statusPill} data-status={row.status}>
                      {row.status === 'Overdue' && <span className="material-symbols-outlined" style={{ fontSize: 10, marginRight: 2 }}>warning</span>}
                      {row.status}
                    </span>
                  </td>
                  <td className={styles.actionCell}><RowMenu items={rowMenuItems(row)} /></td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={9} className={styles.emptyState}>No purchase orders match the current filter.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* Receive-items workspace (doc 15 surface) — erp_receive_purchase_order */}
      {receiveFor && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(20,24,20,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60 }} onClick={() => setReceiveFor(null)}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 20, width: 520, maxWidth: '94vw', maxHeight: '86vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 4px', fontSize: 16 }}>Receive items — PO {receiveFor.id}</h3>
            <p style={{ margin: '0 0 12px', fontSize: 13, color: '#5a6355' }}>{receiveFor.supplier} · {receiveDetail ? `${receiveDetail.receivedPct}% received so far` : 'Loading lines…'}</p>
            {(receiveDetail?.lines || []).map((l) => (
              <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: '1px solid #eeedf1' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{l.description || l.skuId || 'Line item'}</div>
                  <div style={{ fontSize: 12, color: '#5a6355' }}>Ordered {l.quantityOrdered} · received {l.quantityReceived} · ${l.unitCost.toFixed(2)} each</div>
                </div>
                <input type="number" min="0" max={l.quantityOrdered - l.quantityReceived} value={receiveQty[l.id] ?? ''} onChange={(e) => setReceiveQty((prev) => ({ ...prev, [l.id]: e.target.value }))} style={{ width: 84, padding: '7px 9px', border: '1px solid #d4d9d0', borderRadius: 8 }} aria-label={`Quantity to receive for ${l.description || 'line'}`} />
              </div>
            ))}
            {receiveDetail && receiveDetail.lines.length === 0 && <p style={{ fontSize: 13, color: '#5a6355' }}>This PO has no lines to receive.</p>}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
              <button className={styles.btnSecondary} onClick={() => setReceiveFor(null)}>Cancel</button>
              <button className={styles.splitBtnMain} onClick={submitReceive}>Receive items</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default PurchaseOrders;
