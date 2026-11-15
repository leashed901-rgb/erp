'use client';
/**
 * EcommercePage.tsx — 1:1 port of upload/ecommerce.html
 * Installed from the HTML file you provided. Renders the exact layout.
 */
interface Props {
  onToast: (m: string) => void;
  onNavigate?: (d: string, s: string) => void;
}

export default function EcommercePage({ onToast, onNavigate }: Props) {
  return (
    <>



<div className="h-[52px] px-6 flex items-center justify-between bg-white border-b border-surface-dim">
  <div className="flex items-center gap-3">
    <span className="material-symbols-outlined text-[20px] text-on-surface-variant">local_mall</span>
    <span className="text-label-md font-semibold">Catalog</span>
    <span className="text-outline">/</span>
    <span className="text-label-md text-primary font-semibold">Ecommerce</span>
  </div>
  <div className="text-label-sm text-on-surface-variant">Preview · standalone</div>
</div>

<main className="px-6 pb-12">

  <div className="flex items-center justify-between gap-4 py-4 flex-wrap">
    <div>
      <h1 className="text-headline-lg">Ecommerce</h1>
      <p className="text-body-sm text-on-surface-variant mt-0.5">Connected storefronts, marketplace channels, and catalog sync</p>
    </div>
    <div className="flex items-center gap-2">
      <div className="flex split-btn">
        <button className="h-8 px-3 bg-primary text-white text-body-md font-semibold hover:bg-primary-container flex items-center gap-1 split-btn-main" data-connect-channel>
          <span className="material-symbols-outlined text-[16px]">link</span>Connect channel
        </button>
        <button className="h-8 px-1.5 bg-primary text-white hover:bg-primary-container split-btn-arrow" data-new-split>
          <span className="material-symbols-outlined text-[16px]">expand_more</span></button>
      </div>
      <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low flex items-center gap-1" data-sync-all>
        <span className="material-symbols-outlined text-[16px]">sync</span>Sync all</button>
    </div>
  </div>

  
  <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-5">
    <div className="bg-white rounded-xl border border-surface-dim p-3">
      <div className="text-[10px] text-on-surface-variant uppercase tracking-wider font-bold">Connected channels</div>
      <div className="text-headline-sm mt-1 tabular-nums">3</div>
      <div className="text-[11px] text-on-surface-variant mt-0.5">Shopify · TikTok · Etsy</div>
    </div>
    <div className="bg-white rounded-xl border border-surface-dim p-3">
      <div className="text-[10px] text-on-surface-variant uppercase tracking-wider font-bold">Synced products</div>
      <div className="text-headline-sm mt-1 tabular-nums text-secondary">2,840</div>
      <div className="text-[11px] text-on-surface-variant mt-0.5">56% of catalog</div>
    </div>
    <div className="bg-white rounded-xl border border-surface-dim p-3">
      <div className="text-[10px] text-on-surface-variant uppercase tracking-wider font-bold">Needs sync</div>
      <div className="text-headline-sm mt-1 tabular-nums text-qb-maroon">47</div>
      <div className="text-[11px] text-on-surface-variant mt-0.5">Price / stock / content drift</div>
    </div>
    <div className="bg-white rounded-xl border border-surface-dim p-3">
      <div className="text-[10px] text-on-surface-variant uppercase tracking-wider font-bold">Failed syncs</div>
      <div className="text-headline-sm mt-1 tabular-nums text-error">2</div>
      <div className="text-[11px] text-on-surface-variant mt-0.5">Missing images on Etsy</div>
    </div>
  </div>

  
  <div className="flex items-center gap-2 mb-3 flex-wrap">
    <span className="text-label-sm text-on-surface-variant uppercase tracking-wider font-bold mr-1">Create actions:</span>
    <button className="h-8 px-3 rounded-lg bg-white border border-surface-dim hover:bg-primary hover:text-white text-on-surface text-label-sm flex items-center gap-1.5">
      <span className="material-symbols-outlined text-[16px]">storefront</span>Shopify</button>
    <button className="h-8 px-3 rounded-lg bg-white border border-surface-dim hover:bg-primary hover:text-white text-on-surface text-label-sm flex items-center gap-1.5">
      <span className="material-symbols-outlined text-[16px]">music_note</span>TikTok Shop</button>
    <button className="h-8 px-3 rounded-lg bg-white border border-surface-dim hover:bg-primary hover:text-white text-on-surface text-label-sm flex items-center gap-1.5">
      <span className="material-symbols-outlined text-[16px]">shopping_bag</span>Etsy</button>
    <button className="h-8 px-3 rounded-lg bg-white border border-surface-dim hover:bg-primary hover:text-white text-on-surface text-label-sm flex items-center gap-1.5">
      <span className="material-symbols-outlined text-[16px]">local_shipping</span>Amazon</button>
    <button className="h-8 px-3 rounded-lg bg-surface-container hover:bg-surface-container-high text-label-sm flex items-center gap-1" data-open-create>
      <span className="material-symbols-outlined text-[16px]">apps</span>Show all</button>
  </div>

  
  <div className="bg-white rounded-xl shadow-sm border border-surface-dim overflow-hidden">
    <div className="flex items-center gap-1 px-4 h-11 border-b border-surface-dim overflow-x-auto">
      <button className="h-full px-3 text-label-md tab-underline active">All</button>
      <button className="h-full px-3 text-label-md tab-underline text-on-surface-variant">Storefronts</button>
      <button className="h-full px-3 text-label-md tab-underline text-on-surface-variant">Marketplaces</button>
      <button className="h-full px-3 text-label-md tab-underline text-on-surface-variant">Needs sync</button>
    </div>

    <div className="px-4 py-2 flex items-center gap-2 border-b border-surface-dim flex-wrap">
      <div className="relative flex items-center flex-1 max-w-sm min-w-[180px]">
        <span className="material-symbols-outlined absolute left-2 text-[15px] text-outline">search</span>
        <input className="w-full h-7 pl-7 pr-2 bg-surface-container-low border border-surface-dim rounded text-body-sm focus:outline-none focus:border-primary" placeholder="Filter by channel name, domain…" data-filter/>
      </div>
      <button className="h-7 px-2 border border-surface-dim rounded text-label-sm hover:bg-surface-container-low flex items-center gap-1">
        <span className="material-symbols-outlined text-[14px]">filter_list</span>Filter</button>
      <span className="ml-auto text-[11px] text-on-surface-variant" data-c-count>—</span>
    </div>

    <div className="bulk-bar" data-bulk-bar>
      <span className="text-[12px] font-semibold" data-bulk-count>0 selected</span>
      <span className="w-px h-4 bg-white/30"></span>
      <button><span className="material-symbols-outlined text-[14px] align-middle mr-1">sync</span>Sync now</button>
      <button><span className="material-symbols-outlined text-[14px] align-middle mr-1">publish</span>Push catalog</button>
      <button><span className="material-symbols-outlined text-[14px] align-middle mr-1">pause</span>Pause sync</button>
      <span className="w-px h-4 bg-white/30"></span>
      <button><span className="material-symbols-outlined text-[14px] align-middle mr-1">link_off</span>Disconnect</button>
      <button className="ml-auto"><span className="material-symbols-outlined text-[16px]">close</span></button>
    </div>

    <table className="w-full text-left text-body-sm">
      <thead className="bg-surface-container-low text-label-sm text-on-surface-variant uppercase tracking-wider">
        <tr>
          <th className="w-8 px-3 py-2"><input type="checkbox" className="row-check" data-check-all/></th>
          <th className="px-3 py-2">Channel</th>
          <th className="px-3 py-2">Category</th>
          <th className="px-3 py-2 text-right">Listings</th>
          <th className="px-3 py-2 text-right">Needs sync</th>
          <th className="px-3 py-2">Last sync</th>
          <th className="px-3 py-2">Status</th>
          <th className="w-8"></th>
        </tr>
      </thead>
      <tbody className="divide-y divide-surface-dim" data-c-tbody>

        
        <tr className="hover:bg-surface-container-low cursor-pointer c-row">
          <td className="px-3 py-2"><input type="checkbox" className="row-check c-check"/></td>
          <td className="px-3 py-2">
            <div className="flex items-center gap-2">
              <div className="ch-badge shopify">S</div>
              <div className="min-w-0">
                <div className="font-medium truncate">Shopify</div>
                <div className="text-[11px] text-on-surface-variant">managekube.myshopify.com</div>
              </div>
            </div>
          </td>
          <td className="px-3 py-2 text-on-surface-variant">Storefront</td>
          <td className="px-3 py-2 text-right tabular-nums">1,842</td>
          <td className="px-3 py-2 text-right tabular-nums">0</td>
          <td className="px-3 py-2 text-on-surface-variant">2 min ago</td>
          <td className="px-3 py-2"><span className="stat connected"><span className="material-symbols-outlined text-[10px]">check_circle</span>Connected</span></td>
          <td className="px-2 py-2 text-right"><button className="w-6 h-6 rounded hover:bg-surface-container flex items-center justify-center" data-row-menu><span className="material-symbols-outlined text-[16px] text-on-surface-variant">more_horiz</span></button></td>
        </tr>

        
        <tr className="hover:bg-surface-container-low cursor-pointer c-row">
          <td className="px-3 py-2"><input type="checkbox" className="row-check c-check"/></td>
          <td className="px-3 py-2">
            <div className="flex items-center gap-2">
              <div className="ch-badge tiktok">T</div>
              <div className="min-w-0">
                <div className="font-medium truncate">TikTok Shop</div>
                <div className="text-[11px] text-on-surface-variant">ManageKube US</div>
              </div>
            </div>
          </td>
          <td className="px-3 py-2 text-on-surface-variant">Marketplace</td>
          <td className="px-3 py-2 text-right tabular-nums">842</td>
          <td className="px-3 py-2 text-right tabular-nums text-qb-maroon">45</td>
          <td className="px-3 py-2 text-on-surface-variant">45 min ago</td>
          <td className="px-3 py-2"><span className="stat syncing"><span className="material-symbols-outlined text-[10px]">sync</span>Needs sync</span></td>
          <td className="px-2 py-2 text-right"><button className="w-6 h-6 rounded hover:bg-surface-container flex items-center justify-center" data-row-menu><span className="material-symbols-outlined text-[16px] text-on-surface-variant">more_horiz</span></button></td>
        </tr>

        
        <tr className="hover:bg-surface-container-low cursor-pointer c-row">
          <td className="px-3 py-2"><input type="checkbox" className="row-check c-check"/></td>
          <td className="px-3 py-2">
            <div className="flex items-center gap-2">
              <div className="ch-badge etsy">E</div>
              <div className="min-w-0">
                <div className="font-medium truncate">Etsy</div>
                <div className="text-[11px] text-on-surface-variant">UnsaidGoods</div>
              </div>
            </div>
          </td>
          <td className="px-3 py-2 text-on-surface-variant">Marketplace</td>
          <td className="px-3 py-2 text-right tabular-nums">156</td>
          <td className="px-3 py-2 text-right tabular-nums text-error">2</td>
          <td className="px-3 py-2 text-on-surface-variant">2 hours ago</td>
          <td className="px-3 py-2"><span className="stat error"><span className="material-symbols-outlined text-[10px]">error</span>Failed sync</span></td>
          <td className="px-2 py-2 text-right"><button className="w-6 h-6 rounded hover:bg-surface-container flex items-center justify-center" data-row-menu><span className="material-symbols-outlined text-[16px] text-on-surface-variant">more_horiz</span></button></td>
        </tr>

        
        <tr className="hover:bg-surface-container-low cursor-pointer c-row">
          <td className="px-3 py-2"><input type="checkbox" className="row-check c-check"/></td>
          <td className="px-3 py-2">
            <div className="flex items-center gap-2">
              <div className="ch-badge custom">H</div>
              <div className="min-w-0">
                <div className="font-medium truncate">Headless Storefront</div>
                <div className="text-[11px] text-on-surface-variant">unsaidgoods.com</div>
              </div>
            </div>
          </td>
          <td className="px-3 py-2 text-on-surface-variant">Storefront</td>
          <td className="px-3 py-2 text-right tabular-nums">842</td>
          <td className="px-3 py-2 text-right tabular-nums">0</td>
          <td className="px-3 py-2 text-on-surface-variant">1 min ago</td>
          <td className="px-3 py-2"><span className="stat connected"><span className="material-symbols-outlined text-[10px]">check_circle</span>Connected</span></td>
          <td className="px-2 py-2 text-right"><button className="w-6 h-6 rounded hover:bg-surface-container flex items-center justify-center" data-row-menu><span className="material-symbols-outlined text-[16px] text-on-surface-variant">more_horiz</span></button></td>
        </tr>

      </tbody>
    </table>
  </div>

</main>


<div className="row-menu">
  <div className="menu-header">Connect channel</div>
  <button><span className="material-symbols-outlined">storefront</span>Shopify</button>
  <button><span className="material-symbols-outlined">music_note</span>TikTok Shop</button>
  <button><span className="material-symbols-outlined">shopping_bag</span>Etsy</button>
  <button><span className="material-symbols-outlined">local_shipping</span>Amazon Seller</button>
  <div className="sep"></div>
  <button><span className="material-symbols-outlined">api</span>Custom API / Headless</button>
</div>


<div className="row-menu">
  <div className="menu-header">This channel</div>
  <button><span className="material-symbols-outlined">open_in_new</span>Open channel dashboard</button>
  <button><span className="material-symbols-outlined">edit</span>Edit settings</button>
  <div className="sep"></div>
  <div className="menu-header">Sync</div>
  <button><span className="material-symbols-outlined">sync</span>Sync now</button>
  <button><span className="material-symbols-outlined">publish</span>Push catalog changes</button>
  <button><span className="material-symbols-outlined">download</span>Pull orders &amp; reviews</button>
  <div className="sep"></div>
  <div className="menu-header">Manage</div>
  <button><span className="material-symbols-outlined">alt_route</span>View listing mappings</button>
  <button><span className="material-symbols-outlined">pause</span>Pause sync</button>
  <div className="sep"></div>
  <button className="danger"><span className="material-symbols-outlined">link_off</span>Disconnect channel</button>
</div>


<div className="drawer-scrim"></div>
<div className="drawer">
  <div className="flex items-center justify-between px-5 h-14 border-b border-surface-dim shrink-0">
    <div className="flex items-center gap-2 min-w-0">
      <span className="material-symbols-outlined text-[20px] text-primary">link</span>
      <div className="min-w-0">
        <div className="text-headline-sm truncate" data-ch-title>Connect channel</div>
        <div className="text-[11px] text-on-surface-variant">Channel settings &amp; sync configuration</div>
      </div>
    </div>
    <div className="flex items-center gap-1">
      <button className="w-8 h-8 rounded hover:bg-surface-container flex items-center justify-center" title="Maximize">
        <span className="material-symbols-outlined text-[18px]">open_in_full</span></button>
      <button className="w-8 h-8 rounded hover:bg-surface-container flex items-center justify-center" data-close-channel>
        <span className="material-symbols-outlined text-[18px]">close</span></button>
    </div>
  </div>

  <div className="flex-1 overflow-y-auto p-5 space-y-4">

    
    <div className="bg-surface-container-low rounded-lg p-3 flex items-center gap-3" data-info-block>
      <div className="ch-badge shopify" data-ch-badge>S</div>
      <div className="min-w-0 flex-1">
        <div className="text-body-sm font-semibold" data-ch-name>Shopify</div>
        <div className="text-[11px] text-on-surface-variant" data-ch-domain>Not connected</div>
      </div>
    </div>

    <div>
      <div className="section-h">Storefront</div>
      <div className="space-y-3">
        <div>
          <label className="field-label">Shop domain</label>
          <input className="field-input font-mono text-[12px]" placeholder="your-store.myshopify.com" data-f-domain/>
        </div>
        <div>
          <label className="field-label">Admin API access token</label>
          <input className="field-input font-mono text-[11px]" placeholder="shpat_•••••••••••••••" type="password"/>
        </div>
      </div>
    </div>

    <div className="pt-2">
      <div className="section-h">Sync settings</div>
      <div className="space-y-2">
        <label className="flex items-center gap-2 text-body-sm"><input type="checkbox" className="row-check" checked data-f-sync-products/>Sync products &amp; listings</label>
        <label className="flex items-center gap-2 text-body-sm"><input type="checkbox" className="row-check" checked data-f-sync-inventory/>Sync inventory &amp; stock levels</label>
        <label className="flex items-center gap-2 text-body-sm"><input type="checkbox" className="row-check" checked data-f-sync-orders/>Pull orders</label>
        <label className="flex items-center gap-2 text-body-sm"><input type="checkbox" className="row-check" data-f-sync-prices/>Sync prices (overrides channel pricing)</label>
      </div>
    </div>

    <div className="pt-2">
      <div className="section-h">Scheduling</div>
      <div>
        <label className="field-label">Automatic sync interval</label>
        <select className="field-input" data-f-interval>
          <option>Real-time (webhooks)</option>
          <option>Every 15 minutes</option>
          <option>Every hour</option>
          <option>Every 6 hours</option>
          <option>Manual only</option>
        </select>
      </div>
    </div>

    
    <div className="pt-2" data-sync-log>
      <div className="section-h">Recent sync log</div>
      <div className="space-y-1">
        <div className="flex items-center justify-between text-[11px] text-on-surface-variant py-1">
          <div className="flex items-center gap-2"><span className="material-symbols-outlined text-[12px] text-secondary">check_circle</span>Product sync completed</div>
          <span>2 min ago</span>
        </div>
        <div className="flex items-center justify-between text-[11px] text-on-surface-variant py-1">
          <div className="flex items-center gap-2"><span className="material-symbols-outlined text-[12px] text-secondary">check_circle</span>Order sync completed</div>
          <span>4 min ago</span>
        </div>
        <div className="flex items-center justify-between text-[11px] text-on-surface-variant py-1">
          <div className="flex items-center gap-2"><span className="material-symbols-outlined text-[12px] text-secondary">check_circle</span>Inventory sync completed</div>
          <span>8 min ago</span>
        </div>
      </div>
    </div>

  </div>

  <div className="h-14 border-t border-surface-dim px-4 flex items-center justify-between shrink-0">
    <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low" data-close-channel>Cancel</button>
    <div className="flex items-center gap-2">
      <div className="flex split-btn">
        <button className="h-8 px-3 bg-white border border-surface-dim text-body-md font-semibold hover:bg-surface-container-low split-btn-main" data-sync-now>Sync now</button>
        <button className="h-8 px-1.5 bg-white border border-surface-dim hover:bg-surface-container-low split-btn-arrow">
          <span className="material-symbols-outlined text-[16px]">expand_more</span></button>
      </div>
      <div className="flex split-btn">
        <button className="h-8 px-3 bg-primary text-white text-body-md font-semibold hover:bg-primary-container split-btn-main" data-save-channel>Save channel</button>
        <button className="h-8 px-1.5 bg-primary text-white hover:bg-primary-container split-btn-arrow">
          <span className="material-symbols-outlined text-[16px]">expand_more</span></button>
      </div>
    </div>
  </div>
</div>
    </>
  );
}
