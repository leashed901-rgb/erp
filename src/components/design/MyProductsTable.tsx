'use client';
/**
 * MyProductsTable — the "My products" → My Stores screen rendered as a TABLE
 * (move 5). Rows are published listings + product cards + attached stores —
 * same table shape as the products and orders tables, with per-row quick
 * actions.
 *
 * Three row types, flagged by the `kind` column:
 *   - Listing  → a published listing on a sales channel
 *   - Card     → a product card the user authored
 *   - Store    → an attached store/channel
 *
 * Sources — all real, loaded on mount (no seeded lists, no localStorage):
 *   - Published designs: listDesigns({ status: 'published' }) → designs +
 *     design_publications
 *   - Saved templates:   store.savedTemplates (listDesigns template:true)
 *   - Saved images:      store.savedImages (design_assets via listAssets)
 *   - Stores:            listStores() → commerce_order_channels
 *
 * Row actions are real: Open in studio (openStudio + navigate), Preview
 * (preview view for designs, the image URL for assets), Publish (opens the
 * design in the preview screen where the 3-step publish modal lives),
 * Unpublish (POST /api/v1/designs/:id/unpublish — archives publications).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDesignCanvas } from '@/lib/designCanvasStore';
import { listDesigns, listStores, unpublishDesign, type DesignListItem, type StoreRow } from '@/lib/podApi';
import { exportToCsv } from '@/lib/csvExport';
import type { DomainKey } from '@/data/shellData';

interface MyProductsTableProps {
  onToast: (m: string) => void;
  onNavigate: (d: DomainKey, screenId: string) => void;
}

type RowKind = 'Listing' | 'Card' | 'Store';

interface MyProductRow {
  id: string;
  kind: RowKind;
  name: string;
  brand: string;
  store: string;
  status: 'Live' | 'Draft' | 'Syncing' | 'Error';
  variants: number;
  price: number | null;
  publishedAt: string | null;
  /** The designs row behind a Listing/Card row (absent for Store rows). */
  designId?: string;
  /** The design_assets row behind an image Card row. */
  assetId?: string;
  /** Signed preview URL for an image Card row. */
  assetUrl?: string;
  /** True when this Card row is an asset (not a template design). */
  isAsset?: boolean;
}

const money = (n: number | null) =>
  n == null ? '—' : `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const KIND_TABS: { id: RowKind | 'All'; label: string }[] = [
  { id: 'All', label: 'All' },
  { id: 'Listing', label: 'Listings' },
  { id: 'Card', label: 'Product cards' },
  { id: 'Store', label: 'Stores' },
];

function kindIcon(kind: RowKind): string {
  switch (kind) {
    case 'Listing': return 'storefront';
    case 'Card': return 'inventory_2';
    case 'Store': return 'hub';
  }
}

export default function MyProductsTable({ onToast, onNavigate }: MyProductsTableProps) {
  const savedTemplates = useDesignCanvas((s) => s.savedTemplates) ?? [];
  const savedImages = useDesignCanvas((s) => s.savedImages) ?? [];
  const librariesStatus = useDesignCanvas((s) => s.savedLibrariesStatus);
  const loadSavedLibraries = useDesignCanvas((s) => s.loadSavedLibraries);

  const [published, setPublished] = useState<DesignListItem[]>([]);
  const [stores, setStores] = useState<StoreRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [pub, st] = await Promise.all([
        listDesigns({ status: 'published', limit: 100 }),
        listStores(),
      ]);
      setPublished(pub.items);
      setStores(st.items);
      await loadSavedLibraries();
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Could not load my products.');
    } finally {
      setLoading(false);
    }
  }, [loadSavedLibraries]);

  useEffect(() => {
    void load();
  }, [load]);

  // Build the row set — published designs become Listings, saved templates
  // become Cards, saved images become Cards, stores come from the API.
  const rows: MyProductRow[] = useMemo(() => {
    const r: MyProductRow[] = [];
    for (const p of published) {
      r.push({
        id: p.id,
        kind: 'Listing',
        name: p.name,
        brand: p.product_type ?? 'Design',
        store: p.publications.length > 0 ? `${p.publications.length} publication${p.publications.length === 1 ? '' : 's'}` : '—',
        status: p.publications.some((x) => x.status === 'published') ? 'Live' : 'Draft',
        variants: p.publications.length,
        price: p.retail_price,
        publishedAt: p.updated_at,
        designId: p.id,
      });
    }
    for (const t of savedTemplates) {
      r.push({
        id: t.id,
        kind: 'Card',
        name: t.name,
        brand: 'Unsaid Studio',
        store: '—',
        status: 'Draft',
        variants: 0,
        price: null,
        publishedAt: t.createdAt,
        designId: t.id,
      });
    }
    for (const img of savedImages) {
      r.push({
        id: img.id,
        kind: 'Card',
        name: img.name,
        brand: img.origin === 'ai' ? 'AI generated' : img.origin === 'inspiration' ? 'Wikimedia Commons' : 'Upload',
        store: '—',
        status: 'Draft',
        variants: 0,
        price: null,
        publishedAt: img.createdAt,
        assetId: img.id,
        assetUrl: img.src || undefined,
        isAsset: true,
      });
    }
    for (const s of stores) {
      r.push({
        id: s.id,
        kind: 'Store',
        name: s.name,
        brand: '—',
        store: s.name,
        status: s.active ? 'Live' : 'Draft',
        variants: s.liveProducts,
        price: null,
        publishedAt: null,
      });
    }
    return r;
  }, [published, savedTemplates, savedImages, stores]);

  const [tab, setTab] = useState<RowKind | 'All'>('All');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [rowMenuForId, setRowMenuForId] = useState<string | null>(null);

  const filtered = useMemo(() => rows
    .filter((r) => (tab === 'All' ? true : r.kind === tab))
    .filter((r) => !search || r.name.toLowerCase().includes(search.toLowerCase()) || r.store.toLowerCase().includes(search.toLowerCase())),
    [rows, tab, search]);

  const tabCounts = useMemo(() => {
    const c: Record<string, number> = { All: rows.length };
    for (const t of KIND_TABS) {
      if (t.id === 'All') continue;
      c[t.id] = rows.filter((r) => r.kind === t.id).length;
    }
    return c;
  }, [rows]);

  const totalLive = rows.filter((r) => r.status === 'Live').length;
  const totalVariants = rows.reduce((s, r) => s + r.variants, 0);
  const totalStores = rows.filter((r) => r.kind === 'Store').length;

  function toggleRow(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function toggleAll() {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map((r) => r.id)));
  }

  async function openInStudio(row: MyProductRow, view: 'design' | 'preview') {
    if (!row.designId) return;
    try {
      await useDesignCanvas.getState().openStudio({ entry: 'catalog', designId: row.designId, view });
      onNavigate('design', view === 'preview' ? 'design-preview' : 'new-design');
    } catch {
      onToast('Could not open that design.');
    }
  }

  async function handleRowAction(row: MyProductRow, action: string) {
    setRowMenuForId(null);
    if (action === 'design') {
      if (row.kind === 'Store') {
        onNavigate('design', 'studio-my-stores');
        return;
      }
      if (row.isAsset) {
        if (row.assetUrl) window.open(row.assetUrl, '_blank', 'noopener');
        else onToast('No preview file for that image.');
        return;
      }
      await openInStudio(row, 'design');
    } else if (action === 'preview') {
      if (row.isAsset) {
        if (row.assetUrl) window.open(row.assetUrl, '_blank', 'noopener');
        else onToast('No preview file for that image.');
        return;
      }
      // Preview IS the publish entry: the 3-step publish modal lives there.
      await openInStudio(row, 'preview');
    } else if (action === 'publish') {
      // Publish happens in the preview screen's modal (price + channels).
      await openInStudio(row, 'preview');
      onToast(`"${row.name}" — set the price and channels in the publish modal.`);
    } else if (action === 'unpublish') {
      if (!row.designId) return;
      try {
        const res = await unpublishDesign(row.designId);
        onToast(`"${row.name}" unpublished — ${res.archivedPublications} publication(s) archived.`);
        await load();
      } catch (e) {
        onToast(e instanceof Error ? e.message : 'Could not unpublish.');
      }
    }
  }

  function handleExport() {
    const source = selected.size > 0 ? rows.filter((r) => selected.has(r.id)) : filtered;
    exportToCsv(source.map((r) => ({
      name: r.name, kind: r.kind, brand: r.brand, store: r.store,
      status: r.status, variants: r.variants, price: r.price ?? '',
      published: r.publishedAt?.slice(0, 10) ?? '',
    })), [
      { key: 'name', label: 'Name' }, { key: 'kind', label: 'Type' },
      { key: 'brand', label: 'Brand' }, { key: 'store', label: 'Store' },
      { key: 'status', label: 'Status' }, { key: 'variants', label: 'Variants' },
      { key: 'price', label: 'Price' }, { key: 'published', label: 'Published' },
    ], 'my-products');
    onToast(`Exported ${source.length} rows`);
  }

  return (
    <main className="px-6 pb-12 flex flex-col h-full">
      {/* Context header */}
      <div className="flex items-center gap-2 text-body-sm text-on-surface-variant py-3">
        <span className="material-symbols-outlined text-[18px]">layers</span>
        <span>My products</span>
        <span className="text-on-surface-variant/40">/</span>
        <span className="text-on-surface font-medium">Overview</span>
      </div>

      {/* Page header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-headline-lg">My products</h1>
          <p className="text-body-sm text-on-surface-variant mt-0.5">
            Published listings, product cards, and attached stores
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low flex items-center gap-1" onClick={handleExport}>
            <span className="material-symbols-outlined text-[16px]">download</span>Export
          </button>
          <button
            className="h-8 px-3 bg-primary text-white text-body-md font-semibold rounded hover:bg-primary-container flex items-center gap-1"
            onClick={() => onNavigate('design', 'new-design')}
          >
            <span className="material-symbols-outlined text-[16px]">palette</span>New design
          </button>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-4 gap-3 mb-4">
        <div className="bg-white rounded-xl border border-surface-dim p-3">
          <div className="text-[10px] text-on-surface-variant uppercase font-bold">Total</div>
          <div className="text-headline-sm tabular-nums">{rows.length}</div>
        </div>
        <div className="bg-white rounded-xl border border-surface-dim p-3">
          <div className="text-[10px] text-on-surface-variant uppercase font-bold">Live</div>
          <div className="text-headline-sm tabular-nums text-secondary">{totalLive}</div>
        </div>
        <div className="bg-white rounded-xl border border-surface-dim p-3">
          <div className="text-[10px] text-on-surface-variant uppercase font-bold">Stores</div>
          <div className="text-headline-sm tabular-nums">{totalStores}</div>
        </div>
        <div className="bg-white rounded-xl border border-surface-dim p-3">
          <div className="text-[10px] text-on-surface-variant uppercase font-bold">Variants</div>
          <div className="text-headline-sm tabular-nums">{totalVariants}</div>
        </div>
      </div>

      {/* Kind tabs */}
      <div className="flex items-center gap-1 mb-3 border-b border-surface-dim">
        {KIND_TABS.map((t) => (
          <button key={t.id} className={`px-3 py-2 text-label-md tab-underline ${tab === t.id ? 'active' : 'text-on-surface-variant'}`} onClick={() => setTab(t.id)}>
            {t.label} <span className="text-on-surface-variant">({tabCounts[t.id] || 0})</span>
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="flex items-center gap-2 mb-3">
        <div className="relative flex-1 max-w-sm">
          <span className="material-symbols-outlined absolute left-2 top-1.5 text-[16px] text-on-surface-variant">search</span>
          <input className="w-full h-8 pl-8 pr-3 border border-surface-dim rounded text-body-sm focus:outline-none focus:border-primary" placeholder="Search by name, store…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      {loading && <p className="text-body-sm text-on-surface-variant py-4">Loading my products…</p>}
      {loadError && (
        <p className="text-body-sm py-4 text-red-700">
          {loadError}{' '}
          <button className="underline" onClick={() => void load()}>Retry</button>
        </p>
      )}
      {librariesStatus === 'error' && (
        <p className="text-body-sm py-2 text-red-700">Saved templates/images could not load — published listings and stores below are still live.</p>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl border border-surface-dim overflow-hidden flex-1 flex flex-col">
        <div className="overflow-auto flex-1">
          <table className="w-full text-left text-body-sm">
            <thead className="bg-surface-container-low text-label-sm text-on-surface-variant uppercase tracking-wider sticky top-0">
              <tr>
                <th className="px-3 py-2 w-8"><input type="checkbox" checked={selected.size === filtered.length && filtered.length > 0} onChange={toggleAll} /></th>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Store</th>
                <th className="px-3 py-2 text-right">Variants</th>
                <th className="px-3 py-2 text-right">Price</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Published</th>
                <th className="px-2 py-2 w-10 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-dim">
              {filtered.length === 0 ? (
                <tr><td colSpan={9} className="text-center py-8 text-on-surface-variant">
                  Nothing here yet. Publish a design from the studio, or save cards from the catalog.
                </td></tr>
              ) : (
                filtered.map((row) => (
                  <tr key={row.id} className="hover:bg-surface-container-low cursor-pointer" onClick={() => void handleRowAction(row, 'design')}>
                    <td className="px-3 py-2" onClick={(e) => { e.stopPropagation(); }}>
                      <input type="checkbox" checked={selected.has(row.id)} onChange={() => toggleRow(row.id)} />
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-surface-container flex items-center justify-center shrink-0">
                          <span className="material-symbols-outlined text-[15px] text-on-surface-variant">{kindIcon(row.kind)}</span>
                        </div>
                        <div className="min-w-0">
                          <button className="font-medium truncate text-left hover:text-primary hover:underline" onClick={(e) => { e.stopPropagation(); void handleRowAction(row, 'design'); }}>
                            {row.name}
                          </button>
                          <div className="text-[11px] text-on-surface-variant truncate">{row.brand}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <span className={`pill status role ${row.kind === 'Listing' ? 'customer' : row.kind === 'Store' ? 'vendor' : 'contact'}`}>{row.kind}</span>
                    </td>
                    <td className="px-3 py-2 text-[12px]">{row.store}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{row.variants}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-[12px]">{row.price == null ? '—' : money(row.price)}</td>
                    <td className="px-3 py-2">
                      <span className={`pill status role ${row.status === 'Live' ? 'customer' : row.status === 'Error' ? 'vendor' : 'contact'}`}>{row.status}</span>
                    </td>
                    <td className="px-3 py-2 text-[11px] text-on-surface-variant">{row.publishedAt?.slice(0, 10) ?? '—'}</td>
                    <td className="px-2 py-2 text-right relative" onClick={(e) => e.stopPropagation()}>
                      <button
                        className="w-7 h-7 rounded border border-surface-dim hover:bg-surface-container flex items-center justify-center mx-auto"
                        title="Quick actions"
                        aria-label={`Quick actions for ${row.name}`}
                        onClick={(e) => { e.stopPropagation(); setRowMenuForId(rowMenuForId === row.id ? null : row.id); }}
                      >
                        <span className="material-symbols-outlined text-[16px] text-on-surface-variant">more_horiz</span>
                      </button>
                      {rowMenuForId === row.id && (
                        <div className="row-menu open" style={{ position: 'absolute', right: 0, top: '100%', marginTop: 4, minWidth: 210 }} onClick={(e) => e.stopPropagation()}>
                          <div className="menu-header">{row.name}</div>
                          {row.kind !== 'Store' && (
                            <button onClick={() => void handleRowAction(row, 'design')}>
                              <span className="material-symbols-outlined">palette</span>Open in studio
                            </button>
                          )}
                          {row.kind !== 'Store' && (
                            <button onClick={() => void handleRowAction(row, 'preview')}>
                              <span className="material-symbols-outlined">visibility</span>Preview
                            </button>
                          )}
                          <div className="sep"></div>
                          {row.kind !== 'Store' && !row.isAsset && row.status === 'Live' ? (
                            <button onClick={() => void handleRowAction(row, 'unpublish')}>
                              <span className="material-symbols-outlined">unpublished</span>Unpublish
                            </button>
                          ) : row.kind !== 'Store' && !row.isAsset ? (
                            <button onClick={() => void handleRowAction(row, 'publish')}>
                              <span className="material-symbols-outlined">publish</span>Publish to listing
                            </button>
                          ) : null}
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="px-3 py-2 border-t border-surface-dim text-[11px] text-on-surface-variant flex items-center justify-between">
          <span>{filtered.length} of {rows.length} rows</span>
          {selected.size > 0 && (
            <div className="flex items-center gap-2">
              <span>{selected.size} selected</span>
              <button className="h-6 px-2 border border-surface-dim rounded text-label-sm hover:bg-surface-container-low" onClick={handleExport}>
                Export selected
              </button>
            </div>
          )}
        </div>
      </div>

      {rowMenuForId && <div style={{ position: 'fixed', inset: 0, zIndex: 150 }} onClick={() => setRowMenuForId(null)} />}
    </main>
  );
}
