import { useCallback, useEffect, useState } from 'react';
import type { DomainKey } from '@/data/shellData';
import { useDesignCanvas } from '@/lib/designCanvasStore';
import CreateRfqDrawer from './CreateRfqDrawer';

type TechPackRow = {
  id: string;
  design_id: string | null;
  revision: number;
  style_number: string | null;
  title: string | null;
  season_id: string | null;
  base_size: string | null;
  status: string;
  updated_at: string;
};

type DesignRow = { id: string; name: string; status: string };

const STATUS_FILTERS = ['all', 'draft', 'in_review', 'approved', 'released', 'archived'] as const;

const statusChip = (status: string) => {
  switch (status) {
    case 'approved':
    case 'released':
      return 'bg-[#8af5be] text-[#00714b]';
    case 'in_review':
      return 'bg-[#e8f0fb] text-[#0055a5]';
    case 'archived':
      return 'bg-surface-container text-on-surface-variant';
    default:
      return 'bg-[#fff4dc] text-[#8a5a00]';
  }
};

const statusLabel = (status: string) =>
  status === 'in_review' ? 'In review' : status.charAt(0).toUpperCase() + status.slice(1);

/**
 * Tech packs list — the tenant's tech packs from GET /api/v1/tech-packs.
 * Row opens the editor; the ⋯ menu opens the preview or starts an RFQ.
 * "New tech pack" creates one from a design (POST /api/v1/tech-packs).
 */
export default function TechPacksListScreen({
  onNavigate,
}: {
  onNavigate: (domain: DomainKey, screenId: string) => void;
}) {
  const openTechPack = useDesignCanvas((s) => s.openTechPack);
  const openRfq = useDesignCanvas((s) => s.openRfq);
  const [rows, setRows] = useState<TechPackRow[]>([]);
  const [status, setStatus] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [rfqFor, setRfqFor] = useState<TechPackRow | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const q = status === 'all' ? '' : `?status=${status}`;
      const res = await fetch(`/api/v1/tech-packs${q}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message ?? 'Failed to load tech packs.');
      setRows(body.items ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load tech packs.');
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!menuFor) return;
    const close = () => setMenuFor(null);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [menuFor]);

  const openEditor = (row: TechPackRow) => {
    openTechPack(row.id);
    onNavigate('design', 'tech-pack-editor');
  };
  const openPreview = (row: TechPackRow) => {
    openTechPack(row.id);
    onNavigate('design', 'tech-pack-preview');
  };

  return (
    <div className="px-6 pb-12 bg-[#faf9fc] min-h-full">
      <div className="py-4 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-[24px] leading-8 font-semibold tracking-tight">Tech packs</h1>
          <p className="text-[12px] text-on-surface-variant mt-0.5">
            {loading ? 'Loading…' : `${rows.length} tech pack${rows.length === 1 ? '' : 's'}`}
          </p>
        </div>
        <button
          className="h-9 px-4 bg-primary text-white rounded text-[13px] font-semibold hover:bg-primary-container flex items-center gap-1.5"
          onClick={() => setNewOpen(true)}
        >
          <span className="material-symbols-outlined text-[16px]">add</span>New tech pack
        </button>
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
            {f === 'all' ? 'All' : statusLabel(f)}
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
          Loading tech packs…
        </div>
      ) : rows.length === 0 ? (
        <div className="bg-white rounded-xl border border-surface-dim p-8 text-center">
          <span className="material-symbols-outlined text-[32px] text-on-surface-variant">description</span>
          <p className="text-[14px] font-medium mt-2">No tech packs yet</p>
          <p className="text-[12px] text-on-surface-variant mt-1">
            Create one from a design — it carries the design&apos;s version, then you fill in the BOM,
            measurements and construction.
          </p>
          <button
            className="mt-4 h-9 px-4 bg-primary text-white rounded text-[13px] font-semibold hover:bg-primary-container"
            onClick={() => setNewOpen(true)}
          >
            New tech pack
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-surface-dim overflow-hidden">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wide text-on-surface-variant border-b border-surface-dim bg-[#faf9fc]">
                <th className="px-4 py-2.5 font-bold">Style #</th>
                <th className="px-4 py-2.5 font-bold">Title</th>
                <th className="px-4 py-2.5 font-bold">Base</th>
                <th className="px-4 py-2.5 font-bold">Status</th>
                <th className="px-4 py-2.5 font-bold">Rev</th>
                <th className="px-4 py-2.5 font-bold">Updated</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-surface-container last:border-0 hover:bg-surface-container-low cursor-pointer"
                  onClick={() => openEditor(row)}
                >
                  <td className="px-4 py-3 font-mono text-[12px]">{row.style_number ?? '—'}</td>
                  <td className="px-4 py-3 font-medium">{row.title ?? 'Untitled tech pack'}</td>
                  <td className="px-4 py-3">{row.base_size ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${statusChip(row.status)}`}>
                      {statusLabel(row.status)}
                    </span>
                  </td>
                  <td className="px-4 py-3 tabular-nums">{row.revision}</td>
                  <td className="px-4 py-3 text-on-surface-variant text-[12px]">
                    {new Date(row.updated_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                  </td>
                  <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                    <button
                      className="w-8 h-8 rounded hover:bg-surface-container-low inline-flex items-center justify-center"
                      onClick={(e) => {
                        e.stopPropagation();
                        setMenuFor(menuFor === row.id ? null : row.id);
                      }}
                      aria-label="Row actions"
                    >
                      <span className="material-symbols-outlined text-[18px]">more_vert</span>
                    </button>
                    {menuFor === row.id && (
                      <div className="absolute right-6 mt-1 w-56 bg-white border border-surface-dim rounded-lg shadow-lg py-1 z-50 text-left">
                        <button
                          className="w-full px-3 py-2 text-[13px] hover:bg-surface-container-low flex items-center gap-2"
                          onClick={() => {
                            setMenuFor(null);
                            openEditor(row);
                          }}
                        >
                          <span className="material-symbols-outlined text-[16px] text-on-surface-variant">edit</span>
                          Open editor
                        </button>
                        <button
                          className="w-full px-3 py-2 text-[13px] hover:bg-surface-container-low flex items-center gap-2"
                          onClick={() => {
                            setMenuFor(null);
                            openPreview(row);
                          }}
                        >
                          <span className="material-symbols-outlined text-[16px] text-on-surface-variant">visibility</span>
                          Preview document
                        </button>
                        <button
                          className="w-full px-3 py-2 text-[13px] hover:bg-surface-container-low flex items-center gap-2"
                          onClick={() => {
                            setMenuFor(null);
                            setRfqFor(row);
                          }}
                        >
                          <span className="material-symbols-outlined text-[16px] text-[#0077c5]">request_quote</span>
                          Create RFQ
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {newOpen && (
        <NewTechPackDrawer
          onClose={() => setNewOpen(false)}
          onCreated={(id) => {
            setNewOpen(false);
            openTechPack(id);
            onNavigate('design', 'tech-pack-editor');
          }}
        />
      )}
      {rfqFor && (
        <CreateRfqDrawer
          techPackId={rfqFor.id}
          techPackTitle={rfqFor.title ?? 'Untitled tech pack'}
          onClose={() => setRfqFor(null)}
          onCreated={(rfqId) => {
            setRfqFor(null);
            openRfq(rfqId);
            onNavigate('design', 'rfq-board');
          }}
        />
      )}
    </div>
  );
}

function NewTechPackDrawer({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [designs, setDesigns] = useState<DesignRow[]>([]);
  const [query, setQuery] = useState('');
  const [designId, setDesignId] = useState('');
  const [title, setTitle] = useState('');
  const [baseSize, setBaseSize] = useState('M');
  const [sizeRanges, setSizeRanges] = useState<Array<{ id: string; name: string; sizes: string[]; base_size: string }>>([]);
  const [sizeRangeId, setSizeRangeId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetch('/api/v1/designs?limit=50')
      .then((r) => r.json())
      .then((b) => {
        if (!cancelled) setDesigns(b.items ?? []);
      })
      .catch(() => undefined);
    void fetch('/api/v1/size-ranges')
      .then((r) => r.json())
      .then((b) => {
        if (!cancelled) {
          setSizeRanges(b.items ?? []);
          if (b.items?.[0]) setSizeRangeId(b.items[0].id);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = designs.filter((d) => d.name.toLowerCase().includes(query.toLowerCase()));
  const selected = designs.find((d) => d.id === designId);

  const submit = async () => {
    setError(null);
    if (!designId) {
      setError('Pick a design first.');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/v1/tech-packs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          designId,
          title: title.trim() || selected?.name,
          baseSize,
          sizeRangeId: sizeRangeId || null,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message ?? 'Failed to create tech pack.');
      onCreated(body.id as string);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create tech pack.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[81] flex justify-end" role="dialog" aria-label="New tech pack">
      <div className="absolute inset-0 bg-black/35" onClick={onClose} />
      <div className="relative w-[520px] max-w-[96vw] bg-white h-full flex flex-col shadow-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-dim">
          <div>
            <h2 className="text-headline-sm font-semibold">New tech pack</h2>
            <p className="text-body-sm text-on-surface-variant mt-0.5">
              From a design — it carries the design&apos;s saved version.
            </p>
          </div>
          <button
            className="w-8 h-8 rounded hover:bg-surface-container-low flex items-center justify-center"
            onClick={onClose}
            aria-label="Close"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant mb-1.5">
              Design
            </label>
            <input
              className="w-full h-9 px-2.5 border border-surface-dim rounded-md text-[13px] mb-2"
              placeholder="Search designs…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <div className="border border-surface-dim rounded-md max-h-56 overflow-y-auto">
              {filtered.length === 0 ? (
                <p className="px-3 py-3 text-[12px] text-on-surface-variant">No designs match.</p>
              ) : (
                filtered.map((d) => (
                  <button
                    key={d.id}
                    className={`w-full text-left px-3 py-2.5 text-[13px] border-b border-surface-container last:border-0 hover:bg-surface-container-low ${
                      designId === d.id ? 'bg-[#e8f0fb] font-medium' : ''
                    }`}
                    onClick={() => {
                      setDesignId(d.id);
                      if (!title.trim()) setTitle(d.name);
                    }}
                  >
                    {d.name}
                    <span className="block text-[11px] text-on-surface-variant">{d.status}</span>
                  </button>
                ))
              )}
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant mb-1.5">
              Title
            </label>
            <input
              className="w-full h-9 px-2.5 border border-surface-dim rounded-md text-[13px]"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Cotton Crew Tee — Summer 2026"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant mb-1.5">
                Base size
              </label>
              <input
                className="w-full h-9 px-2.5 border border-surface-dim rounded-md text-[13px]"
                value={baseSize}
                onChange={(e) => setBaseSize(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant mb-1.5">
                Size range
              </label>
              <select
                className="w-full h-9 px-2 border border-surface-dim rounded-md text-[13px] bg-white"
                value={sizeRangeId}
                onChange={(e) => setSizeRangeId(e.target.value)}
              >
                {sizeRanges.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {error && (
            <div className="text-[13px] text-error bg-error-container/40 border border-error/30 rounded-md px-3 py-2">
              {error}
            </div>
          )}
        </div>
        <div className="px-5 py-4 border-t border-surface-dim flex justify-end gap-2">
          <button
            className="h-9 px-4 border border-surface-dim rounded text-[13px] font-medium hover:bg-surface-container-low"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            className="h-9 px-4 bg-primary text-white rounded text-[13px] font-semibold hover:bg-primary-container disabled:opacity-50"
            onClick={submit}
            disabled={saving}
          >
            {saving ? 'Creating…' : 'Create tech pack'}
          </button>
        </div>
      </div>
    </div>
  );
}
