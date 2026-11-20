'use client';

/**
 * EtnologicCatalog — the new catalog workspace.
 *
 * Ported from the Etnologic Catalog & Warehouse design. Uses the design
 * tokens from etnologic.css (clean minimal Inter, subtle borders, color
 * system). Renders the product catalog table with real API data.
 *
 * Views:
 *   - Inventory Management (products per warehouse)
 *   - Product Catalog (all products)
 *   - Stock Updates (transaction log)
 *   - Warehouse Management (shelves)
 */
import { useEffect, useMemo, useState } from 'react';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

import '@/app/etnologic.css';

interface Props {
  onToast: (m: string) => void;
  onNavigate?: (d: string, s: string) => void;
}

type View = 'inventory' | 'catalog' | 'updates' | 'warehouse';

interface Product {
  id: string;
  name: string;
  sku: string;
  category: string | null;
  area: string | null;
  status: string;
  price: number | null;
  cost: number | null;
  description: string | null;
  brand: string | null;
  image: string | null;
  created_at: string;
  updated_at: string;
}

const money = (n: number | null, d = 2) =>
  n == null || isNaN(n) ? '—' : '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });

const num = (n: number | null | undefined, d = 0) =>
  n == null || isNaN(n) ? '—' : Number(n).toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d });

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function statusClass(status: string): string {
  const s = status.toLowerCase();
  if (['published', 'active', 'live'].includes(s)) return 'green';
  if (['draft', 'pending', 'review'].includes(s)) return 'amber';
  if (['archived', 'cancelled', 'void'].includes(s)) return 'gray';
  return 'gray';
}

function typeBadge(brand: string | null): { label: string; cls: string; icon: string } {
  if (!brand) return { label: 'Unknown', cls: 't-whl', icon: 'inventory_2' };
  const b = brand.toLowerCase();
  if (b.includes('printify') || b.includes('printful') || b.includes('gelato'))
    return { label: 'POD', cls: 't-pod', icon: 'print' };
  if (b.includes('dropship') || b.includes('delta'))
    return { label: 'Dropship', cls: 't-drop', icon: 'local_shipping' };
  if (b.includes('corinth') || b.includes('in-house'))
    return { label: 'In House', cls: 't-inh', icon: 'precision_manufacturing' };
  return { label: 'Wholesale', cls: 't-whl', icon: 'pallet' };
}

export default function EtnologicCatalog({ onToast, onNavigate }: Props) {
  const [view, setView] = useState<View>('catalog');
  const [products, setProducts] = useState<Product[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    let alive = true;
    supabaseAdmin()
      .from('products')
      .select('*')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .order('updated_at', { ascending: false })
      .limit(500)
      .then(({ data, error }) => {
        if (!alive) return;
        if (error) {
          onToast(`Load failed: ${error.message}`);
          setLoaded(true);
          return;
        }
        setProducts(data || []);
        setLoaded(true);
      });
    return () => { alive = false; };
  }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return products;
    const q = search.toLowerCase();
    return products.filter(p =>
      p.name?.toLowerCase().includes(q) ||
      p.sku?.toLowerCase().includes(q) ||
      p.category?.toLowerCase().includes(q) ||
      p.brand?.toLowerCase().includes(q)
    );
  }, [products, search]);

  const allSelected = filtered.length > 0 && filtered.every(p => selected.has(p.id));

  function toggleSelect(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(filtered.map(p => p.id)));
  }

  const viewTitles: Record<View, { title: string; sub: string }> = {
    inventory: { title: 'Inventory Management', sub: 'One row per product per inventory warehouse.' },
    catalog: { title: 'Product Catalog', sub: 'One row per product.' },
    updates: { title: 'Stock Updates', sub: 'Every number in Inventory Management traces back to a row here.' },
    warehouse: { title: 'Warehouse Management', sub: 'One row per shelf.' },
  };

  const views: { id: View; icon: string; label: string; count?: number }[] = [
    { id: 'inventory', icon: 'inventory_2', label: 'Inventory', count: products.filter(p => p.status === 'published').length },
    { id: 'catalog', icon: 'category', label: 'Catalog', count: products.length },
    { id: 'updates', icon: 'swap_vert', label: 'Stock Updates' },
    { id: 'warehouse', icon: 'shelves', label: 'Warehouse' },
  ];

  return (
    <div className="app" style={{ gridTemplateColumns: '0 1fr 0', height: 'calc(100vh - 0px)' }}>
      <div className="main-col">
        {/* Top bar */}
        <header className="topbar" style={{ position: 'sticky', top: 0, zIndex: 40 }}>
          <div className="crumbs">
            <span>Catalog</span>
            <span className="sep">/</span>
            <b>{viewTitles[view].title}</b>
          </div>
          <div className="top-actions">
            <button className="btn ghost" onClick={() => onToast('Scan or Code')}>
              <span className="ms">barcode_scanner</span>
              <span className="hide-sm">Scan or Code</span>
            </button>
            <button className="btn primary" onClick={() => onToast('New product')}>
              <span className="ms">add</span>
              <span className="hide-sm">New Product</span>
            </button>
          </div>
        </header>

        {/* Page content */}
        <main className="page" style={{ height: 'calc(100vh - 52px)' }}>
          <div className="page-inner">
            {/* View tabs */}
            <div className="views">
              {views.map(v => (
                <button
                  key={v.id}
                  className={view === v.id ? 'on' : ''}
                  onClick={() => setView(v.id)}
                >
                  <span className="ms">{v.icon}</span>
                  {v.label}
                  {v.count !== undefined && <span className="vcount">{v.count}</span>}
                </button>
              ))}
            </div>

            {/* Page header */}
            <div className="ph">
              <div>
                <h1>{viewTitles[view].title}</h1>
                <p>{viewTitles[view].sub}</p>
              </div>
            </div>

            {/* Table card */}
            <div className="tbl-card">
              {/* Toolbar */}
              <div className="toolbar">
                <div className="search">
                  <span className="ms">search</span>
                  <input
                    placeholder={`Search ${viewTitles[view].sub.split('.')[0].toLowerCase()}`}
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                  />
                </div>
                <button className="btn sm" onClick={() => onToast('Filter')}>
                  <span className="ms">filter_list</span>Filter
                </button>
                <div className="tb-right">
                  <span className="rowcount">{filtered.length} products</span>
                  <button className="icon-btn" title="Export CSV" onClick={() => onToast('Exported')}>
                    <span className="ms">download</span>
                  </button>
                </div>
              </div>

              {/* Bulk bar */}
              {selected.size > 0 && (
                <div className="bulk show">
                  <span className="bc">{selected.size} selected</span>
                  <button className="btn sm" onClick={() => onToast('Bulk update')}>
                    <span className="ms">swap_vert</span>Update Stock
                  </button>
                  <button className="btn sm" onClick={() => onToast('Bulk export')}>
                    <span className="ms">download</span>Export
                  </button>
                  <button className="icon-btn" onClick={() => setSelected(new Set())}>
                    <span className="ms">close</span>
                  </button>
                </div>
              )}

              {/* Table */}
              <div className="tbl-scroll">
                {view === 'catalog' && (
                  <CatalogTable
                    products={filtered}
                    selected={selected}
                    allSelected={allSelected}
                    onToggleSelect={toggleSelect}
                    onToggleAll={toggleAll}
                    onToast={onToast}
                    loaded={loaded}
                  />
                )}
                {view === 'inventory' && (
                  <CatalogTable
                    products={filtered.filter(p => p.status === 'published')}
                    selected={selected}
                    allSelected={allSelected}
                    onToggleSelect={toggleSelect}
                    onToggleAll={toggleAll}
                    onToast={onToast}
                    loaded={loaded}
                  />
                )}
                {view === 'updates' && (
                  <div className="empty">
                    <span className="ms">swap_vert</span>
                    Stock updates feed — connects to the stock ledger.
                  </div>
                )}
                {view === 'warehouse' && (
                  <div className="empty">
                    <span className="ms">shelves</span>
                    Warehouse shelf map — connects to warehouse locations.
                  </div>
                )}
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

/* ═════════════════════════════════════════════════════════════════ *
 *  CATALOG TABLE — the product catalog table view
 * ═════════════════════════════════════════════════════════════════ */
function CatalogTable({
  products,
  selected,
  allSelected,
  onToggleSelect,
  onToggleAll,
  onToast,
  loaded,
}: {
  products: Product[];
  selected: Set<string>;
  allSelected: boolean;
  onToggleSelect: (id: string) => void;
  onToggleAll: () => void;
  onToast: (m: string) => void;
  loaded: boolean;
}) {
  if (!loaded) {
    return (
      <div className="empty">
        <span className="ms">inventory_2</span>
        Loading products…
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <div className="empty">
        <span className="ms">filter_alt_off</span>
        No products match.
        <div style={{ marginTop: 12 }}>
          <button className="btn sm" onClick={() => onToast('Clear filters')}>Clear filters</button>
        </div>
      </div>
    );
  }

  return (
    <table className="t grid-t">
      <thead>
        <tr>
          <th className="w-cb">
            <input
              type="checkbox"
              className="cbx"
              checked={allSelected}
              onChange={onToggleAll}
              aria-label="Select all"
            />
          </th>
          <th>Product Name</th>
          <th>Product Category</th>
          <th>Stock Status</th>
          <th className="r">Price per Unit</th>
          <th className="r">Unit Cost</th>
          <th>SKU</th>
          <th>Description</th>
          <th>First Day Added</th>
          <th>Channels</th>
          <th className="add-col"></th>
        </tr>
      </thead>
      <tbody>
        {products.map(p => {
          const tb = typeBadge(p.brand);
          const sc = statusClass(p.status);
          return (
            <tr
              key={p.id}
              className={`click ${selected.has(p.id) ? 'sel' : ''}`}
              onClick={() => onToast(`Open ${p.name}`)}
            >
              <td className="w-cb" onClick={e => e.stopPropagation()}>
                <input
                  type="checkbox"
                  className="cbx"
                  checked={selected.has(p.id)}
                  onChange={() => onToggleSelect(p.id)}
                  aria-label={`Select ${p.name}`}
                />
              </td>
              <td>
                <div className="prod">
                  <div className="thumb">
                    <span className="ms">image</span>
                  </div>
                  <span>
                    <span className="prod-name">{p.name}</span>
                    <span className="prod-sub mono">{p.sku}</span>
                  </span>
                </div>
                <div style={{ marginTop: 4 }}>
                  <span className={`tbadge ${tb.cls}`}>
                    <span className="ms">{tb.icon}</span>
                    {tb.label}
                  </span>
                </div>
              </td>
              <td>{p.category ?? '—'}</td>
              <td>
                <span className={`pill ${sc}`}>
                  <i className="dot"></i>
                  {p.status}
                </span>
              </td>
              <td className="r num">{money(p.price)}</td>
              <td className="r num">{money(p.cost)}</td>
              <td><span className="mono">{p.sku}</span></td>
              <td><span className="muted clamp2">{p.description ?? '—'}</span></td>
              <td>{fmtDate(p.created_at)}</td>
              <td>
                <div className="chans">
                  <span className="tag">Shopify</span>
                </div>
              </td>
              <td className="add-col"></td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
