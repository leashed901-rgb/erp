'use client';
import { useMemo, useState } from 'react';
import { useProducts } from '@/hooks/useCrmApi';
interface Props { onToast: (m: string) => void; onNavigate?: (d: string, s: string) => void; }
export default function ListingsPage({ onToast }: Props) {
  const { data: products, loaded } = useProducts('', 'all');
  const [tab, setTab] = useState<'published' | 'drafts' | 'ugc'>('published');
  const [q, setQ] = useState('');
  const published = products.filter(p => p.status === 'published');
  const drafts = products.filter(p => p.status === 'draft');
  const filtered = (tab==='published'?published:tab==='drafts'?drafts:published).filter(p => !q || `${p.name} ${p.sku}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <main className="px-6 pb-12">
      <div className="flex items-center justify-between py-4 flex-wrap gap-4">
        <div><h1 className="text-headline-lg">Storefront Listings</h1><p className="text-body-sm text-on-surface-variant mt-0.5">{published.length} live · {drafts.length} drafts</p></div>
        <div className="flex items-center gap-2"><button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low flex items-center gap-1" onClick={()=>onToast('View live site')}><span className="material-symbols-outlined text-[16px]">open_in_new</span>View live site</button><button className="h-8 px-3 bg-primary text-white text-body-md font-semibold hover:bg-primary-container flex items-center gap-1 rounded" onClick={()=>onToast('New listing')}><span className="material-symbols-outlined text-[16px]">add</span>New listing</button></div>
      </div>
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-5">
        <div className="bg-white rounded-xl border border-surface-dim p-3"><div className="text-[10px] uppercase font-bold text-on-surface-variant">Live listings</div><div className="text-headline-sm tabular-nums mt-1 text-secondary">{published.length}</div></div>
        <div className="bg-white rounded-xl border border-surface-dim p-3"><div className="text-[10px] uppercase font-bold text-on-surface-variant">Drafts</div><div className="text-headline-sm tabular-nums mt-1">{drafts.length}</div></div>
        <div className="bg-white rounded-xl border border-surface-dim p-3"><div className="text-[10px] uppercase font-bold text-on-surface-variant">Avg price</div><div className="text-headline-sm tabular-nums mt-1">{published.length>0?'$'+(published.reduce((s,p)=>s+(p.price_min||0),0)/published.length).toFixed(0):'—'}</div></div>
        <div className="bg-white rounded-xl border border-surface-dim p-3"><div className="text-[10px] uppercase font-bold text-on-surface-variant">Total value</div><div className="text-headline-sm tabular-nums mt-1 text-qb-teal">${published.reduce((s,p)=>s+(p.price_min||0),0).toLocaleString()}</div></div>
      </div>
      <div className="flex items-center gap-1 border-b border-surface-dim mb-3">
        <button className={`px-4 py-2 text-label-md border-b-2 ${tab==='published'?'border-qb-blue text-qb-blue font-semibold':'border-transparent text-on-surface-variant'}`} onClick={()=>setTab('published')}>Published <span className="ml-1 text-[10px] text-outline">{published.length}</span></button>
        <button className={`px-4 py-2 text-label-md border-b-2 ${tab==='drafts'?'border-qb-blue text-qb-blue font-semibold':'border-transparent text-on-surface-variant'}`} onClick={()=>setTab('drafts')}>Drafts <span className="ml-1 text-[10px] text-outline">{drafts.length}</span></button>
        <button className={`px-4 py-2 text-label-md border-b-2 ${tab==='ugc'?'border-qb-blue text-qb-blue font-semibold':'border-transparent text-on-surface-variant'}`} onClick={()=>setTab('ugc')}>UGC Moderation</button>
      </div>
      <div className="bg-white rounded-xl border border-surface-dim overflow-hidden">
        {tab==='ugc' ? <div className="py-12 text-center text-on-surface-variant"><span className="material-symbols-outlined text-[32px] text-outline-variant">rate_review</span><div className="mt-2 font-semibold text-body-md">No UGC submissions pending</div><p className="text-body-sm mt-1">Customer photos and reviews will appear here for moderation.</p></div> :
        <div className="overflow-x-auto"><table className="w-full text-left text-body-sm">
          <thead className="bg-surface-container-low text-label-sm text-on-surface-variant uppercase tracking-wider"><tr><th className="px-3 py-2">Product</th><th className="px-3 py-2">SKU</th><th className="px-3 py-2 text-right">Price</th><th className="px-3 py-2">Status</th><th className="w-8 px-2 py-2"></th></tr></thead>
          <tbody className="divide-y divide-surface-dim">
            {filtered.map(p=>(<tr key={p.id} className="hover:bg-surface-container-low"><td className="px-3 py-2 font-medium">{p.name}</td><td className="px-3 py-2 text-on-surface-variant font-mono text-[11px]">{p.sku}</td><td className="px-3 py-2 text-right tabular-nums">${(p.price_min||0).toFixed(2)}</td><td className="px-3 py-2"><span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${p.status==='published'?'bg-secondary/15 text-secondary':'bg-surface-container-high text-on-surface-variant'}`}>{p.status==='published'?'Live':'Draft'}</span></td><td className="px-2 py-2 text-right"><button className="w-7 h-7 rounded hover:bg-surface-container flex items-center justify-center" onClick={()=>onToast(`Open: ${p.name}`)}><span className="material-symbols-outlined text-[16px] text-on-surface-variant">more_horiz</span></button></td></tr>))}
            {filtered.length===0 && <tr><td colSpan={5} className="px-3 py-12 text-center text-on-surface-variant">{loaded?'No listings found':'Loading…'}</td></tr>}
          </tbody>
        </table></div>}
      </div>
    </main>
  );
}
