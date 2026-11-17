'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useCmsEditor } from '@/lib/cmsStore';
import type { DomainKey } from '@/data/shellData';
import CmsPageRender, { type CmsBlockView } from './CmsPageRender';
import MediaPicker from './MediaPicker';

/* CMS page editor (SHIP-IT step 1): page meta + sections from the
   cms_block_schemas library + SEO + revisions. Sections edit in place
   from their schema fields; Save writes the page (a revision row is
   snapshotted server-side first); Publish flips status and stamps
   published_at. Preview renders the page exactly as the storefront will,
   through the same render payload /s/[slug] uses. */

interface SchemaField {
  key: string;
  label: string;
  type: string;
  required?: boolean;
  options?: string[];
  placeholder?: string;
}
interface Schema {
  id: string;
  componentType: string;
  label: string;
  description: string;
  fields: SchemaField[];
  icon: string;
}
interface Revision {
  id: string;
  version: number;
  title: string;
  body: string | null;
  blocks: unknown[];
  change_note: string | null;
  created_at: string;
}
interface PageData {
  id: string;
  slug: string;
  title: string;
  pageType: string | null;
  body: string | null;
  blocks: CmsBlockView[];
  excerpt: string | null;
  featuredImageUrl: string | null;
  status: string;
  publishedAt: string | null;
  version: number;
  updatedAt: string;
}
interface SeoData {
  metaTitle: string | null;
  metaDescription: string | null;
  ogTitle: string | null;
  ogDescription: string | null;
  ogImageUrl: string | null;
  canonicalUrl: string | null;
  robotsIndex: boolean;
  robotsFollow: boolean;
}

const PAGE_TYPES = ['standard', 'home', 'services', 'about', 'contact', 'policy', 'landing', 'blog_post', 'faq', 'gallery', 'custom'];
const newBlock = (type: string): CmsBlockView => ({
  id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `blk-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  type,
  props: {},
});

function FieldInput({
  field,
  value,
  onChange,
  bannerOptions,
  id,
}: {
  field: SchemaField;
  value: unknown;
  onChange: (v: string | number | boolean) => void;
  bannerOptions: { id: string; name: string }[];
  id: string;
}) {
  const v = value == null ? '' : String(value);
  if (field.type === 'image') return <MediaPicker value={v} onChange={onChange} label={field.label} />;
  if (field.type === 'textarea' || field.type === 'richtext') {
    return (
      <textarea
        id={id}
        value={v}
        rows={field.type === 'richtext' ? 5 : 3}
        placeholder={field.placeholder || ''}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 border border-[#dad9dd] rounded-md text-[13px] bg-white"
      />
    );
  }
  if (field.type === 'select') {
    const opts = field.key === 'banner_id' ? bannerOptions.map((b) => b.id) : field.options || [];
    const labels = field.key === 'banner_id' ? bannerOptions.map((b) => b.name) : opts;
    if (!opts.length) {
      return (
        <input
          id={id}
          value={v}
          placeholder={field.placeholder || 'ID'}
          onChange={(e) => onChange(e.target.value)}
          className="w-full h-9 px-3 border border-[#dad9dd] rounded-md text-[13px] bg-white"
        />
      );
    }
    return (
      <select id={id} value={v} onChange={(e) => onChange(e.target.value)} className="w-full h-9 px-3 border border-[#dad9dd] rounded-md text-[13px] bg-white">
        <option value="">—</option>
        {opts.map((o, i) => (
          <option key={o} value={o}>
            {labels[i] || o}
          </option>
        ))}
      </select>
    );
  }
  if (field.type === 'toggle') {
    return (
      <label className="flex items-center gap-2 text-[13px]">
        <input type="checkbox" checked={value === true || value === 'true'} onChange={(e) => onChange(e.target.checked)} />
        {field.label}
      </label>
    );
  }
  if (field.type === 'color') {
    return (
      <div className="flex gap-2">
        <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(v) ? v : '#ffffff'} onChange={(e) => onChange(e.target.value)} className="h-9 w-12 border border-[#dad9dd] rounded-md bg-white p-0.5" />
        <input id={id} value={v} placeholder="#ffffff" onChange={(e) => onChange(e.target.value)} className="flex-1 h-9 px-3 border border-[#dad9dd] rounded-md text-[13px] bg-white" />
      </div>
    );
  }
  if (field.type === 'number') {
    return (
      <input
        id={id}
        type="number"
        value={v}
        placeholder={field.placeholder || ''}
        onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
        className="w-full h-9 px-3 border border-[#dad9dd] rounded-md text-[13px] bg-white"
      />
    );
  }
  return (
    <input
      id={id}
      type={field.type === 'url' ? 'url' : 'text'}
      value={v}
      placeholder={field.placeholder || ''}
      onChange={(e) => onChange(e.target.value)}
      className="w-full h-9 px-3 border border-[#dad9dd] rounded-md text-[13px] bg-white"
    />
  );
}

export default function CmsPageEditorScreen({
  onToast,
  onNavigate,
}: {
  onToast: (m: string) => void;
  onNavigate: (domain: DomainKey, screenId: string) => void;
}) {
  const pageId = useCmsEditor((s) => s.pageId);
  const openPage = useCmsEditor((s) => s.openPage);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [schemas, setSchemas] = useState<Schema[]>([]);
  const [bannerOptions, setBannerOptions] = useState<{ id: string; name: string }[]>([]);
  const [page, setPage] = useState<PageData | null>(null);
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [seo, setSeo] = useState<SeoData>({ metaTitle: null, metaDescription: null, ogTitle: null, ogDescription: null, ogImageUrl: null, canonicalUrl: null, robotsIndex: true, robotsFollow: true });
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [pageType, setPageType] = useState('standard');
  const [excerpt, setExcerpt] = useState('');
  const [featuredImageUrl, setFeaturedImageUrl] = useState('');
  const [blocks, setBlocks] = useState<CmsBlockView[]>([]);
  const [tab, setTab] = useState<'sections' | 'seo' | 'revisions' | 'preview'>('sections');
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [previewBlocks, setPreviewBlocks] = useState<CmsBlockView[] | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  // New-page form state (pageId null).
  const [newTitle, setNewTitle] = useState('');
  const [newSlug, setNewSlug] = useState('');
  const [newType, setNewType] = useState('standard');
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    if (!pageId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [pageRes, schemaRes, bannerRes] = await Promise.all([
        fetch(`/api/cms/pages/${encodeURIComponent(pageId)}`),
        fetch('/api/cms/schemas'),
        fetch('/api/v1/marketing/banners'),
      ]);
      const pj = await pageRes.json();
      if (!pageRes.ok) throw new Error(pj.error?.message || 'Page failed to load');
      const p = pj.data.page as PageData;
      setPage(p);
      setRevisions((pj.data.revisions || []) as Revision[]);
      const s = pj.data.seo as SeoData | null;
      if (s) setSeo({ ...s });
      setTitle(p.title);
      setSlug(p.slug);
      setPageType(p.pageType || 'standard');
      setExcerpt(p.excerpt || '');
      setFeaturedImageUrl(p.featuredImageUrl || '');
      setBlocks(Array.isArray(p.blocks) ? (p.blocks as CmsBlockView[]) : []);
      setDirty(false);
      const sj = await schemaRes.json();
      setSchemas((sj.data || []) as Schema[]);
      const bj = await bannerRes.json().catch(() => ({ data: [] }));
      setBannerOptions(((bj.data || []) as { id: string; name: string }[]).map((b) => ({ id: b.id, name: b.name })));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Page failed to load');
    } finally {
      setLoading(false);
    }
  }, [pageId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Schemas for the new-page form too.
  useEffect(() => {
    if (pageId) return;
    fetch('/api/cms/schemas')
      .then((r) => r.json())
      .then((j) => setSchemas((j.data || []) as Schema[]))
      .catch(() => {});
  }, [pageId]);

  const schemaByType = useMemo(() => new Map(schemas.map((s) => [s.componentType, s])), [schemas]);

  const markDirty = () => setDirty(true);

  const save = async (statusOverride?: string) => {
    if (!page) return false;
    setSaving(true);
    try {
      const res = await fetch(`/api/cms/pages/${encodeURIComponent(page.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          slug,
          excerpt,
          featuredImageUrl: featuredImageUrl || null,
          blocks,
          ...(statusOverride ? { status: statusOverride } : {}),
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error?.message || 'Save failed');
      await fetch('/api/cms/seo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pageId: page.id, ...seo }),
      }).catch(() => {});
      setDirty(false);
      await load();
      return true;
    } catch (e) {
      onToast(e instanceof Error ? e.message : 'Save failed');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const publish = async () => {
    if (!page) return;
    const ok = await save('published');
    if (ok) onToast(`Published — live at /s${page.slug.startsWith('/') ? page.slug : `/${page.slug}`}`);
  };

  const restore = async (rev: Revision) => {
    if (!page) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/cms/pages/${encodeURIComponent(page.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: rev.title, body: rev.body, blocks: rev.blocks, changeNote: `Restored revision ${rev.version}` }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error?.message || 'Restore failed');
      onToast(`Restored revision ${rev.version}`);
      await load();
    } catch (e) {
      onToast(e instanceof Error ? e.message : 'Restore failed');
    } finally {
      setSaving(false);
    }
  };

  const loadPreview = useCallback(async () => {
    if (!page) return;
    // Save first so the preview shows the current sections, then fetch
    // the resolved render payload — the same payload /s/[slug] serves.
    await save();
    const res = await fetch(`/api/cms/render?slug=${encodeURIComponent(page.slug)}&preview=1`);
    const j = await res.json().catch(() => ({}));
    if (res.ok && j.data) setPreviewBlocks((j.data.blocks || []) as CmsBlockView[]);
    else setPreviewBlocks(blocks);
  }, [page, blocks]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (tab === 'preview') void loadPreview();
  }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  const moveBlock = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= blocks.length) return;
    const next = [...blocks];
    [next[i], next[j]] = [next[j], next[i]];
    setBlocks(next);
    markDirty();
  };
  const updateBlockProp = (i: number, key: string, value: string | number | boolean) => {
    const next = [...blocks];
    next[i] = { ...next[i], props: { ...next[i].props, [key]: value } };
    setBlocks(next);
    markDirty();
  };
  const removeBlock = (i: number) => {
    setBlocks(blocks.filter((_, x) => x !== i));
    markDirty();
  };

  if (loading) {
    return (
      <div className="p-6">
        <p className="text-[13px] text-[#6f7a69]">Loading page editor…</p>
      </div>
    );
  }

  if (!pageId) {
    return (
      <div className="p-6 max-w-[560px]">
        <button className="text-[12px] font-semibold text-[#0a6400]" onClick={() => onNavigate('settings', 'cms-pages')}>
          ← CMS pages
        </button>
        <h2 className="text-[18px] font-semibold mt-3">New page</h2>
        <p className="text-[13px] text-[#6f7a69] mt-1">Create the page, then add sections from the section library.</p>
        <label className="block mt-5 text-[12px] font-semibold">
          Title
          <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} className="mt-1 w-full h-9 px-3 border border-[#dad9dd] rounded-md text-[13px] font-normal bg-white" />
        </label>
        <label className="block mt-4 text-[12px] font-semibold">
          Slug
          <input
            value={newSlug}
            onChange={(e) => setNewSlug(e.target.value)}
            placeholder="/my-page"
            className="mt-1 w-full h-9 px-3 border border-[#dad9dd] rounded-md text-[13px] font-normal bg-white"
          />
        </label>
        <label className="block mt-4 text-[12px] font-semibold">
          Type
          <select value={newType} onChange={(e) => setNewType(e.target.value)} className="mt-1 w-full h-9 px-3 border border-[#dad9dd] rounded-md text-[13px] font-normal bg-white">
            {PAGE_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <button
          className="mt-6 h-9 px-4 rounded-md bg-[#0a6400] text-white text-[13px] font-semibold disabled:opacity-50"
          disabled={!newTitle.trim() || creating}
          onClick={async () => {
            setCreating(true);
            try {
              const res = await fetch('/api/cms/pages', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title: newTitle.trim(), slug: newSlug.trim() || undefined, pageType: newType }),
              });
              const j = await res.json().catch(() => ({}));
              if (!res.ok) throw new Error(j.error?.message || 'Create failed');
              onToast('Page created');
              openPage(String(j.data.id));
            } catch (e) {
              onToast(e instanceof Error ? e.message : 'Create failed');
            } finally {
              setCreating(false);
            }
          }}
        >
          Create page
        </button>
      </div>
    );
  }

  if (error || !page) {
    return (
      <div className="p-6">
        <p className="text-[13px] text-[#ba1a1a]">{error || 'Page not found'}</p>
        <button className="mt-3 h-8 px-3 border border-[#dad9dd] rounded text-[12px] font-semibold" onClick={() => onNavigate('settings', 'cms-pages')}>
          Back to CMS pages
        </button>
      </div>
    );
  }

  const statusBadge = page.status === 'published' ? 'bg-[#d9f2d0] text-[#0a6400]' : page.status === 'archived' ? 'bg-[#f4f3f7] text-[#6f7a69]' : 'bg-[#fff4cc] text-[#7a5b00]';

  return (
    <div className="min-h-full bg-[#faf9fc]">
      {/* Chrome */}
      <div className="h-[52px] bg-white border-b border-[#dad9dd] flex items-center justify-between px-5 sticky top-0 z-40">
        <div className="flex items-center gap-2.5 text-[13px] min-w-0">
          <button className="text-[#6f7a69] hover:text-black" onClick={() => onNavigate('settings', 'cms-pages')} aria-label="Back to CMS pages">
            ←
          </button>
          <span className="material-symbols-outlined text-[18px] text-[#6f7a69]">description</span>
          <strong className="truncate">{title || 'Untitled page'}</strong>
          <span className={`px-2 py-[3px] rounded-[10px] text-[10px] font-bold uppercase tracking-wide ${statusBadge}`}>{page.status}</span>
          <span className="text-[#6f7a69]">· Rev {page.version}</span>
          {dirty && <span className="text-[#7a5b00] text-[12px]">· Unsaved changes</span>}
        </div>
        <div className="flex gap-1.5">
          <button
            className="h-8 px-3 rounded-md text-[12px] font-semibold border border-[#dad9dd] flex items-center gap-1.5 hover:bg-[#f4f3f7] disabled:opacity-50"
            disabled={saving}
            onClick={() => void save()}
          >
            <span className="material-symbols-outlined text-[16px]">save</span>Save
          </button>
          {page.status === 'published' ? (
            <button
              className="h-8 px-3 rounded-md text-[12px] font-semibold border border-[#dad9dd] flex items-center gap-1.5 hover:bg-[#f4f3f7] disabled:opacity-50"
              disabled={saving}
              onClick={async () => {
                const ok = await save('draft');
                if (ok) onToast('Unpublished — page is a draft again');
              }}
            >
              Unpublish
            </button>
          ) : (
            <button
              className="h-8 px-3 rounded-md text-[12px] font-semibold bg-[#0a6400] text-white flex items-center gap-1.5 hover:bg-[#108000] disabled:opacity-50"
              disabled={saving}
              onClick={() => void publish()}
            >
              <span className="material-symbols-outlined text-[16px]">publish</span>Publish
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="h-11 bg-[#faf9fc] border-b border-[#dad9dd] flex items-center gap-1 px-5 sticky top-[52px] z-40">
        {(
          [
            { id: 'sections', label: 'Sections', icon: 'dashboard' },
            { id: 'seo', label: 'SEO', icon: 'search' },
            { id: 'revisions', label: 'Revisions', icon: 'history', count: revisions.length },
            { id: 'preview', label: 'Preview', icon: 'preview' },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-3.5 py-2 rounded-md text-[12px] font-semibold flex items-center gap-1.5 ${tab === t.id ? 'bg-[#1a1c1e] text-white' : 'text-[#6f7a69] hover:bg-white'}`}
          >
            <span className="material-symbols-outlined text-[16px]">{t.icon}</span>
            {t.label}
            {'count' in t && <span className={`px-1.5 py-px rounded-lg text-[10px] ${tab === t.id ? 'bg-white/20' : 'bg-black/10'}`}>{t.count}</span>}
          </button>
        ))}
      </div>

      <div className="p-6 max-w-[920px] mx-auto">
        {tab === 'sections' && (
          <>
            <div className="bg-white border border-[#dad9dd] rounded-xl p-5">
              <h3 className="text-[13px] font-semibold mb-4">Page details</h3>
              <div className="grid grid-cols-2 gap-4">
                <label className="text-[12px] font-semibold">
                  Title
                  <input
                    value={title}
                    onChange={(e) => {
                      setTitle(e.target.value);
                      markDirty();
                    }}
                    className="mt-1 w-full h-9 px-3 border border-[#dad9dd] rounded-md text-[13px] font-normal bg-white"
                  />
                </label>
                <label className="text-[12px] font-semibold">
                  Slug
                  <input
                    value={slug}
                    onChange={(e) => {
                      setSlug(e.target.value);
                      markDirty();
                    }}
                    className="mt-1 w-full h-9 px-3 border border-[#dad9dd] rounded-md text-[13px] font-normal bg-white"
                  />
                </label>
                <label className="text-[12px] font-semibold">
                  Type
                  <select
                    value={pageType}
                    onChange={(e) => {
                      setPageType(e.target.value);
                      markDirty();
                    }}
                    className="mt-1 w-full h-9 px-3 border border-[#dad9dd] rounded-md text-[13px] font-normal bg-white"
                  >
                    {PAGE_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-[12px] font-semibold">
                  Excerpt
                  <input
                    value={excerpt}
                    onChange={(e) => {
                      setExcerpt(e.target.value);
                      markDirty();
                    }}
                    className="mt-1 w-full h-9 px-3 border border-[#dad9dd] rounded-md text-[13px] font-normal bg-white"
                  />
                </label>
              </div>
              <label className="block mt-4 text-[12px] font-semibold">
                Featured image
                <div className="mt-1">
                  <MediaPicker
                    value={featuredImageUrl}
                    onChange={(u) => {
                      setFeaturedImageUrl(u);
                      markDirty();
                    }}
                    label="Featured image"
                  />
                </div>
              </label>
            </div>

            <div className="flex items-center justify-between mt-6 mb-3">
              <h3 className="text-[13px] font-semibold">Sections ({blocks.length})</h3>
              <div className="relative">
                <button onClick={() => setAddOpen((v) => !v)} className="h-8 px-3 rounded-md bg-[#0a6400] text-white text-[12px] font-semibold flex items-center gap-1">
                  <span className="material-symbols-outlined text-[16px]">add</span>Add section
                </button>
                {addOpen && (
                  <div className="absolute right-0 mt-1 w-[280px] bg-white border border-[#dad9dd] rounded-lg shadow-xl z-20 max-h-[320px] overflow-y-auto">
                    {schemas.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => {
                          setBlocks([...blocks, newBlock(s.componentType)]);
                          markDirty();
                          setAddOpen(false);
                        }}
                        className="w-full text-left px-3 py-2.5 hover:bg-[#f4f3f7] flex items-start gap-2.5"
                      >
                        <span className="material-symbols-outlined text-[18px] text-[#6f7a69]">{s.icon || 'widgets'}</span>
                        <span>
                          <span className="block text-[13px] font-semibold">{s.label}</span>
                          <span className="block text-[11px] text-[#6f7a69]">{s.description}</span>
                        </span>
                      </button>
                    ))}
                    {schemas.length === 0 && <p className="px-3 py-3 text-[12px] text-[#6f7a69]">No section types in the library yet.</p>}
                  </div>
                )}
              </div>
            </div>

            {blocks.length === 0 && (
              <div className="bg-white border border-dashed border-[#dad9dd] rounded-xl p-8 text-center">
                <p className="text-[13px] font-semibold">No sections yet</p>
                <p className="text-[12px] text-[#6f7a69] mt-1">Add a section from the library — hero, text, image, gallery, products, and more.</p>
              </div>
            )}
            {blocks.map((b, i) => {
              const schema = schemaByType.get(b.type);
              return (
                <div key={b.id} className="bg-white border border-[#dad9dd] rounded-xl p-5 mb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-[18px] text-[#6f7a69]">{schema?.icon || 'widgets'}</span>
                      <strong className="text-[13px]">{schema?.label || b.type}</strong>
                      <span className="text-[11px] text-[#6f7a69]">Section {i + 1} of {blocks.length}</span>
                    </div>
                    <div className="flex gap-1">
                      <button onClick={() => moveBlock(i, -1)} disabled={i === 0} className="h-7 w-7 rounded border border-[#dad9dd] text-[14px] disabled:opacity-40" aria-label="Move up">
                        ↑
                      </button>
                      <button onClick={() => moveBlock(i, 1)} disabled={i === blocks.length - 1} className="h-7 w-7 rounded border border-[#dad9dd] text-[14px] disabled:opacity-40" aria-label="Move down">
                        ↓
                      </button>
                      <button onClick={() => removeBlock(i)} className="h-7 px-2 rounded border border-[#dad9dd] text-[12px] text-[#ba1a1a]" aria-label="Remove section">
                        Remove
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4 mt-4">
                    {(schema?.fields || []).map((f) => (
                      <div key={f.key} className={f.type === 'textarea' || f.type === 'richtext' || f.type === 'image' ? 'col-span-2' : ''}>
                        <label htmlFor={`blk-${b.id}-${f.key}`} className="block text-[12px] font-semibold mb-1">
                          {f.label}
                          {f.required && <span className="text-[#ba1a1a]"> *</span>}
                        </label>
                        <FieldInput id={`blk-${b.id}-${f.key}`} field={f} value={b.props[f.key]} bannerOptions={bannerOptions} onChange={(v) => updateBlockProp(i, f.key, v)} />
                      </div>
                    ))}
                    {!schema && <p className="text-[12px] text-[#6f7a69] col-span-2">Unknown section type — no fields in the library.</p>}
                  </div>
                </div>
              );
            })}
          </>
        )}

        {tab === 'seo' && (
          <div className="bg-white border border-[#dad9dd] rounded-xl p-5">
            <h3 className="text-[13px] font-semibold mb-4">Search & social</h3>
            <div className="grid grid-cols-2 gap-4">
              <label className="text-[12px] font-semibold">
                Meta title
                <input
                  value={seo.metaTitle || ''}
                  onChange={(e) => {
                    setSeo({ ...seo, metaTitle: e.target.value });
                    markDirty();
                  }}
                  className="mt-1 w-full h-9 px-3 border border-[#dad9dd] rounded-md text-[13px] font-normal bg-white"
                />
              </label>
              <label className="text-[12px] font-semibold">
                Canonical URL
                <input
                  value={seo.canonicalUrl || ''}
                  onChange={(e) => {
                    setSeo({ ...seo, canonicalUrl: e.target.value });
                    markDirty();
                  }}
                  className="mt-1 w-full h-9 px-3 border border-[#dad9dd] rounded-md text-[13px] font-normal bg-white"
                />
              </label>
              <label className="text-[12px] font-semibold col-span-2">
                Meta description
                <textarea
                  value={seo.metaDescription || ''}
                  rows={3}
                  onChange={(e) => {
                    setSeo({ ...seo, metaDescription: e.target.value });
                    markDirty();
                  }}
                  className="mt-1 w-full px-3 py-2 border border-[#dad9dd] rounded-md text-[13px] font-normal bg-white"
                />
              </label>
              <label className="text-[12px] font-semibold">
                OG title
                <input
                  value={seo.ogTitle || ''}
                  onChange={(e) => {
                    setSeo({ ...seo, ogTitle: e.target.value });
                    markDirty();
                  }}
                  className="mt-1 w-full h-9 px-3 border border-[#dad9dd] rounded-md text-[13px] font-normal bg-white"
                />
              </label>
              <label className="text-[12px] font-semibold">
                OG description
                <input
                  value={seo.ogDescription || ''}
                  onChange={(e) => {
                    setSeo({ ...seo, ogDescription: e.target.value });
                    markDirty();
                  }}
                  className="mt-1 w-full h-9 px-3 border border-[#dad9dd] rounded-md text-[13px] font-normal bg-white"
                />
              </label>
              <label className="text-[12px] font-semibold col-span-2">
                OG image
                <div className="mt-1">
                  <MediaPicker
                    value={seo.ogImageUrl || ''}
                    onChange={(u) => {
                      setSeo({ ...seo, ogImageUrl: u });
                      markDirty();
                    }}
                    label="OG image"
                  />
                </div>
              </label>
              <label className="flex items-center gap-2 text-[13px] font-normal">
                <input
                  type="checkbox"
                  checked={seo.robotsIndex}
                  onChange={(e) => {
                    setSeo({ ...seo, robotsIndex: e.target.checked });
                    markDirty();
                  }}
                />
                Allow search engines to index
              </label>
              <label className="flex items-center gap-2 text-[13px] font-normal">
                <input
                  type="checkbox"
                  checked={seo.robotsFollow}
                  onChange={(e) => {
                    setSeo({ ...seo, robotsFollow: e.target.checked });
                    markDirty();
                  }}
                />
                Allow search engines to follow links
              </label>
            </div>
            <p className="text-[12px] text-[#6f7a69] mt-4">SEO saves with the page — one Save writes both.</p>
          </div>
        )}

        {tab === 'revisions' && (
          <div className="bg-white border border-[#dad9dd] rounded-xl p-5">
            <h3 className="text-[13px] font-semibold mb-3">Revision history</h3>
            {revisions.length === 0 && <p className="text-[13px] text-[#6f7a69]">No revisions yet — the first save snapshots one.</p>}
            {revisions.map((r) => (
              <div key={r.id} className="flex items-center justify-between border-b border-[#dad9dd] last:border-0 py-3">
                <div>
                  <div className="text-[13px] font-semibold">
                    Revision {r.version} · {r.title}
                  </div>
                  <div className="text-[12px] text-[#6f7a69]">
                    {new Date(r.created_at).toLocaleString()}
                    {r.change_note ? ` · ${r.change_note}` : ''}
                  </div>
                </div>
                <button onClick={() => void restore(r)} className="h-8 px-3 rounded-md border border-[#dad9dd] text-[12px] font-semibold hover:bg-[#f4f3f7] disabled:opacity-50" disabled={saving}>
                  Restore
                </button>
              </div>
            ))}
          </div>
        )}

        {tab === 'preview' && (
          <div className="bg-white border border-[#dad9dd] rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-[#dad9dd] bg-[#faf9fc] flex items-center justify-between">
              <span className="text-[12px] font-semibold">Storefront preview — {slug || '(no slug)'}</span>
              <span className="text-[12px] text-[#6f7a69]">{page.status === 'published' ? 'Published' : 'Draft — not live yet'}</span>
            </div>
            {previewBlocks ? <CmsPageRender blocks={previewBlocks} /> : <p className="p-6 text-[13px] text-[#6f7a69]">Loading preview…</p>}
          </div>
        )}
      </div>
    </div>
  );
}
