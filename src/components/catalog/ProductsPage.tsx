'use client';
import { useMemo, useState } from 'react';
import { useProducts, fetchJson, type CatalogProductSummary } from '@/hooks/useCrmApi';
import ProductFormDrawer from './ProductFormDrawer';
interface Props { onToast: (m: string) => void; onNavigate?: (d: string, s: string) => void; }
const money = (n: number | null) => n == null ? '—' : `$${n.toFixed(2)}`;
export default function ProductsPage({ onToast }: Props) {
  const { data: products, loaded, refresh } = useProducts('', 'all');
  const [tab, setTab] = useState<'all' | 'designed' | 'needs_design' | 'published'>('all');
  const [q, setQ] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState<ProductFormDrawer.ProductFormEditTarget | null>(null);
  const total = products.length;
  const designed = products.filter(p => p.status === 'published' || p.status === 'designed').length;
  const needsDesign = products.filter(p => p.status === 'needs_design' || p.status === 'not_designed').length;
  const published = products.filter(p => p.status === 'published').length;
  const filtered = products.filter(p => { if (tab==='designed' && !(p.status==='published'||p.status==='designed')) return false; if (tab==='needs_design' && !(p.status==='needs_design'||p.status==='not_designed')) return false; if (tab==='published' && p.status!=='published') return false; if (q && !`${p.name} ${p.sku}`.toLowerCase().includes(q.toLowerCase())) return false; return true; });
  async function act(action: string, id: string) { if (action==='publish') { const r=await fetchJson(`/api/products/${id}`,{method:'PATCH',body:JSON.stringify({status:'published'})}); if(r.ok){onToast('Published');refresh();} } if (action==='archive') { const r=await fetchJson(`/api/products/${id}`,{method:'PATCH',body:JSON.stringify({status:'archived'})}); if(r.ok){onToast('Archived');refresh();} } if (action==='delete') { const r=await fetchJson(`/api/products/${id}`,{method:'DELETE'}); if(r.ok){onToast('Deleted');refresh();} } }
  return (
    <main className="px-6 pb-12">
      <div className="flex items-center justify-between py-4 flex-wrap gap-4">
        <div><h1 className="text-headline-lg">Products &amp; services</h1><p className="text-body-sm text-on-surface-variant mt-0.5">{total} products · {designed} designed · {needsDesign} need design</p></div>
        <div className="flex items-center gap-2">
          <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low flex items-center gap-1" onClick={()=>onToast('Import')}><span className="material-symbols-outlined text-[16px]">upload</span>Import</button>
          <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low flex items-center gap-1" onClick={()=>onToast('Export')}><span className="material-symbols-outlined text-[16px]">download</span>Export</button>
          <button className="h-8 px-3 bg-primary text-white text-body-md font-semibold hover:bg-primary-container flex items-center gap-1 rounded" onClick={()=>{setEditTarget(null);setShowForm(true);}}><span className="material-symbols-outlined text-[16px]">add</span>New product</button>
        </div>
      </div>
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-5">
        <div className="bg-white rounded-xl border border-surface-dim p-3"><div className="text-[10px] uppercase font-bold text-on-surface-variant">Total products</div><div className="text-headline-sm tabular-nums mt-1">{total}</div></div>
        <div className="bg-white rounded-xl border border-surface-dim p-3"><div className="text-[10px] uppercase font-bold text-on-surface-variant">Designed</div><div className="text-headline-sm tabular-nums mt-1 text-qb-blue">{designed}</div></div>
        <div className="bg-white rounded-xl border border-surface-dim p-3"><div className="text-[10px] uppercase font-bold text-on-surface-variant">Needs design</div><div className="text-headline-sm tabular-nums mt-1 text-qb-maroon">{needsDesign}</div></div>
        <div className="bg-white rounded-xl border border-surface-dim p-3"><div className="text-[10px] uppercase font-bold text-on-surface-variant">Published</div><div className="text-headline-sm tabular-nums mt-1 text-secondary">{published}</div></div>
      </div>
      <div className="flex items-center gap-1 border-b border-surface-dim mb-3">
        {[{id:'all',l:'All',c:total},{id:'designed',l:'Designed',c:designed},{id:'needs_design',l:'Needs design',c:needsDesign},{id:'published',l:'Published',c:published}].map(t=>(
          <button key={t.id} className={`px-4 py-2 text-label-md border-b-2 ${tab===t.id?'border-qb-blue text-qb-blue font-semibold':'border-transparent text-on-surface-variant'}`} onClick={()=>setTab(t.id as any)}>{t.l} <span className="ml-1 text-[10px] text-outline">{t.c}</span></button>
        ))}
      </div>
      <div className="bg-white rounded-xl border border-surface-dim overflow-hidden">
        <div className="px-4 py-2 border-b border-surface-dim flex items-center gap-2">
          <div className="relative flex items-center flex-1 max-w-sm"><span className="material-symbols-outlined absolute left-2 text-[15px] text-outline">search</span><input className="w-full h-7 pl-7 pr-2 bg-surface-container-low border border-surface-dim rounded text-body-sm focus:outline-none focus:border-primary" placeholder="Search products…" value={q} onChange={e=>setQ(e.target.value)} /></div>
          <span className="ml-auto text-[11px] text-on-surface-variant">{filtered.length} of {total}</span>
        </div>
        <div className="overflow-x-auto"><table className="w-full text-left text-body-sm">
          <thead className="bg-surface-container-low text-label-sm text-on-surface-variant uppercase tracking-wider"><tr><th className="px-3 py-2">Product</th><th className="px-3 py-2">Category</th><th className="px-3 py-2">Supplier</th><th className="px-3 py-2 text-right">Price</th><th className="px-3 py-2">Status</th><th className="w-8 px-2 py-2"></th></tr></thead>
          <tbody className="divide-y divide-surface-dim">
            {filtered.map(p=>(<tr key={p.id} className="hover:bg-surface-container-low cursor-pointer" onClick={()=>{setEditTarget({id:p.id,name:p.name,status:p.status});setShowForm(true);}}>
              <td className="px-3 py-2"><div className="font-medium">{p.name}</div><div className="text-[11px] text-on-surface-variant">{p.sku}</div></td>
              <td className="px-3 py-2 text-on-surface-variant">{p.category_name||'—'}</td>
              <td className="px-3 py-2 text-on-surface-variant">—</td>
              <td className="px-3 py-2 text-right tabular-nums">{money(p.price_min)}</td>
              <td className="px-3 py-2"><span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${p.status==='published'?'bg-secondary/15 text-secondary':p.status==='needs_design'?'bg-qb-maroon/15 text-qb-maroon':'bg-surface-container-high text-on-surface-variant'}`}>{p.status}</span></td>
              <td className="px-2 py-2 text-right"><button className="w-7 h-7 rounded hover:bg-surface-container flex items-center justify-center" onClick={e=>{e.stopPropagation();act('publish',p.id);}}><span className="material-symbols-outlined text-[16px] text-on-surface-variant">more_horiz</span></button></td>
            </tr>))}
            {filtered.length===0 && <tr><td colSpan={6} className="px-3 py-12 text-center text-on-surface-variant">{loaded?'No products found':'Loading…'}</td></tr>}
          </tbody>
        </table></div>
      </div>
      <ProductFormDrawer open={showForm} editing={editTarget} onClose={()=>{setShowForm(false);setEditTarget(null);}} onSaved={(name,mode)=>{setShowForm(false);setEditTarget(null);onToast(mode==='created'?`Product "${name}" created`:`Product "${name}" saved`);refresh();}} onToast={onToast} />
    </main>
  );
}
