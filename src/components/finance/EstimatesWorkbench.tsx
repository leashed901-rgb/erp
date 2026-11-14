'use client';
/**
 * EstimatesWorkbench — Finance → Sales → Estimates.
 *
 * Reads REAL data from /api/estimates (acct_estimates — not platformStore).
 * Row actions:
 *   POST /api/estimates/[id]/convert → acct_convert_estimate (creates invoice,
 *     copies lines, marks estimate converted).
 *
 * Visible feedback: the row's status pill flips to "converted" + shows the
 * new invoice number inline. Create/edit opens the DocumentEngine.
 */
import { useState } from 'react';
import { useEstimates, useCrmMutations, type EstimateRow } from '@/hooks/useCrmApi';
import DocumentEngine from '../DocumentEngine';

interface Props {
  onToast: (m: string) => void;
  onNavigate?: (d: string, s: string) => void;
}

const STATUS_TABS = [
  { id: 'all', label: 'All' },
  { id: 'draft', label: 'Draft' },
  { id: 'sent', label: 'Sent' },
  { id: 'accepted', label: 'Accepted' },
  { id: 'declined', label: 'Declined' },
  { id: 'expired', label: 'Expired' },
  { id: 'converted', label: 'Converted' },
];

const STATUS_PILL: Record<string, string> = {
  draft: 'bg-surface-container-high text-on-surface-variant',
  sent: 'bg-qb-blue/15 text-qb-blue',
  accepted: 'bg-secondary/15 text-secondary',
  declined: 'bg-error/15 text-error',
  expired: 'bg-surface-dim text-on-surface-variant line-through',
  converted: 'bg-qb-green/20 text-qb-green',
};

function money(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(Number.isFinite(n) ? n : 0);
}
function fmtDate(iso: string | null) {
  return (iso || '').slice(0, 10) || '—';
}

export default function EstimatesWorkbench({ onToast, onNavigate }: Props) {
  const { data: estimates, loaded, refresh } = useEstimates();
  const { convertEstimate } = useCrmMutations(onToast);

  const [activeTab, setActiveTab] = useState('all');
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [convertingId, setConvertingId] = useState<string | null>(null);
  const [rowMenuForId, setRowMenuForId] = useState<string | null>(null);

  // Local overrides: when convert succeeds, flip the row's status to
  // "converted" + store the new invoice_id so it shows inline immediately.
  const [overrides, setOverrides] = useState<Record<string, Partial<EstimateRow> & { invoice_number?: string }>>({});

  const filtered = estimates.filter((est) => {
    const merged = { ...est, ...overrides[est.id] };
    if (activeTab !== 'all' && merged.status !== activeTab) return false;
    if (q) {
      const s = `${merged.number || ''} ${merged.customer_id || ''}`.toLowerCase();
      if (!s.includes(q.toLowerCase())) return false;
    }
    return true;
  });

  const totalValue = filtered.reduce((s, e) => s + Number(e.total) || 0, 0);
  const acceptedCount = estimates.filter((e) => (overrides[e.id]?.status || e.status) === 'accepted').length;
  const convertedCount = estimates.filter((e) => (overrides[e.id]?.status || e.status) === 'converted').length;

  function applyOverride(id: string, patch: Partial<EstimateRow> & { invoice_number?: string }) {
    setOverrides((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }

  async function handleConvert(id: string) {
    setRowMenuForId(null);
    setConvertingId(id);
    try {
      const res = await convertEstimate(id);
      if (res.ok) {
        const data = res.data as { invoice_id?: string; invoice_number?: string } | undefined;
        applyOverride(id, {
          status: 'converted',
          converted_at: new Date().toISOString(),
          converted_to_invoice_id: data?.invoice_id || null,
          invoice_number: data?.invoice_number,
        });
      }
    } finally {
      setConvertingId(null);
    }
  }

  if (creating) {
    return <DocumentEngine type="Estimate" onToast={onToast} onClose={() => { setCreating(false); refresh(); }} />;
  }
  if (editingId) {
    return <DocumentEngine type="Estimate" documentId={editingId} onToast={onToast} onClose={() => { setEditingId(null); refresh(); }} />;
  }

  return (
    <main className="px-6 pb-12 flex flex-col h-full">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 py-4 flex-wrap">
        <div>
          <h1 className="text-headline-lg">Estimates</h1>
          <p className="text-body-sm text-on-surface-variant mt-0.5">
            {loaded ? `${estimates.length} estimates · ${money(totalValue)} total · ${acceptedCount} accepted · ${convertedCount} converted` : 'Loading…'}
          </p>
        </div>
        <button className="h-8 px-3 bg-primary text-white text-body-md font-semibold rounded hover:bg-primary-container flex items-center gap-1" onClick={() => setCreating(true)}>
          <span className="material-symbols-outlined text-[16px]">add</span>Create estimate
        </button>
      </div>

      {/* Status tabs */}
      <div className="flex items-center gap-1 border-b border-surface-dim mb-3 px-1">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.id}
            className={`px-3 py-2 text-body-md font-semibold border-b-2 ${activeTab === tab.id ? 'border-primary text-primary' : 'border-transparent text-on-surface-variant hover:text-on-surface'}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
            <span className="ml-1 text-[10px] text-on-surface-variant">
              {tab.id === 'all' ? estimates.length : estimates.filter((e) => (overrides[e.id]?.status || e.status) === tab.id).length}
            </span>
          </button>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between mb-3">
        <input
          type="text"
          placeholder="Search estimate #, customer…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="h-8 px-3 border border-surface-dim rounded text-body-md w-72"
        />
        <button className="text-label-sm text-on-surface-variant hover:text-on-surface flex items-center gap-1" onClick={refresh}>
          <span className="material-symbols-outlined text-[14px]">refresh</span>Refresh
        </button>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto bg-white border border-surface-dim rounded-xl">
        <table className="w-full text-left text-body-sm">
          <thead className="bg-surface-container-low text-label-sm text-on-surface-variant uppercase tracking-wider sticky top-0">
            <tr>
              <th className="px-3 py-2">Estimate #</th>
              <th className="px-3 py-2">Customer</th>
              <th className="px-3 py-2">Issue date</th>
              <th className="px-3 py-2">Expiry</th>
              <th className="px-3 py-2 text-right">Total</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Converted to</th>
              <th className="w-8 px-2 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-dim">
            {!loaded && (
              <tr><td colSpan={8} className="text-center py-8 text-on-surface-variant">Loading estimates from acct_estimates…</td></tr>
            )}
            {loaded && filtered.length === 0 && (
              <tr><td colSpan={8} className="text-center py-12 text-on-surface-variant">
                <div className="flex flex-col items-center gap-2">
                  <span className="material-symbols-outlined text-[32px] text-outline-variant">request_quote</span>
                  <div className="font-semibold text-body-md">No estimates found</div>
                  <button className="h-8 px-3 bg-primary text-white rounded text-body-md font-semibold" onClick={() => setCreating(true)}>Create estimate</button>
                </div>
              </td></tr>
            )}
            {loaded && filtered.map((est) => {
              const merged = { ...est, ...overrides[est.id] };
              const isConverting = convertingId === est.id;
              return (
                <tr key={est.id} className="hover:bg-surface-container-low">
                  <td className="px-3 py-2">
                    <button className="font-medium text-primary hover:underline" onClick={() => setEditingId(est.id)}>{merged.number || '—'}</button>
                  </td>
                  <td className="px-3 py-2 text-on-surface-variant">{merged.customer_id ? String(merged.customer_id).slice(0, 8) + '…' : '—'}</td>
                  <td className="px-3 py-2 text-on-surface-variant">{fmtDate(merged.issue_date)}</td>
                  <td className="px-3 py-2 text-on-surface-variant">{fmtDate(merged.expiry_date)}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-medium">{money(Number(merged.total) || 0)}</td>
                  <td className="px-3 py-2">
                    <span className={`text-[11px] px-2 py-0.5 rounded-full font-bold ${STATUS_PILL[merged.status] || STATUS_PILL.draft}`}>
                      {isConverting ? '…' : merged.status}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    {merged.converted_to_invoice_id ? (
                      <button
                        className="text-[11px] text-primary hover:underline flex items-center gap-1"
                        onClick={() => onNavigate?.('finance', 'invoices')}
                        title="Open invoice"
                      >
                        <span className="material-symbols-outlined text-[12px]">receipt_long</span>
                        {overrides[est.id]?.invoice_number || 'Invoice →'}
                      </button>
                    ) : '—'}
                  </td>
                  <td className="px-2 py-2 text-right relative">
                    <button
                      className="w-7 h-7 rounded hover:bg-surface-container flex items-center justify-center mx-auto"
                      onClick={(e) => { e.stopPropagation(); setRowMenuForId(rowMenuForId === est.id ? null : est.id); }}
                      title="Row actions"
                    >
                      <span className="material-symbols-outlined text-[16px] text-on-surface-variant">more_horiz</span>
                    </button>
                    {rowMenuForId === est.id && (
                      <div className="row-menu open" style={{ position: 'absolute', right: 0, top: '100%', marginTop: 4, zIndex: 100 }} onClick={(e) => e.stopPropagation()}>
                        <div className="menu-header">Actions</div>
                        {merged.status !== 'converted' && (
                          <button onClick={() => handleConvert(est.id)} disabled={isConverting}>
                            <span className="material-symbols-outlined text-[14px]">sync_alt</span>Convert to invoice
                          </button>
                        )}
                        <button onClick={() => { setRowMenuForId(null); setEditingId(est.id); }}>
                          <span className="material-symbols-outlined text-[14px]">open_in_new</span>Open
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Click-away */}
      {rowMenuForId && <div style={{ position: 'fixed', inset: 0, zIndex: 50 }} onClick={() => setRowMenuForId(null)} />}
    </main>
  );
}
