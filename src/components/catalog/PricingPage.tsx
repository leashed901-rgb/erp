'use client';
/**
 * PricingPage.tsx — 1:1 port of upload/pricing.html
 * Installed from the HTML file you provided. Renders the exact layout.
 */
interface Props {
  onToast: (m: string) => void;
  onNavigate?: (d: string, s: string) => void;
}

export default function PricingPage({ onToast, onNavigate }: Props) {
  return (
    <>



<div className="h-[52px] px-6 flex items-center justify-between bg-white border-b border-surface-dim relative z-50">
  <div className="flex items-center gap-3">
    <span className="material-symbols-outlined text-[20px] text-on-surface-variant">inventory_2</span>
    <span className="text-label-md font-semibold">Catalog</span>
    <span className="text-outline">/</span>
    <span className="text-label-md text-primary font-semibold">Categories &amp; Pricing</span>
  </div>
  <div className="text-label-sm text-on-surface-variant">Preview · standalone</div>
</div>

<main className="px-6 pb-12">

  
  <div className="flex items-center justify-between gap-4 py-4 flex-wrap">
    <div>
      <h1 className="text-headline-lg mb-1">Price Comparison</h1>
      <p className="text-body-sm text-on-surface-variant">Select a category to view the canonical product and compare supplier costs.</p>
    </div>
    
    <div className="flex items-center gap-2">
      
      <div className="relative">
        <button className="h-9 px-3 bg-white border border-surface-dim rounded-md text-body-md font-semibold hover:bg-surface-container-low flex items-center gap-2 shadow-sm">
          <span className="material-symbols-outlined text-[18px] text-qb-blue">category</span>
          <span>Apparel</span>
          <span className="material-symbols-outlined text-[18px] text-on-surface-variant">expand_more</span>
        </button>
        
        
        <div className="popover-menu" style={{ top: '42px', right: 0 }}>
          <div className="menu-header">Apparel &amp; Accessories</div>
          <button onClick={() => selectCat('Apparel', 'T-Shirt')}><span className="material-symbols-outlined">checkroom</span>Apparel <span className="badge">1,945</span></button>
          <button onClick={() => selectCat('Headwear', 'Hat')}><span className="material-symbols-outlined">sports_baseball</span>Headwear <span className="badge">366</span></button>
          <button onClick={() => selectCat('Accessories', 'Tote')}><span className="material-symbols-outlined">shopping_bag</span>Accessories <span className="badge">343</span></button>
          <div className="menu-header">Home &amp; Living</div>
          <button onClick={() => selectCat('Drinkware', 'Mug')}><span className="material-symbols-outlined">coffee</span>Drinkware <span className="badge">198</span></button>
          <button onClick={() => selectCat('Wall Art', 'Poster')}><span className="material-symbols-outlined">image</span>Wall Art <span className="badge">630</span></button>
          <button onClick={() => selectCat('Home &amp; Living', 'Blanket')}><span className="material-symbols-outlined">chair</span>Home &amp; Living <span className="badge">323</span></button>
          <div className="menu-header">Other Categories</div>
          <button onClick={() => selectCat('Business', 'Notebook')}><span className="material-symbols-outlined">work</span>Business &amp; commercial <span className="badge">258</span></button>
          <button onClick={() => selectCat('Cards', 'Greeting Card')}><span className="material-symbols-outlined">mail</span>Cards &amp; stationery <span className="badge">267</span></button>
          <button onClick={() => selectCat('Collections', 'Gift Set')}><span className="material-symbols-outlined">redeem</span>Collections &amp; Occasions <span className="badge">3</span></button>
          <button onClick={() => selectCat('Games', 'Puzzle')}><span className="material-symbols-outlined">extension</span>Games &amp; Puzzles <span className="badge">21</span></button>
          <button onClick={() => selectCat('Keepsakes', 'Ornament')}><span className="material-symbols-outlined">diamond</span>Keepsakes <span className="badge">527</span></button>
          <button onClick={() => selectCat('Technology', 'Phone Case')}><span className="material-symbols-outlined">devices</span>Technology <span className="badge">65</span></button>
          <button onClick={() => selectCat('Wellness', 'Water Bottle')}><span className="material-symbols-outlined">spa</span>Wellness <span className="badge">16</span></button>
        </div>
      </div>
    </div>
  </div>

  
  <div className="flex items-center gap-2 mb-4">
    <h2 className="text-headline-md">Apparel &amp;rsaquo; Black T-Shirt</h2>
    <span className="px-2 py-0.5 rounded-full bg-qb-blue/10 text-qb-blue text-[10px] font-bold uppercase tracking-wider">Canonical Product</span>
  </div>

  
  <div className="bg-white rounded-xl shadow-sm border border-surface-dim overflow-hidden">
    <table className="comp-table">
      <thead>
        <tr>
          <th>Supplier</th>
          <th>SKU / Location</th>
          <th className="right">Base Cost</th>
          <th className="right">Shipping (Est.)</th>
          <th className="right">Total Cost</th>
          <th className="right">Lead Time</th>
          <th className="w-8"></th>
        </tr>
      </thead>
      <tbody>
        
      </tbody>
    </table>
  </div>

</main>


<div className="flyout-scrim">
  <div className="flyout-container">
    
    
    <div className="flex items-center justify-between px-6 h-16 border-b border-surface-dim bg-white shrink-0">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-qb-blue text-white flex items-center justify-center font-bold">
          <span className="material-symbols-outlined text-[18px]">grid_on</span>
        </div>
        <div>
          <div className="text-headline-md">Apparel &amp;rsaquo; T-Shirt</div>
          <div className="text-[11px] text-on-surface-variant">Variant Matrix &amp; Supplier Routing</div>
        </div>
      </div>
      <button className="w-8 h-8 rounded hover:bg-surface-container flex items-center justify-center" onClick={() => setShowFlyout(false)}>
        <span className="material-symbols-outlined text-[18px]">close</span>
      </button>
    </div>

    
    <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 xl:grid-cols-3 gap-6">
      
      
      <div className="xl:col-span-2 space-y-6">
        
        
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="text-label-sm font-bold uppercase tracking-wider text-on-surface">1. Select Colors</div>
            <button className="text-[11px] text-primary font-semibold hover:underline">Select all</button>
          </div>
          <div className="flex flex-wrap gap-4">
            <div className="flex flex-col items-center gap-1">
              <div className="color-swatch selected" style={{ background: '#1a1c1e' }}></div>
              <span className="text-[10px] font-medium text-on-surface-variant">Black</span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <div className="color-swatch selected" style={{ background: '#ffffff', borderColor: '#dad9dd' }}></div>
              <span className="text-[10px] font-medium text-on-surface-variant">White</span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <div className="color-swatch" style={{ background: '#1e5a38' }}></div>
              <span className="text-[10px] font-medium text-on-surface-variant">Forest</span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <div className="color-swatch" style={{ background: '#6b1e28' }}></div>
              <span className="text-[10px] font-medium text-on-surface-variant">Maroon</span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <div className="color-swatch" style={{ background: '#0077c5' }}></div>
              <span className="text-[10px] font-medium text-on-surface-variant">Royal</span>
            </div>
          </div>
        </div>

        
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="text-label-sm font-bold uppercase tracking-wider text-on-surface">2. Select Sizes</div>
            <button className="text-[11px] text-primary font-semibold hover:underline">Select all</button>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="px-3 py-1.5 border border-qb-blue bg-qb-blue/10 text-qb-blue rounded text-[12px] font-semibold">S</button>
            <button className="px-3 py-1.5 border border-qb-blue bg-qb-blue/10 text-qb-blue rounded text-[12px] font-semibold">M</button>
            <button className="px-3 py-1.5 border border-qb-blue bg-qb-blue/10 text-qb-blue rounded text-[12px] font-semibold">L</button>
            <button className="px-3 py-1.5 border border-surface-dim rounded text-[12px] font-semibold hover:border-primary">XL</button>
            <button className="px-3 py-1.5 border border-surface-dim rounded text-[12px] font-semibold hover:border-primary">2XL</button>
            <button className="px-3 py-1.5 border border-surface-dim rounded text-[12px] font-semibold hover:border-primary">3XL</button>
          </div>
        </div>

        
        <div>
          <div className="text-label-sm font-bold uppercase tracking-wider text-on-surface mb-3">Matrix Preview</div>
          <div className="overflow-x-auto">
            <table className="matrix-table">
              <thead>
                <tr>
                  <th style={{ width: '120px' }}>Color \ Size</th>
                  <th>S</th>
                  <th>M</th>
                  <th>L</th>
                  <th>XL</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="row-label">Black</td>
                  <td><input type="checkbox" defaultChecked/></td>
                  <td><input type="checkbox" defaultChecked/></td>
                  <td><input type="checkbox" defaultChecked/></td>
                  <td><input type="checkbox"/></td>
                </tr>
                <tr>
                  <td className="row-label">White</td>
                  <td><input type="checkbox" defaultChecked/></td>
                  <td><input type="checkbox" defaultChecked/></td>
                  <td><input type="checkbox" defaultChecked/></td>
                  <td><input type="checkbox"/></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

      </div>

      
      <div className="space-y-4">
        <div className="text-label-sm font-bold uppercase tracking-wider text-on-surface mb-3">3. Supplier Routing</div>
        <p className="text-[11px] text-on-surface-variant mb-4">Select the supplier with the lowest landed cost to fulfill this design.</p>
        
        <div className="space-y-2">
          <div className="supplier-card cheapest">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded bg-qb-blue text-white flex items-center justify-center font-bold">P</div>
              <div>
                <div className="font-semibold text-body-sm">Printful</div>
                <div className="text-[10px] text-on-surface-variant">Base: $9.12 · Ship: $3.50</div>
              </div>
            </div>
            <div className="text-right">
              <div className="font-bold text-secondary tabular-nums">$12.62<span className="text-[10px] font-normal text-on-surface-variant">/unit</span></div>
              <div className="text-[10px] text-secondary font-semibold">Cheapest</div>
            </div>
          </div>
          
          <div className="supplier-card">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded bg-qb-green text-white flex items-center justify-center font-bold">G</div>
              <div>
                <div className="font-semibold text-body-sm">Gelato</div>
                <div className="text-[10px] text-on-surface-variant">Base: $8.80 · Ship: $4.50</div>
              </div>
            </div>
            <div className="text-right">
              <div className="font-bold tabular-nums">$13.30<span className="text-[10px] font-normal text-on-surface-variant">/unit</span></div>
            </div>
          </div>
        </div>
      </div>
    </div>

    
    <div className="h-16 bg-white border-t border-surface-dim px-6 flex items-center justify-between shrink-0">
      <button className="h-8 px-4 border border-surface-dim rounded text-body-md hover:bg-surface-container-low font-semibold" onClick={() => setShowFlyout(false)}>Cancel</button>
      <div className="flex items-center gap-2">
        <button className="h-9 px-5 bg-primary text-white rounded text-body-md font-semibold hover:bg-primary-container flex items-center gap-2 shadow-sm" onClick={() => { setShowFlyout(false); onToast('Opening Design Studio with selected variant matrix...'); }}>
          <span className="material-symbols-outlined text-[18px]">palette</span>Open Design Studio
        </button>
      </div>
    </div>

  </div>
</div>


<div className="popover-menu">
  <div className="menu-header">Supplier Pricing</div>
  <button><span className="material-symbols-outlined">tune</span>Variant &amp; Supplier Picker</button>
  <button><span className="material-symbols-outlined">palette</span>Open in Design Studio</button>
</div>
    </>
  );
}
