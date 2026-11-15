'use client';
/**
 * CatalogOverviewPage.tsx — 1:1 port of upload/catalog-overview.html
 * Installed from the HTML file you provided. Renders the exact layout.
 */
interface Props {
  onToast: (m: string) => void;
  onNavigate?: (d: string, s: string) => void;
}

export default function CatalogOverviewPage({ onToast, onNavigate }: Props) {
  return (
    <>



<div className="h-[52px] px-6 flex items-center justify-between bg-white border-b border-surface-dim sticky top-0 z-40">
  <div className="flex items-center gap-3">
    <span className="material-symbols-outlined text-[20px] text-on-surface-variant">inventory_2</span>
    <span className="text-label-md font-semibold">Catalog</span>
    <span className="text-outline">/</span>
    <span className="text-label-md text-primary font-semibold">Overview</span>
  </div>
  <div className="flex items-center gap-2">
    <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low flex items-center gap-1">
      <span className="material-symbols-outlined text-[16px]">calendar_today</span>Nov 2026 ▾
    </button>
    <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low flex items-center gap-1">
      <span className="material-symbols-outlined text-[16px]">download</span>Export
    </button>
    <div className="split-btn">
      <button className="h-8 px-3 bg-primary text-white text-body-md font-semibold hover:bg-primary-container flex items-center gap-1 split-btn-main">
        <span className="material-symbols-outlined text-[16px]">add</span>Create
      </button>
      <button className="h-8 px-1.5 bg-primary text-white hover:bg-primary-container split-btn-arrow">
        <span className="material-symbols-outlined text-[16px]">expand_more</span>
      </button>
    </div>
  </div>
</div>

<main className="px-6 pb-12">

  
  <div className="py-4">
    <h1 className="text-headline-lg">Catalog overview</h1>
    <p className="text-body-sm text-on-surface-variant mt-0.5">Health, activity, and alerts across products, suppliers, channels, and collections</p>
  </div>

  
  <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-5">
    <div className="kpi" onClick="toast('Open Products')">
      <div className="kpi-label"><span className="material-symbols-outlined text-[14px] text-qb-blue">inventory</span>Products</div>
      <div className="kpi-val">5,079</div>
      <div className="kpi-sub">Across 12 suppliers · 1,024 designed</div>
    </div>
    <div className="kpi" onClick="toast('Open Variants &amp; SKUs')">
      <div className="kpi-label"><span className="material-symbols-outlined text-[14px] text-qb-teal">qr_code</span>Variants &amp; SKUs</div>
      <div className="kpi-val">8,412</div>
      <div className="kpi-sub">91 on Classic Tee · 49 on Polo</div>
    </div>
    <div className="kpi" onClick="toast('Open Suppliers')">
      <div className="kpi-label"><span className="material-symbols-outlined text-[14px] text-qb-maroon">factory</span>Suppliers</div>
      <div className="kpi-val">12</div>
      <div className="kpi-sub">3 POD · 2 materials · 7 other</div>
    </div>
    <div className="kpi" onClick="toast('Open Channels')">
      <div className="kpi-label"><span className="material-symbols-outlined text-[14px] text-qb-green">local_mall</span>Channels</div>
      <div className="kpi-val">4</div>
      <div className="kpi-sub">3 connected · 1 needs sync · 2 errors</div>
    </div>
  </div>

  
  <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mb-5">

    
    <div className="xl:col-span-2 bg-white rounded-xl border border-surface-dim p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-headline-sm">Catalog health</h2>
        <span className="text-[11px] text-on-surface-variant">5,079 products</span>
      </div>
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <div className="w-32 text-[12px] text-on-surface-variant text-right">Designed &amp; live</div>
          <div className="flex-1"><div className="bar-track"><div className="bar-fill" style={{ width: '20%', background: '#1e5a38' }}>1,024</div></div></div>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-32 text-[12px] text-on-surface-variant text-right">Designed · Draft</div>
          <div className="flex-1"><div className="bar-track"><div className="bar-fill" style={{ width: '8%', background: '#0055a5' }}>412</div></div></div>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-32 text-[12px] text-on-surface-variant text-right">Needs design</div>
          <div className="flex-1"><div className="bar-track"><div className="bar-fill" style={{ width: '80%', background: '#8a5a00' }}>4,055</div></div></div>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-32 text-[12px] text-on-surface-variant text-right">Needs review</div>
          <div className="flex-1"><div className="bar-track"><div className="bar-fill" style={{ width: '4%', background: '#6b1e28' }}>196</div></div></div>
        </div>
      </div>
      <div className="flex items-center gap-4 mt-3 pt-3 border-t border-surface-dim text-[11px] text-on-surface-variant">
        <span><span className="font-semibold text-on-surface">20%</span> of catalog is designed</span>
        <span><span className="font-semibold text-on-surface">80%</span> needs a design</span>
        <span><span className="font-semibold text-qb-maroon">196</span> need review</span>
      </div>
    </div>

    
    <div className="bg-white rounded-xl border border-surface-dim p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-headline-sm">Needs attention</h2>
        <span className="text-[11px] text-error font-semibold">5 items</span>
      </div>
      <div>
        <div className="act-row" onClick="toast('Open 47 products needing sync')">
          <span className="material-symbols-outlined text-[18px] text-qb-maroon">sync_problem</span>
          <div className="min-w-0 flex-1">
            <div className="text-body-sm font-medium">47 products out of sync</div>
            <div className="text-[11px] text-on-surface-variant">TikTok Shop · price &amp; stock drift</div>
          </div>
          <span className="material-symbols-outlined text-[14px] text-outline">chevron_right</span>
        </div>
        <div className="act-row" onClick="toast('Open Etsy sync errors')">
          <span className="material-symbols-outlined text-[18px] text-error">error</span>
          <div className="min-w-0 flex-1">
            <div className="text-body-sm font-medium">2 failed syncs on Etsy</div>
            <div className="text-[11px] text-on-surface-variant">Missing images on 2 listings</div>
          </div>
          <span className="material-symbols-outlined text-[14px] text-outline">chevron_right</span>
        </div>
        <div className="act-row" onClick="toast('Open UGC moderation')">
          <span className="material-symbols-outlined text-[18px] text-qb-blue">rate_review</span>
          <div className="min-w-0 flex-1">
            <div className="text-body-sm font-medium">8 UGC submissions pending</div>
            <div className="text-[11px] text-on-surface-variant">Photos and reviews to moderate</div>
          </div>
          <span className="material-symbols-outlined text-[14px] text-outline">chevron_right</span>
        </div>
        <div className="act-row" onClick="toast('Open missing assets')">
          <span className="material-symbols-outlined text-[18px] text-qb-maroon">image_not_supported</span>
          <div className="min-w-0 flex-1">
            <div className="text-body-sm font-medium">1 brand missing favicon</div>
            <div className="text-[11px] text-on-surface-variant">Lakeside Studio · draft brand</div>
          </div>
          <span className="material-symbols-outlined text-[14px] text-outline">chevron_right</span>
        </div>
        <div className="act-row" onClick="toast('Open low stock')">
          <span className="material-symbols-outlined text-[18px] text-qb-maroon">inventory_2</span>
          <div className="min-w-0 flex-1">
            <div className="text-body-sm font-medium">3 SKUs low or out of stock</div>
            <div className="text-[11px] text-on-surface-variant">Soy Candle variants · Cedar &amp; Vanilla</div>
          </div>
          <span className="material-symbols-outlined text-[14px] text-outline">chevron_right</span>
        </div>
      </div>
    </div>
  </div>

  
  <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mb-5">

    
    <div className="xl:col-span-2 bg-white rounded-xl border border-surface-dim p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-headline-sm">Recent activity</h2>
        <button className="text-[11px] text-primary font-semibold hover:underline" onClick="toast('View all activity')">View all</button>
      </div>
      <div className="space-y-3 text-body-sm">
        <div className="flex items-start gap-2">
          <span className="material-symbols-outlined text-[16px] text-qb-green mt-0.5">palette</span>
          <div className="min-w-0 flex-1">
            <div className="font-medium">Classic Tee — Black designed</div>
            <div className="text-[11px] text-on-surface-variant">91 variants · applied to 3 channels · 12 min ago</div>
          </div>
        </div>
        <div className="flex items-start gap-2">
          <span className="material-symbols-outlined text-[16px] text-qb-blue mt-0.5">sync</span>
          <div className="min-w-0 flex-1">
            <div className="font-medium">Shopify sync completed</div>
            <div className="text-[11px] text-on-surface-variant">1,842 listings · 0 issues · 2 min ago</div>
          </div>
        </div>
        <div className="flex items-start gap-2">
          <span className="material-symbols-outlined text-[16px] text-qb-maroon mt-0.5">inventory_2</span>
          <div className="min-w-0 flex-1">
            <div className="font-medium">Soy Candle — Vanilla out of stock</div>
            <div className="text-[11px] text-on-surface-variant">Cotton Source Co. · 42 min ago</div>
          </div>
        </div>
        <div className="flex items-start gap-2">
          <span className="material-symbols-outlined text-[16px] text-qb-teal mt-0.5">factory</span>
          <div className="min-w-0 flex-1">
            <div className="font-medium">Printify lead time updated</div>
            <div className="text-[11px] text-on-surface-variant">2–3 days → 1–2 days · 2 hours ago</div>
          </div>
        </div>
        <div className="flex items-start gap-2">
          <span className="material-symbols-outlined text-[16px] text-qb-blue mt-0.5">rate_review</span>
          <div className="min-w-0 flex-1">
            <div className="font-medium">2 UGC submissions received</div>
            <div className="text-[11px] text-on-surface-variant">Lightweight Sweatshirt (AOP) · 3 hours ago</div>
          </div>
        </div>
      </div>
    </div>

    
    <div className="bg-white rounded-xl border border-surface-dim p-5">
      <h2 className="text-headline-sm mb-3">Jump to</h2>
      <div className="space-y-1">
        <button className="w-full text-left px-3 py-2 rounded hover:bg-surface-container-low flex items-center gap-2" onClick="toast('Open Products')">
          <span className="material-symbols-outlined text-[18px] text-qb-blue">inventory</span>
          <span className="flex-1 text-body-sm font-medium">Products</span>
          <span className="text-[11px] text-on-surface-variant">5,079</span>
        </button>
        <button className="w-full text-left px-3 py-2 rounded hover:bg-surface-container-low flex items-center gap-2" onClick="toast('Open Variants &amp; SKUs')">
          <span className="material-symbols-outlined text-[18px] text-qb-teal">qr_code</span>
          <span className="flex-1 text-body-sm font-medium">Variants &amp; SKUs</span>
          <span className="text-[11px] text-on-surface-variant">8,412</span>
        </button>
        <button className="w-full text-left px-3 py-2 rounded hover:bg-surface-container-low flex items-center gap-2" onClick="toast('Open Bundles')">
          <span className="material-symbols-outlined text-[18px] text-qb-green">redeem</span>
          <span className="flex-1 text-body-sm font-medium">Bundles</span>
          <span className="text-[11px] text-on-surface-variant">12</span>
        </button>
        <button className="w-full text-left px-3 py-2 rounded hover:bg-surface-container-low flex items-center gap-2" onClick="toast('Open Suppliers')">
          <span className="material-symbols-outlined text-[18px] text-qb-maroon">factory</span>
          <span className="flex-1 text-body-sm font-medium">Suppliers</span>
          <span className="text-[11px] text-on-surface-variant">12</span>
        </button>
        <button className="w-full text-left px-3 py-2 rounded hover:bg-surface-container-low flex items-center gap-2" onClick="toast('Open Brands')">
          <span className="material-symbols-outlined text-[18px] text-qb-navy">branding_watermark</span>
          <span className="flex-1 text-body-sm font-medium">Brands</span>
          <span className="text-[11px] text-on-surface-variant">3</span>
        </button>
        <button className="w-full text-left px-3 py-2 rounded hover:bg-surface-container-low flex items-center gap-2" onClick="toast('Open Channels')">
          <span className="material-symbols-outlined text-[18px] text-qb-green">local_mall</span>
          <span className="flex-1 text-body-sm font-medium">Channels</span>
          <span className="text-[11px] text-on-surface-variant">4</span>
        </button>
        <button className="w-full text-left px-3 py-2 rounded hover:bg-surface-container-low flex items-center gap-2" onClick="toast('Open Categories &amp; Collections')">
          <span className="material-symbols-outlined text-[18px] text-qb-blue">category</span>
          <span className="flex-1 text-body-sm font-medium">Categories &amp; Collections</span>
          <span className="text-[11px] text-on-surface-variant">24</span>
        </button>
      </div>
    </div>
  </div>

  
  <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">

    
    <div className="bg-white rounded-xl border border-surface-dim p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-headline-sm">Top SKUs (30d)</h2>
        <button className="text-[11px] text-primary font-semibold hover:underline" onClick="toast('Open Variants')">View all</button>
      </div>
      <div>
        <div className="act-row" onClick="toast('Open Classic Tee — M / Black')">
          <div className="av bg-qb-blue">T</div>
          <div className="min-w-0 flex-1">
            <div className="text-body-sm font-medium truncate">Classic Tee — M / Black</div>
            <div className="text-[11px] text-on-surface-variant">1,842 sold · $2,800 margin</div>
          </div>
          <span className="text-body-sm font-semibold tabular-nums">$28.00</span>
        </div>
        <div className="act-row" onClick="toast('Open Speckled Mug')">
          <div className="av bg-qb-teal">M</div>
          <div className="min-w-0 flex-1">
            <div className="text-body-sm font-medium truncate">Speckled Wayland Ceramic Mug</div>
            <div className="text-[11px] text-on-surface-variant">248 sold · $4,464 revenue</div>
          </div>
          <span className="text-body-sm font-semibold tabular-nums">$18.00</span>
        </div>
        <div className="act-row" onClick="toast('Open Soy Candle — Lavender')">
          <div className="av bg-qb-maroon">C</div>
          <div className="min-w-0 flex-1">
            <div className="text-body-sm font-medium truncate">Soy Candle — Lavender</div>
            <div className="text-[11px] text-on-surface-variant">180 sold · $3,960 revenue</div>
          </div>
          <span className="text-body-sm font-semibold tabular-nums">$22.00</span>
        </div>
        <div className="act-row" onClick="toast('Open Dad Cap')">
          <div className="av bg-qb-navy">D</div>
          <div className="min-w-0 flex-1">
            <div className="text-body-sm font-medium truncate">Dad Cap</div>
            <div className="text-[11px] text-on-surface-variant">34 sold · $816 revenue</div>
          </div>
          <span className="text-body-sm font-semibold tabular-nums">$24.00</span>
        </div>
      </div>
    </div>

    
    <div className="bg-white rounded-xl border border-surface-dim p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-headline-sm">Channel health</h2>
        <button className="text-[11px] text-primary font-semibold hover:underline" onClick="toast('Open Channels')">Manage</button>
      </div>
      <div className="space-y-2">
        <div className="flex items-center gap-3 py-2 border-b border-surface-dim last:border-0">
          <div className="w-7 h-7 rounded bg-qb-green text-white flex items-center justify-center text-[11px] font-bold">S</div>
          <div className="flex-1 min-w-0">
            <div className="text-body-sm font-medium">Shopify</div>
            <div className="text-[11px] text-on-surface-variant">1,842 listings · 0 needs sync</div>
          </div>
          <span className="stat success">Synced</span>
        </div>
        <div className="flex items-center gap-3 py-2 border-b border-surface-dim last:border-0">
          <div className="w-7 h-7 rounded bg-qb-maroon text-white flex items-center justify-center text-[11px] font-bold">T</div>
          <div className="flex-1 min-w-0">
            <div className="text-body-sm font-medium">TikTok Shop</div>
            <div className="text-[11px] text-on-surface-variant">842 listings · 45 need sync</div>
          </div>
          <span className="stat warn">Needs sync</span>
        </div>
        <div className="flex items-center gap-3 py-2 border-b border-surface-dim last:border-0">
          <div className="w-7 h-7 rounded bg-qb-maroon text-white flex items-center justify-center text-[11px] font-bold">E</div>
          <div className="flex-1 min-w-0">
            <div className="text-body-sm font-medium">Etsy</div>
            <div className="text-[11px] text-on-surface-variant">156 listings · 2 errors</div>
          </div>
          <span className="stat error">Failed sync</span>
        </div>
        <div className="flex items-center gap-3 py-2 last:border-0">
          <div className="w-7 h-7 rounded bg-qb-blue text-white flex items-center justify-center text-[11px] font-bold">H</div>
          <div className="flex-1 min-w-0">
            <div className="text-body-sm font-medium">Headless Storefront</div>
            <div className="text-[11px] text-on-surface-variant">842 listings · 0 needs sync</div>
          </div>
          <span className="stat success">Synced</span>
        </div>
      </div>
    </div>

  </div>

</main>


<div className="row-menu" style={{ position: 'fixed', background: '#fff', border: '1px solid #dad9dd', borderRadius: '8px', boxShadow: '0 8px 24px rgba(0,0,0,.14)', minWidth: '250px', padding: '4px', zIndex: 200, display: 'none' }}>
  <div className="menu-header" style={{ padding: '6px 10px 4px', fontSize: '10px', fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: '#5a6355' }}>Create in Catalog</div>
  <button style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', padding: '6px 10px', fontSize: '13px', borderRadius: '4px', textAlign: 'left', color: '#1a1c1e' }}><span className="material-symbols-outlined" style={{ fontSize: '16px', color: '#5a6355' }}>checkroom</span>Product</button>
  <button style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', padding: '6px 10px', fontSize: '13px', borderRadius: '4px', textAlign: 'left', color: '#1a1c1e' }}><span className="material-symbols-outlined" style={{ fontSize: '16px', color: '#5a6355' }}>qr_code</span>Variant / SKU</button>
  <button style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', padding: '6px 10px', fontSize: '13px', borderRadius: '4px', textAlign: 'left', color: '#1a1c1e' }}><span className="material-symbols-outlined" style={{ fontSize: '16px', color: '#5a6355' }}>redeem</span>Bundle</button>
  <div style={{ height: '1px', background: '#eeedf1', margin: '4px 0' }}></div>
  <button style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', padding: '6px 10px', fontSize: '13px', borderRadius: '4px', textAlign: 'left', color: '#1a1c1e' }}><span className="material-symbols-outlined" style={{ fontSize: '16px', color: '#5a6355' }}>category</span>Category</button>
  <button style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', padding: '6px 10px', fontSize: '13px', borderRadius: '4px', textAlign: 'left', color: '#1a1c1e' }}><span className="material-symbols-outlined" style={{ fontSize: '16px', color: '#5a6355' }}>collections_bookmark</span>Collection</button>
  <div style={{ height: '1px', background: '#eeedf1', margin: '4px 0' }}></div>
  <button style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', padding: '6px 10px', fontSize: '13px', borderRadius: '4px', textAlign: 'left', color: '#1a1c1e' }}><span className="material-symbols-outlined" style={{ fontSize: '16px', color: '#5a6355' }}>factory</span>Supplier</button>
  <button style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', padding: '6px 10px', fontSize: '13px', borderRadius: '4px', textAlign: 'left', color: '#1a1c1e' }}><span className="material-symbols-outlined" style={{ fontSize: '16px', color: '#5a6355' }}>branding_watermark</span>Brand</button>
  <button style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', padding: '6px 10px', fontSize: '13px', borderRadius: '4px', textAlign: 'left', color: '#1a1c1e' }}><span className="material-symbols-outlined" style={{ fontSize: '16px', color: '#5a6355' }}>link</span>Channel</button>
</div>
    </>
  );
}
