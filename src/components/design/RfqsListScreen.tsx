import { useCallback, useEffect, useState } from 'react';
import type { DomainKey } from '@/data/shellData';
import { useDesignCanvas } from '@/lib/designCanvasStore';

type RfqRow = {
  id: string;
  rfq_number: string | null;
  title: string;
  status: string;
  sealed: boolean;
  currency: string;
  bid_deadline: string | null;
  published_at: string | null;
  created_at: string;
};

const STATUS_FILTERS = ['all', 'draft', 'published', 'closed', 'awarded', 'cancelled'] as const;

const statusChip = (status: string) => {
  switch (status) {
    case 'awarded':
      return 'bg-[#8af5be] text-[#00714b]';
    case 'published':
      return 'bg-[#e8f0fb] text-[#0055a5]';
    case 'closed':
      return 'bg-[#fff4dc] text-[#8a5a00]';
    case 'cancelled':
      return 'bg-[#ffdad6] text-[#93000a]';
    default:
      return 'bg-surface-container text-on-surface-variant';
  }
};

/**
 * RFQs list — the tenant's RFQs from GET /api/v1/rfqs.
 * Row opens the board. RFQs are created from a tech pack (editor or
 * tech-packs list), never from here — this list is the board's index.
 */
export default function RfqsListScreen({
  onNavigate,
}: {
  onNavigate: (domain: DomainKey, screenId: string) => void;
}) {
  const openRfq = useDesignCanvas((s) => s.openRfq);
  const [rows, setRows] = useState<RfqRow[]>([]);
  const [status, setStatus] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const q = status === 'all' ? '' : `?status=${status}`;
      const res = await fetch(`/api/v1/rfqs${q}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message ?? 'Failed to load RFQs.');
      setRows(body.items ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load RFQs.');
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    void load();
  }, [load]);

  const openBoard = (row: RfqRow) => {
    openRfq(row.id);
    onNavigate('design', 'rfq-board');
  };

  return (
    <div className="px-6 pb-12 bg-[#faf9fc] min-h-full">
      <div className="py-4 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-[24px] leading-8 font-semibold tracking-tight">RFQs</h1>
          <p className="text-[12px] text-on-surface-variant mt-0.5">
            {loading ? 'Loading…' : `${rows.length} request${rows.length === 1 ? '' : 's'} for quote`}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-1 border-b border-surface-dim mb-4 overflow-x-auto">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f}
            className={`px-4 py-2.5 text-[12px] font-medium border-b-2 ${
              status === f
                ? 'border-[#0077c5] text-[#0077c5] font-semibold'
                : 'border-transparent text-on-surface-variant'
            }`}
            onClick={() => setStatus(f)}
          >
            {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-4 text-[13px] text-error bg-error-container/40 border border-error/30 rounded-md px-3 py-2">
          {error}
        </div>
      )}

      {loading ? (
        <div className="bg-white rounded-xl border border-surface-dim p-8 text-center text-[13px] text-on-surface-variant">
          Loading RFQs…
        </div>
      ) : rows.length === 0 ? (
        <div className="bg-white rounded-xl border border-surface-dim p-8 text-center">
          <span className="material-symbols-outlined text-[32px] text-on-surface-variant">request_quote</span>
          <p className="text-[14px] font-medium mt-2">No RFQs yet</p>
          <p className="text-[12px] text-on-surface-variant mt-1">
            RFQs start from a tech pack — open one and choose Create RFQ.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-surface-dim overflow-hidden">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wide text-on-surface-variant border-b border-surface-dim bg-[#faf9fc]">
                <th className="px-4 py-2.5 font-bold">RFQ #</th>
                <th className="px-4 py-2.5 font-bold">Title</th>
                <th className="px-4 py-2.5 font-bold">Status</th>
                <th className="px-4 py-2.5 font-bold">Bids</th>
                <th className="px-4 py-2.5 font-bold">Bid deadline</th>
                <th className="px-4 py-2.5 font-bold">Created</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-surface-container last:border-0 hover:bg-surface-container-low cursor-pointer"
                  onClick={() => openBoard(row)}
                >
                  <td className="px-4 py-3 font-mono text-[12px]">{row.rfq_number ?? '—'}</td>
                  <td className="px-4 py-3 font-medium">{row.title}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${statusChip(row.status)}`}>
                      {row.status.charAt(0).toUpperCase() + row.status.slice(1)}
                    </span>
                    {row.sealed && (
                      <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-surface-container text-on-surface-variant">
                        Sealed
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-on-surface-variant">
                    {row.status === 'draft' ? '—' : row.sealed && row.status === 'published' ? 'Sealed' : '—'}
                  </td>
                  <td className="px-4 py-3 text-on-surface-variant text-[12px]">
                    {row.bid_deadline
                      ? new Date(row.bid_deadline).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
                      : '—'}
                  </td>
                  <td className="px-4 py-3 text-on-surface-variant text-[12px]">
                    {new Date(row.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
