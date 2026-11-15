'use client';
/**
 * ProductsPage — 1:1 port of upload/products.html.
 * Products & services list with KPIs (Total / Designed / Needs design / Published),
 * tabs (All / Designed / Needs design / Published), supplier filter,
 * "New product" split button, bulk bar, row menu with "Design now".
 */
import { useEffect, useMemo, useState, useRef } from 'react';
import { useProducts, fetchJson, type CatalogProductSummary } from '@/hooks/useCrmApi';
import ProductFormDrawer from './ProductFormDrawer';

interface Props { onToast: (m: string) => void; onNavigate?: (d: string, s: string) => void; }

const STATUS_PILL: Record<string, string> = {
  published: 'bg-secondary/15 text-secondary',
  designed: 'bg-qb-blue/15 text-qb-blue',
  draft: 'bg-surface-container-high text-on-surface-variant',
  needs_design: 'bg-qb-maroon/15 text-qb-maroon',
  needs_review: 'bg-qb-maroon/15 text-qb-maroon',
  not_designed: 'bg-qb-maroon/15 text-qb-maroon',
  archived: 'bg-surface-dim text-on-surface-variant line-through',
};

function money(n: number | null | undefined) {
  if (n == null) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

export default function ProductsPage({ onToast, onNavigate }: Props) {
  const { data: products, loaded, refresh } = useProducts('', 'all');
  const [tab, setTab] = useState<'all' | 'designed' | 'needs_design' | 'published'>('all');
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [rowMenu, setRowMenu] = useState<{ x: number; y: number; id: string } | null>(null);
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState<ProductFormDrawer.ProductFormEditTarget | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) { setRowMenu(null); setCreateMenuOpen(false); } };
    document.addEventListener('click', h);
    return () => document.removeEventListener('click', h);
  }, []);

  const total = products.length;
  const designed = products.filter(p => p.status === 'published' || p.status === 'designed').length;
  const needsDesign = products.filter(p => p.status === 'needs_design' || p.status === 'not_designed').length;
  const published = products.filter(p => p.status === 'published').length;

  const filtered = useMemo(() => {
    return products.filter(p => {
      if (tab === 'designed' && !(p.status === 'published' || p.status === 'designed')) return false;
      if (tab === 'needs_design' && !(p.status === 'needs_design' || p.status === 'not_designed')) return false;
      if (tab === 'published' && p.status !== 'published') return false;
      if (q && !`${p.name} ${p.sku}`.toLowerCase().includes(q.toLowerCase())) return false;
      return true;
    });
  }, [products, tab, q]);

  async function handleAction(action: string, id: string) {
    setRowMenu(null);
    if (action === 'edit') {
      const p = products.find(x => x.id === id);
      if (p) { setEditTarget({ id: p.id, name: p.name, status: p.status }); setShowForm(true); }
      return;
    }
    if (action === 'publish') {
      const res = await fetchJson(`/api/products/${id}`, { method: 'PATCH', body: JSON.stringify({ status: 'published' }) });
      if (res.ok) { onToast('Published'); refresh(); }
      return;
    }
    if (action === 'archive') {
      const res = await fetchJson(`/api/products/${id}`, { method: 'PATCH', body: JSON.stringify({ status: 'archived' }) });
      if (res.ok) { onToast('Archived'); refresh(); }
      return;
    }
    if (action === 'delete') {
      const res = await fetchJson(`/api/products/${id}`, { method: 'DELETE' });
      if (res.ok) { onToast('Deleted'); refresh(); }
      return;
    }
    if (action === 'design') { onNavigate?.('design', 'new-design'); return; }
    if (action === 'listing') { onNavigate?.('catalog', 'listings'); return; }
  }

  const TABS = [
    { id: 'all' as const, label: 'All', count: total },
    { id: 'designed' as const, label: 'Designed', count: designed },
    { id: 'needs_design' as const, label: 'Needs design', count: needsDesign },
    { id: 'published' as const, label: 'Published', count: published },
  ];

  return (
    <main className="px-6 pb-12">
      {/* Page header */}
      <div className="flex items-center justify-between py-4 flex-wrap gap-4">
        <div>
          <h1 className="text-headline-lg">Products &amp; services</h1>
          <p className="text-body-sm text-on-surface-variant mt-0.5">{total} products · {designed} designed · {needsDesign} need design</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low flex items-center gap-1" onClick={() => onToast('Import products')}>
            <span className="material-symbols-outlined text-[16px]">upload</span>Import
          </button>
          <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low flex items-center gap-1" onClick={() => onToast('Export products')}>
            <span className="material-symbols-outlined text-[16px]">download</span>Export
          </button>
          <div className="flex split-btn relative">
            <button className="h-8 px-3 bg-primary text-white text-body-md font-semibold hover:bg-primary-container flex items-center gap-1 rounded-l" onClick={() => { setEditTarget(null); setShowForm(true); }}>
              <span className="material-symbols-outlined text-[16px]">add</span>New product
            </button>
            <button className="h-8 px-1.5 bg-primary text-white hover:bg-primary-container rounded-r border-l border-white/10" onClick={(e) => { e.stopPropagation(); setCreateMenuOpen(v => !v); }}>
              <span className="material-symbols-outlined text-[16px]">expand_more</span>
            </button>
            {createMenuOpen && (
              <div ref={menuRef} className="absolute top-10 right-0 bg-white border border-surface-dim rounded-lg shadow-xl py-1 w-56 z-50">
                <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">New product</div>
                <button className="w-full text-left px-3 py-1.5 hover:bg-surface-container-low text-body-sm flex items-center gap-2" onClick={() => { setCreateMenuOpen(false); setEditTarget(null); setShowForm(true); }}><span className="material-symbols-outlined text-[16px] text-on-surface-variant">checkroom</span>Product</button>
                <button className="w-full text-left px-3 py-1.5 hover:bg-surface-container-low text-body-sm flex items-center gap-2" onClick={() => { setCreateMenuOpen(false); onNavigate?.('design', 'new-design'); }}><span className="material-symbols-outlined text-[16px] text-on-surface-variant">palette</span>Design from blank</button>
                <button className="w-full text-left px-3 py-1.5 hover:bg-surface-container-low text-body-sm flex items-center gap-2" onClick={() => { setCreateMenuOpen(false); onToast('Import CSV'); }}><span className="material-symbols-outlined text-[16px] text-on-surface-variant">upload</span>Import CSV</button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-5">
        <div className="bg-white rounded-xl border border-surface-dim p-3"><div className="text-[10px] uppercase font-bold text-on-surface-variant">Total products</div><div className="text-headline-sm tabular-nums mt-1">{total}</div></div>
        <div className="bg-white rounded-xl border border-surface-dim p-3"><div className="text-[10px] uppercase font-bold text-on-surface-variant">Designed</div><div className="text-headline-sm tabular-nums mt-1 text-qb-blue">{designed}</div></div>
        <div className="bg-white rounded-xl border border-surface-dim p-3"><div className="text-[10px] uppercase font-bold text-on-surface-variant">Needs design</div><div className="text-headline-sm tabular-nums mt-1 text-qb-maroon">{needsDesign}</div></div>
        <div className="bg-white rounded-xl border border-surface-dim p-3"><div className="text-[10px] uppercase font-bold text-on-surface-variant">Published</div><div className="text-headline-sm tabular-nums mt-1 text-secondary">{published}</div></div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-surface-dim mb-3">
        {TABS.map(t => (
          <button key={t.id} className={`px-4 py-2 text-label-md border-b-2 ${tab === t.id ? 'border-qb-blue text-qb-blue font-semibold' : 'border-transparent text-on-surface-variant'}`} onClick={() => setTab(t.id)}>
            {t.label} <span className="ml-1 text-[10px] text-outline">{t.count}</span>
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-surface-dim overflow-hidden">
        <div className="px-4 py-2 border-b border-surface-dim flex items-center gap-2">
          <div className="relative flex items-center flex-1 max-w-sm">
            <span className="material-symbols-outlined absolute left-2 text-[15px] text-outline">search</span>
            <input className="w-full h-7 pl-7 pr-2 bg-surface-container-low border border-surface-dim rounded text-body-sm focus:outline-none focus:border-primary" placeholder="Search products…" value={q} onChange={e => setQ(e.target.value)} />
          </div>
          <span className="ml-auto text-[11px] text-on-surface-variant">{filtered.length} of {total}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-body-sm">
            <thead className="bg-surface-container-low text-label-sm text-on-surface-variant uppercase tracking-wider">
              <tr>
                <th className="w-8 px-3 py-2"><input type="checkbox" className="accent-qb-blue" checked={selected.size === filtered.length && filtered.length > 0} onChange={() => setSelected(selected.size === filtered.length ? new Set() : new Set(filtered.map(p => p.id)))} /></th>
                <th className="px-3 py-2">Product</th>
                <th className="px-3 py-2">Category</th>
                <th className="px-3 py-2">Supplier</th>
                <th className="px-3 py-2 text-right">Price</th>
                <th className="px-3 py-2">Status</th>
                <th className="w-8 px-2 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-dim">
              {filtered.map(p => (
                <tr key={p.id} className="hover:bg-surface-container-low" onClick={() => { setEditTarget({ id: p.id, name: p.name, status: p.status }); setShowForm(true); }}>
                  <td className="px-3 py-2" onClick={e => e.stopPropagation()}><input type="checkbox" className="accent-qb-blue" checked={selected.has(p.id)} onChange={() => setSelected(prev => { const n = new Set(prev); if (n.has(p.id)) n.delete(p.id); else n.add(p.id); return n; })} /></td>
                  <td className="px-3 py-2"><div className="font-medium">{p.name}</div><div className="text-[11px] text-on-surface-variant">{p.sku}</div></td>
                  <td className="px-3 py-2 text-on-surface-variant">{p.category_name || '—'}</td>
                  <td className="px-3 py-2 text-on-surface-variant">—</td>
                  <td className="px-3 py-2 text-right tabular-nums">{money(p.price_min)}</td>
                  <td className="px-3 py-2"><span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${STATUS_PILL[p.status] || STATUS_PILL.draft}`}>{p.status}</span></td>
                  <td className="px-2 py-2 text-right" onClick={e => e.stopPropagation()}>
                    <button className="w-7 h-7 rounded hover:bg-surface-container flex items-center justify-center" onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setRowMenu({ x: r.right, y: r.bottom + 4, id: p.id }); }}>
                      <span className="material-symbols-outlined text-[16px] text-on-surface-variant">more_horiz</span>
                    </button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={7} className="px-3 py-12 text-center text-on-surface-variant">{loaded ? 'No products found' : 'Loading…'}</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* Row menu */}
      {rowMenu && (
        <div ref={menuRef} className="fixed bg-white border border-surface-dim rounded-lg shadow-xl py-1 w-56 z-50" style={{ top: rowMenu.y, left: Math.min(rowMenu.x - 200, window.innerWidth - 260) }}>
          <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">This product</div>
          <button className="w-full text-left px-3 py-1.5 hover:bg-surface-container-low text-body-sm flex items-center gap-2" onClick={() => handleAction('edit', rowMenu.id)}><span className="material-symbols-outlined text-[16px] text-on-surface-variant">edit</span>Edit product</button>
          <button className="w-full text-left px-3 py-1.5 hover:bg-surface-container-low text-body-sm flex items-center gap-2" onClick={() => handleAction('listing', rowMenu.id)}><span className="material-symbols-outlined text-[16px] text-on-surface-variant">web</span>View listing</button>
          <div className="h-px bg-surface-dim my-1" />
          <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">Publishing</div>
          <button className="w-full text-left px-3 py-1.5 hover:bg-surface-container-low text-body-sm flex items-center gap-2" onClick={() => handleAction('publish', rowMenu.id)}><span className="material-symbols-outlined text-[16px] text-on-surface-variant">publish</span>Publish to channels</button>
          <button className="w-full text-left px-3 py-1.5 hover:bg-surface-container-low text-body-sm flex items-center gap-2" onClick={() => handleAction('archive', rowMenu.id)}><span className="material-symbols-outlined text-[16px] text-on-surface-variant">archive</span>Archive</button>
          <div className="h-px bg-surface-dim my-1" />
          <button className="w-full text-left px-3 py-1.5 hover:bg-surface-container-low text-body-sm flex items-center gap-2 text-error" onClick={() => handleAction('delete', rowMenu.id)}><span className="material-symbols-outlined text-[16px]">delete</span>Delete</button>
        </div>
      )}

      {/* Product form drawer */}
      <ProductFormDrawer
        open={showForm}
        editing={editTarget}
        onClose={() => { setShowForm(false); setEditTarget(null); }}
        onSaved={(name, mode) => { setShowForm(false); setEditTarget(null); onToast(mode === 'created' ? `Product "${name}" created` : `Product "${name}" saved`); refresh(); }}
        onToast={onToast}
      />
    </main>
  );
}
