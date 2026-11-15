'use client';
import { useEffect, useState } from 'react';
interface Props { onToast: (m: string) => void; onNavigate?: (d: string, s: string) => void; }
interface Store { id: string; name: string; platform?: string; domain?: string; status?: string; is_active?: boolean; listing_count?: number; needs_sync?: number; last_sync?: string; }
export default function EcommercePage({ onToast }: Props) {
  const [stores, setStores] = useState<Store[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState<'all' | 'storefronts' | 'marketplaces' | 'needs_sync'>('all');
  const [drawerOpen, setDrawerOpen] = useState(false);
  useEffect(() => { fetch('/api/v1/stores').then(r=>r.json()).then(j=>{setStores(j.data||[]);setLoaded(true);}).catch(()=>setLoaded(true)); }, []);
  const filtered = stores.filter(s => { if (tab==='needs_sync' && !(s.needs_sync&&s.needs_sync>0)) return false; return true; });
  const connected = stores.filter(s=>s.is_active!==false).length;
  const needsSync = stores.filter(s=>s.needs_sync&&s.needs_sync>0).length;
  const errors = stores.filter(s=>s.status==='error').length;
  const totalListings = stores.reduce((s,st)=>s+(st.listing_count||0),0);
  return (
    <main className="px-6 pb-12">
      <div className="flex items-center justify-between py-4 flex-wrap gap-4">
        <div><h1 className="text-headline-lg">Ecommerce</h1><p className="text-body-sm text-on-surface-variant mt-0.5">{connected} connected · {totalListings} listings · {needsSync} need sync</p></div>
        <div className="flex items-center gap-2"><button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low flex items-center gap-1" onClick={()=>onToast('Sync all')}><span className="material-symbols-outlined text-[16px]">sync</span>Sync all</button><button className="h-8 px-3 bg-primary text-white text-body-md font-semibold hover:bg-primary-container flex items-center gap-1 rounded" onClick={()=>setDrawerOpen(true)}><span className="material-symbols-outlined text-[16px]">add</span>Connect channel</button></div>
      </div>
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-5">
        <div className="bg-white rounded-xl border border-surface-dim p-3"><div className="text-[10px] uppercase font-bold text-on-surface-variant">Connected channels</div><div className="text-headline-sm tabular-nums mt-1">{connected}</div></div>
        <div className="bg-white rounded-xl border border-surface-dim p-3"><div className="text-[10px] uppercase font-bold text-on-surface-variant">Synced listings</div><div className="text-headline-sm tabular-nums mt-1 text-secondary">{totalListings}</div></div>
        <div className="bg-white rounded-xl border border-surface-dim p-3"><div className="text-[10px] uppercase font-bold text-on-surface-variant">Needs sync</div><div className={`text-headline-sm tabular-nums mt-1 ${needsSync>0?'text-qb-maroon':''}`}>{needsSync}</div></div>
        <div className="bg-white rounded-xl border border-surface-dim p-3"><div className="text-[10px] uppercase font-bold text-on-surface-variant">Failed syncs</div><div className={`text-headline-sm tabular-nums mt-1 ${errors>0?'text-error':''}`}>{errors}</div></div>
      </div>
      <div className="flex items-center gap-1 border-b border-surface-dim mb-3">
        <button className={`px-4 py-2 text-label-md border-b-2 ${tab==='all'?'border-qb-blue text-qb-blue font-semibold':'border-transparent text-on-surface-variant'}`} onClick={()=>setTab('all')}>All</button>
        <button className={`px-4 py-2 text-label-md border-b-2 ${tab==='storefronts'?'border-qb-blue text-qb-blue font-semibold':'border-transparent text-on-surface-variant'}`} onClick={()=>setTab('storefronts')}>Storefronts</button>
        <button className={`px-4 py-2 text-label-md border-b-2 ${tab==='marketplaces'?'border-qb-blue text-qb-blue font-semibold':'border-transparent text-on-surface-variant'}`} onClick={()=>setTab('marketplaces')}>Marketplaces</button>
        <button className={`px-4 py-2 text-label-md border-b-2 ${tab==='needs_sync'?'border-qb-blue text-qb-blue font-semibold':'border-transparent text-on-surface-variant'}`} onClick={()=>setTab('needs_sync')}>Needs sync <span className="ml-1 text-[10px] text-outline">{needsSync}</span></button>
      </div>
      <div className="bg-white rounded-xl border border-surface-dim overflow-hidden">
        <div className="overflow-x-auto"><table className="w-full text-left text-body-sm">
          <thead className="bg-surface-container-low text-label-sm text-on-surface-variant uppercase tracking-wider"><tr><th className="px-3 py-2">Channel</th><th className="px-3 py-2">Category</th><th className="px-3 py-2 text-right">Listings</th><th className="px-3 py-2 text-right">Needs sync</th><th className="px-3 py-2">Last sync</th><th className="px-3 py-2">Status</th><th className="w-8 px-2 py-2"></th></tr></thead>
          <tbody className="divide-y divide-surface-dim">
            {filtered.map(s=>{const letter=(s.name||'C')[0].toUpperCase(); const colorClass=s.platform==='shopify'?'bg-qb-green':s.platform==='tiktok'?'bg-qb-maroon':s.platform==='etsy'?'bg-qb-maroon':'bg-qb-blue'; const statusClass=s.status==='error'?'bg-error/15 text-error':s.needs_sync?'bg-qb-maroon/15 text-qb-maroon':'bg-secondary/15 text-secondary'; const statusLabel=s.status==='error'?'Error':s.needs_sync?'Needs sync':'Connected'; return (
              <tr key={s.id} className="hover:bg-surface-container-low"><td className="px-3 py-2"><div className="flex items-center gap-2"><div className={`w-7 h-7 rounded ${colorClass} text-white flex items-center justify-center text-[11px] font-bold`}>{letter}</div><div><div className="font-medium">{s.name}</div><div className="text-[11px] text-on-surface-variant">{s.domain||s.platform||'Custom'}</div></div></div></td><td className="px-3 py-2 text-on-surface-variant">{s.platform==='shopify'?'Storefront':'Marketplace'}</td><td className="px-3 py-2 text-right tabular-nums">{s.listing_count||0}</td><td className="px-3 py-2 text-right tabular-nums">{s.needs_sync||0}</td><td className="px-3 py-2 text-on-surface-variant text-[11px]">{s.last_sync||'—'}</td><td className="px-3 py-2"><span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${statusClass}`}>{statusLabel}</span></td><td className="px-2 py-2 text-right"><button className="w-7 h-7 rounded hover:bg-surface-container flex items-center justify-center" onClick={()=>onToast(`Sync: ${s.name}`)}><span className="material-symbols-outlined text-[16px] text-on-surface-variant">sync</span></button></td></tr>
            );})}
            {filtered.length===0 && <tr><td colSpan={7} className="px-3 py-12 text-center text-on-surface-variant">{loaded?'No channels connected':'Loading…'}</td></tr>}
          </tbody>
        </table></div>
      </div>
      {drawerOpen && (<><div className="fixed inset-0 bg-black/35 z-[200]" onClick={()=>setDrawerOpen(false)} /><div className="fixed top-0 right-0 bottom-0 w-[680px] max-w-[96vw] bg-white z-[201] flex flex-col"><div className="flex items-center justify-between px-5 h-14 border-b border-surface-dim shrink-0"><div className="flex items-center gap-2"><span className="material-symbols-outlined text-[20px] text-primary">link</span><div className="text-headline-sm">Connect channel</div></div><button className="w-8 h-8 rounded hover:bg-surface-container flex items-center justify-center" onClick={()=>setDrawerOpen(false)}><span className="material-symbols-outlined text-[18px]">close</span></button></div><div className="flex-1 overflow-y-auto p-5 space-y-3">{['Shopify','TikTok Shop','Etsy','Amazon Seller','Custom API / Headless'].map(p=><button key={p} className="w-full text-left p-4 border border-surface-dim rounded-lg hover:border-primary hover:bg-surface-container-low flex items-center gap-3" onClick={()=>{onToast(`Connect ${p}`);setDrawerOpen(false);}}><span className="material-symbols-outlined text-[24px] text-on-surface-variant">storefront</span><div className="flex-1"><div className="font-medium text-body-md">{p}</div><div className="text-[11px] text-on-surface-variant">Connect via OAuth or API key</div></div><span className="material-symbols-outlined text-[16px] text-outline">chevron_right</span></button>)}</div></div></>)}
    </main>
  );
}
