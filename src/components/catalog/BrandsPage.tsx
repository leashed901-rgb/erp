'use client';
/**
 * BrandsPage — 1:1 port of upload/brands.html.
 * Brand identity & storefront theme management.
 * KPIs: Active brands / Primary brand / Theme variables / Missing assets.
 * "New brand" split button. Detail drawer with colors, typography, domain.
 */
import { useEffect, useState } from 'react';
import { useProducts } from '@/hooks/useCrmApi';

interface Props { onToast: (m: string) => void; onNavigate?: (d: string, s: string) => void; }

export default function BrandsPage({ onToast }: Props) {
  const { data: products } = useProducts('', 'all');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [brandName, setBrandName] = useState('');

  // Derive brands from products' brand field
  const brandMap = new Map<string, number>();
  products.forEach(p => {
    if (p.brand) brandMap.set(p.brand, (brandMap.get(p.brand) || 0) + 1);
  });
  const brands = Array.from(brandMap.entries()).map(([name, count], i) => ({
    id: `brand-${i}`,
    name,
    productCount: count,
    colors: ['#0a6400', '#faf9fc', '#1a1c1e'],
    font: 'Inter',
    domain: '',
    status: 'Active',
  }));

  return (
    <main className="px-6 pb-12">
      {/* Page header */}
      <div className="flex items-center justify-between py-4 flex-wrap gap-4">
        <div>
          <h1 className="text-headline-lg">Brands</h1>
          <p className="text-body-sm text-on-surface-variant mt-0.5">{brands.length} active brands · managing {products.length} products</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low flex items-center gap-1" onClick={() => onToast('Export brand assets')}><span className="material-symbols-outlined text-[16px]">download</span>Export</button>
          <div className="flex split-btn">
            <button className="h-8 px-3 bg-primary text-white text-body-md font-semibold hover:bg-primary-container flex items-center gap-1 rounded-l" onClick={() => { setBrandName(''); setDrawerOpen(true); }}><span className="material-symbols-outlined text-[16px]">add</span>New brand</button>
            <button className="h-8 px-1.5 bg-primary text-white hover:bg-primary-container rounded-r border-l border-white/10" onClick={() => onToast('New brand asset')}><span className="material-symbols-outlined text-[16px]">expand_more</span></button>
          </div>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-5">
        <div className="bg-white rounded-xl border border-surface-dim p-3"><div className="text-[10px] uppercase font-bold text-on-surface-variant">Active brands</div><div className="text-headline-sm tabular-nums mt-1">{brands.length}</div><div className="text-[11px] text-on-surface-variant mt-0.5">Managing {products.length} products</div></div>
        <div className="bg-white rounded-xl border border-surface-dim p-3"><div className="text-[10px] uppercase font-bold text-on-surface-variant">Primary brand</div><div className="text-headline-sm mt-1">{brands[0]?.name || '—'}</div></div>
        <div className="bg-white rounded-xl border border-surface-dim p-3"><div className="text-[10px] uppercase font-bold text-on-surface-variant">Theme variables</div><div className="text-headline-sm tabular-nums mt-1">12</div><div className="text-[11px] text-on-surface-variant mt-0.5">Colors, fonts, spacing</div></div>
        <div className="bg-white rounded-xl border border-surface-dim p-3"><div className="text-[10px] uppercase font-bold text-on-surface-variant">Missing assets</div><div className="text-headline-sm tabular-nums mt-1 text-qb-maroon">0</div><div className="text-[11px] text-on-surface-variant mt-0.5">Favicons, logos</div></div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-surface-dim mb-3">
        <button className="px-4 py-2 text-label-md border-b-2 border-qb-blue text-qb-blue font-semibold">All</button>
        <button className="px-4 py-2 text-label-md border-b-2 border-transparent text-on-surface-variant">Active</button>
        <button className="px-4 py-2 text-label-md border-b-2 border-transparent text-on-surface-variant">Drafts</button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-surface-dim overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-body-sm">
            <thead className="bg-surface-container-low text-label-sm text-on-surface-variant uppercase tracking-wider">
              <tr>
                <th className="px-3 py-2">Brand</th>
                <th className="px-3 py-2">Colors</th>
                <th className="px-3 py-2">Typography</th>
                <th className="px-3 py-2">Products</th>
                <th className="px-3 py-2">Status</th>
                <th className="w-8 px-2 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-dim">
              {brands.map(b => (
                <tr key={b.id} className="hover:bg-surface-container-low">
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded bg-qb-navy text-white flex items-center justify-center text-[11px] font-bold">{b.name[0]?.toUpperCase()}</div>
                      <div><div className="font-medium">{b.name}</div><div className="text-[11px] text-on-surface-variant">{b.domain || 'No domain'}</div></div>
                    </div>
                  </td>
                  <td className="px-3 py-2"><div className="flex gap-1">{b.colors.map((c, i) => <div key={i} className="w-5 h-5 rounded border border-surface-dim" style={{ background: c }} />)}</div></td>
                  <td className="px-3 py-2 text-on-surface-variant">{b.font}</td>
                  <td className="px-3 py-2 tabular-nums">{b.productCount}</td>
                  <td className="px-3 py-2"><span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-secondary/15 text-secondary">Active</span></td>
                  <td className="px-2 py-2 text-right"><button className="w-7 h-7 rounded hover:bg-surface-container flex items-center justify-center" onClick={() => onToast(`Edit brand: ${b.name}`)}><span className="material-symbols-outlined text-[16px] text-on-surface-variant">more_horiz</span></button></td>
                </tr>
              ))}
              {brands.length === 0 && <tr><td colSpan={6} className="px-3 py-12 text-center text-on-surface-variant">No brands found. Products with a brand field will appear here.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* Brand drawer */}
      {drawerOpen && (
        <>
          <div className="fixed inset-0 bg-black/35 z-[200]" onClick={() => setDrawerOpen(false)} />
          <div className="fixed top-0 right-0 bottom-0 w-[680px] max-w-[96vw] bg-white z-[201] flex flex-col">
            <div className="flex items-center justify-between px-5 h-14 border-b border-surface-dim shrink-0">
              <div className="flex items-center gap-2"><span className="material-symbols-outlined text-[20px] text-primary">branding_watermark</span><div className="text-headline-sm">New brand</div></div>
              <button className="w-8 h-8 rounded hover:bg-surface-container flex items-center justify-center" onClick={() => setDrawerOpen(false)}><span className="material-symbols-outlined text-[18px]">close</span></button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <div><label className="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">Brand name</label><input className="w-full h-9 px-3 mt-1 border border-surface-dim rounded text-body-md" value={brandName} onChange={e => setBrandName(e.target.value)} autoFocus /></div>
              <div><label className="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">Domain</label><input className="w-full h-9 px-3 mt-1 border border-surface-dim rounded text-body-md" placeholder="example.com" /></div>
              <div><label className="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">Colors</label><div className="mt-1 space-y-2">
                <div className="flex items-center gap-2"><input type="color" className="w-8 h-8 rounded border border-surface-dim" defaultValue="#0a6400" /><input className="flex-1 h-9 px-3 border border-surface-dim rounded text-body-sm font-mono" defaultValue="#0a6400" /></div>
                <div className="flex items-center gap-2"><input type="color" className="w-8 h-8 rounded border border-surface-dim" defaultValue="#faf9fc" /><input className="flex-1 h-9 px-3 border border-surface-dim rounded text-body-sm font-mono" defaultValue="#faf9fc" /></div>
              </div></div>
              <div><label className="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">Typography</label><select className="w-full h-9 px-3 mt-1 border border-surface-dim rounded text-body-md"><option>Inter</option><option>Geist</option><option>Roboto</option></select></div>
            </div>
            <div className="h-14 border-t border-surface-dim px-4 flex items-center justify-between shrink-0">
              <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low" onClick={() => setDrawerOpen(false)}>Cancel</button>
              <button className="h-8 px-3 bg-primary text-white rounded text-body-md font-semibold hover:bg-primary-container" onClick={() => { onToast(`Brand "${brandName}" created`); setDrawerOpen(false); }}>Save brand</button>
            </div>
          </div>
        </>
      )}
    </main>
  );
}
