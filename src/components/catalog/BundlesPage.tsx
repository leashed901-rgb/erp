'use client';
/**
 * BundlesPage.tsx — 1:1 port of upload/bundles.html
 * Installed from the HTML file you provided. Renders the exact layout.
 */
interface Props {
  onToast: (m: string) => void;
  onNavigate?: (d: string, s: string) => void;
}

export default function BundlesPage({ onToast, onNavigate }: Props) {
  return (
    <>



<div className="h-[52px] px-6 flex items-center justify-between bg-white border-b border-surface-dim">
  <div className="flex items-center gap-3">
    <span className="material-symbols-outlined text-[20px] text-on-surface-variant">inventory_2</span>
    <span className="text-label-md font-semibold">Catalog</span>
    <span className="text-outline">/</span>
    <span className="text-label-md text-primary font-semibold">Bundles</span>
  </div>
  <div className="text-label-sm text-on-surface-variant">Preview · standalone</div>
</div>

<main className="px-6 pb-12">

  <div className="flex items-center justify-between gap-4 py-4 flex-wrap">
    <div>
      <h1 className="text-headline-lg">Bundles</h1>
      <p className="text-body-sm text-on-surface-variant mt-0.5">Group multiple items to sell together as a single package</p>
    </div>
    <div className="flex items-center gap-2">
      <button className="h-8 px-3 bg-primary text-white text-body-md font-semibold hover:bg-primary-container flex items-center gap-1 rounded" data-new-bundle>
          <span className="material-symbols-outlined text-[16px]">add</span>New bundle
        </button>
      <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low flex items-center gap-1" data-export>
        <span className="material-symbols-outlined text-[16px]">download</span>Export</button>
    </div>
  </div>

  
  <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-5">
    <div className="bg-white rounded-xl border border-surface-dim p-3">
      <div className="text-[10px] text-on-surface-variant uppercase tracking-wider font-bold">Total bundles</div>
      <div className="text-headline-sm mt-1 tabular-nums">12</div>
      <div className="text-[11px] text-on-surface-variant mt-0.5">Active in catalog</div>
    </div>
    <div className="bg-white rounded-xl border border-surface-dim p-3">
      <div className="text-[10px] text-on-surface-variant uppercase tracking-wider font-bold">Active</div>
      <div className="text-headline-sm mt-1 tabular-nums text-secondary">9</div>
      <div className="text-[11px] text-on-surface-variant mt-0.5">Published to channels</div>
    </div>
    <div className="bg-white rounded-xl border border-surface-dim p-3">
      <div className="text-[10px] text-on-surface-variant uppercase tracking-wider font-bold">Drafts</div>
      <div className="text-headline-sm mt-1 tabular-nums text-qb-maroon">3</div>
      <div className="text-[11px] text-on-surface-variant mt-0.5">Needs review</div>
    </div>
    <div className="bg-white rounded-xl border border-surface-dim p-3">
      <div className="text-[10px] text-on-surface-variant uppercase tracking-wider font-bold">Avg. savings</div>
      <div className="text-headline-sm mt-1 tabular-nums">15%</div>
      <div className="text-[11px] text-on-surface-variant mt-0.5">Vs. buying separately</div>
    </div>
  </div>

  
  <div className="bg-white rounded-xl shadow-sm border border-surface-dim overflow-hidden">
    <div className="flex items-center gap-1 px-4 h-11 border-b border-surface-dim overflow-x-auto">
      <button className="h-full px-3 text-label-md tab-underline active">All</button>
      <button className="h-full px-3 text-label-md tab-underline text-on-surface-variant">Active</button>
      <button className="h-full px-3 text-label-md tab-underline text-on-surface-variant">Drafts</button>
    </div>

    <div className="px-4 py-2 flex items-center gap-2 border-b border-surface-dim flex-wrap">
      <div className="relative flex items-center flex-1 max-w-sm min-w-[180px]">
        <span className="material-symbols-outlined absolute left-2 text-[15px] text-outline">search</span>
        <input className="w-full h-7 pl-7 pr-2 bg-surface-container-low border border-surface-dim rounded text-body-sm focus:outline-none focus:border-primary" placeholder="Filter bundles…" data-filter/>
      </div>
      <button className="h-7 px-2 border border-surface-dim rounded text-label-sm hover:bg-surface-container-low flex items-center gap-1">
        <span className="material-symbols-outlined text-[14px]">filter_list</span>Filter</button>
      <span className="ml-auto text-[11px] text-on-surface-variant" data-b-count>—</span>
    </div>

    <div className="bulk-bar" data-bulk-bar>
      <span className="text-[12px] font-semibold" data-bulk-count>0 selected</span>
      <span className="w-px h-4 bg-white/30"></span>
      <button><span className="material-symbols-outlined text-[14px] align-middle mr-1">publish</span>Publish</button>
      <button><span className="material-symbols-outlined text-[14px] align-middle mr-1">archive</span>Archive</button>
      <span className="w-px h-4 bg-white/30"></span>
      <button><span className="material-symbols-outlined text-[14px] align-middle mr-1">delete</span>Delete</button>
      <button className="ml-auto"><span className="material-symbols-outlined text-[16px]">close</span></button>
    </div>

    <table className="w-full text-left text-body-sm">
      <thead className="bg-surface-container-low text-label-sm text-on-surface-variant uppercase tracking-wider">
        <tr>
          <th className="w-8 px-3 py-2"><input type="checkbox" className="row-check" data-check-all/></th>
          <th className="px-3 py-2 w-14">Thumb</th>
          <th className="px-3 py-2">Bundle</th>
          <th className="px-3 py-2">Contains</th>
          <th className="px-3 py-2 text-right">Bundle price</th>
          <th className="px-3 py-2 text-right">Items total</th>
          <th className="px-3 py-2">Status</th>
          <th className="w-8"></th>
        </tr>
      </thead>
      <tbody className="divide-y divide-surface-dim" data-b-tbody>

        <tr className="hover:bg-surface-container-low cursor-pointer b-row">
          <td className="px-3 py-2"><input type="checkbox" className="row-check b-check"/></td>
          <td className="px-3 py-2"><div className="w-10 h-10 rounded bg-gradient-to-br from-qb-blue to-qb-navy flex items-center justify-center"><span className="material-symbols-outlined text-white text-[20px]">redeem</span></div></td>
          <td className="px-3 py-2 font-medium">Starter Kit</td>
          <td className="px-3 py-2 text-on-surface-variant">Tee + Tote + Stickers</td>
          <td className="px-3 py-2 text-right tabular-nums text-on-surface-variant">$45.00</td>
          <td className="px-3 py-2 text-right tabular-nums text-on-surface-variant">$54.00</td>
          <td className="px-3 py-2"><span className="stat active">Active · Published</span></td>
          <td className="px-2 py-2 text-right"><button className="w-6 h-6 rounded hover:bg-surface-container flex items-center justify-center" data-row-menu><span className="material-symbols-outlined text-[16px] text-on-surface-variant">more_horiz</span></button></td>
        </tr>

        <tr className="hover:bg-surface-container-low cursor-pointer b-row">
          <td className="px-3 py-2"><input type="checkbox" className="row-check b-check"/></td>
          <td className="px-3 py-2"><div className="w-10 h-10 rounded bg-gradient-to-br from-qb-teal to-qb-green flex items-center justify-center"><span className="material-symbols-outlined text-white text-[20px]">coffee</span></div></td>
          <td className="px-3 py-2 font-medium">Morning Coffee Set</td>
          <td className="px-3 py-2 text-on-surface-variant">Mug + Coaster + Beans</td>
          <td className="px-3 py-2 text-right tabular-nums text-on-surface-variant">$32.00</td>
          <td className="px-3 py-2 text-right tabular-nums text-on-surface-variant">$38.00</td>
          <td className="px-3 py-2"><span className="stat draft">Draft</span></td>
          <td className="px-2 py-2 text-right"><button className="w-6 h-6 rounded hover:bg-surface-container flex items-center justify-center" data-row-menu><span className="material-symbols-outlined text-[16px]">more_horiz</span></button></td>
        </tr>

      </tbody>
    </table>
  </div>

</main>


<div className="row-menu">
  <div className="menu-header">New bundle</div>
  <button><span className="material-symbols-outlined">add_box</span>Blank bundle</button>
  <button><span className="material-symbols-outlined">category</span>From category…</button>
</div>


<div className="row-menu">
  <div className="menu-header">This bundle</div>
  <button><span className="material-symbols-outlined">edit</span>Edit bundle</button>
  <button><span className="material-symbols-outlined">content_copy</span>Duplicate</button>
  <button><span className="material-symbols-outlined">visibility</span>View listing</button>
  <div className="sep"></div>
  <div className="menu-header">Publishing</div>
  <button><span className="material-symbols-outlined">publish</span>Publish to channels</button>
  <div className="sep"></div>
  <div className="menu-header">Danger</div>
  <button className="danger"><span className="material-symbols-outlined">delete</span>Delete</button>
</div>


<div className="drawer-scrim"></div>
<div className="drawer">
  <div className="flex items-center justify-between px-5 h-14 border-b border-surface-dim shrink-0">
    <div className="flex items-center gap-2 min-w-0">
      <span className="material-symbols-outlined text-[20px] text-primary">redeem</span>
      <div className="min-w-0">
        <div className="text-headline-sm truncate" data-b-title>New bundle</div>
        <div className="text-[11px] text-on-surface-variant">Group items to sell together</div>
      </div>
    </div>
    <button className="w-8 h-8 rounded hover:bg-surface-container flex items-center justify-center" data-close-bundle>
      <span className="material-symbols-outlined text-[18px]">close</span></button>
  </div>
  
  <div className="flex-1 overflow-y-auto p-5 space-y-4">
    <div>
      <label className="field-label">Bundle name</label>
      <input className="field-input" placeholder="e.g. Starter Kit" data-b-name/>
    </div>

    <div>
      <div className="section-h">Included items</div>
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-body-sm border border-surface-dim rounded p-2">
          <div className="w-8 h-8 rounded bg-gradient-to-br from-qb-blue to-qb-navy"></div>
          <div className="min-w-0 flex-1">
            <div className="font-medium truncate">Classic Tee — M / White</div>
          </div>
          <input className="w-14 h-7 px-1 border border-surface-dim rounded text-body-sm text-right tabular-nums" value="1"/>
        </div>
        <div className="flex items-center gap-2 text-body-sm border border-surface-dim rounded p-2">
          <div className="w-8 h-8 rounded bg-gradient-to-br from-qb-teal to-qb-green"></div>
          <div className="min-w-0 flex-1">
            <div className="font-medium truncate">Canvas Tote</div>
          </div>
          <input className="w-14 h-7 px-1 border border-surface-dim rounded text-body-sm text-right tabular-nums" value="1"/>
        </div>
      </div>
      <button className="mt-2 w-full h-8 border border-dashed border-surface-dim rounded text-[11px] text-primary font-semibold hover:bg-surface-container-low flex items-center justify-center gap-1" data-add-item>
        <span className="material-symbols-outlined text-[14px]">add</span>Add item
      </button>
    </div>

    <div className="grid grid-cols-2 gap-3 border-t border-surface-dim pt-3">
      <div>
        <label className="field-label">Bundle price</label>
        <input className="field-input tabular-nums" placeholder="$0.00"/>
      </div>
      <div>
        <label className="field-label">Compare at price</label>
        <input className="field-input tabular-nums" placeholder="$0.00"/>
      </div>
    </div>
  </div>

  <div className="h-14 border-t border-surface-dim px-4 flex items-center justify-between shrink-0">
    <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low" data-close-bundle>Cancel</button>
    <div className="flex items-center gap-2">
      <button className="h-8 px-3 bg-white border border-surface-dim text-body-md font-semibold hover:bg-surface-container-low" data-save-draft>Save draft</button>
      <button className="h-8 px-3 bg-primary text-white text-body-md font-semibold hover:bg-primary-container" data-save-bundle>Save bundle</button>
    </div>
  </div>
</div>
    </>
  );
}
