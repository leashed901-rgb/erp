'use client';

import { useCallback, useEffect, useState } from 'react';
import type { MediaAsset } from '@/lib/cmsTypes';
import type { DomainKey } from '@/data/shellData';

/* Media library (SHIP-IT step 2): the cms_media_assets rows — grid of
   assets, add-by-URL, edit metadata, delete. The page/banner/popup
   editors pick from this library through the MediaPicker modal. */

export default function CmsMediaLibraryScreen({
  onToast,
  onNavigate,
}: {
  onToast: (m: string) => void;
  onNavigate: (domain: DomainKey, screenId: string) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [q, setQ] = useState('');
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [altText, setAltText] = useState('');
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editAlt, setEditAlt] = useState('');
  const [editTags, setEditTags] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/cms/media');
      const j = await res.json();
      if (!res.ok) throw new Error(j.error?.message || 'Media failed to load');
      setAssets((j.data || []) as MediaAsset[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Media failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const add = async () => {
    if (!url.trim()) return;
    setAdding(true);
    try {
      const res = await fetch('/api/cms/media', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim(), title: title.trim() || null, altText: altText.trim() || null }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error?.message || 'Add failed');
      onToast('Asset added');
      setUrl('');
      setTitle('');
      setAltText('');
      await load();
    } catch (e) {
      onToast(e instanceof Error ? e.message : 'Add failed');
    } finally {
      setAdding(false);
    }
  };

  const saveEdit = async (id: string) => {
    try {
      const res = await fetch(`/api/cms/media/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: editTitle, altText: editAlt, tags: editTags }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error?.message || 'Save failed');
      setEditingId(null);
      await load();
    } catch (e) {
      onToast(e instanceof Error ? e.message : 'Save failed');
    }
  };

  const remove = async (id: string) => {
    try {
      const res = await fetch(`/api/cms/media/${encodeURIComponent(id)}`, { method: 'DELETE' });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error?.message || 'Delete failed');
      onToast('Asset deleted');
      await load();
    } catch (e) {
      onToast(e instanceof Error ? e.message : 'Delete failed');
    }
  };

  const filtered = q.trim()
    ? assets.filter((a) => `${a.title || ''} ${a.altText || ''} ${a.url} ${a.tags || ''}`.toLowerCase().includes(q.toLowerCase()))
    : assets;

  const input = 'h-9 px-3 border border-[#dad9dd] rounded-md text-[13px] bg-white';

  return (
    <div className="min-h-full bg-[#faf9fc]">
      <div className="h-[52px] bg-white border-b border-[#dad9dd] flex items-center justify-between px-5 sticky top-0 z-40">
        <div className="flex items-center gap-2.5 text-[13px] min-w-0">
          <button className="text-[#6f7a69] hover:text-black" onClick={() => onNavigate('settings', 'media')} aria-label="Back to Media">
            ←
          </button>
          <span className="material-symbols-outlined text-[18px] text-[#6f7a69]">photo_library</span>
          <strong>Media library</strong>
          <span className="text-[#6f7a69]">· {assets.length} assets</span>
        </div>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search media…" className={`${input} w-[240px]`} />
      </div>

      <div className="p-6 max-w-[1100px] mx-auto">
        {error && <p className="text-[13px] text-[#ba1a1a] mb-4">{error}</p>}
        <div className="bg-white border border-[#dad9dd] rounded-xl p-5 mb-6">
          <h3 className="text-[13px] font-semibold mb-3">Add an asset by URL</h3>
          <div className="flex gap-2 flex-wrap">
            <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://… (image URL)" className={`${input} flex-1 min-w-[280px]`} />
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" className={`${input} w-[180px]`} />
            <input value={altText} onChange={(e) => setAltText(e.target.value)} placeholder="Alt text" className={`${input} w-[180px]`} />
            <button onClick={() => void add()} disabled={!url.trim() || adding} className="h-9 px-4 rounded-md bg-[#0a6400] text-white text-[12px] font-semibold disabled:opacity-50">
              Add asset
            </button>
          </div>
        </div>

        {loading && <p className="text-[13px] text-[#6f7a69]">Loading media…</p>}
        {!loading && filtered.length === 0 && (
          <div className="bg-white border border-dashed border-[#dad9dd] rounded-xl p-8 text-center">
            <p className="text-[13px] font-semibold">No media yet</p>
            <p className="text-[12px] text-[#6f7a69] mt-1">Add an image by URL above — pages, banners and popups pick from here.</p>
          </div>
        )}
        <div className="grid grid-cols-3 gap-4">
          {filtered.map((a) => (
            <div key={a.id} className="bg-white border border-[#dad9dd] rounded-xl overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={a.url} alt={a.altText || ''} className="w-full h-44 object-cover bg-[#f4f3f7]" />
              <div className="p-3">
                {editingId === a.id ? (
                  <>
                    <input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} placeholder="Title" className={`${input} w-full mb-2`} />
                    <input value={editAlt} onChange={(e) => setEditAlt(e.target.value)} placeholder="Alt text" className={`${input} w-full mb-2`} />
                    <input value={editTags} onChange={(e) => setEditTags(e.target.value)} placeholder="Tags (comma separated)" className={`${input} w-full mb-2`} />
                    <div className="flex gap-2">
                      <button onClick={() => void saveEdit(a.id)} className="h-8 px-3 rounded-md bg-[#0a6400] text-white text-[12px] font-semibold">
                        Save
                      </button>
                      <button onClick={() => setEditingId(null)} className="h-8 px-3 rounded-md border border-[#dad9dd] text-[12px] font-semibold">
                        Cancel
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="text-[13px] font-semibold truncate">{a.title || a.url}</div>
                    <div className="text-[11px] text-[#6f7a69] mt-1 truncate">
                      {a.mimeType || 'image'} · {a.status}
                      {a.tags ? ` · ${a.tags}` : ''}
                    </div>
                    <div className="flex gap-2 mt-3">
                      <button
                        onClick={() => {
                          setEditingId(a.id);
                          setEditTitle(a.title || '');
                          setEditAlt(a.altText || '');
                          setEditTags(a.tags || '');
                        }}
                        className="h-8 px-3 rounded-md border border-[#dad9dd] text-[12px] font-semibold"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => void navigator.clipboard?.writeText(a.url)}
                        className="h-8 px-3 rounded-md border border-[#dad9dd] text-[12px] font-semibold"
                      >
                        Copy URL
                      </button>
                      <button onClick={() => void remove(a.id)} className="h-8 px-3 rounded-md border border-[#dad9dd] text-[12px] font-semibold text-[#ba1a1a]">
                        Delete
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
