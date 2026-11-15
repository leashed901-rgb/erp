'use client';
/**
 * BrandsPage.tsx — 1:1 port of upload/brands.html
 * Installed from the HTML file you provided. Renders the exact layout.
 */
interface Props {
  onToast: (m: string) => void;
  onNavigate?: (d: string, s: string) => void;
}

export default function BrandsPage({ onToast, onNavigate }: Props) {
  return (
    <>



<div className="h-[52px] px-6 flex items-center justify-between bg-white border-b border-surface-dim">
  <div className="flex items-center gap-3">
    <span className="material-symbols-outlined text-[20px] text-on-surface-variant">inventory_2</span>
    <span className="text-label-md font-semibold">Catalog</span>
    <span className="text-outline">/</span>
    <span className="text-label-md text-primary font-semibold">Brands</span>
  </div>
  <div className="text-label-sm text-on-surface-variant">Preview · standalone</div>
</div>

<main className="px-6 pb-12">

  <div className="flex items-center justify-between gap-4 py-4 flex-wrap">
    <div>
      <h1 className="text-headline-lg">Brands</h1>
      <p className="text-body-sm text-on-surface-variant mt-0.5">Manage brand identities, assets, and storefront themes</p>
    </div>
    <div className="flex items-center gap-2">
      <div className="flex split-btn">
        <button className="h-8 px-3 bg-primary text-white text-body-md font-semibold hover:bg-primary-container flex items-center gap-1 split-btn-main" data-new-brand>
          <span className="material-symbols-outlined text-[16px]">add</span>New brand
        </button>
        <button className="h-8 px-1.5 bg-primary text-white hover:bg-primary-container split-btn-arrow" data-new-split>
          <span className="material-symbols-outlined text-[16px]">expand_more</span></button>
      </div>
      <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low flex items-center gap-1" data-export>
        <span className="material-symbols-outlined text-[16px]">download</span>Export</button>
    </div>
  </div>

  
  <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-5">
    <div className="bg-white rounded-xl border border-surface-dim p-3">
      <div className="text-[10px] text-on-surface-variant uppercase tracking-wider font-bold">Active brands</div>
      <div className="text-headline-sm mt-1 tabular-nums">3</div>
      <div className="text-[11px] text-on-surface-variant mt-0.5">Managing 5,079 products</div>
    </div>
    <div className="bg-white rounded-xl border border-surface-dim p-3">
      <div className="text-[10px] text-on-surface-variant uppercase tracking-wider font-bold">Primary brand</div>
      <div className="text-headline-sm mt-1">ManageKube</div>
      <div className="text-[11px] text-on-surface-variant mt-0.5">Applied to all outbound</div>
    </div>
    <div className="bg-white rounded-xl border border-surface-dim p-3">
      <div className="text-[10px] text-on-surface-variant uppercase tracking-wider font-bold">Theme variables</div>
      <div className="text-headline-sm mt-1 tabular-nums text-secondary">12</div>
      <div className="text-[11px] text-on-surface-variant mt-0.5">Colors, fonts, spacing</div>
    </div>
    <div className="bg-white rounded-xl border border-surface-dim p-3">
      <div className="text-[10px] text-on-surface-variant uppercase tracking-wider font-bold">Missing assets</div>
      <div className="text-headline-sm mt-1 tabular-nums text-qb-maroon">1</div>
      <div className="text-[11px] text-on-surface-variant mt-0.5">Favicon needed</div>
    </div>
  </div>

  
  <div className="flex items-center gap-2 mb-3 flex-wrap">
    <span className="text-label-sm text-on-surface-variant uppercase tracking-wider font-bold mr-1">Create actions:</span>
    <button className="h-8 px-3 rounded-lg bg-white border border-surface-dim hover:bg-primary hover:text-white text-on-surface text-label-sm flex items-center gap-1.5">
      <span className="material-symbols-outlined text-[16px]">branding_watermark</span>Brand</button>
    <button className="h-8 px-3 rounded-lg bg-white border border-surface-dim hover:bg-primary hover:text-white text-on-surface text-label-sm flex items-center gap-1.5">
      <span className="material-symbols-outlined text-[16px]">image</span>Brand asset</button>
    <button className="h-8 px-3 rounded-lg bg-white border border-surface-dim hover:bg-primary hover:text-white text-on-surface text-label-sm flex items-center gap-1.5">
      <span className="material-symbols-outlined text-[16px]">palette</span>Theme</button>
    <button className="h-8 px-3 rounded-lg bg-surface-container hover:bg-surface-container-high text-label-sm flex items-center gap-1" data-open-create>
      <span className="material-symbols-outlined text-[16px]">apps</span>Show all</button>
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
        <input className="w-full h-7 pl-7 pr-2 bg-surface-container-low border border-surface-dim rounded text-body-sm focus:outline-none focus:border-primary" placeholder="Filter by brand name…" data-filter/>
      </div>
      <button className="h-7 px-2 border border-surface-dim rounded text-label-sm hover:bg-surface-container-low flex items-center gap-1">
        <span className="material-symbols-outlined text-[14px]">filter_list</span>Filter</button>
      <span className="ml-auto text-[11px] text-on-surface-variant" data-b-count>—</span>
    </div>

    <div className="bulk-bar" data-bulk-bar>
      <span className="text-[12px] font-semibold" data-bulk-count>0 selected</span>
      <span className="w-px h-4 bg-white/30"></span>
      <button><span className="material-symbols-outlined text-[14px] align-middle mr-1">publish</span>Apply to storefront</button>
      <button><span className="material-symbols-outlined text-[14px] align-middle mr-1">download</span>Export assets</button>
      <span className="w-px h-4 bg-white/30"></span>
      <button><span className="material-symbols-outlined text-[14px] align-middle mr-1">delete</span>Delete</button>
      <button className="ml-auto"><span className="material-symbols-outlined text-[16px]">close</span></button>
    </div>

    <table className="w-full text-left text-body-sm">
      <thead className="bg-surface-container-low text-label-sm text-on-surface-variant uppercase tracking-wider">
        <tr>
          <th className="w-8 px-3 py-2"><input type="checkbox" className="row-check" data-check-all/></th>
          <th className="px-3 py-2">Brand</th>
          <th className="px-3 py-2">Colors</th>
          <th className="px-3 py-2">Typography</th>
          <th className="px-3 py-2 text-right">Products</th>
          <th className="px-3 py-2">Status</th>
          <th className="w-8"></th>
        </tr>
      </thead>
      <tbody className="divide-y divide-surface-dim" data-b-tbody>

        
        <tr className="hover:bg-surface-container-low cursor-pointer b-row">
          <td className="px-3 py-2"><input type="checkbox" className="row-check b-check"/></td>
          <td className="px-3 py-2">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded bg-qb-green flex items-center justify-center font-bold text-white text-[14px]">MK</div>
              <div className="min-w-0">
                <div className="font-medium truncate">ManageKube</div>
                <div className="text-[11px] text-on-surface-variant truncate">managekube.io</div>
              </div>
            </div>
          </td>
          <td className="px-3 py-2">
            <div className="swatch-row">
              <div className="swatch" style={{ background: '#0a6400' }} title="#0a6400"></div>
              <div className="swatch" style={{ background: '#faf9fc' }} title="#faf9fc"></div>
              <div className="swatch" style={{ background: '#1a1c1e' }} title="#1a1c1e"></div>
            </div>
          </td>
          <td className="px-3 py-2 text-on-surface-variant">Inter</td>
          <td className="px-3 py-2 text-right tabular-nums">5,079</td>
          <td className="px-3 py-2"><span className="stat active">Active</span></td>
          <td className="px-2 py-2 text-right"><button className="w-6 h-6 rounded hover:bg-surface-container flex items-center justify-center" data-row-menu><span className="material-symbols-outlined text-[16px] text-on-surface-variant">more_horiz</span></button></td>
        </tr>

        
        <tr className="hover:bg-surface-container-low cursor-pointer b-row">
          <td className="px-3 py-2"><input type="checkbox" className="row-check b-check"/></td>
          <td className="px-3 py-2">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded bg-qb-navy flex items-center justify-center font-bold text-white text-[14px]">UG</div>
              <div className="min-w-0">
                <div className="font-medium truncate">Unsaid Goods</div>
                <div className="text-[11px] text-on-surface-variant truncate">unsaidgoods.com</div>
              </div>
            </div>
          </td>
          <td className="px-3 py-2">
            <div className="swatch-row">
              <div className="swatch" style={{ background: '#1f2937' }} title="#1f2937"></div>
              <div className="swatch" style={{ background: '#e8f0fb' }} title="#e8f0fb"></div>
              <div className="swatch" style={{ background: '#faf9fc' }} title="#faf9fc"></div>
            </div>
          </td>
          <td className="px-3 py-2 text-on-surface-variant">Geist</td>
          <td className="px-3 py-2 text-right tabular-nums">2,140</td>
          <td className="px-3 py-2"><span className="stat active">Active</span></td>
          <td className="px-2 py-2 text-right"><button className="w-6 h-6 rounded hover:bg-surface-container flex items-center justify-center" data-row-menu><span className="material-symbols-outlined text-[16px]">more_horiz</span></button></td>
        </tr>

        
        <tr className="hover:bg-surface-container-low cursor-pointer b-row">
          <td className="px-3 py-2"><input type="checkbox" className="row-check b-check"/></td>
          <td className="px-3 py-2">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded bg-qb-maroon flex items-center justify-center font-bold text-white text-[14px]">LS</div>
              <div className="min-w-0">
                <div className="font-medium truncate">Lakeside Studio</div>
                <div className="text-[11px] text-on-surface-variant truncate">No domain set</div>
              </div>
            </div>
          </td>
          <td className="px-3 py-2">
            <div className="swatch-row">
              <div className="swatch" style={{ background: '#6b1e28' }} title="#6b1e28"></div>
              <div className="swatch" style={{ background: '#f4e8f8' }} title="#f4e8f8"></div>
            </div>
          </td>
          <td className="px-3 py-2 text-on-surface-variant">Inter</td>
          <td className="px-3 py-2 text-right tabular-nums">—</td>
          <td className="px-3 py-2"><span className="stat draft">Draft</span></td>
          <td className="px-2 py-2 text-right"><button className="w-6 h-6 rounded hover:bg-surface-container flex items-center justify-center" data-row-menu><span className="material-symbols-outlined text-[16px]">more_horiz</span></button></td>
        </tr>

      </tbody>
    </table>
  </div>

</main>


<div className="row-menu">
  <div className="menu-header">New brand</div>
  <button><span className="material-symbols-outlined">branding_watermark</span>Brand</button>
  <button><span className="material-symbols-outlined">image</span>Brand asset</button>
  <button><span className="material-symbols-outlined">palette</span>Theme</button>
  <div className="sep"></div>
  <button><span className="material-symbols-outlined">upload</span>Import from CSS</button>
</div>


<div className="row-menu">
  <div className="menu-header">This brand</div>
  <button><span className="material-symbols-outlined">edit</span>Edit brand</button>
  <button><span className="material-symbols-outlined">open_in_new</span>Open brand kit</button>
  <button><span className="material-symbols-outlined">content_copy</span>Duplicate</button>
  <div className="sep"></div>
  <div className="menu-header">Apply</div>
  <button><span className="material-symbols-outlined">storefront</span>Apply to storefront</button>
  <button><span className="material-symbols-outlined">receipt_long</span>Apply to invoices</button>
  <button><span className="material-symbols-outlined">palette</span>Apply to mockups</button>
  <div className="sep"></div>
  <button className="danger"><span className="material-symbols-outlined">delete</span>Delete brand</button>
</div>


<div className="drawer-scrim"></div>
<div className="drawer">
  <div className="flex items-center justify-between px-5 h-14 border-b border-surface-dim shrink-0">
    <div className="flex items-center gap-2 min-w-0">
      <span className="material-symbols-outlined text-[20px] text-primary">branding_watermark</span>
      <div className="min-w-0">
        <div className="text-headline-sm truncate" data-b-title>New brand</div>
        <div className="text-[11px] text-on-surface-variant">Brand identity &amp; theme</div>
      </div>
    </div>
    <div className="flex items-center gap-1">
      <button className="w-8 h-8 rounded hover:bg-surface-container flex items-center justify-center" title="Maximize">
        <span className="material-symbols-outlined text-[18px]">open_in_full</span></button>
      <button className="w-8 h-8 rounded hover:bg-surface-container flex items-center justify-center" data-close-brand>
        <span className="material-symbols-outlined text-[18px]">close</span></button>
    </div>
  </div>

  <div className="flex-1 overflow-y-auto p-5 space-y-4">

    <div>
      <div className="section-h">Basic info</div>
      <div className="space-y-3">
        <div>
          <label className="field-label">Brand name</label>
          <input className="field-input" placeholder="e.g. Unsaid Goods" data-f-name/>
        </div>
        <div>
          <label className="field-label">Domain</label>
          <input className="field-input font-mono text-[12px]" placeholder="e.g. unsaidgoods.com" data-f-domain/>
        </div>
        <div>
          <label className="field-label">Logo</label>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded bg-surface-container-low border border-surface-dim flex items-center justify-center" data-f-logo>UG</div>
            <button className="h-8 px-3 border border-dashed border-surface-dim rounded text-label-sm text-primary font-semibold hover:bg-surface-container-low flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px]">upload</span>Upload</button>
          </div>
        </div>
      </div>
    </div>

    <div className="pt-2">
      <div className="section-h">Colors</div>
      <div className="space-y-2">
        <div className="color-row">
          <div className="color-preview" style={{ background: '#0a6400' }}></div>
          <label className="text-[11px] text-on-surface-variant w-20">Primary</label>
          <input className="color-input" value="#0a6400" data-f-color-primary/>
        </div>
        <div className="color-row">
          <div className="color-preview" style={{ background: '#faf9fc' }}></div>
          <label className="text-[11px] text-on-surface-variant w-20">Surface</label>
          <input className="color-input" value="#faf9fc" data-f-color-surface/>
        </div>
        <div className="color-row">
          <div className="color-preview" style={{ background: '#1a1c1e' }}></div>
          <label className="text-[11px] text-on-surface-variant w-20">On-surface</label>
          <input className="color-input" value="#1a1c1e" data-f-color-on/>
        </div>
      </div>
    </div>

    <div className="pt-2">
      <div className="section-h">Typography</div>
      <div className="space-y-3">
        <div>
          <label className="field-label">Heading font</label>
          <select className="field-input" data-f-font-heading>
            <option>Inter</option>
            <option>Geist</option>
            <option>Söhne</option>
            <option>GT America</option>
            <option>Custom…</option>
          </select>
        </div>
        <div>
          <label className="field-label">Body font</label>
          <select className="field-input" data-f-font-body>
            <option>Inter</option>
            <option>Geist</option>
            <option>Söhne</option>
            <option>GT America</option>
          </select>
        </div>
      </div>
    </div>

    <div className="pt-2">
      <div className="section-h">Application</div>
      <div className="space-y-2">
        <label className="flex items-center gap-2 text-body-sm"><input type="checkbox" className="row-check" defaultChecked data-f-apply-store/>Apply to storefront</label>
        <label className="flex items-center gap-2 text-body-sm"><input type="checkbox" className="row-check" defaultChecked data-f-apply-invoices/>Apply to invoices</label>
        <label className="flex items-center gap-2 text-body-sm"><input type="checkbox" className="row-check" data-f-apply-mockups/>Apply to product mockups</label>
      </div>
    </div>

    <div className="pt-2">
      <div className="section-h">Notes</div>
      <textarea className="field-input" style={{ height: '60px', padding: '8px 10px', fontFamily: 'inherit' }} placeholder="Internal notes about this brand"></textarea>
    </div>

  </div>

  <div className="h-14 border-t border-surface-dim px-4 flex items-center justify-between shrink-0">
    <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low" data-close-brand>Cancel</button>
    <div className="flex items-center gap-2">
      <div className="flex split-btn">
        <button className="h-8 px-3 bg-white border border-surface-dim text-body-md font-semibold hover:bg-surface-container-low split-btn-main" data-save-new>Save and new</button>
        <button className="h-8 px-1.5 bg-white border border-surface-dim hover:bg-surface-container-low split-btn-arrow">
          <span className="material-symbols-outlined text-[16px]">expand_more</span></button>
      </div>
      <div className="flex split-btn">
        <button className="h-8 px-3 bg-primary text-white text-body-md font-semibold hover:bg-primary-container split-btn-main" data-save-brand>Save brand</button>
        <button className="h-8 px-1.5 bg-primary text-white hover:bg-primary-container split-btn-arrow">
          <span className="material-symbols-outlined text-[16px]">expand_more</span></button>
      </div>
    </div>
  </div>
</div>
    </>
  );
}
