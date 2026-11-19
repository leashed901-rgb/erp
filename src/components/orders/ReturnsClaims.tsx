'use client';

import { useState, useEffect, useCallback } from 'react';
import { DomainKey } from '@/data/shellData';
import { fetchJson } from '@/hooks/useCrmApi';
import RowMenu, { RowMenuItem, BulkBar } from '@/components/ListPrimitives';
import styles from './OrdersPages.module.css';

interface OrdersScreenProps {
  onNavigate: (domain: DomainKey, screenId: string) => void;
  onToast: (msg: string) => void;
  onCreate?: (label: string) => void;
  onOpenCreateFlyout?: () => void;
  onOpenPeek?: (title: string, details: Record<string, string | number>) => void;
}

interface RmaRow {
  id: string; rma_number: string; order_id: string; order_number: string | null;
  crm_customer_id: string | null; customer: string | null; status: string;
  reason_code: string | null; requested_at: string; approved_at: string | null;
  received_at: string | null; completed_at: string | null; notes: string | null;
  refund_total: number; items: number;
}
interface RmaLine {
  id: string; order_line_id: string; description: string | null; sku: string | null;
  quantity_requested: number; quantity_received: number; quantity_approved: number;
  disposition: string | null; refund_amount: number | null;
}
interface Inspection { id: string; return_line_id: string; condition_code: string | null; disposition: string; notes: string | null; inspected_at: string | null }
interface Refund { id: string; amount: number; currency: string; status: string; payment_reference: string | null; processed_at: string | null }
interface RmaDetail extends RmaRow {
  order_total: number | null; order_amount_paid: number | null; order_amount_refunded: number | null;
  lines: RmaLine[]; inspections: Inspection[]; refunds: Refund[];
}
interface ReturnableOrder {
  id: string; order_number: string; status: string; currency: string; total: number; amount_paid: number;
  customer: string | null; customer_email: string | null;
  lines: { id: string; description: string | null; quantity: number; unit_price: number; line_total: number; remaining: number }[];
}
interface Policy { id: string; scope: string; category_label: string | null; window_days: number; is_legal_minimum: boolean; notes: string | null; is_active: boolean }

const STATUS_TABS = ['All', 'requested', 'approved', 'received', 'completed', 'declined', 'refunded'] as const;
const STATUS_LABELS: Record<string, string> = {
  requested: 'Requested', approved: 'Approved', received: 'Received', completed: 'Completed', declined: 'Declined',
};

const money = (n: number | null | undefined) =>
  n == null ? '—' : `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function ReturnsClaims({ onToast }: OrdersScreenProps) {
  const [rows, setRows] = useState<RmaRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>('All');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [detail, setDetail] = useState<RmaDetail | null>(null);
  const [decisionRma, setDecisionRma] = useState<RmaRow | null>(null);
  const [decisionKind, setDecisionKind] = useState<'approve' | 'decline'>('approve');
  const [decisionReason, setDecisionReason] = useState('');
  const [decisionBusy, setDecisionBusy] = useState(false);
  const [receiveRma, setReceiveRma] = useState<RmaDetail | null>(null);
  const [receiveQtys, setReceiveQtys] = useState<Record<string, string>>({});
  const [receiveDisps, setReceiveDisps] = useState<Record<string, string>>({});
  const [receiveRefund, setReceiveRefund] = useState(true);
  const [receiveBusy, setReceiveBusy] = useState(false);
  const [refundRma, setRefundRma] = useState<RmaRow | null>(null);
  const [refundAmount, setRefundAmount] = useState('');
  const [refundReason, setRefundReason] = useState('');
  const [refundBusy, setRefundBusy] = useState(false);
  const [inspectRma, setInspectRma] = useState<RmaDetail | null>(null);
  const [inspectLine, setInspectLine] = useState('');
  const [inspectDisp, setInspectDisp] = useState('restock');
  const [inspectCondition, setInspectCondition] = useState('');
  const [inspectNotes, setInspectNotes] = useState('');
  const [inspectBusy, setInspectBusy] = useState(false);

  const [newOpen, setNewOpen] = useState(false);
  const [orders, setOrders] = useState<ReturnableOrder[]>([]);
  const [ordersLoaded, setOrdersLoaded] = useState(false);
  const [pickOrderId, setPickOrderId] = useState('');
  const [pickQtys, setPickQtys] = useState<Record<string, string>>({});
  const [pickReason, setPickReason] = useState('');
  const [pickNotes, setPickNotes] = useState('');
  const [pickBusy, setPickBusy] = useState(false);

  const [policiesOpen, setPoliciesOpen] = useState(false);
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [policyScope, setPolicyScope] = useState('global');
  const [policyLabel, setPolicyLabel] = useState('');
  const [policyDays, setPolicyDays] = useState('');
  const [policyLegal, setPolicyLegal] = useState(false);
  const [policyBusy, setPolicyBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetchJson<{ data: RmaRow[] }>(
      `/api/v1/returns${activeTab !== 'All' ? `?status=${activeTab}` : ''}`,
    );
    if (!res.ok) setLoadError(res.error || 'Failed to load returns');
    else { setRows(res.data.data); setLoadError(null); }
    setLoaded(true);
  }, [activeTab]);
  useEffect(() => { load(); }, [load]);

  async function loadOrders() {
    setOrdersLoaded(false);
    const res = await fetchJson<{ data: ReturnableOrder[] }>('/api/v1/returns/orders');
    if (res.ok && res.data) setOrders(res.data.data);
    setOrdersLoaded(true);
  }

  async function loadPolicies() {
    const res = await fetchJson<{ data: Policy[] }>('/api/v1/returns/policies');
    if (res.ok && res.data) setPolicies(res.data.data);
  }

  async function openDetail(id: string) {
    const res = await fetchJson<{ data: RmaDetail }>(`/api/v1/returns/${id}`);
    if (!res.ok) onToast(`Could not open RMA: ${res.error}`);
    else setDetail(res.data.data);
  }

  async function submitDecision() {
    if (!decisionRma) return;
    if (decisionKind === 'decline' && !decisionReason.trim()) { onToast('A reason is required to decline a return'); return; }
    setDecisionBusy(true);
    const res = await fetchJson<{ data: RmaRow }>(`/api/v1/returns/${decisionRma.id}/decision`, {
      method: 'POST',
      body: JSON.stringify({ decision: decisionKind, reason: decisionReason.trim() || undefined }),
    });
    setDecisionBusy(false);
    if (!res.ok) { onToast(`Decision failed: ${res.error}`); return; }
    onToast(`RMA ${decisionRma.rma_number} ${decisionKind === 'approve' ? 'approved' : 'declined'}`);
    setDecisionRma(null); setDecisionReason('');
    load();
    if (detail?.id === decisionRma.id) openDetail(decisionRma.id);
  }

  async function submitReceive() {
    if (!receiveRma) return;
    const lines = receiveRma.lines
      .filter(l => (receiveQtys[l.id] ?? '') !== '')
      .map(l => ({
        return_line_id: l.id,
        quantity: Number(receiveQtys[l.id]),
        disposition: receiveDisps[l.id] || l.disposition || 'restock',
      }));
    if (lines.length === 0) { onToast('Enter a received quantity on at least one line'); return; }
    setReceiveBusy(true);
    const res = await fetchJson<{ data: { restocked?: number; refunded?: number } }>(`/api/v1/returns/${receiveRma.id}/receive`, {
      method: 'POST',
      body: JSON.stringify({ lines, refund: receiveRefund }),
    });
    setReceiveBusy(false);
    if (!res.ok) { onToast(`Receive failed: ${res.error}`); return; }
    const r = res.data?.data;
    onToast(`RMA ${receiveRma.rma_number} received — ${r?.restocked ?? 0} restocked${r?.refunded ? `, ${money(r.refunded)} refunded` : ''}`);
    setReceiveRma(null);
    load();
    setDetail(null);
  }

  async function submitRefund() {
    if (!refundRma) return;
    const amount = Number(refundAmount);
    if (!Number.isFinite(amount) || amount <= 0) { onToast('Enter a refund amount greater than 0'); return; }
    if (!refundReason.trim()) { onToast('A reason is required for refunds'); return; }
    setRefundBusy(true);
    const res = await fetchJson(`/api/v1/returns/${refundRma.id}/refund`, {
      method: 'POST',
      body: JSON.stringify({ amount, reason: refundReason.trim() }),
    });
    setRefundBusy(false);
    if (!res.ok) { onToast(`Refund failed: ${res.error}`); return; }
    onToast(`Refunded ${money(amount)} on RMA ${refundRma.rma_number}`);
    setRefundRma(null); setRefundAmount(''); setRefundReason('');
    load();
  }

  async function submitInspection() {
    if (!inspectRma || !inspectLine) { onToast('Pick a line to inspect'); return; }
    setInspectBusy(true);
    const res = await fetchJson(`/api/v1/returns/${inspectRma.id}/inspections`, {
      method: 'POST',
      body: JSON.stringify({ return_line_id: inspectLine, disposition: inspectDisp, condition_code: inspectCondition || undefined, notes: inspectNotes || undefined }),
    });
    setInspectBusy(false);
    if (!res.ok) { onToast(`Inspection failed: ${res.error}`); return; }
    onToast(`Inspection recorded — line disposition set to ${inspectDisp}`);
    setInspectNotes(''); setInspectCondition('');
    openDetail(inspectRma.id);
  }

  async function submitNewReturn() {
    const order = orders.find(o => o.id === pickOrderId);
    if (!order) { onToast('Pick an order to return from'); return; }
    const lines = order.lines
      .filter(l => (pickQtys[l.id] ?? '') !== '')
      .map(l => ({ order_line_id: l.id, quantity: Number(pickQtys[l.id]) }));
    if (lines.length === 0) { onToast('Enter a quantity on at least one line'); return; }
    if (lines.some(l => !Number.isFinite(l.quantity) || l.quantity <= 0)) { onToast('Quantities must be greater than 0'); return; }
    setPickBusy(true);
    const res = await fetchJson<{ data: { rma_number: string } }>('/api/v1/returns', {
      method: 'POST',
      body: JSON.stringify({ order_id: order.id, lines, reason_code: pickReason || undefined, notes: pickNotes || undefined }),
    });
    setPickBusy(false);
    if (!res.ok) { onToast(`Return failed: ${res.error}`); return; }
    onToast(`Return ${res.data?.data.rma_number} opened for ${order.order_number}`);
    setNewOpen(false); setPickOrderId(''); setPickQtys({}); setPickReason(''); setPickNotes('');
    load();
  }

  async function submitPolicy() {
    const days = Number(policyDays);
    if (!Number.isFinite(days) || days < 1 || days > 3650) { onToast('Window must be 1–3650 days'); return; }
    if (policyScope === 'category' && !policyLabel.trim()) { onToast('A category label is required for a category-scoped rule'); return; }
    setPolicyBusy(true);
    const res = await fetchJson('/api/v1/returns/policies', {
      method: 'POST',
      body: JSON.stringify({
        scope: policyScope,
        category_label: policyScope === 'category' ? policyLabel.trim() : null,
        window_days: days,
        is_legal_minimum: policyLegal,
      }),
    });
    setPolicyBusy(false);
    if (!res.ok) { onToast(`Policy failed: ${res.error}`); return; }
    onToast(`Policy rule added — ${policyScope} · ${days} days`);
    setPolicyDays(''); setPolicyLabel(''); setPolicyLegal(false);
    loadPolicies();
  }

  async function bulkDecide(kind: 'approve' | 'decline') {
    const targets = rows.filter(r => selected.has(r.id) && r.status === 'requested');
    if (targets.length === 0) { onToast('Select requested RMAs to decide'); return; }
    if (kind === 'decline' && !confirm('Decline the selected RMAs without a reason? Use a row menu to decline with a reason.')) return;
    let ok = 0; let lastErr = '';
    for (const r of targets) {
      const res = await fetchJson(`/api/v1/returns/${r.id}/decision`, {
        method: 'POST',
        body: JSON.stringify({ decision: kind }),
      });
      if (res.ok) ok++; else lastErr = res.error || '';
    }
    onToast(ok === targets.length ? `${ok} RMA(s) ${kind === 'approve' ? 'approved' : 'declined'}` : `${ok} of ${targets.length} done — ${lastErr}`);
    setSelected(new Set());
    load();
  }

  const filtered = rows.filter(row => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (row.rma_number || '').toLowerCase().includes(q)
      || (row.customer || '').toLowerCase().includes(q)
      || (row.order_number || '').toLowerCase().includes(q);
  });

  const openCount = rows.filter(r => r.status === 'requested').length;
  const approvedCount = rows.filter(r => r.status === 'approved').length;
  const completedCount = rows.filter(r => r.status === 'completed').length;
  const refundedTotal = rows.reduce((s, r) => s + (r.refund_total || 0), 0);

  const toggleSelect = (id: string) =>
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const rowMenuItems = (row: RmaRow): RowMenuItem[] => {
    const items: RowMenuItem[] = [
      { label: 'View details', icon: 'open_in_new', onClick: () => openDetail(row.id) },
    ];
    if (row.status === 'requested') {
      items.push(
        { label: 'Approve', icon: 'check_circle', onClick: () => { setDecisionRma(row); setDecisionKind('approve'); setDecisionReason(''); } },
        { label: 'Decline', icon: 'cancel', onClick: () => { setDecisionRma(row); setDecisionKind('decline'); setDecisionReason(''); } },
      );
    }
    if (row.status === 'approved') {
      items.push({ label: 'Receive items', icon: 'package_2', onClick: async () => {
        const res = await fetchJson<{ data: RmaDetail }>(`/api/v1/returns/${row.id}`);
        if (!res.ok) onToast(`Could not open receive: ${res.error}`);
        else {
          setReceiveRma(res.data.data);
          setReceiveQtys(Object.fromEntries(res.data.data.lines.map(l => [l.id, String(l.quantity_approved)])));
          setReceiveDisps(Object.fromEntries(res.data.data.lines.map(l => [l.id, l.disposition || 'restock'])));
          setReceiveRefund(true);
        }
      } });
    }
    if (['approved', 'received', 'completed'].includes(row.status)) {
      items.push({ label: 'Add inspection', icon: 'fact_check', onClick: async () => {
        const res = await fetchJson<{ data: RmaDetail }>(`/api/v1/returns/${row.id}`);
        if (!res.ok) onToast(`Could not open inspections: ${res.error}`);
        else { setInspectRma(res.data.data); setInspectLine(res.data.data.lines[0]?.id ?? ''); }
      } });
      items.push({ label: 'Issue refund', icon: 'payments', dividerBefore: true, onClick: () => { setRefundRma(row); setRefundAmount(''); setRefundReason(''); } });
    }
    return items;
  };

  return (
    <div className={styles.container}>
      <div className={styles.contextHeader}>
        <div className={styles.contextLeft}>
          <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#5a6355' }}>local_shipping</span>
          <span className={styles.contextLabel}>Orders</span>
          <span className={styles.contextSep}>/</span>
          <span className={styles.contextActive}>Returns</span>
        </div>
      </div>

      <div className={styles.pageBody}>
        <div className={styles.pageHeader}>
          <div>
            <h1 className={styles.pageTitle}>Returns & Claims</h1>
            <p className={styles.pageSubtitle}>Manage return requests, inspections, restock, refunds, and exchange resolution</p>
          </div>
          <div className={styles.headerActions}>
            <button className={styles.btnSecondary} onClick={() => { setPoliciesOpen(!policiesOpen); if (!policiesOpen) loadPolicies(); }}>
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>policy</span>
              Policy rules
            </button>
            <button className={styles.btnPrimary} onClick={() => { setNewOpen(true); loadOrders(); }}>
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add</span>
              New return
            </button>
          </div>
        </div>

        {loadError && (
          <div className="border border-surface-dim rounded-lg p-4 text-body-sm mb-4" style={{ background: '#fdecea' }}>{loadError}</div>
        )}

        {policiesOpen && (
          <div className={styles.tableCard} style={{ padding: 16, marginBottom: 12 }}>
            <h3 style={{ fontWeight: 600, marginBottom: 8 }}>Return policy rules</h3>
            {policies.length === 0
              ? <p className="text-body-sm text-on-surface-variant">No policy rules yet — add a global window below.</p>
              : <ul className="text-body-sm" style={{ marginBottom: 12 }}>
                  {policies.map(p => (
                    <li key={p.id} style={{ padding: '4px 0' }}>
                      <strong>{p.scope === 'global' ? 'Global' : `Category: ${p.category_label ?? '—'}`}</strong> · {p.window_days} days
                      {p.is_legal_minimum ? ' · legal minimum' : ''} · {p.is_active ? 'active' : 'inactive'}
                      {p.notes ? ` · ${p.notes}` : ''}
                    </li>
                  ))}
                </ul>}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <select className={styles.filterSelect} value={policyScope} onChange={e => setPolicyScope(e.target.value)}>
                <option value="global">Global</option>
                <option value="category">Category</option>
              </select>
              {policyScope === 'category' && (
                <input className={styles.filterInput} placeholder="Category label" value={policyLabel} onChange={e => setPolicyLabel(e.target.value)} style={{ maxWidth: 200 }} />
              )}
              <input className={styles.filterInput} type="number" placeholder="Window (days)" value={policyDays} onChange={e => setPolicyDays(e.target.value)} style={{ maxWidth: 140 }} />
              <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13 }}>
                <input type="checkbox" checked={policyLegal} onChange={e => setPolicyLegal(e.target.checked)} /> Legal minimum
              </label>
              <button className={styles.btnSecondary} disabled={policyBusy} onClick={submitPolicy}>{policyBusy ? 'Adding…' : 'Add rule'}</button>
            </div>
          </div>
        )}

        <div className={styles.kpiGrid}>
          <button className={styles.kpiTile} onClick={() => setActiveTab('requested')}>
            <div className={styles.kpiValue} style={{ color: '#6b1e28' }}>{openCount}</div>
            <div className={styles.kpiLabel}>Awaiting approval</div>
            <div className={styles.kpiDelta}>Status: requested</div>
          </button>
          <button className={styles.kpiTile} onClick={() => setActiveTab('approved')}>
            <div className={styles.kpiValue} style={{ color: '#1e5a38' }}>{approvedCount}</div>
            <div className={styles.kpiLabel}>Approved — awaiting receipt</div>
            <div className={styles.kpiDelta}>Receive to restock + refund</div>
          </button>
          <button className={styles.kpiTile} onClick={() => setActiveTab('completed')}>
            <div className={styles.kpiValue}>{completedCount}</div>
            <div className={styles.kpiLabel}>Completed returns</div>
            <div className={styles.kpiDelta}>{rows.length} total RMAs</div>
          </button>
          <div className={styles.kpiTile}>
            <div className={styles.kpiValue}>{money(refundedTotal)}</div>
            <div className={styles.kpiLabel}>Refunded (this list)</div>
            <div className={styles.kpiDelta}>Sum of RMA refund totals</div>
          </div>
        </div>

        <div className={styles.tableCard}>
          <div className={styles.viewTabsBar}>
            {STATUS_TABS.map(tab => (
              <button key={tab} className={`${styles.viewTab} ${activeTab === tab ? styles.viewTabActive : ''}`} onClick={() => setActiveTab(tab)}>
                {tab === 'All' ? 'All' : STATUS_LABELS[tab]}
              </button>
            ))}
          </div>

          <div className={styles.filterBar}>
            <div className={styles.filterInputWrap}>
              <span className={`material-symbols-outlined ${styles.filterInputIcon}`}>search</span>
              <input className={styles.filterInput} placeholder="Filter by RMA, customer, order…" type="text" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <span className={styles.filterCount}>{selected.size > 0 ? `${selected.size} selected` : `${filtered.length} return${filtered.length === 1 ? '' : 's'}`}</span>
          </div>

          {selected.size > 0 && (
            <BulkBar
              selectedIds={Array.from(selected)}
              onClear={() => setSelected(new Set())}
              actions={[
                { label: 'Approve', icon: 'check_circle', onClick: () => bulkDecide('approve') },
                { label: 'Decline', icon: 'cancel', onClick: () => bulkDecide('decline') },
              ]}
            />
          )}

          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.checkCell}><input type="checkbox" checked={selected.size === filtered.length && filtered.length > 0} onChange={() => setSelected(prev => prev.size === filtered.length ? new Set() : new Set(filtered.map(r => r.id)))} /></th>
                <th>RMA</th>
                <th>Customer</th>
                <th>Order</th>
                <th>Reason</th>
                <th style={{ textAlign: 'right' }}>Items</th>
                <th style={{ textAlign: 'right' }}>Refund</th>
                <th>Status</th>
                <th>Requested</th>
                <th className={styles.actionCell}></th>
              </tr>
            </thead>
            <tbody>
              {!loaded ? (
                <tr><td colSpan={10} className={styles.emptyState}>Loading returns…</td></tr>
              ) : filtered.map(row => (
                <tr key={row.id} className={`${styles.tableRow} ${selected.has(row.id) ? styles.tableRowSelected : ''}`}>
                  <td className={styles.checkCell}><input type="checkbox" checked={selected.has(row.id)} onChange={() => toggleSelect(row.id)} /></td>
                  <td><button style={{ fontWeight: 600, color: '#1a1c1e' }} onClick={() => openDetail(row.id)}>{row.rma_number}</button></td>
                  <td>{row.customer ?? '—'}</td>
                  <td>{row.order_number ?? '—'}</td>
                  <td>{row.reason_code ?? '—'}</td>
                  <td style={{ textAlign: 'right' }}>{row.items}</td>
                  <td style={{ textAlign: 'right' }}>{money(row.refund_total)}</td>
                  <td><span className={styles.statusPill} data-status={STATUS_LABELS[row.status] ?? row.status}>{STATUS_LABELS[row.status] ?? row.status}</span></td>
                  <td>{row.requested_at ? row.requested_at.slice(0, 10) : '—'}</td>
                  <td className={styles.actionCell}><RowMenu items={rowMenuItems(row)} /></td>
                </tr>
              ))}
              {loaded && filtered.length === 0 && (
                <tr><td colSpan={10} className={styles.emptyState}>No returns match — open one from a returnable order with "New return".</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* RMA detail drawer */}
      {detail && (
        <div className="modal-scrim open" onClick={() => setDetail(null)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-1">
              <div>
                <h3 className="text-headline-sm">{detail.rma_number}</h3>
                <div className="text-[12px] text-on-surface-variant">
                  {detail.customer ?? '—'} · Order {detail.order_number ?? '—'} · {STATUS_LABELS[detail.status] ?? detail.status}
                </div>
              </div>
              <button className="w-8 h-8 rounded hover:bg-surface-container flex items-center justify-center" onClick={() => setDetail(null)} aria-label="Close">
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>
            <div className="text-body-sm mt-3 space-y-1">
              <div><strong>Reason:</strong> {detail.reason_code ?? '—'}</div>
              {detail.notes && <div><strong>Notes:</strong> {detail.notes}</div>}
              <div><strong>Order:</strong> total {money(detail.order_total)} · paid {money(detail.order_amount_paid)} · refunded {money(detail.order_amount_refunded)}</div>
              <div><strong>Timeline:</strong> requested {detail.requested_at.slice(0, 10)}
                {detail.approved_at ? ` · approved ${detail.approved_at.slice(0, 10)}` : ''}
                {detail.received_at ? ` · received ${detail.received_at.slice(0, 10)}` : ''}
                {detail.completed_at ? ` · completed ${detail.completed_at.slice(0, 10)}` : ''}</div>
            </div>
            <h4 className="font-semibold mt-4 mb-2 text-body-sm">Lines</h4>
            <div className="border border-surface-dim rounded-lg divide-y divide-surface-dim">
              {detail.lines.map(l => (
                <div key={l.id} className="px-3 py-2 text-body-sm">
                  <div className="font-medium">{l.description ?? l.sku ?? '—'}</div>
                  <div className="text-[11px] text-on-surface-variant font-mono">{l.sku ?? '—'} · requested {l.quantity_requested} · approved {l.quantity_approved} · received {l.quantity_received} · {l.disposition ?? '—'} · refund {money(l.refund_amount)}</div>
                </div>
              ))}
              {detail.lines.length === 0 && <div className="px-3 py-2 text-body-sm text-on-surface-variant">No lines.</div>}
            </div>
            {detail.inspections.length > 0 && (
              <>
                <h4 className="font-semibold mt-4 mb-2 text-body-sm">Inspections</h4>
                <div className="border border-surface-dim rounded-lg divide-y divide-surface-dim">
                  {detail.inspections.map(i => (
                    <div key={i.id} className="px-3 py-2 text-body-sm">
                      {i.disposition}{i.condition_code ? ` · ${i.condition_code}` : ''}{i.notes ? ` · ${i.notes}` : ''}
                      <span className="text-[11px] text-on-surface-variant"> · {i.inspected_at ? i.inspected_at.slice(0, 10) : ''}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
            {detail.refunds.length > 0 && (
              <>
                <h4 className="font-semibold mt-4 mb-2 text-body-sm">Refunds</h4>
                <div className="border border-surface-dim rounded-lg divide-y divide-surface-dim">
                  {detail.refunds.map(r => (
                    <div key={r.id} className="px-3 py-2 text-body-sm">
                      {money(r.amount)} {r.currency} · {r.status}{r.payment_reference ? ` · ${r.payment_reference}` : ''}
                    </div>
                  ))}
                </div>
              </>
            )}
            <div className="flex justify-end gap-2 mt-4">
              {detail.status === 'requested' && (
                <>
                  <button className="h-8 px-3 border border-surface-dim rounded" onClick={() => { setDecisionRma(detail); setDecisionKind('decline'); setDecisionReason(''); }}>Decline</button>
                  <button className="h-8 px-4 bg-primary text-white rounded font-semibold" onClick={() => { setDecisionRma(detail); setDecisionKind('approve'); setDecisionReason(''); }}>Approve</button>
                </>
              )}
              {detail.status === 'approved' && (
                <button className="h-8 px-4 bg-primary text-white rounded font-semibold" onClick={() => {
                  setReceiveRma(detail);
                  setReceiveQtys(Object.fromEntries(detail.lines.map(l => [l.id, String(l.quantity_approved)])));
                  setReceiveDisps(Object.fromEntries(detail.lines.map(l => [l.id, l.disposition || 'restock'])));
                  setReceiveRefund(true);
                }}>Receive items</button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Approve / decline modal */}
      {decisionRma && (
        <div className="modal-scrim open" onClick={() => setDecisionRma(null)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-5" onClick={e => e.stopPropagation()}>
            <h3 className="text-headline-sm">{decisionKind === 'approve' ? 'Approve return' : 'Decline return'} — {decisionRma.rma_number}</h3>
            <p className="text-body-sm text-on-surface-variant mt-1 mb-3">
              {decisionKind === 'approve'
                ? 'Approving sets the approved quantity per line and lets the warehouse receive the items.'
                : 'Declining requires a reason, which is recorded on the RMA.'}
            </p>
            <label className="text-label-sm">Reason{decisionKind === 'decline' ? ' (required)' : ' (optional)'}</label>
            <input className="w-full h-9 px-3 border border-surface-dim rounded mt-1 mb-4" placeholder={decisionKind === 'decline' ? 'e.g. Outside the return window' : 'Optional note'} value={decisionReason} onChange={e => setDecisionReason(e.target.value)} />
            <div className="flex justify-end gap-2">
              <button className="h-8 px-3 border border-surface-dim rounded" onClick={() => setDecisionRma(null)}>Cancel</button>
              <button className="h-8 px-4 bg-primary text-white rounded font-semibold" disabled={decisionBusy} onClick={submitDecision}>{decisionBusy ? 'Saving…' : decisionKind === 'approve' ? 'Approve' : 'Decline'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Receive drawer */}
      {receiveRma && (
        <div className="modal-scrim open" onClick={() => setReceiveRma(null)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-5" onClick={e => e.stopPropagation()}>
            <h3 className="text-headline-sm">Receive items — {receiveRma.rma_number}</h3>
            <p className="text-body-sm text-on-surface-variant mt-1 mb-3">Restock dispositions move stock back into the default warehouse. Refunds post when enabled.</p>
            {receiveRma.lines.map(l => (
              <div key={l.id} className="flex items-center gap-3 py-2 border-b border-surface-dim text-body-sm">
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{l.description ?? l.sku ?? '—'}</div>
                  <div className="text-[11px] text-on-surface-variant">approved {l.quantity_approved} · refund {money(l.refund_amount)}</div>
                </div>
                <select className="h-8 px-2 border border-surface-dim rounded" value={receiveDisps[l.id] ?? 'restock'} onChange={e => setReceiveDisps(prev => ({ ...prev, [l.id]: e.target.value }))}>
                  <option value="restock">Restock</option>
                  <option value="damage">Damage</option>
                  <option value="scrap">Scrap</option>
                  <option value="repair">Repair</option>
                </select>
                <input className="w-20 h-8 px-2 border border-surface-dim rounded text-right tabular-nums" type="number" min={0} max={l.quantity_approved} value={receiveQtys[l.id] ?? ''} onChange={e => setReceiveQtys(prev => ({ ...prev, [l.id]: e.target.value }))} />
              </div>
            ))}
            <label className="flex items-center gap-2 mt-3 text-body-sm">
              <input type="checkbox" checked={receiveRefund} onChange={e => setReceiveRefund(e.target.checked)} /> Issue refund for received lines
            </label>
            <div className="flex justify-end gap-2 mt-4">
              <button className="h-8 px-3 border border-surface-dim rounded" onClick={() => setReceiveRma(null)}>Cancel</button>
              <button className="h-8 px-4 bg-primary text-white rounded font-semibold" disabled={receiveBusy} onClick={submitReceive}>{receiveBusy ? 'Receiving…' : 'Receive'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Refund modal */}
      {refundRma && (
        <div className="modal-scrim open" onClick={() => setRefundRma(null)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-5" onClick={e => e.stopPropagation()}>
            <h3 className="text-headline-sm">Issue refund — {refundRma.rma_number}</h3>
            <p className="text-body-sm text-on-surface-variant mt-1 mb-3">Refunds cannot exceed what the order has paid. The server enforces the cap.</p>
            <label className="text-label-sm">Amount (USD)</label>
            <input className="w-full h-9 px-3 border border-surface-dim rounded mt-1 mb-3" type="number" step="0.01" placeholder="e.g. 30.00" value={refundAmount} onChange={e => setRefundAmount(e.target.value)} />
            <label className="text-label-sm">Reason (required)</label>
            <input className="w-full h-9 px-3 border border-surface-dim rounded mt-1 mb-4" placeholder="e.g. Defective print" value={refundReason} onChange={e => setRefundReason(e.target.value)} />
            <div className="flex justify-end gap-2">
              <button className="h-8 px-3 border border-surface-dim rounded" onClick={() => setRefundRma(null)}>Cancel</button>
              <button className="h-8 px-4 bg-primary text-white rounded font-semibold" disabled={refundBusy} onClick={submitRefund}>{refundBusy ? 'Refunding…' : 'Issue refund'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Inspection form */}
      {inspectRma && (
        <div className="modal-scrim open" onClick={() => setInspectRma(null)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-5" onClick={e => e.stopPropagation()}>
            <h3 className="text-headline-sm">Add inspection — {inspectRma.rma_number}</h3>
            <p className="text-body-sm text-on-surface-variant mt-1 mb-3">The line's disposition is updated so receiving honors it.</p>
            <label className="text-label-sm">Line</label>
            <select className="w-full h-9 px-2 border border-surface-dim rounded mt-1 mb-3" value={inspectLine} onChange={e => setInspectLine(e.target.value)}>
              {inspectRma.lines.map(l => <option key={l.id} value={l.id}>{l.description ?? l.sku ?? l.id} (requested {l.quantity_requested})</option>)}
            </select>
            <label className="text-label-sm">Disposition</label>
            <select className="w-full h-9 px-2 border border-surface-dim rounded mt-1 mb-3" value={inspectDisp} onChange={e => setInspectDisp(e.target.value)}>
              <option value="restock">Restock</option>
              <option value="damage">Damage</option>
              <option value="scrap">Scrap</option>
              <option value="repair">Repair</option>
            </select>
            <label className="text-label-sm">Condition (optional)</label>
            <input className="w-full h-9 px-3 border border-surface-dim rounded mt-1 mb-3" placeholder="e.g. Like new, minor scuff" value={inspectCondition} onChange={e => setInspectCondition(e.target.value)} />
            <label className="text-label-sm">Notes (optional)</label>
            <input className="w-full h-9 px-3 border border-surface-dim rounded mt-1 mb-4" placeholder="Inspection notes" value={inspectNotes} onChange={e => setInspectNotes(e.target.value)} />
            <div className="flex justify-end gap-2">
              <button className="h-8 px-3 border border-surface-dim rounded" onClick={() => setInspectRma(null)}>Cancel</button>
              <button className="h-8 px-4 bg-primary text-white rounded font-semibold" disabled={inspectBusy} onClick={submitInspection}>{inspectBusy ? 'Saving…' : 'Record inspection'}</button>
            </div>
          </div>
        </div>
      )}

      {/* New return */}
      {newOpen && (
        <div className="modal-scrim open" onClick={() => setNewOpen(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-5" onClick={e => e.stopPropagation()}>
            <h3 className="text-headline-sm">New return</h3>
            <p className="text-body-sm text-on-surface-variant mt-1 mb-3">Pick an order with unreturned lines, then choose quantities.</p>
            {!ordersLoaded ? (
              <div className="text-body-sm text-on-surface-variant py-4">Loading returnable orders…</div>
            ) : orders.length === 0 ? (
              <div className="border border-surface-dim rounded-lg p-4 text-body-sm text-on-surface-variant">No orders have unreturned lines right now. Orders need ERP order lines with quantity left to return.</div>
            ) : (
              <>
                <label className="text-label-sm">Order</label>
                <select className="w-full h-9 px-2 border border-surface-dim rounded mt-1 mb-3" value={pickOrderId} onChange={e => { setPickOrderId(e.target.value); setPickQtys({}); }}>
                  <option value="">Pick an order…</option>
                  {orders.map(o => <option key={o.id} value={o.id}>{o.order_number} · {o.customer ?? o.customer_email ?? '—'} · {money(o.total)} · paid {money(o.amount_paid)}</option>)}
                </select>
                {pickOrderId && orders.find(o => o.id === pickOrderId)?.lines.map(l => (
                  <div key={l.id} className="flex items-center gap-3 py-2 border-b border-surface-dim text-body-sm">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{l.description ?? '—'}</div>
                      <div className="text-[11px] text-on-surface-variant">{money(l.unit_price)} each · {l.remaining} returnable</div>
                    </div>
                    <input className="w-20 h-8 px-2 border border-surface-dim rounded text-right tabular-nums" type="number" min={0} max={l.remaining} placeholder="Qty" value={pickQtys[l.id] ?? ''} onChange={e => setPickQtys(prev => ({ ...prev, [l.id]: e.target.value }))} />
                  </div>
                ))}
                <label className="text-label-sm mt-3">Reason code (optional)</label>
                <input className="w-full h-9 px-3 border border-surface-dim rounded mt-1 mb-3" placeholder="e.g. defective, wrong_size" value={pickReason} onChange={e => setPickReason(e.target.value)} />
                <label className="text-label-sm">Notes (optional)</label>
                <input className="w-full h-9 px-3 border border-surface-dim rounded mt-1 mb-4" placeholder="Customer notes" value={pickNotes} onChange={e => setPickNotes(e.target.value)} />
              </>
            )}
            <div className="flex justify-end gap-2">
              <button className="h-8 px-3 border border-surface-dim rounded" onClick={() => setNewOpen(false)}>Cancel</button>
              <button className="h-8 px-4 bg-primary text-white rounded font-semibold" disabled={pickBusy || !pickOrderId} onClick={submitNewReturn}>{pickBusy ? 'Opening…' : 'Open return'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ReturnsClaims;
