'use client';
import { useEffect, useState } from 'react';
import { useProducts, useParties } from '@/hooks/useCrmApi';
interface Props { onToast: (m: string) => void; onNavigate?: (d: string, s: string) => void; }
export default function CatalogOverview({ onToast, onNavigate }: Props) {
  const { data: products } = useProducts('', 'all');
  const { data: suppliers } = useParties('supplier');
  const [stores, setStores] = useState<any[]>([]);
  const [collections, setCollections] = useState<any[]>([]);
  useEffect(() => { fetch('/api/v1/stores').then(r=>r.json()).then(j=>setStores(j.data||[])).catch(()=>{}); fetch('/api/v1/collections').then(r=>r.json()).then(j=>setCollections(j.data||[])).catch(()=>{}); }, []);
  const published = products.filter(p => p.status === 'published').length;
  const needsDesign = products.filter(p => p.status === 'needs_design' || p.status === 'not_designed').length;
  const needsReview = products.filter(p => p.status === 'needs_review').length;
  const designedPct = products.length > 0 ? Math.round(published / products.length * 100) : 0;
  return (
    <main className="px-6 pb-12">
      <div className="py-4"><h1 className="text-headline-lg">Catalog overview</h1><p className="text-body-sm text-on-surface-variant mt-0.5">Health, activity, and alerts across products, suppliers, channels, and collections</p></div>
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-5">
        <div className="bg-white border border-surface-dim rounded-xl p-3.5 cursor-pointer hover:border-qb-blue" onClick={() => onNavigate?.('catalog','products')}><div className="text-[10px] uppercase tracking-wider font-bold text-on-surface-variant flex items-center gap-1.5"><span className="material-symbols-outlined text-[14px] text-qb-blue">inventory</span>Products</div><div className="text-2xl font-bold tabular-nums mt-1">{products.length}</div><div className="text-[11px] text-on-surface-variant mt-0.5">{suppliers.length} suppliers · {published} designed</div></div>
        <div className="bg-white border border-surface-dim rounded-xl p-3.5 cursor-pointer hover:border-qb-blue"><div className="text-[10px] uppercase tracking-wider font-bold text-on-surface-variant flex items-center gap-1.5"><span className="material-symbols-outlined text-[14px] text-qb-teal">qr_code</span>Variants &amp; SKUs</div><div className="text-2xl font-bold tabular-nums mt-1">{products.length * 3}</div><div className="text-[11px] text-on-surface-variant mt-0.5">Estimated from products</div></div>
        <div className="bg-white border border-surface-dim rounded-xl p-3.5 cursor-pointer hover:border-qb-blue"><div className="text-[10px] uppercase tracking-wider font-bold text-on-surface-variant flex items-center gap-1.5"><span className="material-symbols-outlined text-[14px] text-qb-maroon">factory</span>Suppliers</div><div className="text-2xl font-bold tabular-nums mt-1">{suppliers.length}</div><div className="text-[11px] text-on-surface-variant mt-0.5">Active partners</div></div>
        <div className="bg-white border border-surface-dim rounded-xl p-3.5 cursor-pointer hover:border-qb-blue" onClick={() => onNavigate?.('catalog','ecommerce')}><div className="text-[10px] uppercase tracking-wider font-bold text-on-surface-variant flex items-center gap-1.5"><span className="material-symbols-outlined text-[14px] text-qb-green">local_mall</span>Channels</div><div className="text-2xl font-bold tabular-nums mt-1">{stores.length}</div><div className="text-[11px] text-on-surface-variant mt-0.5">{stores.length} connected</div></div>
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mb-5">
        <div className="xl:col-span-2 bg-white rounded-xl border border-surface-dim p-5">
          <div className="flex items-center justify-between mb-3"><h2 className="text-headline-sm">Catalog health</h2><span className="text-[11px] text-on-surface-variant">{products.length} products</span></div>
          <div className="space-y-2">
            <div className="flex items-center gap-3"><div className="w-32 text-[12px] text-on-surface-variant text-right">Designed &amp; live</div><div className="flex-1"><div className="h-6 bg-surface-container-low rounded overflow-hidden"><div className="h-full rounded flex items-center justify-end pr-2 text-[11px] font-semibold text-white" style={{width:`${Math.max(2,designedPct)}%`,background:'#1e5a38'}}>{published}</div></div></div></div>
            <div className="flex items-center gap-3"><div className="w-32 text-[12px] text-on-surface-variant text-right">Needs design</div><div className="flex-1"><div className="h-6 bg-surface-container-low rounded overflow-hidden"><div className="h-full rounded flex items-center justify-end pr-2 text-[11px] font-semibold text-white" style={{width:`${Math.max(2,100-designedPct)}%`,background:'#8a5a00'}}>{needsDesign}</div></div></div></div>
            {needsReview > 0 && <div className="flex items-center gap-3"><div className="w-32 text-[12px] text-on-surface-variant text-right">Needs review</div><div className="flex-1"><div className="h-6 bg-surface-container-low rounded overflow-hidden"><div className="h-full rounded flex items-center justify-end pr-2 text-[11px] font-semibold text-white" style={{width:`${Math.max(1,Math.round(needsReview/products.length*100))}%`,background:'#6b1e28'}}>{needsReview}</div></div></div></div>}
          </div>
          <div className="flex items-center gap-4 mt-3 pt-3 border-t border-surface-dim text-[11px] text-on-surface-variant"><span><span className="font-semibold text-on-surface">{designedPct}%</span> designed</span><span><span className="font-semibold text-on-surface">{100-designedPct}%</span> needs design</span></div>
        </div>
        <div className="bg-white rounded-xl border border-surface-dim p-5">
          <div className="flex items-center justify-between mb-3"><h2 className="text-headline-sm">Needs attention</h2><span className="text-[11px] text-error font-semibold">{needsReview} items</span></div>
          {needsReview > 0 ? <div className="flex items-center gap-2.5 py-2.5 border-b border-surface-container-low cursor-pointer hover:bg-surface-container-low rounded px-1" onClick={() => onNavigate?.('catalog','products')}><span className="material-symbols-outlined text-[18px] text-qb-maroon">image_not_supported</span><div className="min-w-0 flex-1"><div className="text-body-sm font-medium">{needsReview} products need review</div><div className="text-[11px] text-on-surface-variant">Image · price · category missing</div></div><span className="material-symbols-outlined text-[14px] text-outline">chevron_right</span></div>
          : <div className="py-6 text-center text-on-surface-variant text-body-sm"><span className="material-symbols-outlined text-[28px] text-secondary">check_circle</span><div className="mt-1">All clear</div></div>}
        </div>
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mb-5">
        <div className="bg-white rounded-xl border border-surface-dim p-5"><h2 className="text-headline-sm mb-3">Jump to</h2><div className="space-y-1">
          {[{l:'Products',i:'inventory',c:products.length,t:['catalog','products']},{l:'Listings',i:'web',c:published,t:['catalog','listings']},{l:'Bundles',i:'redeem',c:'—',t:['catalog','bundles']},{l:'Suppliers',i:'factory',c:suppliers.length,t:['catalog','catalog-parties']},{l:'Brands',i:'branding_watermark',c:'—',t:['catalog','brands']},{l:'Channels',i:'local_mall',c:stores.length,t:['catalog','ecommerce']},{l:'Collections',i:'category',c:collections.length,t:['catalog','categories']}].map(r=>(
            <button key={r.l} className="w-full text-left px-3 py-2 rounded hover:bg-surface-container-low flex items-center gap-2" onClick={()=>onNavigate?.(r.t[0] as any,r.t[1])}><span className="material-symbols-outlined text-[18px] text-qb-blue">{r.i}</span><span className="flex-1 text-body-sm font-medium">{r.l}</span><span className="text-[11px] text-on-surface-variant">{r.c}</span></button>
          ))}
        </div></div>
        <div className="xl:col-span-2 bg-white rounded-xl border border-surface-dim p-5"><div className="flex items-center justify-between mb-3"><h2 className="text-headline-sm">Channel health</h2><button className="text-[11px] text-primary font-semibold hover:underline" onClick={()=>onNavigate?.('catalog','ecommerce')}>Manage</button></div>
          <div className="space-y-2">{stores.length===0 ? <div className="py-4 text-center text-on-surface-variant text-body-sm">No channels connected.</div> : stores.map(ch=>{const letter=(ch.name||'C')[0].toUpperCase();return <div key={ch.id} className="flex items-center gap-3 py-2 border-b border-surface-container-low last:border-0"><div className="w-7 h-7 rounded bg-qb-blue text-white flex items-center justify-center text-[11px] font-bold">{letter}</div><div className="flex-1 min-w-0"><div className="text-body-sm font-medium">{ch.name}</div><div className="text-[11px] text-on-surface-variant">{ch.platform||'Custom'}</div></div><span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-secondary/15 text-secondary">Connected</span></div>})}</div>
        </div>
      </div>
    </main>
  );
}
