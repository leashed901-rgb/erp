'use client';
import { useState, useEffect, useMemo } from 'react';
import { fetchJson } from '@/hooks/useCrmApi';

/**
 * Blanks screen (SHIP-IT__250) — the staff-side blanks list. Supplier
 * catalog products (keeper suppliers) via GET /api/v1/blanks, the same
 * source the Studio picker reads. Search narrows server-side (q);
 * supplier filter is client-side on the returned page. Row click opens
 * a detail drawer fed by GET /api/v1/blanks/[id]; "Open in Studio"
 * takes the user to the canvas, where the picker engages the blank.
 */

interface BlankItem {
  id: string;
  name: string;
  brand: string | null;
  supplier: string | null;
  supplierSlug: string | null;
  variantCount: number;
  sku: string | null;
  baseCost: number | null;
  currency: string;
  family: string | null;
  status: string | null;
  fulfillment: string | null;
  estShipping: string | null;
}

interface BlankDetail {
  id: string;
  name: string;
  brand: string | null;
  supplier: string | null;
  supplierSlug: string | null;
  baseCost: number | null;
  currency: string;
  family: string | null;
  status: string | null;
  fulfillment: string | null;
  estShipping: string | null;
  description: string | null;
  printAreas: { placement: string; widthPx: number; heightPx: number; dpi: number }[];
  variants: { id: string }[];
}

interface Props {
  onToast: (msg: string) => void;
  onNavigate?: (domain: string, screen: string) => void;
}

export default function BlanksScreen({ onToast, onNavigate }: Props) {
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [supplier, setSupplier] = useState('all');
  const [items, setItems] = useState<BlankItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<BlankDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 400);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ limit: '100' });
    if (debounced) params.set('q', debounced);
    fetchJson<{ items: BlankItem[]; total: number }>(`/api/v1/blanks?${params}`).then((res) => {
      if (cancelled) return;
      if (!res.ok) setError(res.error || 'Blanks load failed');
      else {
        setItems((res.data?.items || []) as BlankItem[]);
        setTotal(res.data?.total ?? (res.data?.items || []).length);
      }
      setLoading(false);
    }).catch((e: unknown) => {
      if (cancelled) return;
      setError(e instanceof Error ? e.message : 'Blanks load failed');
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [debounced]);

  const suppliers = useMemo(() => {
    const s = new Set(items.map((i) => i.supplier).filter(Boolean) as string[]);
    return [...s].sort();
  }, [items]);

  const filtered = supplier === 'all' ? items : items.filter((i) => i.supplier === supplier);

  async function openDetail(id: string) {
    setDetailLoading(true);
    const res = await fetchJson<BlankDetail>(`/api/v1/blanks/${id}`);
    setDetailLoading(false);
    if (!res.ok) { onToast(res.error || 'Blank detail failed'); return; }
    setSelected(res.data);
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Blanks</h1>
        <span className="text-sm text-gray-500">From Supabase supplier_catalog_products · {total} total</span>
      </div>
      <p className="mt-1 text-sm text-gray-600">Supplier catalog products — the blanks the Design Studio builds on. Search scans the whole supplier catalog.</p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 max-w-sm">
          <span className="material-symbols-outlined absolute left-2 top-1.5 text-[16px] text-gray-400">search</span>
          <input
            className="w-full h-8 pl-8 pr-3 border rounded text-sm focus:outline-none"
            placeholder="Search blanks by name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select className="h-8 rounded border px-2 text-sm" value={supplier} onChange={(e) => setSupplier(e.target.value)}>
          <option value="all">All suppliers</option>
          {suppliers.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {error && <div className="mt-4 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {loading && <div className="mt-4 text-sm text-gray-500">Loading…</div>}

      {!loading && filtered.length === 0 && (
        <p className="mt-4 text-sm text-gray-500">No blanks found{debounced ? ` for “${debounced}”` : ''}.</p>
      )}

      {!loading && filtered.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-gray-500"><th className="py-2 pr-3">Blank</th><th className="py-2 pr-3">Supplier</th><th className="py-2 pr-3">Variants</th><th className="py-2 text-right">Base cost</th><th className="py-2 pr-3">Render state</th></tr></thead>
            <tbody>
              {filtered.map((b) => (
                <tr key={b.id} className="cursor-pointer border-t hover:bg-gray-50" onClick={() => openDetail(b.id)}>
                  <td className="py-2 pr-3">{b.name.trim()}{b.brand ? <span className="text-gray-500"> · {b.brand}</span> : ''}</td>
                  <td className="py-2 pr-3">{b.supplier || '—'}</td>
                  <td className="py-2 pr-3">{b.variantCount}</td>
                  <td className="py-2 text-right">{b.baseCost == null ? '—' : `$${Number(b.baseCost).toFixed(2)}`}</td>
                  <td className="py-2 pr-3">{b.status || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <div className="fixed inset-y-0 right-0 w-full max-w-md overflow-y-auto bg-white p-6 shadow-xl">
          <div className="flex items-start justify-between">
            <h2 className="text-lg font-semibold">{selected.name.trim()}</h2>
            <button className="rounded px-2 py-1 text-sm text-gray-600 hover:bg-gray-100" onClick={() => setSelected(null)}>✕</button>
          </div>
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-gray-500">Brand</dt><dd>{selected.brand || '—'}</dd></div>
            <div className="flex justify-between"><dt className="text-gray-500">Supplier</dt><dd>{selected.supplier || '—'}</dd></div>
            <div className="flex justify-between"><dt className="text-gray-500">Variants</dt><dd>{(selected.variants || []).length}</dd></div>
            <div className="flex justify-between"><dt className="text-gray-500">Base cost</dt><dd>{selected.baseCost == null ? '—' : `$${Number(selected.baseCost).toFixed(2)} ${selected.currency || ''}`}</dd></div>
            <div className="flex justify-between"><dt className="text-gray-500">Render state</dt><dd>{selected.status || '—'}</dd></div>
            <div className="flex justify-between"><dt className="text-gray-500">Fulfillment</dt><dd>{selected.fulfillment || '—'}</dd></div>
            <div className="flex justify-between"><dt className="text-gray-500">Est. shipping</dt><dd>{selected.estShipping || '—'}</dd></div>
            <div className="flex justify-between"><dt className="text-gray-500">Family</dt><dd>{selected.family || '—'}</dd></div>
          </dl>
          {(selected.printAreas || []).length > 0 && (
            <div className="mt-4">
              <h3 className="font-medium">Print areas</h3>
              <ul className="mt-1 list-disc pl-5 text-sm text-gray-600">
                {selected.printAreas.map((p, i) => <li key={i}>{p.placement} — {p.dpi ? (p.widthPx / p.dpi).toFixed(1) : p.widthPx} × {p.dpi ? (p.heightPx / p.dpi).toFixed(1) : p.heightPx} in</li>)}
              </ul>
            </div>
          )}
          {selected.description && <p className="mt-4 text-sm text-gray-600">{selected.description}</p>}
          <div className="mt-5 flex gap-2">
            <button
              className="rounded bg-gray-900 px-3 py-1.5 text-sm text-white"
              onClick={() => { setSelected(null); onNavigate?.('design', 'new-design'); }}
            >Open in Studio</button>
            <button className="rounded px-3 py-1.5 text-sm text-gray-600" onClick={() => setSelected(null)}>Close</button>
          </div>
        </div>
      )}
      {detailLoading && <div className="fixed bottom-4 right-4 rounded bg-gray-900 px-3 py-2 text-sm text-white">Loading blank…</div>}
    </div>
  );
}
