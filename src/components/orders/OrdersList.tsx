'use client';

import { useState, useEffect, useMemo } from 'react';
import { DomainKey } from '@/data/shellData';
import RowMenu, { RowMenuItem, BulkBar } from '@/components/ListPrimitives';
import { exportToCsv } from '@/lib/csvExport';
import { useOrders, orderMutations } from '@/hooks/useOrdersApi';
import type { Order } from '@/lib/orderTypes';
import type { DocumentType } from '@/lib/platformStore';
import styles from './OrdersPages.module.css';

interface OrdersScreenProps {
  onNavigate: (domain: DomainKey, screenId: string) => void;
  onToast: (msg: string) => void;
  onCreate?: (label: string) => void;
  onOpenCreateFlyout?: () => void;
  onOpenDocument?: (type: DocumentType, id: string | null) => void;
  onOpenPeek?: (title: string, details: Record<string, string | number>) => void;
}

/* Spec tabs (pages-2): All · New · Needs attention · In production ·
   Ready to ship · Shipped · Delivered · Returned · Canceled. */
const ORDER_TABS = ['All', 'New', 'Needs attention', 'In production', 'Ready to ship', 'Shipped', 'Delivered', 'Returned', 'Canceled'] as const;

interface OrderRow {
  docId: string;     // erp_orders.id — used for mutations + the doc page
  id: string;        // display id (#1047)
  channel: string | null;
  customer: string;
  date: string;      // ISO date or ''
  items: string;
  itemCount: number;
  thumbnailUrl: string | null;
  total: string;
  totalNum: number;
  payment: Order['paymentStatus'];
  status: Order['displayStatus'];
  invoice: string | null;
  issue: string | null;
  tracking: string | null;
  sla: string;
  slaPast: boolean;
}

const AVATAR_COLORS: Record<string, string> = {
  A: styles.avatarBlue,
  B: styles.avatarGreen,
  N: styles.avatarTeal,
  O: styles.avatarMaroon,
  M: styles.avatarNavy,
  L: styles.avatarMaroon,
};

function avatarClass(name: string): string {
  const first = name[0]?.toUpperCase() || 'A';
  return AVATAR_COLORS[first] || styles.avatarBlue;
}

export function OrdersList({ onNavigate, onToast, onCreate, onOpenPeek, onOpenDocument }: OrdersScreenProps) {
  const [allOrders, setAllOrders] = useState<OrderRow[]>([]);
  const [activeTab, setActiveTab] = useState<string>('All');
  const [search, setSearch] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [channelFilter, setChannelFilter] = useState('all');
  const [paymentFilter, setPaymentFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [splitOpen, setSplitOpen] = useState(false);
  const [refundFor, setRefundFor] = useState<OrderRow | null>(null);
  const [refundAmount, setRefundAmount] = useState('');
  const [refundReason, setRefundReason] = useState('');
  const [reportFor, setReportFor] = useState<OrderRow | null>(null);
  const [reportSubject, setReportSubject] = useState('');
  const [reportDesc, setReportDesc] = useState('');
  const { data: orderDtos, refresh } = useOrders();

  // REAL data from erp_orders via GET /api/v1/orders (doc 14).
  useEffect(() => {
    const rows: OrderRow[] = (orderDtos || []).map((o: Order) => {
      const slaPast = o.slaDueAt ? new Date(o.slaDueAt) < new Date() : false;
      return {
        docId: o.id,
        id: `#${o.orderNumber}`,
        channel: o.channel,
        customer: o.customerName || (o.customerEmail ? o.customerEmail.split('@')[0] : o.customerId ? o.customerId.slice(0, 8) : '—'),
        date: o.orderDate ? o.orderDate.slice(0, 10) : '',
        items: `${o.itemCount} item${o.itemCount === 1 ? '' : 's'}`,
        itemCount: o.itemCount,
        thumbnailUrl: o.thumbnailUrl,
        total: `$${o.total.toFixed(2)}`,
        totalNum: o.total,
        payment: o.paymentStatus,
        status: o.displayStatus,
        invoice: o.invoiceId,
        issue: o.needsAttention ? (o.attentionReason || 'Needs attention') : o.onHold ? (o.holdReason || 'On hold') : null,
        tracking: o.trackingNumber,
        sla: o.slaDueAt ? (slaPast ? 'Past SLA' : `${Math.max(0, Math.round((new Date(o.slaDueAt).getTime() - Date.now()) / 86400000))}d left`) : '—',
        slaPast,
      };
    });
    setAllOrders(rows);
  }, [orderDtos]);

  const channels = useMemo(() => [...new Set(allOrders.map((r) => r.channel).filter((c): c is string => Boolean(c)))], [allOrders]);

  const filtered = allOrders.filter((row) => {
    if (activeTab !== 'All' && row.status !== activeTab) return false;
    if (channelFilter !== 'all' && row.channel !== channelFilter) return false;
    if (paymentFilter !== 'all' && row.payment !== paymentFilter) return false;
    if (dateFrom && row.date < dateFrom) return false;
    if (dateTo && row.date > dateTo) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return row.id.toLowerCase().includes(q) || row.customer.toLowerCase().includes(q);
  });

  const tabCounts: Record<string, number> = { All: allOrders.length };
  ORDER_TABS.forEach((tab) => {
    if (tab !== 'All') tabCounts[tab] = allOrders.filter((r) => r.status === tab).length;
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

  // Row click → the order's DocumentEngine page (spec step 2). The peek
  // drawer is the fallback when the shell hasn't passed the opener.
  const openOrder = (row: OrderRow) => {
    if (onOpenDocument) onOpenDocument('SalesOrder', row.docId);
    else if (onOpenPeek) onOpenPeek(`Order ${row.id} — ${row.customer}`, {
      Order: row.id,
      Customer: row.customer,
      Items: row.items,
      Channel: row.channel || '—',
      Total: row.total,
      SLA: row.sla,
      Status: row.status,
    });
    else onToast(`Viewing ${row.id}`);
  };

  const rowMenuItems = (row: OrderRow): RowMenuItem[] => {
    const items: RowMenuItem[] = [
      { label: 'View order', icon: 'open_in_new', onClick: () => openOrder(row) },
      { label: 'Edit', icon: 'edit', onClick: () => (onCreate ? onCreate('Sales order') : onToast(`Editing ${row.id}`)) },
    ];
    if (row.status !== 'Shipped' && row.status !== 'Delivered') {
      items.push({ label: 'Print slip', icon: 'receipt', onClick: async () => {
        try { await orderMutations.createBatch({ orderIds: [row.docId], includeLabels: false }); onToast(`Packing slip batch created for ${row.id}`); }
        catch { onToast(`Could not create slip for ${row.id}`); }
      } });
      items.push({ label: 'Print shipping label', icon: 'print', onClick: async () => {
        try { await orderMutations.createLabel(row.docId, {}); onToast(`Shipping label created for ${row.id}`); }
        catch { onToast(`Could not create label for ${row.id}`); }
      } });
    }
    if (row.status === 'Ready to ship' || row.status === 'New' || row.status === 'In production') {
      items.push({ label: 'Mark shipped', icon: 'local_shipping', onClick: async () => {
        try { await orderMutations.markShipped(row.docId, {}); onToast(`Order ${row.id} marked shipped`); refresh(); }
        catch { onToast(`Could not mark ${row.id} shipped`); }
      } });
    }
    items.push({ label: 'Refund…', icon: 'undo', dividerBefore: true, onClick: () => { setRefundFor(row); setRefundAmount(row.total.replace(/[^0-9.]/g, '')); setRefundReason(''); } });
    items.push({ label: 'Report a problem…', icon: 'report_problem', onClick: () => { setReportFor(row); setReportSubject(''); setReportDesc(''); } });
    items.push({ label: 'Cancel order', icon: 'block', danger: true, onClick: async () => {
      try { await orderMutations.cancel(row.docId, { reason: 'Cancelled by user' }); onToast(`Order ${row.id} cancelled`); refresh(); }
      catch { onToast(`Could not cancel ${row.id}`); }
    } });
    return items;
  };

  const submitRefund = async () => {
    if (!refundFor) return;
    const amount = Number(refundAmount);
    if (!Number.isFinite(amount) || amount <= 0) { onToast('Enter a refund amount'); return; }
    try {
      await orderMutations.refund(refundFor.docId, { amount, reason: refundReason || undefined });
      onToast(`Refund of $${amount.toFixed(2)} issued for ${refundFor.id}`);
      setRefundFor(null);
      refresh();
    } catch { onToast(`Refund failed for ${refundFor.id}`); }
  };

  const submitReport = async () => {
    if (!reportFor) return;
    if (!reportSubject.trim()) { onToast('Describe the problem'); return; }
    try {
      await orderMutations.reportProblem(reportFor.docId, { subject: reportSubject, description: reportDesc || undefined });
      onToast(`Problem reported for ${reportFor.id} — ticket created`);
      setReportFor(null);
      refresh();
    } catch { onToast(`Could not report problem for ${reportFor.id}`); }
  };

  const selectedArray = Array.from(selected);
  const filtersActive = channelFilter !== 'all' || paymentFilter !== 'all' || dateFrom !== '' || dateTo !== '';

  return (
    <div className={styles.container}>
      {/* Context header */}
      <div className={styles.contextHeader}>
        <div className={styles.contextLeft}>
          <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#5a6355' }}>local_shipping</span>
          <span className={styles.contextLabel}>Orders</span>
          <span className={styles.contextSep}>/</span>
          <span className={styles.contextActive}>Orders</span>
        </div>
      </div>

      <div className={styles.pageBody}>
        {/* Page header */}
        <div className={styles.pageHeader}>
          <div>
            <h1 className={styles.pageTitle}>Orders</h1>
            <p className={styles.pageSubtitle}>All orders across channels · {allOrders.filter((o) => o.status !== 'Delivered' && o.status !== 'Shipped').length} active · SLAs enforced</p>
          </div>
          <div className={styles.headerActions}>
            {/* Split button: Create order */}
            <div className={styles.splitBtn} style={{ position: 'relative' }}>
              <button className={styles.splitBtnMain} onClick={() => (onCreate ? onCreate('Order') : onToast('Create order — opening drawer'))}>
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add</span>
                Create order
              </button>
              <button
                className={styles.splitBtnArrow}
                aria-expanded={splitOpen}
                onClick={() => setSplitOpen((prev) => !prev)}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>expand_more</span>
              </button>
            </div>
            <button className={styles.btnSecondary} onClick={() => (onCreate ? onCreate('Ticket') : onToast('Report a problem — opening'))}>
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>report_problem</span>
              Report a problem
            </button>
            <button className={styles.btnSecondary} onClick={() => (onCreate ? onCreate('Purchase order') : onToast('Create PO — opening'))}>
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>shopping_bag</span>
              Create PO
            </button>
            <button className={styles.btnSecondary} onClick={() => onNavigate('orders', 'inventory')}>
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>sync</span>
              Restock
            </button>
            <button className={styles.btnSecondary} onClick={() => onNavigate('orders', 'batch-slips')}>
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>receipt</span>
              Batch slips
            </button>
            <button className={styles.btnSecondary} onClick={() => onNavigate('orders', 'fulfillment-queue')}>
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>checklist</span>
              Pick list
            </button>
            <button className={styles.btnSecondary} onClick={() => {
              const cols = [
                { key: 'id', label: 'Order' },
                { key: 'channel', label: 'Channel' },
                { key: 'customer', label: 'Customer' },
                { key: 'date', label: 'Date' },
                { key: 'items', label: 'Items' },
                { key: 'total', label: 'Total' },
                { key: 'payment', label: 'Payment' },
                { key: 'status', label: 'Fulfillment' },
                { key: 'invoice', label: 'Invoice' },
                { key: 'tracking', label: 'Tracking' },
              ];
              exportToCsv(filtered as unknown as Record<string, unknown>[], cols, 'orders-list');
              onToast(`Exported ${filtered.length} records to CSV`);
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>download</span>
              Export
            </button>
          </div>
        </div>

        {/* Table card */}
        <div className={styles.tableCard}>
          {/* View tabs */}
          <div className={styles.viewTabsBar}>
            {ORDER_TABS.map((tab) => (
              <button
                key={tab}
                className={`${styles.viewTab} ${activeTab === tab ? styles.viewTabActive : ''}`}
                onClick={() => setActiveTab(tab)}
              >
                {tab}
                {tabCounts[tab] > 0 && <span className={styles.viewTabCount}>{tabCounts[tab]}</span>}
              </button>
            ))}
          </div>

          {/* Filter bar */}
          <div className={styles.filterBar}>
            <div className={styles.filterInputWrap}>
              <span className={`material-symbols-outlined ${styles.filterInputIcon}`}>search</span>
              <input
                className={styles.filterInput}
                placeholder="Filter by order #, customer…"
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <button className={styles.filterBtn} onClick={() => setFiltersOpen((v) => !v)} aria-expanded={filtersOpen}>
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>filter_list</span>
              Filter{filtersActive ? ' •' : ''}
            </button>
            <span className={styles.filterCount}>
              {selected.size > 0 ? `${selected.size} selected` : `${filtered.length} of ${allOrders.length}`}
            </span>
          </div>

          {/* Filter row — channel + payment + date range, all live */}
          {filtersOpen && (
            <div className={styles.filterBar} style={{ borderTop: '1px solid #e6e9e3', flexWrap: 'wrap', gap: 8 }}>
              <label style={{ fontSize: 12, color: '#5a6355' }}>Channel
                <select value={channelFilter} onChange={(e) => setChannelFilter(e.target.value)} style={{ marginLeft: 6, padding: '6px 8px', borderRadius: 8, border: '1px solid #d4d9d0' }}>
                  <option value="all">All channels</option>
                  {channels.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>
              <label style={{ fontSize: 12, color: '#5a6355' }}>Payment
                <select value={paymentFilter} onChange={(e) => setPaymentFilter(e.target.value)} style={{ marginLeft: 6, padding: '6px 8px', borderRadius: 8, border: '1px solid #d4d9d0' }}>
                  <option value="all">Any payment</option>
                  <option value="unpaid">Not paid</option>
                  <option value="partial">Partially paid</option>
                  <option value="paid">Paid</option>
                  <option value="refunded">Refunded</option>
                </select>
              </label>
              <label style={{ fontSize: 12, color: '#5a6355' }}>From
                <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} style={{ marginLeft: 6, padding: '6px 8px', borderRadius: 8, border: '1px solid #d4d9d0' }} />
              </label>
              <label style={{ fontSize: 12, color: '#5a6355' }}>To
                <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} style={{ marginLeft: 6, padding: '6px 8px', borderRadius: 8, border: '1px solid #d4d9d0' }} />
              </label>
              {filtersActive && (
                <button className={styles.filterBtn} onClick={() => { setChannelFilter('all'); setPaymentFilter('all'); setDateFrom(''); setDateTo(''); }}>
                  Clear filters
                </button>
              )}
            </div>
          )}

          {/* Bulk bar */}
          {selected.size > 0 && (
            <BulkBar
              selectedIds={selectedArray}
              onClear={() => setSelected(new Set())}
              actions={[
                { label: 'Print slips', icon: 'receipt', onClick: async () => { const ids = filtered.filter((r) => selected.has(r.id)).map((r) => r.docId); try { await orderMutations.createBatch({ orderIds: ids, includeLabels: false }); onToast(`Slip batch created for ${ids.length} orders`); } catch { onToast('Could not create slip batch'); } setSelected(new Set()); } },
                { label: 'Print labels', icon: 'print', onClick: async () => { const ids = filtered.filter((r) => selected.has(r.id)).map((r) => r.docId); try { await orderMutations.createBatch({ orderIds: ids, includeLabels: true }); onToast(`Labels created for ${ids.length} orders`); } catch { onToast('Could not create labels'); } setSelected(new Set()); } },
                { label: 'Mark shipped', icon: 'local_shipping', onClick: async () => { const rows = filtered.filter((r) => selected.has(r.id)); await Promise.all(rows.map((r) => orderMutations.markShipped(r.docId, {}).catch(() => {}))); onToast(`Marked ${rows.length} orders shipped`); setSelected(new Set()); refresh(); } },
                { label: 'Mark picked up', icon: 'storefront', onClick: async () => { const rows = filtered.filter((r) => selected.has(r.id)); await Promise.all(rows.map((r) => orderMutations.markShipped(r.docId, {}).catch(() => {}))); onToast(`Marked ${rows.length} orders picked up`); setSelected(new Set()); refresh(); } },
                { label: 'Cancel', icon: 'cancel', danger: true, onClick: async () => { const rows = filtered.filter((r) => selected.has(r.id)); await Promise.all(rows.map((r) => orderMutations.cancel(r.docId, { reason: 'Cancelled by user' }).catch(() => {}))); onToast(`Cancelled ${rows.length} orders`); setSelected(new Set()); refresh(); } },
              ]}
            />
          )}

          {/* Table — spec columns: Order # · Channel · Customer · Date ·
              Items (count + thumbnail) · Total · Payment · Fulfillment ·
              Invoice · Issue alert · Tracking. */}
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.checkCell}>
                  <input
                    type="checkbox"
                    checked={selected.size === filtered.length && filtered.length > 0}
                    onChange={toggleSelectAll}
                  />
                </th>
                <th>Order</th>
                <th>Channel</th>
                <th>Customer</th>
                <th>Date</th>
                <th>Items</th>
                <th style={{ textAlign: 'right' }}>Total</th>
                <th>Payment</th>
                <th>Fulfillment</th>
                <th>Invoice</th>
                <th>Issue</th>
                <th>Tracking</th>
                <th className={styles.actionCell}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr
                  key={row.id}
                  className={`${styles.tableRow} ${selected.has(row.id) ? styles.tableRowSelected : ''}`}
                  onClick={() => openOrder(row)}
                >
                  <td className={styles.checkCell}>
                    <input
                      type="checkbox"
                      checked={selected.has(row.id)}
                      onChange={() => toggleSelect(row.id)}
                    />
                  </td>
                  <td><strong>{row.id}</strong></td>
                  <td>{row.channel ? <span className={styles.statusPill} data-status="channel">{row.channel}</span> : '—'}</td>
                  <td>
                    <div className={styles.cellName}>
                      <span className={`${styles.avatar} ${avatarClass(row.customer)}`}>{row.customer[0]}</span>
                      {row.customer}
                    </div>
                  </td>
                  <td>{row.date || '—'}</td>
                  <td>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      {row.thumbnailUrl && <img src={row.thumbnailUrl} alt="" style={{ width: 24, height: 24, objectFit: 'cover', borderRadius: 4 }} />}
                      {row.items}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right' }}>{row.total}</td>
                  <td><span className={styles.statusPill} data-status={row.payment}>{row.payment === 'paid' ? 'Paid' : row.payment === 'partial' ? 'Partial' : row.payment === 'refunded' ? 'Refunded' : 'Not paid'}</span></td>
                  <td><span className={styles.statusPill} data-status={row.status}>{row.status}</span></td>
                  <td>{row.invoice ? 'Invoiced' : '—'}</td>
                  <td style={{ color: row.issue ? '#ba1a1a' : undefined, fontWeight: row.issue ? 600 : 400 }}>{row.issue || '—'}</td>
                  <td>{row.tracking || '—'}</td>
                  <td className={styles.actionCell}>
                    <RowMenu items={rowMenuItems(row)} />
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={13} className={styles.emptyState}>No orders match the current filter.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Refund modal (doc 14 surface) — erp_refund_order via the refund route */}
      {refundFor && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(20,24,20,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60 }} onClick={() => setRefundFor(null)}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 20, width: 380, maxWidth: '92vw' }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 4px', fontSize: 16 }}>Refund {refundFor.id}</h3>
            <p style={{ margin: '0 0 12px', fontSize: 13, color: '#5a6355' }}>{refundFor.customer} · order total {refundFor.total}</p>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Amount (USD)</label>
            <input type="number" min="0" step="0.01" value={refundAmount} onChange={(e) => setRefundAmount(e.target.value)} style={{ width: '100%', padding: '8px 10px', border: '1px solid #d4d9d0', borderRadius: 8, marginBottom: 10 }} />
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Reason</label>
            <input type="text" value={refundReason} onChange={(e) => setRefundReason(e.target.value)} placeholder="e.g. Damaged in transit" style={{ width: '100%', padding: '8px 10px', border: '1px solid #d4d9d0', borderRadius: 8, marginBottom: 14 }} />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className={styles.btnSecondary} onClick={() => setRefundFor(null)}>Cancel</button>
              <button className={styles.splitBtnMain} onClick={submitRefund}>Issue refund</button>
            </div>
          </div>
        </div>
      )}

      {/* Report-a-problem modal (doc 14 surface) — support ticket via the report route */}
      {reportFor && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(20,24,20,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60 }} onClick={() => setReportFor(null)}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 20, width: 380, maxWidth: '92vw' }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 4px', fontSize: 16 }}>Report a problem — {reportFor.id}</h3>
            <p style={{ margin: '0 0 12px', fontSize: 13, color: '#5a6355' }}>Creates a support ticket and flags the order as needing attention.</p>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Problem</label>
            <input type="text" value={reportSubject} onChange={(e) => setReportSubject(e.target.value)} placeholder="e.g. Wrong item shipped" style={{ width: '100%', padding: '8px 10px', border: '1px solid #d4d9d0', borderRadius: 8, marginBottom: 10 }} />
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Details</label>
            <textarea value={reportDesc} onChange={(e) => setReportDesc(e.target.value)} rows={3} style={{ width: '100%', padding: '8px 10px', border: '1px solid #d4d9d0', borderRadius: 8, marginBottom: 14 }} />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className={styles.btnSecondary} onClick={() => setReportFor(null)}>Cancel</button>
              <button className={styles.splitBtnMain} onClick={submitReport}>Create ticket</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default OrdersList;
