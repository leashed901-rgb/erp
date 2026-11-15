'use client';
import { useState } from 'react';
import { useParties } from '@/hooks/useCrmApi';
interface Props { onToast: (m: string) => void; onNavigate?: (d: string, s: string) => void; }
export default function PricingPage({ onToast, onNavigate }: Props) {
  const { data: suppliers } = useParties('supplier');
  const [category, setCategory] = useState('Apparel');
  const [catOpen, setCatOpen] = useState(false);
  const CATEGORIES = [{g:'Apparel & Accessories',i:['Apparel','Headwear','Accessories']},{g:'Home & Living',i:['Drinkware','Wall Art','Home & Living']},{g:'Other',i:['Business','Cards','Games','Keepsakes','Technology','Wellness']}];
  const rows = suppliers.slice(0,5).map((s,i) => { const base=8+Math.random()*4; const ship=3+Math.random()*2; return { id:s.id, name:s.display_name||s.name||`Supplier ${i+1}`, sku:`SKU-${1000+i}`, baseCost:Math.round(base*100)/100, shipping:Math.round(ship*100)/100, totalCost:Math.round((base+ship)*100)/100, leadTime:`${1+i}–${2+i} days` }; });
  const cheapest = rows.length>0 ? rows.reduce((m,s)=>s.totalCost<m.totalCost?s:m, rows[0]) : null;
  return (
    <main className="px-6 pb-12">
      <div className="flex items-center justify-between py-4 flex-wrap gap-4">
        <div><h1 className="text-headline-lg">Pricing</h1><p className="text-body-sm text-on-surface-variant mt-0.5">Compare supplier costs for canonical products across categories</p></div>
        <div className="relative"><button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low flex items-center gap-1" onClick={()=>setCatOpen(v=>!v)}><span className="material-symbols-outlined text-[16px]">category</span>{category} <span className="material-symbols-outlined text-[14px]">expand_more</span></button>
        {catOpen && <div className="absolute top-10 right-0 bg-white border border-surface-dim rounded-lg shadow-xl py-2 w-56 z-50">{CATEGORIES.map(g=><div key={g.g}><div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">{g.g}</div>{g.i.map(c=><button key={c} className={`w-full text-left px-3 py-1.5 hover:bg-surface-container-low text-body-sm ${c===category?'text-primary font-semibold':''}`} onClick={()=>{setCategory(c);setCatOpen(false);}}>{c}</button>)}</div>)}</div>}</div>
      </div>
      <div className="bg-white rounded-xl border border-surface-dim p-4 mb-4"><div className="flex items-center gap-3"><span className="material-symbols-outlined text-[24px] text-qb-blue">checkroom</span><div><div className="text-[11px] text-on-surface-variant">{category} › Black T-Shirt</div><div className="text-headline-sm">Price Comparison</div></div></div></div>
      <div className="bg-white rounded-xl border border-surface-dim overflow-hidden">
        <div className="px-4 py-2 border-b border-surface-dim bg-surface-container-low flex items-center justify-between"><h2 className="text-headline-sm">Suppliers for {category}</h2><span className="text-[11px] text-on-surface-variant">{rows.length} suppliers</span></div>
        <div className="overflow-x-auto"><table className="w-full text-left text-body-sm">
          <thead className="bg-surface-container-low text-label-sm text-on-surface-variant uppercase tracking-wider"><tr><th className="px-3 py-2">Supplier</th><th className="px-3 py-2">SKU / Location</th><th className="px-3 py-2 text-right">Base cost</th><th className="px-3 py-2 text-right">Shipping (est.)</th><th className="px-3 py-2 text-right">Total cost</th><th className="px-3 py-2">Lead time</th><th className="w-8 px-2 py-2"></th></tr></thead>
          <tbody className="divide-y divide-surface-dim">
            {rows.map(s=>(<tr key={s.id} className={`hover:bg-surface-container-low ${cheapest?.id===s.id?'bg-secondary/5':''}`}><td className="px-3 py-2"><div className="flex items-center gap-2"><div className="w-7 h-7 rounded bg-qb-blue text-white flex items-center justify-center text-[11px] font-bold">{s.name[0]?.toUpperCase()}</div><div><div className="font-medium">{s.name}</div>{cheapest?.id===s.id && <span className="text-[10px] text-secondary font-bold">Cheapest</span>}</div></div></td><td className="px-3 py-2 text-on-surface-variant font-mono text-[11px]">{s.sku}</td><td className="px-3 py-2 text-right tabular-nums">${s.baseCost.toFixed(2)}</td><td className="px-3 py-2 text-right tabular-nums">${s.shipping.toFixed(2)}</td><td className={`px-3 py-2 text-right tabular-nums font-bold ${cheapest?.id===s.id?'text-secondary':''}`}>${s.totalCost.toFixed(2)}</td><td className="px-3 py-2 text-on-surface-variant">{s.leadTime}</td><td className="px-2 py-2 text-right"><button className="w-7 h-7 rounded hover:bg-surface-container flex items-center justify-center" onClick={()=>onNavigate?.('design','new-design')}><span className="material-symbols-outlined text-[16px] text-on-surface-variant">palette</span></button></td></tr>))}
            {rows.length===0 && <tr><td colSpan={7} className="px-3 py-12 text-center text-on-surface-variant">No suppliers found.</td></tr>}
          </tbody>
        </table></div>
      </div>
    </main>
  );
}
