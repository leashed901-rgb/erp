'use client';
/**
 * CatalogProductsScreen — unified flat-table catalog with facets.
 *
 * ONE table, all products. Facet chips along the top filter in place —
 * no sidebar navigation, no separate category screens. Click a facet
 * to toggle it; multiple facets stack (AND logic).
 *
 * Facets: category, fulfillment type, status, brand, channel.
 * Search: name, brand, tag, SKU.
 *
 * Real rows from the `products` table via /api/products.
 */
import { useMemo, useState, useEffect } from 'react';
import { exportToCsv } from '@/lib/csvExport';
import ProductProfile from './ProductProfile';
import ProductFormDrawer, { type ProductFormEditTarget } from './ProductFormDrawer';

interface CatalogProductsScreenProps {
  onToast: (m: string) => void;
  onNavigate?: (d: string, s: string) => void;
  backLabel?: string;
}

interface CatalogProduct {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  status: string;
  category?: { id: string; name: string } | null;
  brand: string | null;
  tags: string[];
  is_featured: boolean;
  is_new: boolean;
  is_best_seller: boolean;
  is_house_favorite: boolean;
  fulfillment_type: string | null;
  variant_count: number;
  price_min: number | null;
  price_max: number | null;
  units_sold: number;
  revenue: number;
  updated_at: string | null;
  channels?: string[];
}

const money = (n: number | null) =>
  n == null ? '—' : `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function categoryIcon(name: string | null | undefined): string {
  const s = (name || '').toLowerCase();
  if (s.includes('apparel') || s.includes('tee') || s.includes('shirt') || s.includes('outerwear')) return 'checkroom';
  if (s.includes('mug') || s.includes('tumbler')) return 'local_cafe';
  if (s.includes('cap') || s.includes('beanie') || s.includes('headwear')) return 'sports_baseball';
  if (s.includes('textile') || s.includes('cushion') || s.includes('blanket')) return 'bed';
  if (s.includes('wellness') || s.includes('self-care')) return 'spa';
  if (s.includes('digital')) return 'memory';
  if (s.includes('bundle')) return 'inventory_2';
  return 'category';
}

function editTargetFrom(p: CatalogProduct): ProductFormEditTarget {
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    status: p.status,
    category_id: p.category?.id || null,
    brand: p.brand,
    tags: p.tags,
    is_featured: p.is_featured,
    is_new: p.is_new,
    is_best_seller: p.is_best_seller,
    is_house_favorite: p.is_house_favorite,
    fulfillment_type: p.fulfillment_type,
  };
}

const FULFILLMENT_LABELS: Record<string, string> = {
  stock: 'In Stock',
  pod: 'Print on Demand',
  supplier_fulfilled: 'Dropship',
  digital: 'Digital',
  bundle: 'Bundle',
};

export default function CatalogProductsScreen({ onToast, onNavigate, backLabel }: CatalogProductsScreenProps) {
  const [search, setSearch] = useState('');
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [profileId, setProfileId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [rowMenuForId, setRowMenuForId] = useState<string | null>(null);
  const [rowEditId, setRowEditId] = useState<string | null>(null);

  // ── Facet state ── active filters as Sets of strings
  const [facetCategories, setFacetCategories] = useState<Set<string>>(new Set());
  const [facetFulfillment, setFacetFulfillment] = useState<Set<string>>(new Set());
  const [facetStatus, setFacetStatus] = useState<Set<string>>(new Set());
  const [facetBrand, setFacetBrand] = useState<Set<string>>(new Set());

  // Fetch products
  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    const params = new URLSearchParams();
    if (search) params.set('q', search);
    fetch(`/api/products?${params.toString()}`)
      .then(r => r.json())
      .then(json => {
        if (cancelled) return;
        setProducts(json.data || []);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
    return () => { cancelled = true; };
  }, [search]);

  // ── Build facet options from the data ──
  const facetOptions = useMemo(() => {
    const categories = new Map<string, number>();
    const fulfillment = new Map<string, number>();
    const status = new Map<string, number>();
    const brand = new Map<string, number>();

    for (const p of products) {
      const catName = p.category?.name || 'Uncategorized';
      categories.set(catName, (categories.get(catName) || 0) + 1);

      const fType = p.fulfillment_type || 'unknown';
      const fLabel = FULFILLMENT_LABELS[fType] || fType;
      fulfillment.set(fLabel, (fulfillment.get(fLabel) || 0) + 1);

      const st = p.status || 'unknown';
      status.set(st, (status.get(st) || 0) + 1);

      const br = p.brand || 'No brand';
      brand.set(br, (brand.get(br) || 0) + 1);
    }

    return {
      categories: [...categories.entries()].sort((a, b) => b[1] - a[1]),
      fulfillment: [...fulfillment.entries()].sort((a, b) => b[1] - a[1]),
      status: [...status.entries()].sort((a, b) => b[1] - a[1]),
      brand: [...brand.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10),
    };
  }, [products]);

  // ── Filtered products based on active facets ──
  const filtered = useMemo(() => {
    return products.filter(p => {
      if (facetCategories.size > 0) {
        const catName = p.category?.name || 'Uncategorized';
        if (!facetCategories.has(catName)) return false;
      }
      if (facetFulfillment.size > 0) {
        const fType = p.fulfillment_type || 'unknown';
        const fLabel = FULFILLMENT_LABELS[fType] || fType;
        if (!facetFulfillment.has(fLabel)) return false;
      }
      if (facetStatus.size > 0) {
        if (!facetStatus.has(p.status)) return false;
      }
      if (facetBrand.size > 0) {
        const br = p.brand || 'No brand';
        if (!facetBrand.has(br)) return false;
      }
      return true;
    });
  }, [products, facetCategories, facetFulfillment, facetStatus, facetBrand]);

  // Summary KPIs
  const totalVariants = filtered.reduce((s, p) => s + p.variant_count, 0);
  const totalUnits = filtered.reduce((s, p) => s + p.units_sold, 0);
  const totalRevenue = filtered.reduce((s, p) => s + p.revenue, 0);

  // ── Facet toggle helper ──
  function toggleFacet(set: Set<string>, value: string, setter: (s: Set<string>) => void) {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    setter(next);
  }

  function clearAllFacets() {
    setFacetCategories(new Set());
    setFacetFulfillment(new Set());
    setFacetStatus(new Set());
    setFacetBrand(new Set());
  }

  const activeFacetCount = facetCategories.size + facetFulfillment.size + facetStatus.size + facetBrand.size;

  function toggleRow(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map(p => p.id)));
  }

  function handleExport() {
    exportToCsv(filtered.map(p => ({
      name: p.name, status: p.status, category: p.category?.name || '',
      brand: p.brand || '', variants: p.variant_count,
      price_min: p.price_min ?? '', price_max: p.price_max ?? '',
      units_sold: p.units_sold, revenue: p.revenue,
      fulfillment: p.fulfillment_type || '',
      updated: p.updated_at ? p.updated_at.slice(0, 10) : '',
    })), [
      { key: 'name', label: 'Product' }, { key: 'status', label: 'Status' },
      { key: 'category', label: 'Category' }, { key: 'brand', label: 'Brand' },
      { key: 'variants', label: 'Variants' }, { key: 'price_min', label: 'Price min' },
      { key: 'price_max', label: 'Price max' }, { key: 'units_sold', label: 'Units sold' },
      { key: 'revenue', label: 'Revenue' }, { key: 'fulfillment', label: 'Fulfillment' },
      { key: 'updated', label: 'Updated' },
    ], 'catalog-products');
    onToast(`Exported ${filtered.length} products`);
  }

  // ── Product Profile ──
  if (profileId) {
    const p = products.find(x => x.id === profileId) || null;
    return (
      <ProductProfile
        productId={profileId}
        summary={p as any}
        backLabel={backLabel || 'Products'}
        onToast={onToast}
        onBack={() => setProfileId(null)}
        onNavigate={onNavigate}
      />
    );
  }

  const rowEditTarget = rowEditId ? (() => {
    const p = products.find(x => x.id === rowEditId);
    return p ? editTargetFrom(p) : null;
  })() : null;

  // ── Facet chip component ──
  const FacetChip = ({ label, count, active, onClick }: { label: string; count: number; active: boolean; onClick: () => void }) => (
    <button
      className={`h-7 px-2.5 rounded-full text-[12px] font-semibold border transition-colors whitespace-nowrap ${
        active
          ? 'bg-primary text-white border-primary'
          : 'bg-white text-on-surface-variant border-surface-dim hover:bg-surface-container-low'
      }`}
      onClick={onClick}
    >
      {label} <span className={active ? 'opacity-80' : 'opacity-60'}>({count})</span>
    </button>
  );

  return (
    <main className="px-6 pb-12 flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between py-4">
        <div>
          <h1 className="text-headline-lg">Catalog</h1>
          <p className="text-body-sm text-on-surface-variant mt-0.5">
            {products.length} products · {filtered.length} shown · {activeFacetCount > 0 ? `${activeFacetCount} filters active` : 'no filters'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low flex items-center gap-1" onClick={handleExport}>
            <span className="material-symbols-outlined text-[16px]">download</span>Export
          </button>
          <button className="h-8 px-3 bg-primary text-white text-body-md font-semibold rounded hover:bg-primary-container flex items-center gap-1" onClick={() => setShowCreate(true)}>
            <span className="material-symbols-outlined text-[16px]">add</span>New product
          </button>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-4 gap-3 mb-4">
        <div className="bg-white rounded-xl border border-surface-dim p-3">
          <div className="text-[10px] text-on-surface-variant uppercase font-bold">Products</div>
          <div className="text-headline-sm tabular-nums">{filtered.length}</div>
        </div>
        <div className="bg-white rounded-xl border border-surface-dim p-3">
          <div className="text-[10px] text-on-surface-variant uppercase font-bold">Variants</div>
          <div className="text-headline-sm tabular-nums">{totalVariants}</div>
        </div>
        <div className="bg-white rounded-xl border border-surface-dim p-3">
          <div className="text-[10px] text-on-surface-variant uppercase font-bold">Units sold</div>
          <div className="text-headline-sm tabular-nums text-primary">{totalUnits}</div>
        </div>
        <div className="bg-white rounded-xl border border-surface-dim p-3">
          <div className="text-[10px] text-on-surface-variant uppercase font-bold">Revenue</div>
          <div className="text-headline-sm tabular-nums text-secondary">{money(totalRevenue)}</div>
        </div>
      </div>

      {/* Search + facet bar */}
      <div className="mb-3 space-y-2">
        <div className="flex items-center gap-2">
          <div className="relative flex-1 max-w-sm">
            <span className="material-symbols-outlined absolute left-2 top-1.5 text-[16px] text-on-surface-variant">search</span>
            <input className="w-full h-8 pl-8 pr-3 border border-surface-dim rounded text-body-sm focus:outline-none focus:border-primary" placeholder="Search by name, brand, tag…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          {activeFacetCount > 0 && (
            <button className="h-8 px-3 text-[12px] font-semibold text-primary hover:underline" onClick={clearAllFacets}>
              Clear all filters ({activeFacetCount})
            </button>
          )}
        </div>

        {/* Facet chips — horizontal scroll rows */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* Status facets */}
          {facetOptions.status.map(([value, count]) => (
            <FacetChip key={`s-${value}`} label={value.charAt(0).toUpperCase() + value.slice(1)} count={count} active={facetStatus.has(value)} onClick={() => toggleFacet(facetStatus, value, setFacetStatus)} />
          ))}
          <span className="w-px h-5 bg-surface-dim mx-1" />
          {/* Fulfillment facets */}
          {facetOptions.fulfillment.map(([value, count]) => (
            <FacetChip key={`f-${value}`} label={value} count={count} active={facetFulfillment.has(value)} onClick={() => toggleFacet(facetFulfillment, value, setFacetFulfillment)} />
          ))}
          <span className="w-px h-5 bg-surface-dim mx-1" />
          {/* Category facets */}
          {facetOptions.categories.map(([value, count]) => (
            <FacetChip key={`c-${value}`} label={value} count={count} active={facetCategories.has(value)} onClick={() => toggleFacet(facetCategories, value, setFacetCategories)} />
          ))}
          <span className="w-px h-5 bg-surface-dim mx-1" />
          {/* Brand facets (top 10) */}
          {facetOptions.brand.map(([value, count]) => (
            <FacetChip key={`b-${value}`} label={value} count={count} active={facetBrand.has(value)} onClick={() => toggleFacet(facetBrand, value, setFacetBrand)} />
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-surface-dim overflow-hidden flex-1 flex flex-col">
        <div className="overflow-auto flex-1">
          <table className="w-full text-left text-body-sm">
            <thead className="bg-surface-container-low text-label-sm text-on-surface-variant uppercase tracking-wider sticky top-0">
              <tr>
                <th className="px-3 py-2 w-8"><input type="checkbox" checked={selected.size === filtered.length && filtered.length > 0} onChange={toggleAll} /></th>
                <th className="px-3 py-2">Product</th>
                <th className="px-3 py-2">Category</th>
                <th className="px-3 py-2">Fulfillment</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2 text-right">Price</th>
                <th className="px-3 py-2 text-right">Variants</th>
                <th className="px-3 py-2 text-right">Units</th>
                <th className="px-3 py-2 text-right">Revenue</th>
                <th className="px-2 py-2 w-10 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-dim">
              {!loaded && products.length === 0 ? (
                <tr><td colSpan={10} className="text-center py-8 text-on-surface-variant/60">Fetching from Supabase…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={10} className="text-center py-8 text-on-surface-variant">No products match the current filters.</td></tr>
              ) : (
                filtered.map(p => (
                  <tr key={p.id} className="hover:bg-surface-container-low cursor-pointer" onClick={() => setProfileId(p.id)}>
                    <td className="px-3 py-2" onClick={e => { e.stopPropagation(); }}>
                      <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggleRow(p.id)} />
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-surface-container flex items-center justify-center shrink-0">
                          <span className="material-symbols-outlined text-[15px] text-on-surface-variant">{categoryIcon(p.category?.name)}</span>
                        </div>
                        <div className="min-w-0">
                          <button className="font-medium truncate text-left hover:text-primary hover:underline" onClick={e => { e.stopPropagation(); setProfileId(p.id); }}>
                            {p.name}
                          </button>
                          <div className="text-[11px] text-on-surface-variant truncate">
                            {p.brand || p.slug}
                            {p.is_best_seller && <span className="ml-1 text-secondary font-semibold">· Best seller</span>}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-[12px]">{p.category?.name || '—'}</td>
                    <td className="px-3 py-2 text-[12px]">
                      <span className={`pill ${p.fulfillment_type === 'stock' ? 'role customer' : p.fulfillment_type === 'pod' ? 'role vendor' : 'tag'}`}>
                        {FULFILLMENT_LABELS[p.fulfillment_type || ''] || p.fulfillment_type || '—'}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span className={`pill status role ${p.status === 'published' ? 'customer' : p.status === 'draft' ? 'contact' : 'vendor'}`}>{p.status}</span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-[12px]">
                      {p.price_min == null ? '—' : p.price_min === p.price_max ? money(p.price_min) : `${money(p.price_min)}–${money(p.price_max)}`}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{p.variant_count}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{p.units_sold}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{money(p.revenue)}</td>
                    <td className="px-2 py-2 text-right relative">
                      <button
                        className="w-7 h-7 rounded border border-surface-dim hover:bg-surface-container flex items-center justify-center mx-auto"
                        title="Quick actions"
                        aria-label={`Quick actions for ${p.name}`}
                        onClick={e => { e.stopPropagation(); setRowMenuForId(rowMenuForId === p.id ? null : p.id); }}
                      >
                        <span className="material-symbols-outlined text-[16px] text-on-surface-variant">more_horiz</span>
                      </button>
                      {rowMenuForId === p.id && (
                        <div className="row-menu open" style={{ position: 'absolute', right: 0, top: '100%', marginTop: 4, minWidth: 210 }} onClick={e => e.stopPropagation()}>
                          <div className="menu-header">{p.name}</div>
                          <button onClick={() => { setRowMenuForId(null); setProfileId(p.id); }}><span className="material-symbols-outlined">inventory_2</span>Open profile</button>
                          <button onClick={() => { setRowMenuForId(null); setRowEditId(p.id); }}><span className="material-symbols-outlined">edit</span>Edit product</button>
                          <button onClick={() => {
                            setRowMenuForId(null);
                            const next = p.status === 'published' ? 'draft' : 'published';
                            fetch(`/api/products/${p.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: next }) })
                              .then(() => { onToast(`${p.name} → ${next}`); })
                              .catch(() => onToast('Update failed'));
                          }}>
                            <span className="material-symbols-outlined">{p.status === 'published' ? 'unpublished' : 'publish'}</span>
                            {p.status === 'published' ? 'Unpublish (draft)' : 'Publish'}
                          </button>
                          <div className="sep"></div>
                          <button className="danger" onClick={() => {
                            setRowMenuForId(null);
                            if (!confirm(`Archive "${p.name}"?`)) return;
                            fetch(`/api/products/${p.id}`, { method: 'DELETE' })
                              .then(() => onToast(`Archived: ${p.name}`))
                              .catch(() => onToast('Archive failed'));
                          }}><span className="material-symbols-outlined">archive</span>Archive</button>
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
          <span>{filtered.length} of {products.length} products</span>
          {selected.size > 0 && (
            <div className="flex items-center gap-2">
              <span>{selected.size} selected</span>
              <button className="h-6 px-2 border border-surface-dim rounded text-label-sm hover:bg-surface-container-low" onClick={() => {
                selected.forEach(id => fetch(`/api/products/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'published' }) }));
                onToast(`Publishing ${selected.size} products`);
                setSelected(new Set());
              }}>Publish</button>
              <button className="h-6 px-2 border border-surface-dim rounded text-label-sm hover:bg-surface-container-low" onClick={() => {
                selected.forEach(id => fetch(`/api/products/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'draft' }) }));
                onToast(`Unpublishing ${selected.size} products`);
                setSelected(new Set());
              }}>Unpublish</button>
              <button className="h-6 px-2 border border-surface-dim rounded text-label-sm hover:bg-surface-container-low" onClick={() => {
                selected.forEach(id => fetch(`/api/products/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'archived' }) }));
                onToast(`Archiving ${selected.size} products`);
                setSelected(new Set());
              }}>Archive</button>
            </div>
          )}
        </div>
      </div>

      {/* Click-away for the row menu */}
      {rowMenuForId && <div style={{ position: 'fixed', inset: 0, zIndex: 150 }} onClick={() => setRowMenuForId(null)} />}

      {/* Create — the canonical ProductFormDrawer */}
      <ProductFormDrawer
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onSaved={(_name, mode) => { if (mode === 'created') setShowCreate(false); }}
        onToast={onToast}
      />

      {/* Edit from a row quick action — same canonical drawer, prefilled */}
      <ProductFormDrawer
        open={!!rowEditTarget}
        editing={rowEditTarget}
        onClose={() => setRowEditId(null)}
        onSaved={() => {}}
        onToast={onToast}
      />
    </main>
  );
}
