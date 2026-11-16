'use client';
/**
 * ListingsPage.tsx — 1:1 port of upload/listings.html
 * Installed from the HTML file you provided. Renders the exact layout.
 */
interface Props {
  onToast: (m: string) => void;
  onNavigate?: (d: string, s: string) => void;
}

export default function ListingsPage({ onToast, onNavigate }: Props) {
  return (
    <>



<div className="h-[52px] px-6 flex items-center justify-between bg-white border-b border-surface-dim">
  <div className="flex items-center gap-3">
    <span className="material-symbols-outlined text-[20px] text-on-surface-variant">storefront</span>
    <span className="text-label-md font-semibold">Catalog</span>
    <span className="text-outline">/</span>
    <span className="text-label-md text-primary font-semibold">Listings</span>
  </div>
  <div className="text-label-sm text-on-surface-variant">Preview · standalone</div>
</div>

<main className="px-6 pb-12">

  <div className="flex items-center justify-between gap-4 py-4 flex-wrap">
    <div>
      <h1 className="text-headline-lg">Storefront Listings</h1>
      <p className="text-body-sm text-on-surface-variant mt-0.5">Control what is published to the website, PDP content, and social engagement.</p>
    </div>
    <div className="flex items-center gap-2">
      <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low flex items-center gap-1" data-sync-all>
        <span className="material-symbols-outlined text-[16px]">open_in_new</span>View live site</button>
      <button className="h-8 px-3 bg-primary text-white text-body-md font-semibold hover:bg-primary-container flex items-center gap-1 rounded" onClick={() => onToast('New storefront listing flow')}>
          <span className="material-symbols-outlined text-[16px]">add</span>New listing
        </button>
    </div>
  </div>

  
  <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-5">
    <div className="bg-white rounded-xl border border-surface-dim p-3">
      <div className="text-[10px] text-on-surface-variant uppercase tracking-wider font-bold">Live listings</div>
      <div className="text-headline-sm mt-1 tabular-nums">142</div>
      <div className="text-[11px] text-on-surface-variant mt-0.5">Visible to customers</div>
    </div>
    <div className="bg-white rounded-xl border border-surface-dim p-3">
      <div className="text-[10px] text-on-surface-variant uppercase tracking-wider font-bold">Pending UGC</div>
      <div className="text-headline-sm mt-1 tabular-nums text-qb-maroon">8</div>
      <div className="text-[11px] text-on-surface-variant mt-0.5">Photos / reviews to moderate</div>
    </div>
    <div className="bg-white rounded-xl border border-surface-dim p-3">
      <div className="text-[10px] text-on-surface-variant uppercase tracking-wider font-bold">Total Likes</div>
      <div className="text-headline-sm mt-1 tabular-nums text-secondary">4,820</div>
      <div className="text-[11px] text-on-surface-variant mt-0.5">Across all PDPs</div>
    </div>
    <div className="bg-white rounded-xl border border-surface-dim p-3">
      <div className="text-[10px] text-on-surface-variant uppercase tracking-wider font-bold">Avg Rating</div>
      <div className="text-headline-sm mt-1 tabular-nums">4.8 <span className="text-[12px] text-outline">(214 reviews)</span></div>
      <div className="text-[11px] text-on-surface-variant mt-0.5">All-time</div>
    </div>
  </div>

  
  <div className="bg-white rounded-xl shadow-sm border border-surface-dim overflow-hidden">
    <div className="flex items-center gap-1 px-4 h-11 border-b border-surface-dim overflow-x-auto">
      <button className="h-full px-3 text-label-md tab-underline active">Published</button>
      <button className="h-full px-3 text-label-md tab-underline text-on-surface-variant">Drafts</button>
      <button className="h-full px-3 text-label-md tab-underline text-on-surface-variant">UGC Moderation <span className="ml-1 px-1.5 py-0.5 rounded-full bg-qb-blue text-white text-[10px]">8</span></button>
    </div>

    <div className="px-4 py-2 flex items-center gap-2 border-b border-surface-dim flex-wrap">
      <div className="relative flex items-center flex-1 max-w-sm min-w-[180px]">
        <span className="material-symbols-outlined absolute left-2 text-[15px] text-outline">search</span>
        <input className="w-full h-7 pl-7 pr-2 bg-surface-container-low border border-surface-dim rounded text-body-sm focus:outline-none focus:border-primary" placeholder="Filter by title, SKU…" data-filter/>
      </div>
      <button className="h-7 px-2 border border-surface-dim rounded text-label-sm hover:bg-surface-container-low flex items-center gap-1">
        <span className="material-symbols-outlined text-[14px]">filter_list</span>Filter</button>
      <span className="ml-auto text-[11px] text-on-surface-variant" data-l-count>—</span>
    </div>

    <div className="bulk-bar" data-bulk-bar>
      <span className="text-[12px] font-semibold" data-bulk-count>0 selected</span>
      <span className="w-px h-4 bg-white/30"></span>
      <button><span className="material-symbols-outlined text-[14px] align-middle mr-1">publish</span>Publish</button>
      <button><span className="material-symbols-outlined text-[14px] align-middle mr-1">visibility_off</span>Unpublish</button>
      <button><span className="material-symbols-outlined text-[14px] align-middle mr-1">star</span>Feature on Home</button>
    </div>

    <table className="w-full text-left text-body-sm">
      <thead className="bg-surface-container-low text-label-sm text-on-surface-variant uppercase tracking-wider">
        <tr>
          <th className="w-8 px-3 py-2"><input type="checkbox" className="row-check" data-check-all/></th>
          <th className="px-3 py-2">Product</th>
          <th className="px-3 py-2">Collections</th>
          <th className="px-3 py-2">Engagement (Likes / Saves)</th>
          <th className="px-3 py-2 text-right">Price</th>
          <th className="px-3 py-2">Status</th>
          <th className="w-8"></th>
        </tr>
      </thead>
      <tbody className="divide-y divide-surface-dim" data-l-tbody>

        <tr className="hover:bg-surface-container-low cursor-pointer l-row">
          <td className="px-3 py-2"><input type="checkbox" className="row-check l-check"/></td>
          <td className="px-3 py-2">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded bg-gradient-to-br from-qb-teal to-qb-green shrink-0"></div>
              <div className="min-w-0">
                <div className="font-medium truncate">Speckled Wayland Ceramic Mug</div>
                <div className="text-[11px] text-on-surface-variant font-mono">MUG-003</div>
              </div>
            </div>
          </td>
          <td className="px-3 py-2 text-on-surface-variant">Drinkware, New Arrivals</td>
          <td className="px-3 py-2">
            <div className="flex items-center gap-3">
              <span className="social-metric"><span className="material-symbols-outlined text-error">favorite</span>248</span>
              <span className="social-metric"><span className="material-symbols-outlined text-qb-blue">bookmark</span>82</span>
              <span className="social-metric"><span className="material-symbols-outlined text-qb-maroon">photo_camera</span>14</span>
            </div>
          </td>
          <td className="px-3 py-2 text-right tabular-nums">$18.00</td>
          <td className="px-3 py-2"><span className="stat live">Live</span></td>
          <td className="px-2 py-2 text-right"><button className="w-6 h-6 rounded hover:bg-surface-container flex items-center justify-center" data-row-menu><span className="material-symbols-outlined text-[16px] text-on-surface-variant">more_horiz</span></button></td>
        </tr>

        <tr className="hover:bg-surface-container-low cursor-pointer l-row">
          <td className="px-3 py-2"><input type="checkbox" className="row-check l-check"/></td>
          <td className="px-3 py-2">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded bg-gradient-to-br from-qb-blue to-qb-navy shrink-0"></div>
              <div className="min-w-0">
                <div className="font-medium truncate">Classic Tee — Black</div>
                <div className="text-[11px] text-on-surface-variant font-mono">TEE-001-BLK</div>
              </div>
            </div>
          </td>
          <td className="px-3 py-2 text-on-surface-variant">Apparel, Bestsellers</td>
          <td className="px-3 py-2">
            <div className="flex items-center gap-3">
              <span className="social-metric"><span className="material-symbols-outlined text-error">favorite</span>1,204</span>
              <span className="social-metric"><span className="material-symbols-outlined text-qb-blue">bookmark</span>340</span>
              <span className="social-metric"><span className="material-symbols-outlined text-qb-maroon">photo_camera</span>48</span>
            </div>
          </td>
          <td className="px-3 py-2 text-right tabular-nums">$24.00</td>
          <td className="px-3 py-2"><span className="stat live">Live</span></td>
          <td className="px-2 py-2 text-right"><button className="w-6 h-6 rounded hover:bg-surface-container flex items-center justify-center" data-row-menu><span className="material-symbols-outlined text-[16px] text-on-surface-variant">more_horiz</span></button></td>
        </tr>

        <tr className="hover:bg-surface-container-low cursor-pointer l-row">
          <td className="px-3 py-2"><input type="checkbox" className="row-check l-check"/></td>
          <td className="px-3 py-2">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded bg-gradient-to-br from-surface-dim to-surface-container-high shrink-0"></div>
              <div className="min-w-0">
                <div className="font-medium truncate">Lightweight Sweatshirt (AOP)</div>
                <div className="text-[11px] text-on-surface-variant font-mono">HD-211</div>
              </div>
            </div>
          </td>
          <td className="px-3 py-2 text-on-surface-variant">Apparel</td>
          <td className="px-3 py-2">
            <div className="flex items-center gap-3">
              <span className="social-metric"><span className="material-symbols-outlined text-error">favorite</span>12</span>
              <span className="social-metric"><span className="material-symbols-outlined text-qb-blue">bookmark</span>4</span>
              <span className="social-metric text-qb-maroon"><span className="material-symbols-outlined text-qb-maroon">rate_review</span>2 pending</span>
            </div>
          </td>
          <td className="px-3 py-2 text-right tabular-nums">$45.00</td>
          <td className="px-3 py-2"><span className="stat review">Needs UGC</span></td>
          <td className="px-2 py-2 text-right"><button className="w-6 h-6 rounded hover:bg-surface-container flex items-center justify-center" data-row-menu><span className="material-symbols-outlined text-[16px] text-on-surface-variant">more_horiz</span></button></td>
        </tr>

      </tbody>
    </table>
  </div>

</main>


<div className="row-menu">
  <div className="menu-header">Storefront</div>
  <button><span className="material-symbols-outlined">open_in_new</span>View PDP on site</button>
  <button><span className="material-symbols-outlined">edit</span>Edit listing details</button>
  <button><span className="material-symbols-outlined text-qb-blue">rate_review</span>Moderate UGC (2 pending)</button>
  <div className="sep"></div>
  <div className="menu-header">Design &amp; Sourcing</div>
  <button className="font-semibold text-qb-blue"><span className="material-symbols-outlined text-qb-blue">palette</span>Open in Design Studio</button>
  <button className="font-semibold text-qb-blue"><span className="material-symbols-outlined text-qb-blue">tune</span>Variant &amp; Supplier Picker</button>
  <div className="sep"></div>
  <button className="danger"><span className="material-symbols-outlined">visibility_off</span>Unpublish from site</button>
</div>


<div className="flyout-scrim">
  <div className="flyout-container">
    <div className="flex items-center justify-between px-6 h-16 border-b border-surface-dim bg-white shrink-0">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-qb-blue text-white flex items-center justify-center font-bold">
          <span className="material-symbols-outlined text-[18px]">grid_on</span>
        </div>
        <div>
          <div className="text-headline-md">Variant &amp; Supplier Picker</div>
          <div className="text-[11px] text-on-surface-variant">Calculate costs for this listing</div>
        </div>
      </div>
      <button className="w-8 h-8 rounded hover:bg-surface-container flex items-center justify-center" onClick={() => setShowFlyout(false)}>
        <span className="material-symbols-outlined text-[18px]">close</span>
      </button>
    </div>

    <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 xl:grid-cols-3 gap-6">
      <div className="xl:col-span-2 space-y-6">
        <div>
          <div className="text-label-sm font-bold uppercase tracking-wider text-on-surface mb-3">1. Select Colors</div>
          <div className="flex flex-wrap gap-4">
            <div className="flex flex-col items-center gap-1"><div className="color-swatch selected" style={{ background: '#1a1c1e' }}></div><span className="text-[10px] font-medium text-on-surface-variant">Black</span></div>
            <div className="flex flex-col items-center gap-1"><div className="color-swatch selected" style={{ background: '#ffffff', borderColor: '#dad9dd' }}></div><span className="text-[10px] font-medium text-on-surface-variant">White</span></div>
          </div>
        </div>
        <div>
          <div className="text-label-sm font-bold uppercase tracking-wider text-on-surface mb-3">2. Select Sizes</div>
          <div className="flex flex-wrap gap-2">
            <button className="px-3 py-1.5 border border-qb-blue bg-qb-blue/10 text-qb-blue rounded text-[12px] font-semibold">S</button>
            <button className="px-3 py-1.5 border border-qb-blue bg-qb-blue/10 text-qb-blue rounded text-[12px] font-semibold">M</button>
            <button className="px-3 py-1.5 border border-qb-blue bg-qb-blue/10 text-qb-blue rounded text-[12px] font-semibold">L</button>
            <button className="px-3 py-1.5 border border-surface-dim rounded text-[12px] font-semibold hover:border-primary">XL</button>
          </div>
        </div>
        <div>
          <div className="text-label-sm font-bold uppercase tracking-wider text-on-surface mb-3">Matrix Preview</div>
          <table className="matrix-table">
            <thead><tr><th>Color \ Size</th><th>S</th><th>M</th><th>L</th><th>XL</th></tr></thead>
            <tbody>
              <tr><td className="row-label">Black</td><td><input type="checkbox" defaultChecked/></td><td><input type="checkbox" defaultChecked/></td><td><input type="checkbox" defaultChecked/></td><td><input type="checkbox"/></td></tr>
              <tr><td className="row-label">White</td><td><input type="checkbox" defaultChecked/></td><td><input type="checkbox" defaultChecked/></td><td><input type="checkbox" defaultChecked/></td><td><input type="checkbox"/></td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="space-y-4">
        <div className="text-label-sm font-bold uppercase tracking-wider text-on-surface mb-3">3. Supplier Routing</div>
        <div className="space-y-2">
          <div className="supplier-card cheapest">
            <div className="flex items-center gap-3"><div className="w-8 h-8 rounded bg-qb-blue text-white flex items-center justify-center font-bold">P</div><div><div className="font-semibold text-body-sm">Printful</div><div className="text-[10px] text-on-surface-variant">Base: $9.12 · Ship: $3.50</div></div></div>
            <div className="text-right"><div className="font-bold text-secondary tabular-nums">$12.62</div><div className="text-[10px] text-secondary font-semibold">Cheapest</div></div>
          </div>
          <div className="supplier-card">
            <div className="flex items-center gap-3"><div className="w-8 h-8 rounded bg-qb-green text-white flex items-center justify-center font-bold">G</div><div><div className="font-semibold text-body-sm">Gelato</div><div className="text-[10px] text-on-surface-variant">Base: $8.80 · Ship: $4.50</div></div></div>
            <div className="text-right"><div className="font-bold tabular-nums">$13.30</div></div>
          </div>
        </div>
      </div>
    </div>

    <div className="h-16 bg-white border-t border-surface-dim px-6 flex items-center justify-between shrink-0">
      <button className="h-8 px-4 border border-surface-dim rounded text-body-md hover:bg-surface-container-low font-semibold" onClick={() => setShowFlyout(false)}>Cancel</button>
      <button className="h-9 px-5 bg-primary text-white rounded text-body-md font-semibold hover:bg-primary-container flex items-center gap-2 shadow-sm" onClick={() => { setShowFlyout(false); onToast('Opening Design Studio...'); }}>
        <span className="material-symbols-outlined text-[18px]">palette</span>Save &amp; Open Studio
      </button>
    </div>
  </div>
</div>


<div className="drawer-scrim"></div>
<div className="drawer">
  <div className="flex items-center justify-between px-5 h-14 border-b border-surface-dim shrink-0">
    <div className="flex items-center gap-2 min-w-0">
      <span className="material-symbols-outlined text-[20px] text-qb-blue">rate_review</span>
      <div className="min-w-0">
        <div className="text-headline-sm truncate">Moderate UGC</div>
        <div className="text-[11px] text-on-surface-variant">Lightweight Sweatshirt (AOP)</div>
      </div>
    </div>
    <button className="w-8 h-8 rounded hover:bg-surface-container flex items-center justify-center" onClick={() => setShowUgcDrawer(false)}>
      <span className="material-symbols-outlined text-[18px]">close</span></button>
  </div>
  <div className="flex-1 overflow-y-auto p-5 space-y-6">
    <div className="border border-surface-dim rounded-lg overflow-hidden">
      <div className="bg-surface-container-low p-3 border-b border-surface-dim flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-qb-navy text-white flex items-center justify-center text-[10px] font-bold">JD</div>
          <span className="text-[12px] font-medium">Jane Doe</span>
          <span className="px-1.5 py-0.5 bg-secondary-container text-on-secondary-container text-[9px] font-bold rounded">Verified Purchase</span>
        </div>
        <span className="text-[11px] text-on-surface-variant">2 hours ago</span>
      </div>
      <div className="p-3 bg-surface-container-low flex justify-center h-40">
        <div className="w-32 h-full bg-qb-blue/20 rounded border border-qb-blue/30 flex items-center justify-center">
          <span className="material-symbols-outlined text-[32px] text-qb-blue">image</span>
        </div>
      </div>
      <div className="p-3">
        <p className="text-[12px] mb-3">"Loved the quality! Fits perfectly."</p>
        <div className="flex items-center gap-2">
          <button className="flex-1 h-7 bg-primary text-white rounded text-[11px] font-semibold hover:bg-primary-container" onClick={() => onToast('Approved')}>Approve</button>
          <button className="flex-1 h-7 border border-error text-error rounded text-[11px] font-semibold hover:bg-error-container/20" onClick={() => onToast('Rejected')}>Reject</button>
        </div>
      </div>
    </div>
  </div>
</div>
    </>
  );
}
