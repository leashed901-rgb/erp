'use client';
import { useState } from 'react';
import { useProducts, fetchJson } from '@/hooks/useCrmApi';
interface Props { onToast: (m: string) => void; onNavigate?: (d: string, s: string) => void; }
export default function BundlesPage({ onToast }: Props) {
  const { data: products, loaded, refresh } = useProducts('', 'all');
  const [tab, setTab] = useState<'all' | 'active' | 'drafts'>('all');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const bundles = products;
  const filtered = bundles.filter(b => { if (tab==='active' && b.status!=='published') return false; if (tab==='drafts' && b.status!=='draft') return false; return true; });
  const active = bundles.filter(b => b.status==='published').length;
  const drafts = bundles.filter(b => b.status==='draft').length;
  async function create() { if(!name.trim()){onToast('Name required');return;} const r=await fetchJson('/api/products',{method:'POST',body:JSON.stringify({name:name.trim(),status:'draft'})}); if(r.ok){onToast('Bundle created');setDrawerOpen(false);setName('');setPrice('');refresh();} }
  return (
    <main className="px-6 pb-12">
      <div className="flex items-center justify-between py-4 flex-wrap gap-4">
        <div><h1 className="text-headline-lg">Bundles</h1><p className="text-body-sm text-on-surface-variant mt-0.5">{bundles.length} bundles · {active} active · {drafts} drafts</p></div>
        <div className="flex items-center gap-2"><button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low flex items-center gap-1" onClick={()=>onToast('Export')}><span className="material-symbols-outlined text-[16px]">download</span>Export</button><button className="h-8 px-3 bg-primary text-white text-body-md font-semibold hover:bg-primary-container flex items-center gap-1 rounded" onClick={()=>setDrawerOpen(true)}><span className="material-symbols-outlined text-[16px]">add</span>New bundle</button></div>
      </div>
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-5">
        <div className="bg-white rounded-xl border border-surface-dim p-3"><div className="text-[10px] uppercase font-bold text-on-surface-variant">Total bundles</div><div className="text-headline-sm tabular-nums mt-1">{bundles.length}</div></div>
        <div className="bg-white rounded-xl border border-surface-dim p-3"><div className="text-[10px] uppercase font-bold text-on-surface-variant">Active</div><div className="text-headline-sm tabular-nums mt-1 text-secondary">{active}</div></div>
        <div className="bg-white rounded-xl border border-surface-dim p-3"><div className="text-[10px] uppercase font-bold text-on-surface-variant">Drafts</div><div className="text-headline-sm tabular-nums mt-1">{drafts}</div></div>
        <div className="bg-white rounded-xl border border-surface-dim p-3"><div className="text-[10px] uppercase font-bold text-on-surface-variant">Total value</div><div className="text-headline-sm tabular-nums mt-1 text-qb-teal">${bundles.reduce((s,b)=>s+(b.price_min||0),0).toLocaleString()}</div></div>
      </div>
      <div className="flex items-center gap-1 border-b border-surface-dim mb-3">
        <button className={`px-4 py-2 text-label-md border-b-2 ${tab==='all'?'border-qb-blue text-qb-blue font-semibold':'border-transparent text-on-surface-variant'}`} onClick={()=>setTab('all')}>All <span className="ml-1 text-[10px] text-outline">{bundles.length}</span></button>
        <button className={`px-4 py-2 text-label-md border-b-2 ${tab==='active'?'border-qb-blue text-qb-blue font-semibold':'border-transparent text-on-surface-variant'}`} onClick={()=>setTab('active')}>Active <span className="ml-1 text-[10px] text-outline">{active}</span></button>
        <button className={`px-4 py-2 text-label-md border-b-2 ${tab==='drafts'?'border-qb-blue text-qb-blue font-semibold':'border-transparent text-on-surface-variant'}`} onClick={()=>setTab('drafts')}>Drafts <span className="ml-1 text-[10px] text-outline">{drafts}</span></button>
      </div>
      <div className="bg-white rounded-xl border border-surface-dim overflow-hidden">
        <div className="overflow-x-auto"><table className="w-full text-left text-body-sm">
          <thead className="bg-surface-container-low text-label-sm text-on-surface-variant uppercase tracking-wider"><tr><th className="px-3 py-2">Bundle</th><th className="px-3 py-2">SKU</th><th className="px-3 py-2 text-right">Price</th><th className="px-3 py-2">Status</th><th className="w-8 px-2 py-2"></th></tr></thead>
          <tbody className="divide-y divide-surface-dim">
            {filtered.map(b=>(<tr key={b.id} className="hover:bg-surface-container-low"><td className="px-3 py-2"><div className="flex items-center gap-2"><span className="material-symbols-outlined text-[18px] text-on-surface-variant">redeem</span><div className="font-medium">{b.name}</div></div></td><td className="px-3 py-2 text-on-surface-variant font-mono text-[11px]">{b.sku}</td><td className="px-3 py-2 text-right tabular-nums">${(b.price_min||0).toFixed(2)}</td><td className="px-3 py-2"><span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${b.status==='published'?'bg-secondary/15 text-secondary':'bg-surface-container-high text-on-surface-variant'}`}>{b.status==='published'?'Active':'Draft'}</span></td><td className="px-2 py-2 text-right"><button className="w-7 h-7 rounded hover:bg-surface-container flex items-center justify-center" onClick={()=>onToast(`Edit: ${b.name}`)}><span className="material-symbols-outlined text-[16px] text-on-surface-variant">more_horiz</span></button></td></tr>))}
            {filtered.length===0 && <tr><td colSpan={5} className="px-3 py-12 text-center text-on-surface-variant">{loaded?'No bundles found':'Loading…'}</td></tr>}
          </tbody>
        </table></div>
      </div>
      {drawerOpen && (<><div className="fixed inset-0 bg-black/35 z-[200]" onClick={()=>setDrawerOpen(false)} /><div className="fixed top-0 right-0 bottom-0 w-[680px] max-w-[96vw] bg-white z-[201] flex flex-col"><div className="flex items-center justify-between px-5 h-14 border-b border-surface-dim shrink-0"><div className="flex items-center gap-2"><span className="material-symbols-outlined text-[20px] text-primary">redeem</span><div className="text-headline-sm">New bundle</div></div><button className="w-8 h-8 rounded hover:bg-surface-container flex items-center justify-center" onClick={()=>setDrawerOpen(false)}><span className="material-symbols-outlined text-[18px]">close</span></button></div><div className="flex-1 overflow-y-auto p-5 space-y-4"><div><label className="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">Bundle name</label><input className="w-full h-9 px-3 mt-1 border border-surface-dim rounded text-body-md" value={name} onChange={e=>setName(e.target.value)} autoFocus /></div><div><label className="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">Bundle price</label><input className="w-full h-9 px-3 mt-1 border border-surface-dim rounded text-body-md" type="number" value={price} onChange={e=>setPrice(e.target.value)} placeholder="$0.00" /></div><div><label className="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">Included items</label><div className="mt-1 border border-dashed border-surface-dim rounded-lg p-6 text-center text-on-surface-variant text-body-sm"><span className="material-symbols-outlined text-[24px] text-outline">add</span><div className="mt-1">Add products to this bundle</div></div></div></div><div className="h-14 border-t border-surface-dim px-4 flex items-center justify-between shrink-0"><button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low" onClick={()=>setDrawerOpen(false)}>Cancel</button><button className="h-8 px-3 bg-primary text-white rounded text-body-md font-semibold hover:bg-primary-container" onClick={create}>Create bundle</button></div></div></>)}
    </main>
  );
}
