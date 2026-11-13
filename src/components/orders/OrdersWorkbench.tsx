'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import styles from './OrdersWorkbench.module.css';

/* ══════════════════════════════════════════════════════════════════ */
/* TYPES — the four unified row shapes                                */
/* ══════════════════════════════════════════════════════════════════ */

type Scope = 'orders' | 'inventory' | 'fulfillment' | 'returns';

interface OrderRow {
  id: string;          // display #1047
  docId: string;       // erp_orders.id — used for mutations
  customer: string;
  items: string;
  supplier: string;
  total: number;
  status: string;
  track: 'warehouse' | 'dropship';
  sla: string;
  slaPast: boolean;
  carrier: string;
  tracking: string;
  createdAt: string;
}

interface InventoryRow {
  sku: string;
  product: string;
  warehouse: string;
  bin: string;
  onHand: number;
  committed: number;
  reorder: number;
  status: 'In stock' | 'Low stock' | 'Out of stock';
}

interface ReturnRow {
  id: string;          // RMA-101
  customer: string;
  order: string;       // #1047
  reason: string;
  refund: number;
  status: string;
  type: 'Customer' | 'Supplier';
  items: string;
}

/* ══════════════════════════════════════════════════════════════════ */
/* VIEWS CONFIGURATION — the four unified scopes                      */
/* ══════════════════════════════════════════════════════════════════ */

interface MenuSection { section: string }
interface MenuItem { a: string; l: string; i: string; danger?: boolean }
interface BulkItem { a: string; l: string; danger?: boolean }

interface ViewConfig {
  title: string;
  statuses: string[];
  cols: string[];
  menu: (MenuSection | MenuItem)[];
  bulk: BulkItem[];
}

const VIEWS: Record<Scope, ViewConfig> = {
  orders: {
    title: 'Orders',
    statuses: ['All', 'Unfulfilled', 'Ready', 'Pickup', 'Shipped', 'Delivered'],
    cols: ['Order', 'Customer', 'Items', 'Supplier', 'Total', 'SLA', 'Status'],
    menu: [
      { section: 'This order' }, { a: 'view', l: 'View order', i: 'open_in_new' },
      { section: 'Fulfill' }, { a: 'slip', l: 'Print slip', i: 'receipt' }, { a: 'label', l: 'Print label', i: 'print' }, { a: 'ship', l: 'Mark shipped', i: 'local_shipping' },
      { section: 'Post-order' }, { a: 'rma', l: 'View linked RMA', i: 'assignment_return' }, { a: 'restock', l: 'Restock inventory', i: 'sync' },
      { section: '' }, { a: 'cancel', l: 'Cancel order', i: 'block', danger: true },
    ],
    bulk: [{ a: 'slips', l: 'Print slips' }, { a: 'labels', l: 'Print labels' }, { a: 'ship', l: 'Mark shipped' }, { a: 'cancel', l: 'Cancel', danger: true }],
  },
  inventory: {
    title: 'Inventory',
    statuses: ['All', 'In stock', 'Low stock', 'Out of stock'],
    cols: ['SKU / Product', 'Warehouse', 'Bin', 'On hand', 'Committed', 'Available', 'Reorder pt', 'Status'],
    menu: [
      { section: 'This SKU' }, { a: 'view', l: 'View in Catalog', i: 'open_in_new' }, { a: 'adjust', l: 'Adjust stock', i: 'tune' }, { a: 'transfer', l: 'Transfer', i: 'swap_horiz' },
      { section: 'Orders' }, { a: 'orders', l: 'View open orders using this SKU', i: 'shopping_cart' },
      { section: 'History' }, { a: 'history', l: 'Stock history', i: 'history' },
    ],
    bulk: [{ a: 'reorder', l: 'Reorder (Accounting)' }, { a: 'adjust', l: 'Adjust' }, { a: 'transfer', l: 'Transfer' }],
  },
  fulfillment: {
    title: 'Fulfillment Queue',
    statuses: ['All', 'Warehouse', 'Drop-ship', 'Past SLA'],
    cols: ['Order', 'Customer', 'Track', 'Supplier', 'Ship by / Tracking', 'Status'],
    menu: [
      { section: 'This order' }, { a: 'view', l: 'View order', i: 'open_in_new' },
      { section: 'Fulfill' }, { a: 'slip', l: 'Print slip', i: 'receipt' }, { a: 'label', l: 'Print label', i: 'print' },
      { section: 'Update' }, { a: 'ship', l: 'Mark shipped', i: 'local_shipping' }, { a: 'track', l: 'Track shipment', i: 'local_shipping' },
    ],
    bulk: [{ a: 'slips', l: 'Print slips' }, { a: 'ship', l: 'Mark shipped' }],
  },
  returns: {
    title: 'Returns & Claims',
    statuses: ['All', 'Requested', 'Approved', 'In transit', 'Received', 'Refunded', 'Declined'],
    cols: ['RMA', 'Customer', 'Order', 'Reason', 'Refund', 'Status'],
    menu: [
      { section: 'This RMA' }, { a: 'view', l: 'Open RMA', i: 'open_in_new' },
      { section: 'Approve' }, { a: 'approve', l: 'Approve return', i: 'check_circle' }, { a: 'decline', l: 'Decline return', i: 'cancel' },
      { section: 'Complete' }, { a: 'receive', l: 'Mark received', i: 'inventory' }, { a: 'refund', l: 'Issue refund', i: 'payments' },
    ],
    bulk: [{ a: 'approve', l: 'Approve' }, { a: 'refund', l: 'Issue refund' }],
  },
};

/* ══════════════════════════════════════════════════════════════════ */
/* UTILS                                                              */
/* ══════════════════════════════════════════════════════════════════ */

function statusClass(s: string): string {
  const m: Record<string, string> = {
    Unfulfilled: styles.statWarn,
    Ready: styles.statInfo,
    Pickup: styles.statPurple,
    Shipped: styles.statShipped,
    Delivered: styles.statSuccess,
    'In stock': styles.statSuccess,
    'Low stock': styles.statWarn,
    'Out of stock': styles.statError,
    Requested: styles.statWarn,
    Approved: styles.statInfo,
    'In transit': styles.statPurple,
    Refunded: styles.statSuccess,
    Declined: styles.statError,
    Received: styles.statPurple,
  };
  return m[s] || styles.statNeutral;
}

function avatarClass(initial: string): string {
  const colors = [styles.avatarBlue, styles.avatarGreen, styles.avatarTeal, styles.avatarMaroon, styles.avatarNavy];
  const code = initial.toUpperCase().charCodeAt(0) || 65;
  return colors[code % colors.length];
}

function money(n: number): string {
  return `$${(Number.isFinite(n) ? n : 0).toFixed(2)}`;
}

/* ══════════════════════════════════════════════════════════════════ */
/* API DATA MAPPING                                                   */
/* ══════════════════════════════════════════════════════════════════ */

function mapOrderRow(d: Record<string, unknown>): OrderRow {
  const id = String(d.order_number || d.id || '').replace(/^SO-/, '');
  const total = Number(d.total) || 0;
  const slaDue = d.sla_due_at as string | null;
  const slaPast = slaDue ? new Date(slaDue) < new Date() : false;
  const status: string =
    d.status === 'closed' ? 'Delivered'
    : d.status === 'fulfilled' || d.status === 'shipped' ? 'Shipped'
    : d.fulfillment_method === 'pickup' ? 'Pickup'
    : Number(d.amount_paid) > 0 ? 'Ready'
    : 'Unfulfilled';
  const method = String(d.fulfillment_method || 'stock');
  const track: OrderRow['track'] = method === 'POD' || method === 'dropship' ? 'dropship' : 'warehouse';
  const customerEmail = (d.customer_email as string) || '';
  const customer = customerEmail ? customerEmail.split('@')[0] : (String(d.crm_customer_id || 'Customer')).slice(0, 12);
  const sla = slaDue
    ? slaPast ? 'Past SLA'
      : `${Math.max(0, Math.round((new Date(slaDue).getTime() - Date.now()) / 86400000))}d left`
    : '—';
  return {
    id,
    docId: String(d.id),
    customer,
    items: String(d.notes || d.items || '—'),
    supplier: '—',
    total,
    status,
    track,
    sla,
    slaPast,
    carrier: 'USPS',
    tracking: '',
    createdAt: (d.order_date as string) || (d.created_at as string) || '',
  };
}

function mapInventoryRow(d: Record<string, unknown>): InventoryRow {
  const onHand = d.onHand == null ? 0 : Number(d.onHand);
  const reorder = d.reorderPoint == null ? 0 : Number(d.reorderPoint);
  const committed = 0; // not exposed by /api/v1/inventory
  const status: InventoryRow['status'] =
    onHand === 0 ? 'Out of stock'
    : onHand <= reorder ? 'Low stock'
    : 'In stock';
  const size = (d.size as string) || '';
  const color = (d.color as string) || '';
  const product = `${d.product || 'Product'}${size ? ` — ${size}` : ''}${color ? ` / ${color}` : ''}`;
  return {
    sku: String(d.sku || ''),
    product,
    warehouse: 'Charlotte',
    bin: '—',
    onHand,
    committed,
    reorder,
    status,
  };
}

function mapReturnRow(d: Record<string, unknown>): ReturnRow {
  const id = String(d.rma_number || d.id || '').slice(0, 12);
  const rawStatus = String(d.status || 'requested');
  const status: string =
    rawStatus === 'completed' ? 'Refunded'
    : rawStatus === 'rejected' || rawStatus === 'declined' ? 'Declined'
    : rawStatus === 'received' ? 'Received'
    : rawStatus === 'approved' ? 'Approved'
    : rawStatus === 'in_transit' ? 'In transit'
    : 'Requested';
  return {
    id,
    customer: String(d.customer_email || d.customer_name || 'Customer'),
    order: d.order_id ? `#${String(d.order_id).slice(0, 6)}` : '—',
    reason: String(d.reason || d.decision_reason || 'Return'),
    refund: Number(d.refund_amount || 0),
    status,
    type: 'Customer',
    items: '—',
  };
}

/* ══════════════════════════════════════════════════════════════════ */
/* COMPONENT                                                          */
/* ══════════════════════════════════════════════════════════════════ */

export interface OrdersWorkbenchProps {
  onToast: (m: string) => void;
  onNavigate?: (d: string, s: string) => void;
}

interface DrawerState {
  icon: string;
  title: string;
  sub: string;
  body: React.ReactNode;
  footer: React.ReactNode;
}

interface RowMenuState {
  x: number;
  y: number;
  rowId: string;
}

export default function OrdersWorkbench({ onToast, onNavigate }: OrdersWorkbenchProps) {
  // State hooks
  const [scope, setScope] = useState<Scope>('orders');
  const [status, setStatus] = useState<string>('All');
  const [q, setQ] = useState<string>('');

  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [inventory, setInventory] = useState<InventoryRow[]>([]);
  const [returns, setReturns] = useState<ReturnRow[]>([]);
  const [loaded, setLoaded] = useState<boolean>(false);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [rowMenu, setRowMenu] = useState<RowMenuState | null>(null);
  const [drawer, setDrawer] = useState<DrawerState | null>(null);
  const [toastMsg, setToastMsg] = useState<string>('');

  // Refs
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rowMenuRef = useRef<HTMLDivElement | null>(null);

  // ════════════════════════════════════════════════════════════════
  // DATA FETCHING — real APIs
  // ════════════════════════════════════════════════════════════════

  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    const fetchOrders = fetch('/api/v1/documents?type=SalesOrder').then(r => r.json()).then(json => (json.data || []) as Record<string, unknown>[]).catch(() => []);
    const fetchInv = fetch('/api/v1/inventory').then(r => r.json()).then(json => (json.rows || []) as Record<string, unknown>[]).catch(() => []);
    const fetchRet = fetch('/api/v1/returns').then(r => r.json()).then(json => (json.data || []) as Record<string, unknown>[]).catch(() => []);
    Promise.all([fetchOrders, fetchInv, fetchRet]).then(([o, i, r]) => {
      if (cancelled) return;
      setOrders(o.map(mapOrderRow));
      setInventory(i.map(mapInventoryRow));
      setReturns(r.map(mapReturnRow));
      setLoaded(true);
    });
    return () => { cancelled = true; };
  }, []);

  // ════════════════════════════════════════════════════════════════
  // DERIVED DATA
  // ════════════════════════════════════════════════════════════════

  const data = useMemo<(OrderRow | InventoryRow | ReturnRow)[]>(() => {
    if (scope === 'orders') return orders;
    if (scope === 'inventory') return inventory;
    if (scope === 'fulfillment') return orders; // same source, filtered by fulfillment_method
    return returns;
  }, [scope, orders, inventory, returns]);

  const filtered = useMemo(() => {
    const query = q.toLowerCase();
    return data.filter((r) => {
      // Status filter
      let statusOk = status === 'All';
      if (!statusOk) {
        if (scope === 'fulfillment') {
          const track = (r as unknown as OrderRow).track;
          const sla = (r as unknown as OrderRow).sla;
          statusOk =
            (status === 'Warehouse' && track === 'warehouse') ||
            (status === 'Drop-ship' && track === 'dropship') ||
            (status === 'Past SLA' && sla === 'Past SLA');
        } else {
          statusOk = (r as unknown as { status: string }).status === status;
        }
      }
      // Search filter (search the JSON-serialized row, mirroring original)
      const qOk = !query || JSON.stringify(r).toLowerCase().includes(query);
      return statusOk && qOk;
    });
  }, [data, status, q, scope]);

  // ════════════════════════════════════════════════════════════════
  // KPI STRIP — derived per scope
  // ════════════════════════════════════════════════════════════════

  const kpis = useMemo(() => {
    const o = orders;
    const i = inventory;
    const r = returns;
    if (scope === 'orders') return [
      { l: 'Orders today', i: 'shopping_cart', v: String(o.length), d: `${o.length} total orders`, c: '' },
      { l: 'Unfulfilled', i: 'schedule', v: String(o.filter(x => x.status === 'Unfulfilled').length), d: `${o.filter(x => x.slaPast).length} past SLA`, c: 'text-error' },
      { l: 'Shipped', i: 'local_shipping', v: String(o.filter(x => x.status === 'Shipped').length), d: 'This week', c: 'text-qb-green' },
      { l: 'Revenue MTD', i: 'attach_money', v: money(o.reduce((s, x) => s + x.total, 0)), d: `${o.length} orders`, c: 'text-qb-teal' },
    ];
    if (scope === 'inventory') return [
      { l: 'Total SKUs', i: 'inventory_2', v: String(i.length), d: 'Across warehouses', c: '' },
      { l: 'In stock', i: 'check_circle', v: String(i.filter(x => x.status === 'In stock').length), d: 'Healthy', c: 'text-secondary' },
      { l: 'Low stock', i: 'warning', v: String(i.filter(x => x.status === 'Low stock').length), d: 'Below reorder', c: 'text-qb-maroon' },
      { l: 'Out of stock', i: 'error', v: String(i.filter(x => x.status === 'Out of stock').length), d: 'Blocking orders', c: 'text-error' },
    ];
    if (scope === 'fulfillment') return [
      { l: 'Warehouse queue', i: 'inventory', v: String(o.filter(x => x.track === 'warehouse').length), d: `${o.filter(x => x.track === 'warehouse' && x.slaPast).length} past SLA`, c: 'text-qb-maroon' },
      { l: 'Drop ship queue', i: 'local_shipping', v: String(o.filter(x => x.track === 'dropship').length), d: 'In transit', c: 'text-qb-blue' },
      { l: 'Awaiting receipt', i: 'schedule', v: String(o.filter(x => x.status === 'Delivered').length), d: 'Delivered, needs confirm', c: '' },
      { l: 'Ship today', i: 'schedule', v: String(o.filter(x => x.status === 'Ready').length), d: 'By 4:00 PM cutoff', c: 'text-error' },
    ];
    return [
      { l: 'Open returns', i: 'assignment_return', v: String(r.filter(x => ['Requested', 'Approved', 'In transit'].includes(x.status)).length), d: `${money(r.filter(x => ['Requested', 'Approved', 'In transit'].includes(x.status)).reduce((s, x) => s + x.refund, 0))} refunds pending`, c: '' },
      { l: 'Awaiting receipt', i: 'schedule', v: String(r.filter(x => x.status === 'In transit').length), d: 'In transit back', c: 'text-qb-maroon' },
      { l: 'Supplier claims', i: 'factory', v: String(r.filter(x => x.type === 'Supplier').length), d: 'Recoverable', c: '' },
      { l: 'Return rate (30d)', i: 'trending_down', v: '2.4%', d: 'Down from 3.1%', c: 'text-secondary' },
    ];
  }, [scope, orders, inventory, returns]);

  // ════════════════════════════════════════════════════════════════
  // STATUS TAB COUNTS
  // ════════════════════════════════════════════════════════════════

  const tabCount = useCallback((s: string): number => {
    if (s === 'All') return data.length;
    if (scope === 'fulfillment') {
      return data.filter((r) => {
        const o = r as unknown as OrderRow;
        return (s === 'Warehouse' && o.track === 'warehouse')
          || (s === 'Drop-ship' && o.track === 'dropship')
          || (s === 'Past SLA' && o.sla === 'Past SLA');
      }).length;
    }
    return data.filter(r => (r as unknown as { status: string }).status === s).length;
  }, [data, scope]);

  // ════════════════════════════════════════════════════════════════
  // SELECTION HANDLERS
  // ════════════════════════════════════════════════════════════════

  const rowIdOf = useCallback((r: OrderRow | InventoryRow | ReturnRow): string => {
    if (scope === 'inventory') return (r as unknown as InventoryRow).sku;
    if (scope === 'returns') return (r as unknown as ReturnRow).id;
    return (r as unknown as OrderRow).id;
  }, [scope]);

  const toggleRow = (id: string) =>
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleAll = (checked: boolean) => {
    if (!checked) { setSelected(new Set()); return; }
    setSelected(new Set(filtered.map(rowIdOf)));
  };

  const allChecked = filtered.length > 0 && filtered.every(r => selected.has(rowIdOf(r)));

  // ════════════════════════════════════════════════════════════════
  // TOAST (local fallback — also forwards to onToast prop)
  // ════════════════════════════════════════════════════════════════

  const showToast = useCallback((m: string) => {
    onToast(m);
    setToastMsg(m);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(''), 1800);
  }, [onToast]);

  // ════════════════════════════════════════════════════════════════
  // ROW MENU
  // ════════════════════════════════════════════════════════════════

  const openRowMenu = (e: React.MouseEvent<HTMLButtonElement>, rowId: string) => {
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = Math.min(rect.right - 250, window.innerWidth - 270);
    const y = rect.bottom + 4;
    setRowMenu({ x, y, rowId });
  };

  const closeRowMenu = useCallback(() => setRowMenu(null), []);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (rowMenuRef.current && !rowMenuRef.current.contains(e.target as Node)) {
        closeRowMenu();
      }
    };
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, [closeRowMenu]);

  const handleRowAction = (act: string, id: string) => {
    closeRowMenu();
    if (act === 'view') {
      openDrawer(id);
      return;
    }
    if (act === 'rma') {
      setScope('returns');
      setStatus('All');
      setQ('');
      showToast(`Showing returns for order #${id}`);
      return;
    }
    if (act === 'orders') {
      setScope('orders');
      setStatus('All');
      setQ('');
      showToast(`Showing orders using ${id}`);
      return;
    }
    showToast(`${act} on ${id}`);
  };

  // ════════════════════════════════════════════════════════════════
  // DRAWER
  // ════════════════════════════════════════════════════════════════

  const openDrawer = (id: string) => {
    if (scope === 'orders') {
      const o = orders.find(x => x.id === id);
      if (!o) return;
      setDrawer({
        icon: 'shopping_cart',
        title: `Order #${o.id}`,
        sub: o.customer,
        body: <div className="bg-surface-container-low p-3 rounded">{o.items}</div>,
        footer: (
          <button
            className="h-8 px-3 bg-primary text-white rounded"
            onClick={() => setDrawer(null)}
          >
            Close
          </button>
        ),
      });
    } else if (scope === 'inventory') {
      const v = inventory.find(x => x.sku === id);
      if (!v) return;
      setDrawer({
        icon: 'tune',
        title: v.product,
        sub: v.sku,
        body: (
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-surface-container-low p-3 rounded text-center">
              <div className="text-[11px] text-on-surface-variant">On hand</div>
              <div className="text-headline-sm mt-1 tabular-nums">{v.onHand}</div>
            </div>
            <div className="bg-surface-container-low p-3 rounded text-center">
              <div className="text-[11px] text-on-surface-variant">Available</div>
              <div className={`text-headline-sm mt-1 tabular-nums ${v.onHand - v.committed < 0 ? 'text-error' : ''}`}>{v.onHand - v.committed}</div>
            </div>
            <div className="bg-surface-container-low p-3 rounded text-center">
              <div className="text-[11px] text-on-surface-variant">Reorder</div>
              <div className="text-headline-sm mt-1 tabular-nums">{v.reorder}</div>
            </div>
          </div>
        ),
        footer: (
          <div className="flex items-center gap-2">
            <button className="h-8 px-3 border rounded" onClick={() => setDrawer(null)}>Close</button>
            <button className="h-8 px-3 bg-primary text-white rounded" onClick={() => showToast('Saved')}>Save</button>
          </div>
        ),
      });
    } else if (scope === 'returns') {
      const r = returns.find(x => x.id === id);
      if (!r) return;
      setDrawer({
        icon: 'assignment_return',
        title: r.id,
        sub: r.customer,
        body: (
          <div className="bg-surface-container-low p-3 rounded">
            <div className="text-body-sm">Reason: {r.reason}</div>
            <div className="text-body-sm mt-1">Refund: {money(r.refund)}</div>
          </div>
        ),
        footer: <button className="h-8 px-3 border rounded" onClick={() => setDrawer(null)}>Close</button>,
      });
    } else {
      const o = orders.find(x => x.id === id);
      if (!o) return;
      setDrawer({
        icon: 'inventory',
        title: `Fulfill #${o.id}`,
        sub: o.customer,
        body: (
          <div className="bg-surface-container-low p-3 rounded">
            <div className="text-body-sm">Track: <span className="capitalize">{o.track}</span></div>
            <div className="text-body-sm mt-1">Status: {o.status}</div>
          </div>
        ),
        footer: <button className="h-8 px-3 border rounded" onClick={() => setDrawer(null)}>Close</button>,
      });
    }
  };

  // ════════════════════════════════════════════════════════════════
  // BULK ACTIONS
  // ════════════════════════════════════════════════════════════════

  const runBulk = (label: string) => {
    const n = selected.size;
    showToast(`${label} on ${n} record${n !== 1 ? 's' : ''}`);
    setSelected(new Set());
  };

  // ════════════════════════════════════════════════════════════════
  // TOP-BAR ACTIONS
  // ════════════════════════════════════════════════════════════════

  const topAction = (act: string) => {
    if (act === 'create') { showToast('Create order — opening drawer'); return; }
    if (act === 'report') { showToast('Report a problem — opening'); return; }
    if (act === 'batch') { onNavigate?.('orders', 'batch-slips'); return; }
    if (act === 'pick') { showToast('Pick list — opening'); return; }
    showToast(`${act} — opening`);
  };

  // ════════════════════════════════════════════════════════════════
  // SCOPE CHANGE
  // ════════════════════════════════════════════════════════════════

  const changeScope = (s: Scope) => {
    setScope(s);
    setStatus('All');
    setQ('');
    setSelected(new Set());
  };

  // ════════════════════════════════════════════════════════════════
  // ROW RENDERERS — per scope
  // ════════════════════════════════════════════════════════════════

  const renderRowCells = (r: OrderRow | InventoryRow | ReturnRow): React.ReactNode => {
    if (scope === 'orders' || scope === 'fulfillment') {
      const o = r as unknown as OrderRow;
      if (scope === 'orders') {
        return (
          <>
            <td className="px-3 py-2 font-medium">#{o.id}</td>
            <td className="px-3 py-2">
              <div className="flex items-center gap-2">
                <div className={`${styles.avatar} ${avatarClass(o.customer)}`}>{o.customer[0]?.toUpperCase() || 'A'}</div>
                <div className="font-medium truncate">{o.customer}</div>
              </div>
            </td>
            <td className="px-3 py-2 text-on-surface-variant">{o.items}</td>
            <td className="px-3 py-2 text-on-surface-variant">{o.supplier}</td>
            <td className="px-3 py-2 text-right tabular-nums">{money(o.total)}</td>
            <td className={`px-3 py-2 ${o.slaPast ? 'text-error font-semibold' : 'text-on-surface-variant'}`}>{o.sla}</td>
            <td className="px-3 py-2"><span className={`${styles.stat} ${statusClass(o.status)}`}>{o.status}</span></td>
          </>
        );
      }
      // fulfillment scope
      return (
        <>
          <td className="px-3 py-2 font-medium">#{o.id}</td>
          <td className="px-3 py-2">
            <div className="flex items-center gap-2">
              <div className={`${styles.avatar} ${avatarClass(o.customer)}`}>{o.customer[0]?.toUpperCase() || 'A'}</div>
              <div className="font-medium truncate">{o.customer}</div>
            </div>
          </td>
          <td className="px-3 py-2 text-on-surface-variant capitalize">{o.track}</td>
          <td className="px-3 py-2 text-on-surface-variant">{o.supplier}</td>
          <td className="px-3 py-2">
            {o.tracking ? (
              <span className="font-mono text-[11px] bg-surface-container-low px-1.5 py-0.5 rounded border border-surface-dim">
                {o.tracking.slice(0, 12)}...
              </span>
            ) : (
              <span className={o.slaPast ? 'text-error font-semibold' : 'text-on-surface-variant'}>{o.sla}</span>
            )}
          </td>
          <td className="px-3 py-2"><span className={`${styles.stat} ${statusClass(o.status)}`}>{o.status}</span></td>
        </>
      );
    }
    if (scope === 'inventory') {
      const v = r as unknown as InventoryRow;
      const available = v.onHand - v.committed;
      const availableClass = available < 0 ? 'text-error' : available < v.reorder ? 'text-qb-maroon' : '';
      return (
        <>
          <td className="px-3 py-2">
            <div className="font-medium">{v.product}</div>
            <div className="text-[11px] text-on-surface-variant font-mono">{v.sku}</div>
          </td>
          <td className="px-3 py-2 text-on-surface-variant">{v.warehouse}</td>
          <td className="px-3 py-2 font-mono text-on-surface-variant text-[11px]">{v.bin}</td>
          <td className="px-3 py-2 text-right tabular-nums">{v.onHand}</td>
          <td className="px-3 py-2 text-right tabular-nums text-on-surface-variant">{v.committed}</td>
          <td className={`px-3 py-2 text-right tabular-nums font-medium ${availableClass}`}>{available}</td>
          <td className="px-3 py-2 text-right tabular-nums text-on-surface-variant">{v.reorder}</td>
          <td className="px-3 py-2"><span className={`${styles.stat} ${statusClass(v.status)}`}>{v.status}</span></td>
        </>
      );
    }
    // returns
    const rr = r as unknown as ReturnRow;
    return (
      <>
        <td className="px-3 py-2 font-medium">{rr.id}</td>
        <td className="px-3 py-2">
          <div className="flex items-center gap-2">
            <div className={`${styles.avatar} ${avatarClass(rr.customer)}`}>{rr.customer[0]?.toUpperCase() || 'A'}</div>
            <div className="font-medium truncate">{rr.customer}</div>
          </div>
        </td>
        <td className="px-3 py-2 text-on-surface-variant">{rr.order}</td>
        <td className="px-3 py-2 text-on-surface-variant">{rr.reason}</td>
        <td className="px-3 py-2 text-right tabular-nums">{money(rr.refund)}</td>
        <td className="px-3 py-2"><span className={`${styles.stat} ${statusClass(rr.status)}`}>{rr.status}</span></td>
      </>
    );
  };

  const cfg = VIEWS[scope];
  const lastColIdx = cfg.cols.length - 2;
  const selectedCount = selected.size;

  return (
    <div className="bg-background font-sans text-body-md text-on-surface antialiased min-h-screen">
      {/* ══ PAGE HEADER ══ */}
      <div className="px-6 pt-4">
        <div className="flex items-start justify-between gap-4 py-4 flex-wrap">
          <div>
            <h1 className="text-headline-lg">Orders</h1>
            <p className="text-body-sm text-on-surface-variant mt-0.5">All orders across channels · SLAs enforced</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className={`${styles.splitBtn} flex`}>
              <button
                className="h-8 px-3 bg-primary text-white text-body-md font-semibold hover:bg-primary-container flex items-center gap-1 split-btn-main"
                onClick={() => topAction('create')}
              >
                <span className="material-symbols-outlined text-[16px]">add</span>Create order
              </button>
              <button
                className="h-8 px-1.5 bg-primary text-white hover:bg-primary-container split-btn-arrow"
                onClick={() => showToast('Create options: Sales order / Refund / RMA / Manual')}
              >
                <span className="material-symbols-outlined text-[16px]">expand_more</span>
              </button>
            </div>
            <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low flex items-center gap-1" onClick={() => topAction('report')}>
              <span className="material-symbols-outlined text-[16px]">report_problem</span>Report a problem
            </button>
            <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low flex items-center gap-1" onClick={() => topAction('batch')}>
              <span className="material-symbols-outlined text-[16px]">receipt</span>Batch slips
            </button>
            <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low flex items-center gap-1" onClick={() => topAction('pick')}>
              <span className="material-symbols-outlined text-[16px]">checklist</span>Pick list
            </button>
          </div>
        </div>
      </div>

      <main className="px-6 pb-12">
        {/* ══ KPI STRIP ══ */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-5">
          {kpis.map((k, idx) => (
            <div key={idx} className="bg-white rounded-xl border border-surface-dim p-3">
              <div className="text-[10px] text-on-surface-variant uppercase tracking-wider font-bold flex items-center gap-1">
                <span className="material-symbols-outlined text-[13px]">{k.i}</span>{k.l}
              </div>
              <div className={`text-headline-sm mt-1 tabular-nums ${k.c || ''}`}>{k.v}</div>
              <div className="text-[11px] text-on-surface-variant mt-0.5">{k.d}</div>
            </div>
          ))}
        </div>

        {/* ══ THE ONE TABLE ══ */}
        <div className="bg-white rounded-xl shadow-sm border border-surface-dim overflow-hidden">
          {/* SCOPE TOGGLES */}
          <div className="px-4 py-3 border-b border-surface-dim bg-surface-container-lowest flex items-center gap-2">
            <span className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider mr-2">View Scope:</span>
            {(Object.keys(VIEWS) as Scope[]).map((s) => (
              <button
                key={s}
                className={`px-3 py-1.5 rounded-md text-[13px] font-semibold transition-colors ${styles.viewToggle} ${scope === s ? `${styles.viewToggleActive} text-primary` : 'text-on-surface-variant hover:bg-surface-container'}`}
                onClick={() => changeScope(s)}
              >
                {VIEWS[s].title}
              </button>
            ))}
          </div>

          {/* STATUS TABS */}
          <div className="flex items-center gap-1 px-4 h-11 border-b border-surface-dim overflow-x-auto">
            {cfg.statuses.map((s) => (
              <button
                key={s}
                className={`h-full px-3 text-label-md ${styles.tabUnderline} ${status === s ? `${styles.tabUnderlineActive}` : 'text-on-surface-variant'}`}
                onClick={() => setStatus(s)}
              >
                {s} <span className="ml-1 text-[10px] text-outline">{tabCount(s)}</span>
              </button>
            ))}
          </div>

          {/* FILTER BAR */}
          <div className="px-4 py-2 flex items-center gap-2 border-b border-surface-dim flex-wrap">
            <div className="relative flex items-center flex-1 max-w-sm min-w-[180px]">
              <span className="material-symbols-outlined absolute left-2 text-[15px] text-outline">search</span>
              <input
                className="w-full h-7 pl-7 pr-2 bg-surface-container-low border border-surface-dim rounded text-body-sm focus:outline-none focus:border-primary"
                placeholder="Search..."
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
            <button className="h-7 px-2 border border-surface-dim rounded text-label-sm hover:bg-surface-container-low flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px]">filter_list</span>Filter
            </button>
            <button className="h-7 px-2 border border-surface-dim rounded text-label-sm hover:bg-surface-container-low flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px]">calendar_today</span>Date
            </button>
            <span className="ml-auto text-[11px] text-on-surface-variant">
              {loaded ? `${filtered.length} of ${data.length}` : '—'}
            </span>
          </div>

          {/* BULK BAR */}
          <div className={`${styles.bulkBar} ${selectedCount > 0 ? styles.bulkBarShow : ''}`}>
            <span className="text-[12px] font-semibold">{selectedCount} selected</span>
            <span className="w-px h-4 bg-white/30" />
            <div className="flex items-center gap-1">
              {cfg.bulk.map((b) => (
                <button
                  key={b.a}
                  className={b.danger ? styles.bulkBarDanger : ''}
                  onClick={() => runBulk(b.l)}
                >
                  {b.l}
                </button>
              ))}
            </div>
            <button className="ml-auto" onClick={() => setSelected(new Set())}>
              <span className="material-symbols-outlined text-[16px]">close</span>
            </button>
          </div>

          {/* DYNAMIC TABLE */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-body-sm">
              <thead className="bg-surface-container-low text-label-sm text-on-surface-variant uppercase tracking-wider">
                <tr>
                  <th className="w-8 px-3 py-2">
                    <input
                      type="checkbox"
                      className={styles.rowCheck}
                      checked={allChecked}
                      onChange={(e) => toggleAll(e.target.checked)}
                    />
                  </th>
                  {cfg.cols.map((c, i) => (
                    <th key={c} className={`px-3 py-2 ${i === lastColIdx ? 'text-right' : ''}`}>{c}</th>
                  ))}
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-dim">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={cfg.cols.length + 2} className="px-3 py-12 text-center text-on-surface-variant">
                      {loaded ? 'No rows match the current filters.' : 'Loading...'}
                    </td>
                  </tr>
                ) : (
                  filtered.map((r) => {
                    const id = rowIdOf(r);
                    const isSel = selected.has(id);
                    return (
                      <tr
                        key={id}
                        className={`hover:bg-surface-container-low cursor-pointer ${isSel ? 'bg-surface-container-low' : ''}`}
                        onClick={(e) => {
                          if ((e.target as HTMLElement).closest('input,button')) return;
                          openDrawer(id);
                        }}
                      >
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            className={styles.rowCheck}
                            checked={isSel}
                            onChange={() => toggleRow(id)}
                            onClick={(e) => e.stopPropagation()}
                          />
                        </td>
                        {renderRowCells(r)}
                        <td className="px-2 py-2 text-right">
                          <button
                            className="w-6 h-6 rounded hover:bg-surface-container flex items-center justify-center"
                            onClick={(e) => openRowMenu(e, id)}
                          >
                            <span className="material-symbols-outlined text-[16px] text-on-surface-variant">more_horiz</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {/* ══ ROW MENU ══ */}
      {rowMenu && (
        <div
          ref={rowMenuRef}
          className={`${styles.rowMenu} ${styles.rowMenuOpen}`}
          style={{ top: rowMenu.y, left: rowMenu.x }}
        >
          {cfg.menu.map((m, idx) => {
            if ('section' in m) {
              return m.section ? (
                <div key={idx} className={styles.menuHeader}>{m.section}</div>
              ) : (
                <div key={idx} className={styles.sep} />
              );
            }
            return (
              <button
                key={idx}
                className={m.danger ? 'danger' : ''}
                onClick={() => handleRowAction(m.a, rowMenu.rowId)}
              >
                <span className="material-symbols-outlined">{m.i}</span>
                {m.l}
              </button>
            );
          })}
        </div>
      )}

      {/* ══ DRAWER ══ */}
      <div
        className={`${styles.drawerScrim} ${drawer ? styles.drawerScrimOpen : ''}`}
        onClick={() => setDrawer(null)}
      />
      <div className={`${styles.drawer} ${drawer ? styles.drawerOpen : ''}`}>
        {drawer && (
          <>
            <div className="flex items-center justify-between px-5 h-14 border-b border-surface-dim shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <span className="material-symbols-outlined text-[20px] text-primary">{drawer.icon}</span>
                <div className="min-w-0">
                  <div className="text-headline-sm truncate">{drawer.title}</div>
                  <div className="text-[11px] text-on-surface-variant">{drawer.sub}</div>
                </div>
              </div>
              <button
                className="w-8 h-8 rounded hover:bg-surface-container flex items-center justify-center"
                onClick={() => setDrawer(null)}
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {drawer.body}
            </div>
            <div className="h-14 border-t border-surface-dim px-4 flex items-center justify-between shrink-0">
              {drawer.footer}
            </div>
          </>
        )}
      </div>

      {/* ══ TOAST (local fallback) ══ */}
      <div className={`${styles.toast} ${toastMsg ? styles.toastShow : ''}`}>{toastMsg}</div>
    </div>
  );
}
