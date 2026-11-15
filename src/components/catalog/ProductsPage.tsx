'use client';
/**
 * ProductsPage.tsx — 1:1 port of upload/products.html
 * Installed from the HTML file you provided. Renders the exact layout.
 */
interface Props {
  onToast: (m: string) => void;
  onNavigate?: (d: string, s: string) => void;
}

export default function ProductsPage({ onToast, onNavigate }: Props) {
  return (
    <>



<div className="h-[52px] px-6 flex items-center justify-between bg-white border-b border-surface-dim">
  <div className="flex items-center gap-3">
    <span className="material-symbols-outlined text-[20px] text-on-surface-variant">inventory_2</span>
    <span className="text-label-md font-semibold">Catalog</span>
    <span className="text-outline">/</span>
    <span className="text-label-md text-primary font-semibold">Products &amp; services</span>
  </div>
  <div className="text-label-sm text-on-surface-variant">Preview · standalone</div>
</div>

<main className="px-6 pb-12">

  <div className="flex items-center justify-between gap-4 py-4 flex-wrap">
    <div>
      <h1 className="text-headline-lg">Products &amp; services</h1>
      <p className="text-body-sm text-on-surface-variant mt-0.5">Manage your catalog, designs, and supplier blanks</p>
    </div>
    <div className="flex items-center gap-2">
      <button className="h-8 px-3 bg-primary text-white text-body-md font-semibold hover:bg-primary-container flex items-center gap-1 rounded" data-new-product>
          <span className="material-symbols-outlined text-[16px]">add</span>New product
        </button>
      <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low flex items-center gap-1" data-export>
        <span className="material-symbols-outlined text-[16px]">download</span>Export</button>
      <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low flex items-center gap-1" data-customize>
        <span className="material-symbols-outlined text-[16px]">tune</span>Customize</button>
    </div>
  </div>

  
  <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-5">
    <div className="bg-white rounded-xl border border-surface-dim p-3">
      <div className="text-[10px] text-on-surface-variant uppercase tracking-wider font-bold">Total products</div>
      <div className="text-headline-sm mt-1 tabular-nums">5,079</div>
      <div className="text-[11px] text-on-surface-variant mt-0.5">Across 12 suppliers</div>
    </div>
    <div className="bg-white rounded-xl border border-surface-dim p-3">
      <div className="text-[10px] text-on-surface-variant uppercase tracking-wider font-bold">Designed</div>
      <div className="text-headline-sm mt-1 tabular-nums text-secondary">1,024</div>
      <div className="text-[11px] text-on-surface-variant mt-0.5">20% of catalog</div>
    </div>
    <div className="bg-white rounded-xl border border-surface-dim p-3">
      <div className="text-[10px] text-on-surface-variant uppercase tracking-wider font-bold">Needs design</div>
      <div className="text-headline-sm mt-1 tabular-nums text-qb-maroon">4,055</div>
      <div className="text-[11px] text-on-surface-variant mt-0.5">Blank supplier items</div>
    </div>
    <div className="bg-white rounded-xl border border-surface-dim p-3">
      <div className="text-[10px] text-on-surface-variant uppercase tracking-wider font-bold">Published</div>
      <div className="text-headline-sm mt-1 tabular-nums">812</div>
      <div className="text-[11px] text-on-surface-variant mt-0.5">Active on channels</div>
    </div>
  </div>

  
  <div className="flex items-center gap-2 mb-3 flex-wrap">
    <span className="text-label-sm text-on-surface-variant uppercase tracking-wider font-bold mr-1">Create actions:</span>
    <button className="h-8 px-3 rounded-lg bg-white border border-surface-dim hover:bg-primary hover:text-white text-on-surface text-label-sm flex items-center gap-1.5">
      <span className="material-symbols-outlined text-[16px]">checkroom</span>Product</button>
    <button className="h-8 px-3 rounded-lg bg-white border border-surface-dim hover:bg-primary hover:text-white text-on-surface text-label-sm flex items-center gap-1.5">
      <span className="material-symbols-outlined text-[16px]">handyman</span>Service</button>
    <button className="h-8 px-3 rounded-lg bg-white border border-surface-dim hover:bg-primary hover:text-white text-on-surface text-label-sm flex items-center gap-1.5">
      <span className="material-symbols-outlined text-[16px]">inventory_2</span>Bundle</button>
    <button className="h-8 px-3 rounded-lg bg-white border border-surface-dim hover:bg-primary hover:text-white text-on-surface text-label-sm flex items-center gap-1.5">
      <span className="material-symbols-outlined text-[16px]">palette</span>Design</button>
    <button className="h-8 px-3 rounded-lg bg-surface-container hover:bg-surface-container-high text-label-sm flex items-center gap-1" data-open-create>
      <span className="material-symbols-outlined text-[16px]">apps</span>Show all</button>
  </div>

  
  <div className="bg-white rounded-xl shadow-sm border border-surface-dim overflow-hidden">
    <div className="flex items-center gap-1 px-4 h-11 border-b border-surface-dim overflow-x-auto">
      <button className="h-full px-3 text-label-md tab-underline active">All</button>
      <button className="h-full px-3 text-label-md tab-underline text-on-surface-variant">Designed</button>
      <button className="h-full px-3 text-label-md tab-underline text-on-surface-variant">Needs design</button>
      <button className="h-full px-3 text-label-md tab-underline text-on-surface-variant">Published</button>
    </div>

    <div className="px-4 py-2 flex items-center gap-2 border-b border-surface-dim flex-wrap">
      <div className="relative flex items-center flex-1 max-w-sm min-w-[180px]">
        <span className="material-symbols-outlined absolute left-2 text-[15px] text-outline">search</span>
        <input className="w-full h-7 pl-7 pr-2 bg-surface-container-low border border-surface-dim rounded text-body-sm focus:outline-none focus:border-primary" placeholder="Filter products…" data-filter/>
      </div>
      <label className="h-7 px-2 border border-surface-dim rounded text-label-sm hover:bg-surface-container-low flex items-center gap-1 bg-white">
        <span className="material-symbols-outlined text-[14px] text-on-surface-variant">factory</span>
        <span className="text-on-surface-variant">Supplier:</span>
        <select className="bg-transparent border-none text-label-sm text-on-surface focus:outline-none" data-filter-supplier>
          <option value="">All</option>
          <option>Printify</option>
          <option>Printful</option>
          <option>Gelato</option>
        </select>
      </label>
      <button className="h-7 px-2 border border-surface-dim rounded text-label-sm hover:bg-surface-container-low flex items-center gap-1">
        <span className="material-symbols-outlined text-[14px]">filter_list</span>Filter</button>
      <button className="h-7 px-2 border border-surface-dim rounded text-label-sm hover:bg-surface-container-low flex items-center gap-1">
        <span className="material-symbols-outlined text-[14px]">bookmark</span>Saved views</button>
      <span className="ml-auto text-[11px] text-on-surface-variant" data-p-count>—</span>
    </div>

    <div className="bulk-bar" data-bulk-bar>
      <span className="text-[12px] font-semibold" data-bulk-count>0 selected</span>
      <span className="w-px h-4 bg-white/30"></span>
      <button><span className="material-symbols-outlined text-[14px] align-middle mr-1">publish</span>Publish</button>
      <button><span className="material-symbols-outlined text-[14px] align-middle mr-1">archive</span>Archive</button>
      <button><span className="material-symbols-outlined text-[14px] align-middle mr-1">sell</span>Reprice</button>
      <span className="w-px h-4 bg-white/30"></span>
      <button><span className="material-symbols-outlined text-[14px] align-middle mr-1">delete</span>Delete</button>
      <button className="ml-auto"><span className="material-symbols-outlined text-[16px]">close</span></button>
    </div>

    <table className="w-full text-left text-body-sm">
      <thead className="bg-surface-container-low text-label-sm text-on-surface-variant uppercase tracking-wider">
        <tr>
          <th className="w-8 px-3 py-2"><input type="checkbox" className="row-check" data-check-all/></th>
          <th className="px-3 py-2 w-14">Thumb</th>
          <th className="px-3 py-2">Product</th>
          <th className="px-3 py-2">Category</th>
          <th className="px-3 py-2">Supplier</th>
          <th className="px-3 py-2 text-right">Price</th>
          <th className="px-3 py-2 text-right">Variants</th>
          <th className="px-3 py-2">Status</th>
          <th className="w-8"></th>
        </tr>
      </thead>
      <tbody className="divide-y divide-surface-dim" data-p-tbody>

        <tr className="hover:bg-surface-container-low cursor-pointer p-row">
          <td className="px-3 py-2"><input type="checkbox" className="row-check p-check"/></td>
          <td className="px-3 py-2"><div className="w-10 h-10 rounded bg-gradient-to-br from-qb-teal to-qb-green flex items-center justify-center"><span className="material-symbols-outlined text-white text-[20px]">coffee</span></div></td>
          <td className="px-3 py-2 font-medium">Speckled Wayland Ceramic Mug</td>
          <td className="px-3 py-2 text-on-surface-variant">Drinkware › Mugs</td>
          <td className="px-3 py-2 text-on-surface-variant">Printify</td>
          <td className="px-3 py-2 text-right tabular-nums text-on-surface-variant">—</td>
          <td className="px-3 py-2 text-right tabular-nums text-on-surface-variant">4</td>
          <td className="px-3 py-2"><span className="stat published">Designed · Published</span></td>
          <td className="px-2 py-2 text-right"><button className="w-6 h-6 rounded hover:bg-surface-container flex items-center justify-center" data-row-menu><span className="material-symbols-outlined text-[16px] text-on-surface-variant">more_horiz</span></button></td>
        </tr>

        <tr className="hover:bg-surface-container-low cursor-pointer p-row">
          <td className="px-3 py-2"><input type="checkbox" className="row-check p-check"/></td>
          <td className="px-3 py-2"><div className="w-10 h-10 rounded bg-gradient-to-br from-surface-dim to-surface-container-high"></div></td>
          <td className="px-3 py-2 font-medium">Lightweight Sweatshirt (AOP)</td>
          <td className="px-3 py-2 text-on-surface-variant">Apparel › Hoodies</td>
          <td className="px-3 py-2 text-on-surface-variant">Printify</td>
          <td className="px-3 py-2 text-right tabular-nums text-on-surface-variant">from $21.35</td>
          <td className="px-3 py-2 text-right tabular-nums text-on-surface-variant">7</td>
          <td className="px-3 py-2"><span className="stat needs-design">Not designed</span></td>
          <td className="px-2 py-2 text-right"><button className="w-6 h-6 rounded hover:bg-surface-container flex items-center justify-center" data-row-menu><span className="material-symbols-outlined text-[16px] text-on-surface-variant">more_horiz</span></button></td>
        </tr>

        <tr className="hover:bg-surface-container-low cursor-pointer p-row">
          <td className="px-3 py-2"><input type="checkbox" className="row-check p-check"/></td>
          <td className="px-3 py-2"><div className="w-10 h-10 rounded bg-gradient-to-br from-surface-dim to-surface-container-high"></div></td>
          <td className="px-3 py-2 font-medium">Women's Heather Contender Polo</td>
          <td className="px-3 py-2 text-on-surface-variant">Apparel › Women</td>
          <td className="px-3 py-2 text-on-surface-variant">Printify</td>
          <td className="px-3 py-2 text-right tabular-nums text-on-surface-variant">—</td>
          <td className="px-3 py-2 text-right tabular-nums text-on-surface-variant">49</td>
          <td className="px-3 py-2"><span className="stat needs-design">Not designed</span></td>
          <td className="px-2 py-2 text-right"><button className="w-6 h-6 rounded hover:bg-surface-container flex items-center justify-center" data-row-menu><span className="material-symbols-outlined text-[16px] text-on-surface-variant">more_horiz</span></button></td>
        </tr>

        <tr className="hover:bg-surface-container-low cursor-pointer p-row">
          <td className="px-3 py-2"><input type="checkbox" className="row-check p-check"/></td>
          <td className="px-3 py-2"><div className="w-10 h-10 rounded bg-gradient-to-br from-qb-blue to-qb-navy flex items-center justify-center"><span className="material-symbols-outlined text-white text-[20px]">checkroom</span></div></td>
          <td className="px-3 py-2 font-medium">Unisex Heavyweight Tee</td>
          <td className="px-3 py-2 text-on-surface-variant">Apparel › Women</td>
          <td className="px-3 py-2 text-on-surface-variant">Printful</td>
          <td className="px-3 py-2 text-right tabular-nums text-on-surface-variant">from $24.92</td>
          <td className="px-3 py-2 text-right tabular-nums text-on-surface-variant">91</td>
          <td className="px-3 py-2"><span className="stat draft">Designed · Draft</span></td>
          <td className="px-2 py-2 text-right"><button className="w-6 h-6 rounded hover:bg-surface-container flex items-center justify-center" data-row-menu><span className="material-symbols-outlined text-[16px] text-on-surface-variant">more_horiz</span></button></td>
        </tr>

      </tbody>
    </table>
  </div>

</main>


<div className="row-menu">
  <div className="menu-header">New product</div>
  <button><span className="material-symbols-outlined">checkroom</span>Product</button>
  <button><span className="material-symbols-outlined">handyman</span>Service</button>
  <button><span className="material-symbols-outlined">inventory_2</span>Bundle</button>
  <div className="sep"></div>
  <button><span className="material-symbols-outlined">palette</span>Design from blank</button>
  <button><span className="material-symbols-outlined">upload</span>Import CSV</button>
</div>


<div className="row-menu">
  <div className="menu-header">This product</div>
  <button><span className="material-symbols-outlined">palette</span>Design now</button>
  <button><span className="material-symbols-outlined">edit</span>Edit product</button>
  <button><span className="material-symbols-outlined">visibility</span>View listing</button>
  <div className="sep"></div>
  <div className="menu-header">Publishing</div>
  <button><span className="material-symbols-outlined">publish</span>Publish to channels</button>
  <button><span className="material-symbols-outlined">sell</span>Reprice variants</button>
  <div className="sep"></div>
  <div className="menu-header">Danger</div>
  <button><span className="material-symbols-outlined">archive</span>Archive</button>
  <button className="danger"><span className="material-symbols-outlined">delete</span>Delete</button>
</div>
    </>
  );
}
