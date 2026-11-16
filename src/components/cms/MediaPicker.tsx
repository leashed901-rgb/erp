'use client';

import { useEffect, useState } from 'react';

/* MediaPicker — an image field's "Browse" control. Lists /api/cms/media
   rows in a modal; picking one writes its URL into the field. The same
   picker serves the page editor, banner editor and popup editor. */

interface Asset {
  id: string;
  url: string;
  title: string | null;
  altText: string | null;
  mimeType: string | null;
}

export default function MediaPicker({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (url: string) => void;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState('');

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch('/api/cms/media')
      .then((r) => r.json())
      .then((j) => setAssets((j.data || []) as Asset[]))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open ]);

  const filtered = q.trim()
    ? assets.filter((a) => `${a.title || ''} ${a.altText || ''} ${a.url}`.toLowerCase().includes(q.toLowerCase()))
    : assets;

  return (
    <div>
      <div className="flex gap-2">
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="https://…"
          className="flex-1 h-9 px-3 border border-[#dad9dd] rounded-md text-[13px] bg-white"
          aria-label={label}
        />
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="h-9 px-3 border border-[#dad9dd] rounded-md text-[12px] font-semibold hover:bg-[#f4f3f7]"
        >
          Browse
        </button>
      </div>
      {value && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={value} alt="" className="mt-2 max-h-32 rounded-md border border-[#dad9dd] object-cover" />
      )}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setOpen(false)}>
          <div className="bg-white rounded-xl w-[640px] max-w-[92vw] max-h-[80vh] flex flex-col shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-[#dad9dd] flex items-center justify-between">
              <strong className="text-[14px]">Choose media</strong>
              <button type="button" onClick={() => setOpen(false)} className="text-[20px] leading-none px-2" aria-label="Close">
                ×
              </button>
            </div>
            <div className="px-5 py-3 border-b border-[#dad9dd]">
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search media…"
                className="w-full h-9 px-3 border border-[#dad9dd] rounded-md text-[13px]"
              />
            </div>
            <div className="p-5 overflow-y-auto grid grid-cols-3 gap-3">
              {loading && <p className="text-[13px] text-[#6f7a69]">Loading media…</p>}
              {!loading && filtered.length === 0 && (
                <p className="text-[13px] text-[#6f7a69] col-span-3">
                  No media yet — add assets under Website / CMS → Media, or paste a URL above.
                </p>
              )}
              {filtered.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => {
                    onChange(a.url);
                    setOpen(false);
                  }}
                  className="border border-[#dad9dd] rounded-lg overflow-hidden text-left hover:border-[#0a6400]"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={a.url} alt={a.altText || ''} className="w-full h-28 object-cover" />
                  <span className="block px-2 py-1.5 text-[11px] truncate">{a.title || a.url}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
