'use client';
/**
 * CollectionsPage — 1:1 port of upload/categories& collections.html.
 * Collection management (manual + automated) for storefront publishing.
 * KPIs: Total collections / Published / Drafts / Uncategorized.
 * "New collection" split button. Detail drawer with type, visibility, rules.
 */
import { useEffect, useState } from 'react';

interface Props { onToast: (m: string) => void; onNavigate?: (d: string, s: string) => void; }
interface Collection { id: string; name: string; slug: string; product_count?: number; type?: string; status?: string; is_published?: boolean; }

export default function CollectionsPage({ onToast }: Props) {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState<'all' | 'published' | 'drafts'>('all');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<Collection | null>(null);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [type, setType] = useState<'manual' | 'automated'>('manual');
  const [publish, setPublish] = useState(false);

  useEffect(() => {
    fetch('/api/v1/collections').then(r => r.json()).then(j => { setCollections(j.data || []); setLoaded(true); }).catch(() => setLoaded(true));
  }, []);

  function refresh() { fetch('/api/v1/collections').then(r => r.json()).then(j => setCollections(j.data || [])); }

  const filtered = collections.filter(c => {
    if (tab === 'published' && !c.is_published) return false;
    if (tab === 'drafts' && c.is_published) return false;
    return true;
  });

  function openCreate() { setEditing(null); setName(''); setSlug(''); setType('manual'); setPublish(false); setDrawerOpen(true); }
  function openEdit(c: Collection) { setEditing(c); setName(c.name); setSlug(c.slug || ''); setType((c.type as 'manual' | 'automated') || 'manual'); setPublish(c.is_published || false); setDrawerOpen(true); }

  async function save() {
    if (!name.trim()) { onToast('Name is required'); return; }
    const body = { name: name.trim(), slug: slug.trim() || name.trim().toLowerCase().replace(/\s+/g, '-'), type, is_published: publish };
    if (editing) {
      const res = await fetch(`/api/v1/collections/${editing.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (res.ok) { onToast('Collection saved'); setDrawerOpen(false); refresh(); }
    } else {
      const res = await fetch('/api/v1/collections', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (res.ok) { onToast('Collection created'); setDrawerOpen(false); refresh(); }
    }
  }

  async function del(id: string) {
    const res = await fetch(`/api/v1/collections/${id}`, { method: 'DELETE' });
    if (res.ok) { onToast('Collection deleted'); refresh(); }
  }

  const publishedCount = collections.filter(c => c.is_published).length;
  const draftCount = collections.filter(c => !c.is_published).length;

  return (
    <main className="px-6 pb-12">
      {/* Page header */}
      <div className="flex items-center justify-between py-4 flex-wrap gap-4">
        <div>
          <h1 className="text-headline-lg">Collections</h1>
          <p className="text-body-sm text-on-surface-variant mt-0.5">Group products into themes for storefront publishing</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low flex items-center gap-1" onClick={() => onToast('Export collections')}><span className="material-symbols-outlined text-[16px]">download</span>Export</button>
          <div className="flex split-btn">
            <button className="h-8 px-3 bg-primary text-white text-body-md font-semibold hover:bg-primary-container flex items-center gap-1 rounded-l" onClick={openCreate}><span className="material-symbols-outlined text-[16px]">add</span>New collection</button>
            <button className="h-8 px-1.5 bg-primary text-white hover:bg-primary-container rounded-r border-l border-white/10" onClick={() => onToast('New automated collection')}><span className="material-symbols-outlined text-[16px]">expand_more</span></button>
          </div>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-5">
        <div className="bg-white rounded-xl border border-surface-dim p-3"><div className="text-[10px] uppercase font-bold text-on-surface-variant">Total collections</div><div className="text-headline-sm tabular-nums mt-1">{collections.length}</div></div>
        <div className="bg-white rounded-xl border border-surface-dim p-3"><div className="text-[10px] uppercase font-bold text-on-surface-variant">Published</div><div className="text-headline-sm tabular-nums mt-1 text-secondary">{publishedCount}</div></div>
        <div className="bg-white rounded-xl border border-surface-dim p-3"><div className="text-[10px] uppercase font-bold text-on-surface-variant">Drafts</div><div className="text-headline-sm tabular-nums mt-1">{draftCount}</div></div>
        <div className="bg-white rounded-xl border border-surface-dim p-3"><div className="text-[10px] uppercase font-bold text-on-surface-variant">Products in collections</div><div className="text-headline-sm tabular-nums mt-1">{collections.reduce((s, c) => s + (c.product_count || 0), 0)}</div></div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-surface-dim mb-3">
        <button className={`px-4 py-2 text-label-md border-b-2 ${tab === 'all' ? 'border-qb-blue text-qb-blue font-semibold' : 'border-transparent text-on-surface-variant'}`} onClick={() => setTab('all')}>All collections <span className="ml-1 text-[10px] text-outline">{collections.length}</span></button>
        <button className={`px-4 py-2 text-label-md border-b-2 ${tab === 'published' ? 'border-qb-blue text-qb-blue font-semibold' : 'border-transparent text-on-surface-variant'}`} onClick={() => setTab('published')}>Published <span className="ml-1 text-[10px] text-outline">{publishedCount}</span></button>
        <button className={`px-4 py-2 text-label-md border-b-2 ${tab === 'drafts' ? 'border-qb-blue text-qb-blue font-semibold' : 'border-transparent text-on-surface-variant'}`} onClick={() => setTab('drafts')}>Drafts <span className="ml-1 text-[10px] text-outline">{draftCount}</span></button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-surface-dim overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-body-sm">
            <thead className="bg-surface-container-low text-label-sm text-on-surface-variant uppercase tracking-wider">
              <tr>
                <th className="px-3 py-2">Collection</th>
                <th className="px-3 py-2">Products</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Status</th>
                <th className="w-8 px-2 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-dim">
              {filtered.map(c => (
                <tr key={c.id} className="hover:bg-surface-container-low cursor-pointer" onClick={() => openEdit(c)}>
                  <td className="px-3 py-2"><div className="font-medium">{c.name}</div><div className="text-[11px] text-on-surface-variant font-mono">/collections/{c.slug || c.id.slice(0, 8)}</div></td>
                  <td className="px-3 py-2 text-on-surface-variant">{c.product_count || 0}</td>
                  <td className="px-3 py-2"><span className="text-[11px] px-2 py-0.5 rounded bg-surface-container-high text-on-surface-variant">{c.type || 'manual'}</span></td>
                  <td className="px-3 py-2"><span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${c.is_published ? 'bg-secondary/15 text-secondary' : 'bg-surface-container-high text-on-surface-variant'}`}>{c.is_published ? 'Published' : 'Draft'}</span></td>
                  <td className="px-2 py-2 text-right"><button className="text-on-surface-variant hover:text-error" onClick={e => { e.stopPropagation(); del(c.id); }}><span className="material-symbols-outlined text-[16px]">delete</span></button></td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={5} className="px-3 py-12 text-center text-on-surface-variant">{loaded ? 'No collections found' : 'Loading…'}</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* Collection drawer */}
      {drawerOpen && (
        <>
          <div className="fixed inset-0 bg-black/35 z-[200]" onClick={() => setDrawerOpen(false)} />
          <div className="fixed top-0 right-0 bottom-0 w-[680px] max-w-[96vw] bg-white z-[201] flex flex-col">
            <div className="flex items-center justify-between px-5 h-14 border-b border-surface-dim shrink-0">
              <div className="flex items-center gap-2"><span className="material-symbols-outlined text-[20px] text-primary">collections_bookmark</span><div className="text-headline-sm">{editing ? 'Edit collection' : 'New collection'}</div></div>
              <button className="w-8 h-8 rounded hover:bg-surface-container flex items-center justify-center" onClick={() => setDrawerOpen(false)}><span className="material-symbols-outlined text-[18px]">close</span></button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <div><label className="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">Title</label><input className="w-full h-9 px-3 mt-1 border border-surface-dim rounded text-body-md" value={name} onChange={e => setName(e.target.value)} autoFocus /></div>
              <div><label className="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">URL handle</label><input className="w-full h-9 px-3 mt-1 border border-surface-dim rounded text-body-md font-mono text-body-sm" value={slug} onChange={e => setSlug(e.target.value)} placeholder="/collections/…" /></div>
              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">Type</label>
                <div className="flex gap-3 mt-1">
                  <label className="flex items-center gap-2 text-body-sm"><input type="radio" name="type" checked={type === 'manual'} onChange={() => setType('manual')} /> Manual</label>
                  <label className="flex items-center gap-2 text-body-sm"><input type="radio" name="type" checked={type === 'automated'} onChange={() => setType('automated')} /> Automated (rules)</label>
                </div>
              </div>
              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">Visibility</label>
                <div className="mt-1 space-y-1">
                  <label className="flex items-center gap-2 text-body-sm"><input type="checkbox" checked={publish} onChange={() => setPublish(!publish)} /> Publish to storefront</label>
                </div>
              </div>
            </div>
            <div className="h-14 border-t border-surface-dim px-4 flex items-center justify-between shrink-0">
              <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low" onClick={() => setDrawerOpen(false)}>Cancel</button>
              <button className="h-8 px-3 bg-primary text-white rounded text-body-md font-semibold hover:bg-primary-container" onClick={save}>{editing ? 'Save' : 'Create collection'}</button>
            </div>
          </div>
        </>
      )}
    </main>
  );
}
