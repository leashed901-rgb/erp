'use client';

import { useCallback, useEffect, useState } from 'react';
import { useCmsEditor } from '@/lib/cmsStore';
import type { DomainKey } from '@/data/shellData';
import type { ContentBlock } from '@/lib/cmsTypes';

/* Block editor: a reusable content block from cms_content_blocks. The
   component type comes from the section library; props are edited as
   JSON (the page editor's per-field form is the friendly path — this
   screen is the library record itself). */

interface SchemaOpt {
  componentType: string;
  label: string;
}

export default function CmsBlockEditorScreen({
  onToast,
  onNavigate,
}: {
  onToast: (m: string) => void;
  onNavigate: (domain: DomainKey, screenId: string) => void;
}) {
  const blockId = useCmsEditor((s) => s.blockId);
  const openBlock = useCmsEditor((s) => s.openBlock);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [schemas, setSchemas] = useState<SchemaOpt[]>([]);
  const [pages, setPages] = useState<{ id: string; title: string }[]>([]);
  const [block, setBlock] = useState<ContentBlock | null>(null);
  const [componentType, setComponentType] = useState('');
  const [blockIdText, setBlockIdText] = useState('');
  const [propsText, setPropsText] = useState('{}');
  const [propsError, setPropsError] = useState<string | null>(null);
  const [slotId, setSlotId] = useState('');
  const [pageId, setPageId] = useState('');
  const [status, setStatus] = useState('draft');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [schemaRes, pageRes] = await Promise.all([fetch('/api/cms/schemas'), fetch('/api/cms/pages')]);
      const sj = await schemaRes.json();
      setSchemas(((sj.data || []) as SchemaOpt[]).map((s) => ({ componentType: s.componentType, label: s.label })));
      const pj = await pageRes.json();
      setPages(((pj.data || []) as { id: string; title: string }[]).map((p) => ({ id: p.id, title: p.title })));
      if (blockId) {
        const res = await fetch(`/api/cms/blocks/${encodeURIComponent(blockId)}`);
        const j = await res.json();
        if (!res.ok) throw new Error(j.error?.message || 'Block failed to load');
        const b = j.data as ContentBlock;
        setBlock(b);
        setComponentType(b.componentType);
        setBlockIdText(b.blockId);
        setPropsText(JSON.stringify(b.props || {}, null, 2));
        setSlotId(b.slotId || '');
        setPageId(b.pageId || '');
        setStatus(b.status);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Block failed to load');
    } finally {
      setLoading(false);
    }
  }, [blockId]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    let props: Record<string, unknown>;
    try {
      props = JSON.parse(propsText || '{}') as Record<string, unknown>;
      setPropsError(null);
    } catch {
      setPropsError('Props must be valid JSON');
      return;
    }
    if (!componentType) {
      onToast('Choose a component type');
      return;
    }
    setSaving(true);
    try {
      let res: Response;
      if (block) {
        res = await fetch(`/api/cms/blocks/${encodeURIComponent(block.id)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ props, status, slotId: slotId || null, sortOrder: block.sortOrder }),
        });
      } else {
        res = await fetch('/api/cms/blocks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ componentType, blockId: blockIdText || undefined, props, slotId: slotId || null, pageId: pageId || null, status }),
        });
      }
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error?.message || 'Save failed');
      onToast(block ? 'Block saved' : 'Block created');
      if (!block) openBlock(String(j.data.id));
      else setBlock(j.data as ContentBlock);
    } catch (e) {
      onToast(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <p className="text-[13px] text-[#6f7a69]">Loading block editor…</p>
      </div>
    );
  }
  if (error) {
    return (
      <div className="p-6">
        <p className="text-[13px] text-[#ba1a1a]">{error}</p>
        <button className="mt-3 h-8 px-3 border border-[#dad9dd] rounded text-[12px] font-semibold" onClick={() => onNavigate('settings', 'content-blocks')}>
          Back to Content blocks
        </button>
      </div>
    );
  }

  const input = 'w-full h-9 px-3 border border-[#dad9dd] rounded-md text-[13px] bg-white';

  return (
    <div className="min-h-full bg-[#faf9fc]">
      <div className="h-[52px] bg-white border-b border-[#dad9dd] flex items-center justify-between px-5 sticky top-0 z-40">
        <div className="flex items-center gap-2.5 text-[13px] min-w-0">
          <button className="text-[#6f7a69] hover:text-black" onClick={() => onNavigate('settings', 'content-blocks')} aria-label="Back to Content blocks">
            ←
          </button>
          <span className="material-symbols-outlined text-[18px] text-[#6f7a69]">widgets</span>
          <strong className="truncate">{block ? block.blockId : 'New block'}</strong>
        </div>
        <button onClick={() => void save()} disabled={saving || !componentType} className="h-8 px-3 rounded-md text-[12px] font-semibold bg-[#0a6400] text-white flex items-center gap-1.5 hover:bg-[#108000] disabled:opacity-50">
          <span className="material-symbols-outlined text-[16px]">save</span>Save
        </button>
      </div>

      <div className="p-6 max-w-[720px] mx-auto">
        <div className="bg-white border border-[#dad9dd] rounded-xl p-5">
          <div className="grid grid-cols-2 gap-4">
            <label className="text-[12px] font-semibold">
              Component type
              <select value={componentType} onChange={(e) => setComponentType(e.target.value)} className={`${input} mt-1`} disabled={!!block}>
                <option value="">—</option>
                {schemas.map((s) => (
                  <option key={s.componentType} value={s.componentType}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-[12px] font-semibold">
              Block ID
              <input value={blockIdText} onChange={(e) => setBlockIdText(e.target.value)} className={`${input} mt-1`} placeholder="auto if blank" disabled={!!block} />
            </label>
            <label className="text-[12px] font-semibold">
              Slot
              <input value={slotId} onChange={(e) => setSlotId(e.target.value)} className={`${input} mt-1`} placeholder="slot id" />
            </label>
            <label className="text-[12px] font-semibold">
              Page
              <select value={pageId} onChange={(e) => setPageId(e.target.value)} className={`${input} mt-1`}>
                <option value="">— (unassigned)</option>
                {pages.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-[12px] font-semibold">
              Status
              <select value={status} onChange={(e) => setStatus(e.target.value)} className={`${input} mt-1`}>
                <option value="draft">Draft</option>
                <option value="published">Published</option>
              </select>
            </label>
          </div>
          <label className="block mt-4 text-[12px] font-semibold">
            Props (JSON)
            <textarea
              value={propsText}
              rows={12}
              onChange={(e) => setPropsText(e.target.value)}
              className="mt-1 w-full px-3 py-2 border border-[#dad9dd] rounded-md text-[12px] font-mono bg-white"
              spellCheck={false}
            />
          </label>
          {propsError && <p className="text-[12px] text-[#ba1a1a] mt-2">{propsError}</p>}
          <p className="text-[12px] text-[#6f7a69] mt-3">Reusable blocks are placed into page slots; the page editor is the friendly path for editing a page&apos;s own sections.</p>
        </div>
      </div>
    </div>
  );
}
