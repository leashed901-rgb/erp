'use client';
/**
 * CollectionsPage.tsx — 1:1 port of upload/collections.html
 * Installed from the HTML file you provided. Renders the exact layout.
 */
interface Props {
  onToast: (m: string) => void;
  onNavigate?: (d: string, s: string) => void;
}

export default function CollectionsPage({ onToast, onNavigate }: Props) {
  return (
    <>



<div className="h-[52px] px-6 flex items-center justify-between bg-white border-b border-surface-dim">
  <div className="flex items-center gap-3">
    <span className="material-symbols-outlined text-[20px] text-on-surface-variant">category</span>
    <span className="text-label-md font-semibold">Catalog</span>
    <span className="text-outline">/</span>
    <span className="text-label-md text-primary font-semibold">Categories &amp; Collections</span>
  </div>
  <div className="text-label-sm text-on-surface-variant">Preview · standalone</div>
</div>

<main className="px-6 pb-12">

  <div className="flex items-center justify-between gap-4 py-4 flex-wrap">
    <div>
      <h1 className="text-headline-lg">Categories &amp; Collections</h1>
      <p className="text-body-sm text-on-surface-variant mt-0.5">Group products into collections for the storefront</p>
    </div>
    <div className="flex items-center gap-2">
      <button className="h-8 px-3 bg-primary text-white text-body-md font-semibold hover:bg-primary-container flex items-center gap-1 rounded" data-new-collection>
          <span className="material-symbols-outlined text-[16px]">add</span>New collection
        </button>
      <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low flex items-center gap-1" data-export>
        <span className="material-symbols-outlined text-[16px]">download</span>Export</button>
    </div>
  </div>

  
  <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-5">
    <div className="bg-white rounded-xl border border-surface-dim p-3">
      <div className="text-[10px] text-on-surface-variant uppercase tracking-wider font-bold">Total collections</div>
      <div className="text-headline-sm mt-1 tabular-nums">24</div>
      <div className="text-[11px] text-on-surface-variant mt-0.5">Across 4 main categories</div>
    </div>
    <div className="bg-white rounded-xl border border-surface-dim p-3">
      <div className="text-[10px] text-on-surface-variant uppercase tracking-wider font-bold">Published</div>
      <div className="text-headline-sm mt-1 tabular-nums text-secondary">18</div>
      <div className="text-[11px] text-on-surface-variant mt-0.5">Visible on storefront</div>
    </div>
    <div className="bg-white rounded-xl border border-surface-dim p-3">
      <div className="text-[10px] text-on-surface-variant uppercase tracking-wider font-bold">Drafts</div>
      <div className="text-headline-sm mt-1 tabular-nums text-qb-maroon">6</div>
      <div className="text-[11px] text-on-surface-variant mt-0.5">Waiting for launch</div>
    </div>
    <div className="bg-white rounded-xl border border-surface-dim p-3">
      <div className="text-[10px] text-on-surface-variant uppercase tracking-wider font-bold">Uncategorized</div>
      <div className="text-headline-sm mt-1 tabular-nums">12</div>
      <div className="text-[11px] text-on-surface-variant mt-0.5">Products not in a collection</div>
    </div>
  </div>

  {/* ── CATEGORIES heading — the category tree that groups collections.
      This is the "category heading" section: a proper labeled block showing
      every top-level category with its subcategory count and product rollup. */}
  <div className="mb-5">
    <div className="flex items-center justify-between mb-3">
      <div>
        <h2 className="text-headline-md flex items-center gap-2">
          <span className="material-symbols-outlined text-[20px] text-qb-blue">category</span>
          Categories
        </h2>
        <p className="text-body-sm text-on-surface-variant mt-0.5">Top-level category tree — each category groups its subcategories and collections</p>
      </div>
      <button
        className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low flex items-center gap-1"
        onClick={() => onToast('New category drawer')}
      >
        <span className="material-symbols-outlined text-[16px]">add</span>New category
      </button>
    </div>
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
      {/* Apparel & Accessories */}
      <div className="bg-white rounded-xl border border-surface-dim p-4 hover:border-qb-blue hover:shadow-sm transition-all cursor-pointer" onClick={() => onToast('Open Apparel & Accessories')}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-qb-blue/10 flex items-center justify-center">
              <span className="material-symbols-outlined text-[18px] text-qb-blue">checkroom</span>
            </div>
            <div className="font-semibold text-body-sm">Apparel &amp; Accessories</div>
          </div>
          <span className="stat info">3 subcategories</span>
        </div>
        <div className="text-[11px] text-on-surface-variant">1,945 products · Apparel · Headwear · Accessories</div>
      </div>
      {/* Home & Living */}
      <div className="bg-white rounded-xl border border-surface-dim p-4 hover:border-qb-blue hover:shadow-sm transition-all cursor-pointer" onClick={() => onToast('Open Home & Living')}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-qb-green/10 flex items-center justify-center">
              <span className="material-symbols-outlined text-[18px] text-qb-green">chair</span>
            </div>
            <div className="font-semibold text-body-sm">Home &amp; Living</div>
          </div>
          <span className="stat info">3 subcategories</span>
        </div>
        <div className="text-[11px] text-on-surface-variant">1,151 products · Drinkware · Wall Art · Home &amp; Living</div>
      </div>
      {/* Other Categories */}
      <div className="bg-white rounded-xl border border-surface-dim p-4 hover:border-qb-blue hover:shadow-sm transition-all cursor-pointer" onClick={() => onToast('Open Other Categories')}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-qb-maroon/10 flex items-center justify-center">
              <span className="material-symbols-outlined text-[18px] text-qb-maroon">widgets</span>
            </div>
            <div className="font-semibold text-body-sm">Other Categories</div>
          </div>
          <span className="stat info">7 subcategories</span>
        </div>
        <div className="text-[11px] text-on-surface-variant">1,154 products · Business · Cards · Collections · Games · Keepsakes · Tech · Wellness</div>
      </div>
    </div>
  </div>

  {/* ── COLLECTIONS table ── */}
  <div className="bg-white rounded-xl shadow-sm border border-surface-dim overflow-hidden">
    <div className="flex items-center gap-1 px-4 h-11 border-b border-surface-dim overflow-x-auto">
      <button className="h-full px-3 text-label-md tab-underline active">All collections</button>
      <button className="h-full px-3 text-label-md tab-underline text-on-surface-variant">Published</button>
      <button className="h-full px-3 text-label-md tab-underline text-on-surface-variant">Drafts</button>
      <button className="h-full px-3 text-label-md tab-underline text-on-surface-variant">Automated</button>
    </div>

    <div className="px-4 py-2 flex items-center gap-2 border-b border-surface-dim flex-wrap">
      <div className="relative flex items-center flex-1 max-w-sm min-w-[180px]">
        <span className="material-symbols-outlined absolute left-2 text-[15px] text-outline">search</span>
        <input className="w-full h-7 pl-7 pr-2 bg-surface-container-low border border-surface-dim rounded text-body-sm focus:outline-none focus:border-primary" placeholder="Filter collections…" data-filter/>
      </div>
      <button className="h-7 px-2 border border-surface-dim rounded text-label-sm hover:bg-surface-container-low flex items-center gap-1">
        <span className="material-symbols-outlined text-[14px]">filter_list</span>Filter</button>
      <span className="ml-auto text-[11px] text-on-surface-variant" data-c-count>—</span>
    </div>

    <div className="bulk-bar" data-bulk-bar>
      <span className="text-[12px] font-semibold" data-bulk-count>0 selected</span>
      <span className="w-px h-4 bg-white/30"></span>
      <button><span className="material-symbols-outlined text-[14px] align-middle mr-1">publish</span>Publish</button>
      <button><span className="material-symbols-outlined text-[14px] align-middle mr-1">visibility_off</span>Unpublish</button>
      <button><span className="material-symbols-outlined text-[14px] align-middle mr-1">delete</span>Delete</button>
    </div>

    <table className="w-full text-left text-body-sm">
      <thead className="bg-surface-container-low text-label-sm text-on-surface-variant uppercase tracking-wider">
        <tr>
          <th className="w-8 px-3 py-2"><input type="checkbox" className="row-check" data-check-all/></th>
          <th className="px-3 py-2">Collection title</th>
          <th className="px-3 py-2">Products</th>
          <th className="px-3 py-2">Type</th>
          <th className="px-3 py-2">Visibility</th>
          <th className="w-8"></th>
        </tr>
      </thead>
      <tbody className="divide-y divide-surface-dim" data-c-tbody>

        <tr className="hover:bg-surface-container-low cursor-pointer c-row">
          <td className="px-3 py-2"><input type="checkbox" className="row-check c-check"/></td>
          <td className="px-3 py-2">
            <div className="font-medium">Summer 2026</div>
            <div className="text-[11px] text-on-surface-variant font-mono">/collections/summer-2026</div>
          </td>
          <td className="px-3 py-2 text-on-surface-variant">24 products</td>
          <td className="px-3 py-2 text-on-surface-variant">Manual</td>
          <td className="px-3 py-2"><span className="stat live">Published</span></td>
          <td className="px-2 py-2 text-right"><button className="w-6 h-6 rounded hover:bg-surface-container flex items-center justify-center" data-row-menu><span className="material-symbols-outlined text-[16px] text-on-surface-variant">more_horiz</span></button></td>
        </tr>

        <tr className="hover:bg-surface-container-low cursor-pointer c-row">
          <td className="px-3 py-2"><input type="checkbox" className="row-check c-check"/></td>
          <td className="px-3 py-2">
            <div className="font-medium">Best Sellers</div>
            <div className="text-[11px] text-on-surface-variant font-mono">/collections/best-sellers</div>
          </td>
          <td className="px-3 py-2 text-on-surface-variant">42 products</td>
          <td className="px-3 py-2 text-on-surface-variant">Automated (Sales)</td>
          <td className="px-3 py-2"><span className="stat live">Published</span></td>
          <td className="px-2 py-2 text-right"><button className="w-6 h-6 rounded hover:bg-surface-container flex items-center justify-center" data-row-menu><span className="material-symbols-outlined text-[16px]">more_horiz</span></button></td>
        </tr>

        <tr className="hover:bg-surface-container-low cursor-pointer c-row">
          <td className="px-3 py-2"><input type="checkbox" className="row-check c-check"/></td>
          <td className="px-3 py-2">
            <div className="font-medium">Fall Preview 2026</div>
            <div className="text-[11px] text-on-surface-variant font-mono">/collections/fall-preview</div>
          </td>
          <td className="px-3 py-2 text-on-surface-variant">8 products</td>
          <td className="px-3 py-2 text-on-surface-variant">Manual</td>
          <td className="px-3 py-2"><span className="stat draft">Draft</span></td>
          <td className="px-2 py-2 text-right"><button className="w-6 h-6 rounded hover:bg-surface-container flex items-center justify-center" data-row-menu><span className="material-symbols-outlined text-[16px]">more_horiz</span></button></td>
        </tr>

      </tbody>
    </table>
  </div>

</main>


<div className="row-menu">
  <div className="menu-header">New</div>
  <button><span className="material-symbols-outlined">collections_bookmark</span>Manual collection</button>
  <button><span className="material-symbols-outlined">bolt</span>Automated collection</button>
</div>


<div className="row-menu">
  <div className="menu-header">This collection</div>
  <button><span className="material-symbols-outlined">edit</span>Edit collection</button>
  <button><span className="material-symbols-outlined">open_in_new</span>View on storefront</button>
  <button><span className="material-symbols-outlined">content_copy</span>Duplicate</button>
  <div className="sep"></div>
  <div className="menu-header">Organize</div>
  <button><span className="material-symbols-outlined">inventory_2</span>Manage products</button>
  <button><span className="material-symbols-outlined">rule</span>Edit rules</button>
  <div className="sep"></div>
  <div className="menu-header">Publishing</div>
  <button><span className="material-symbols-outlined">publish</span>Publish to storefront</button>
  <button className="danger"><span className="material-symbols-outlined">delete</span>Delete</button>
</div>


<div className="drawer-scrim"></div>
<div className="drawer">
  <div className="flex items-center justify-between px-5 h-14 border-b border-surface-dim shrink-0">
    <div className="flex items-center gap-2 min-w-0">
      <span className="material-symbols-outlined text-[20px] text-primary">collections_bookmark</span>
      <div className="min-w-0">
        <div className="text-headline-sm truncate" data-c-title>New collection</div>
        <div className="text-[11px] text-on-surface-variant">Organize products for the storefront</div>
      </div>
    </div>
    <button className="w-8 h-8 rounded hover:bg-surface-container flex items-center justify-center" data-close-coll>
      <span className="material-symbols-outlined text-[18px]">close</span></button>
  </div>

  <div className="flex-1 overflow-y-auto p-5 space-y-4">
    <div>
      <div className="section-h">General</div>
      <div className="space-y-3">
        <div><label className="field-label">Collection title</label><input className="field-input" placeholder="e.g. Summer 2026"/></div>
        <div>
          <label className="field-label">URL handle</label>
          <div className="flex items-center">
            <span className="text-[12px] text-on-surface-variant px-2 bg-surface-container-low border border-r-0 border-surface-dim rounded-l h-9 flex items-center">/collections/</span>
            <input className="field-input rounded-l-none" placeholder="summer-2026"/>
          </div>
        </div>
        <div>
          <label className="field-label">Description</label>
          <textarea className="field-input" style={{ height: '60px', padding: '8px 10px', fontFamily: 'inherit' }} placeholder="Visible on the collection page"></textarea>
        </div>
      </div>
    </div>

    <div className="pt-2">
      <div className="section-h">Collection type</div>
      <div className="space-y-3">
        <label className="flex items-start gap-2 cursor-pointer">
          <input type="radio" name="coll-type" className="mt-0.5 row-check" defaultChecked/>
          <div><div className="text-body-md font-medium">Manual</div><div className="text-[11px] text-on-surface-variant">Hand-pick products for this collection.</div></div>
        </label>
        <label className="flex items-start gap-2 cursor-pointer">
          <input type="radio" name="coll-type" className="mt-0.5 row-check"/>
          <div><div className="text-body-md font-medium">Automated</div><div className="text-[11px] text-on-surface-variant">Matches products based on conditions.</div></div>
        </label>
      </div>
    </div>

    <div className="pt-2">
      <div className="section-h">Visibility</div>
      <div className="space-y-2 mt-1">
        <label className="flex items-center gap-2 text-body-sm"><input type="checkbox" className="row-check" defaultChecked/>Publish to storefront</label>
        <label className="flex items-center gap-2 text-body-sm"><input type="checkbox" className="row-check" defaultChecked/>Include in search &amp; filters</label>
        <label className="flex items-center gap-2 text-body-sm"><input type="checkbox" className="row-check"/>Feature on homepage</label>
      </div>
    </div>
  </div>

  <div className="h-14 border-t border-surface-dim px-4 flex items-center justify-between shrink-0">
    <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low" data-close-coll>Cancel</button>
    <div className="flex items-center gap-2">
      <button className="h-8 px-3 border border-surface-dim rounded text-body-md font-semibold hover:bg-surface-container-low" data-save-draft>Save draft</button>
      <button className="h-8 px-3 bg-primary text-white rounded text-body-md font-semibold hover:bg-primary-container" data-save-coll>Save &amp; publish</button>
    </div>
  </div>
</div>
    </>
  );
}
