'use client';
/**
 * InvoicesScreen — Sales → Invoices.
 *
 * Reads real data from /api/v1/documents?type=Invoice (acct_ar_invoices).
 * Row actions call the real RPC wrappers:
 *   POST /api/invoices/[id]/send    → acct_send_invoice
 *   POST /api/invoices/[id]/post    → acct_post_invoice
 *   POST /api/invoices/[id]/mark-paid → acct_mark_invoice_paid
 *   POST /api/invoices/[id]/void    → acct_void_invoice
 *
 * Each action flips the status pill IN THE ROW (visible feedback), not just
 * a toast. Create/edit opens the DocumentEngine (the full invoice page).
 */
import { useState } from 'react';
import { useInvoices, useCrmMutations, type InvoiceRow } from '@/hooks/useCrmApi';
import DocumentEngine from '../DocumentEngine';

interface Props {
  onToast: (m: string) => void;
  onNavigate?: (d: string, s: string) => void;
  onCreate?: (label: string) => void;
}

const STATUS_TABS = [
  { id: 'all', label: 'All' },
  { id: 'draft', label: 'Draft' },
  { id: 'open', label: 'Unpaid' },
  { id: 'overdue', label: 'Overdue' },
  { id: 'paid', label: 'Paid' },
  { id: 'void', label: 'Void' },
];

const STATUS_PILL: Record<string, string> = {
  draft: 'bg-surface-container-high text-on-surface-variant',
  open: 'bg-qb-blue/15 text-qb-blue',
  overdue: 'bg-error/15 text-error',
  paid: 'bg-secondary/15 text-secondary',
  void: 'bg-surface-dim text-on-surface-variant line-through',
};

function money(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(Number.isFinite(n) ? n : 0);
}
function fmtDate(iso: string | null) {
  return (iso || '').slice(0, 10) || '—';
}

export default function InvoicesScreen({ onToast }: Props) {
  const { data: invoices, loaded, refresh } = useInvoices();
  const { sendInvoice, voidInvoice, markInvoicePaid, postInvoice } = useCrmMutations(onToast);

  const [activeTab, setActiveTab] = useState('all');
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rowMenuForId, setRowMenuForId] = useState<string | null>(null);

  // Local row overrides — when an action succeeds, flip the row's status
  // immediately so the user sees the change without waiting for a refetch.
  const [overrides, setOverrides] = useState<Record<string, Partial<InvoiceRow>>>({});

  const filtered = invoices.filter((inv) => {
    const merged = { ...inv, ...overrides[inv.id] };
    if (activeTab !== 'all' && merged.status !== activeTab) return false;
    if (q) {
      const s = `${merged.invoice_number || ''} ${merged.customer_id || ''}`.toLowerCase();
      if (!s.includes(q.toLowerCase())) return false;
    }
    return true;
  });

  const totalAmount = filtered.reduce((s, i) => s + Number(i.total) || 0, 0);
  const openBalance = filtered.reduce((s, i) => s + Number(i.open_balance) || 0, 0);

  function applyOverride(id: string, patch: Partial<InvoiceRow>) {
    setOverrides((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }

  async function handleAction(action: 'send' | 'void' | 'mark_paid' | 'post', id: string) {
    setRowMenuForId(null);
    setBusyId(id);
    try {
      let res;
      if (action === 'send') {
        res = await sendInvoice(id);
        if (res.ok) applyOverride(id, { status: 'open' });
      } else if (action === 'post') {
        res = await postInvoice(id);
        if (res.ok) applyOverride(id, { status: 'open' });
      } else if (action === 'mark_paid') {
        res = await markInvoicePaid(id);
        if (res.ok) applyOverride(id, { status: 'paid', open_balance: 0 });
      } else if (action === 'void') {
        res = await voidInvoice(id);
        if (res.ok) applyOverride(id, { status: 'void' });
      }
    } finally {
      setBusyId(null);
    }
  }

  async function bulkAction(action: 'send' | 'void' | 'mark_paid' | 'post') {
    const ids = [...selected];
    for (const id of ids) {
      await handleAction(action, id);
    }
    onToast(`${action} applied to ${ids.length} invoice${ids.length === 1 ? '' : 's'}`);
    setSelected(new Set());
    setTimeout(refresh, 600);
  }

  if (creating) {
    return <DocumentEngine type="Invoice" onToast={onToast} onClose={() => { setCreating(false); refresh(); }} />;
  }
  if (editingId) {
    return <DocumentEngine type="Invoice" documentId={editingId} onToast={onToast} onClose={() => { setEditingId(null); refresh(); }} />;
  }

  const toggleSelect = (id: string) => setSelected((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <main className="px-6 pb-12 flex flex-col h-full">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 py-4 flex-wrap">
        <div>
          <h1 className="text-headline-lg">Invoices</h1>
          <p className="text-body-sm text-on-surface-variant mt-0.5">
            {loaded ? `${invoices.length} invoices · ${money(totalAmount)} total · ${money(openBalance)} open` : 'Loading…'}
          </p>
        </div>
        <button className="h-8 px-3 bg-primary text-white text-body-md font-semibold rounded hover:bg-primary-container flex items-center gap-1" onClick={() => setCreating(true)}>
          <span className="material-symbols-outlined text-[16px]">add</span>Create invoice
        </button>
      </div>

      {/* Status tabs */}
      <div className="flex items-center gap-1 border-b border-surface-dim mb-3 px-1">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.id}
            className={`px-3 py-2 text-body-md font-semibold border-b-2 ${activeTab === tab.id ? 'border-primary text-primary' : 'border-transparent text-on-surface-variant hover:text-on-surface'}`}
            onClick={() => { setActiveTab(tab.id); setSelected(new Set()); }}
          >
            {tab.label}
            <span className="ml-1 text-[10px] text-on-surface-variant">
              {tab.id === 'all' ? invoices.length : invoices.filter((i) => (overrides[i.id]?.status || i.status) === tab.id).length}
            </span>
          </button>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        {selected.size > 0 ? (
          <div className="flex items-center gap-2">
            <span className="text-body-md font-semibold">{selected.size} selected</span>
            <button className="h-7 px-2 border border-surface-dim rounded text-label-sm hover:bg-surface-container" onClick={() => bulkAction('send')}>Send</button>
            <button className="h-7 px-2 border border-surface-dim rounded text-label-sm hover:bg-surface-container" onClick={() => bulkAction('post')}>Post</button>
            <button className="h-7 px-2 border border-surface-dim rounded text-label-sm hover:bg-surface-container" onClick={() => bulkAction('mark_paid')}>Mark paid</button>
            <button className="h-7 px-2 border border-error text-error rounded text-label-sm hover:bg-error/10" onClick={() => bulkAction('void')}>Void</button>
            <button className="h-7 px-2 text-label-sm text-on-surface-variant hover:text-on-surface" onClick={() => setSelected(new Set())}>Clear</button>
          </div>
        ) : (
          <input
            type="text"
            placeholder="Search invoice #, customer…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="h-8 px-3 border border-surface-dim rounded text-body-md w-72"
          />
        )}
        <button className="text-label-sm text-on-surface-variant hover:text-on-surface flex items-center gap-1" onClick={refresh}>
          <span className="material-symbols-outlined text-[14px]">refresh</span>Refresh
        </button>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto bg-white border border-surface-dim rounded-xl">
        <table className="w-full text-left text-body-sm">
          <thead className="bg-surface-container-low text-label-sm text-on-surface-variant uppercase tracking-wider sticky top-0">
            <tr>
              <th className="w-8 px-3 py-2"><input type="checkbox" checked={selected.size === filtered.length && filtered.length > 0} onChange={() => selected.size === filtered.length ? setSelected(new Set()) : setSelected(new Set(filtered.map((i) => i.id)))} className="accent-primary" /></th>
              <th className="px-3 py-2">Invoice #</th>
              <th className="px-3 py-2">Customer</th>
              <th className="px-3 py-2">Invoice date</th>
              <th className="px-3 py-2">Due date</th>
              <th className="px-3 py-2 text-right">Amount</th>
              <th className="px-3 py-2 text-right">Balance</th>
              <th className="px-3 py-2">Status</th>
              <th className="w-8 px-2 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-dim">
            {!loaded && (
              <tr><td colSpan={9} className="text-center py-8 text-on-surface-variant">Loading invoices from acct_ar_invoices…</td></tr>
            )}
            {loaded && filtered.length === 0 && (
              <tr><td colSpan={9} className="text-center py-12 text-on-surface-variant">
                <div className="flex flex-col items-center gap-2">
                  <span className="material-symbols-outlined text-[32px] text-outline-variant">receipt_long</span>
                  <div className="font-semibold text-body-md">No invoices found</div>
                  <button className="h-8 px-3 bg-primary text-white rounded text-body-md font-semibold" onClick={() => setCreating(true)}>Create invoice</button>
                </div>
              </td></tr>
            )}
            {loaded && filtered.map((inv) => {
              const merged = { ...inv, ...overrides[inv.id] };
              const isBusy = busyId === inv.id;
              return (
                <tr key={inv.id} className={`hover:bg-surface-container-low ${selected.has(inv.id) ? 'bg-surface-container-low' : ''}`}>
                  <td className="px-3 py-2"><input type="checkbox" checked={selected.has(inv.id)} onChange={() => toggleSelect(inv.id)} className="accent-primary" /></td>
                  <td className="px-3 py-2">
                    <button className="font-medium text-primary hover:underline" onClick={() => setEditingId(inv.id)}>{merged.invoice_number || '—'}</button>
                  </td>
                  <td className="px-3 py-2 text-on-surface-variant">{merged.customer_id ? String(merged.customer_id).slice(0, 8) + '…' : '—'}</td>
                  <td className="px-3 py-2 text-on-surface-variant">{fmtDate(merged.invoice_date)}</td>
                  <td className="px-3 py-2 text-on-surface-variant">{fmtDate(merged.due_date)}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-medium">{money(Number(merged.total) || 0)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{money(Number(merged.open_balance) || 0)}</td>
                  <td className="px-3 py-2">
                    <span className={`text-[11px] px-2 py-0.5 rounded-full font-bold ${STATUS_PILL[merged.status] || STATUS_PILL.DRAFT}`}>
                      {isBusy ? '…' : merged.status}
                    </span>
                  </td>
                  <td className="px-2 py-2 text-right relative">
                    <button
                      className="w-7 h-7 rounded hover:bg-surface-container flex items-center justify-center mx-auto"
                      onClick={(e) => { e.stopPropagation(); setRowMenuForId(rowMenuForId === inv.id ? null : inv.id); }}
                      title="Row actions"
                    >
                      <span className="material-symbols-outlined text-[16px] text-on-surface-variant">more_horiz</span>
                    </button>
                    {rowMenuForId === inv.id && (
                      <div className="row-menu open" style={{ position: 'absolute', right: 0, top: '100%', marginTop: 4, zIndex: 100 }} onClick={(e) => e.stopPropagation()}>
                        <div className="menu-header">Actions</div>
                        {merged.status === 'draft' && (
                          <button onClick={() => handleAction('post', inv.id)} disabled={isBusy}><span className="material-symbols-outlined text-[14px]">publish</span>Post invoice</button>
                        )}
                        {(merged.status === 'draft' || merged.status === 'open' || merged.status === 'overdue') && (
                          <button onClick={() => handleAction('send', inv.id)} disabled={isBusy}><span className="material-symbols-outlined text-[14px]">send</span>Send</button>
                        )}
                        {(merged.status === 'open' || merged.status === 'overdue') && (
                          <button onClick={() => handleAction('mark_paid', inv.id)} disabled={isBusy}><span className="material-symbols-outlined text-[14px]">payments</span>Mark paid</button>
                        )}
                        {merged.status !== 'void' && merged.status !== 'paid' && (
                          <button className="danger" onClick={() => handleAction('void', inv.id)} disabled={isBusy}><span className="material-symbols-outlined text-[14px]">block</span>Void</button>
                        )}
                        <div className="sep" />
                        <button onClick={() => { setRowMenuForId(null); setEditingId(inv.id); }}><span className="material-symbols-outlined text-[14px]">open_in_new</span>Open</button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Click-away for row menu */}
      {rowMenuForId && <div style={{ position: 'fixed', inset: 0, zIndex: 50 }} onClick={() => setRowMenuForId(null)} />}
    </main>
  );
}
