'use client';

import { useCallback, useEffect, useState } from 'react';
import { useCmsEditor } from '@/lib/cmsStore';
import type { DomainKey } from '@/data/shellData';
import MediaPicker from './MediaPicker';
import type { BannerDef } from '@/lib/cmsTypes';

/* Banner editor (SHIP-IT step 3): full field set + live preview + the
   scheduling window. "Live now" is computed the same way the storefront
   and the list do: is_active AND inside starts_at/ends_at. */

const PLACEMENTS = ['home', 'all_pages', 'services', 'booking', 'portal', 'custom'];
// Allowed values come from the cms_banners CHECK constraints — the
// editor's old lists (announcement/promo/sale/info) could never save.
const TYPES = ['hero', 'promo_bar', 'popup', 'inline', 'footer', 'alert'];

function isLiveNow(b: { isActive: boolean; startsAt: string | null; endsAt: string | null }): boolean {
  if (!b.isActive) return false;
  const now = Date.now();
  if (b.startsAt && new Date(b.startsAt).getTime() > now) return false;
  if (b.endsAt && new Date(b.endsAt).getTime() < now) return false;
  return true;
}

const toInput = (iso: string | null) => (iso ? iso.slice(0, 16) : '');
const fromInput = (v: string) => (v ? new Date(v).toISOString() : null);

export default function CmsBannerEditorScreen({
  onToast,
  onNavigate,
}: {
  onToast: (m: string) => void;
  onNavigate: (domain: DomainKey, screenId: string) => void;
}) {
  const bannerId = useCmsEditor((s) => s.bannerId);
  const openBanner = useCmsEditor((s) => s.openBanner);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<BannerDef | null>(null);

  const blank: BannerDef = {
    id: '',
    name: '',
    bannerType: 'promo_bar',
    headline: '',
    subheadline: '',
    body: '',
    imageUrl: null,
    ctaLabel: '',
    ctaUrl: '',
    backgroundColor: '#0a6400',
    textColor: '#ffffff',
    placement: 'all_pages',
    sortOrder: 0,
    isActive: true,
    startsAt: null,
    endsAt: null,
    dismissible: true,
  };

  const load = useCallback(async () => {
    if (!bannerId) {
      setForm(blank);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/marketing/banners/${encodeURIComponent(bannerId)}`);
      const j = await res.json();
      if (!res.ok) throw new Error(j.error?.message || 'Banner failed to load');
      setForm(j.data as BannerDef);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Banner failed to load');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bannerId]);

  useEffect(() => {
    void load();
  }, [load]);

  const set = <K extends keyof BannerDef>(k: K, v: BannerDef[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));

  const save = async () => {
    if (!form) return;
    setSaving(true);
    try {
      const body = {
        name: form.name,
        bannerType: form.bannerType,
        headline: form.headline,
        subheadline: form.subheadline,
        body: form.body,
        imageUrl: form.imageUrl,
        ctaLabel: form.ctaLabel,
        ctaUrl: form.ctaUrl,
        backgroundColor: form.backgroundColor,
        textColor: form.textColor,
        placement: form.placement,
        sortOrder: form.sortOrder,
        isActive: form.isActive,
        startsAt: form.startsAt,
        endsAt: form.endsAt,
        dismissible: form.dismissible,
      };
      let res: Response;
      if (form.id) {
        res = await fetch(`/api/v1/marketing/banners/${encodeURIComponent(form.id)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
      } else {
        res = await fetch('/api/v1/marketing/banners', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
      }
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error?.message || 'Save failed');
      onToast(form.id ? 'Banner saved' : 'Banner created');
      if (!form.id) openBanner(String(j.data.id));
      else setForm(j.data as BannerDef);
    } catch (e) {
      onToast(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <p className="text-[13px] text-[#6f7a69]">Loading banner editor…</p>
      </div>
    );
  }
  if (error || !form) {
    return (
      <div className="p-6">
        <p className="text-[13px] text-[#ba1a1a]">{error || 'Banner not found'}</p>
        <button className="mt-3 h-8 px-3 border border-[#dad9dd] rounded text-[12px] font-semibold" onClick={() => onNavigate('settings', 'banners')}>
          Back to Banners
        </button>
      </div>
    );
  }

  const live = isLiveNow(form);
  const input = 'w-full h-9 px-3 border border-[#dad9dd] rounded-md text-[13px] bg-white';

  return (
    <div className="min-h-full bg-[#faf9fc]">
      <div className="h-[52px] bg-white border-b border-[#dad9dd] flex items-center justify-between px-5 sticky top-0 z-40">
        <div className="flex items-center gap-2.5 text-[13px] min-w-0">
          <button className="text-[#6f7a69] hover:text-black" onClick={() => onNavigate('settings', 'banners')} aria-label="Back to Banners">
            ←
          </button>
          <span className="material-symbols-outlined text-[18px] text-[#6f7a69]">view_carousel</span>
          <strong className="truncate">{form.name || 'New banner'}</strong>
          <span className={`px-2 py-[3px] rounded-[10px] text-[10px] font-bold uppercase tracking-wide ${live ? 'bg-[#d9f2d0] text-[#0a6400]' : 'bg-[#f4f3f7] text-[#6f7a69]'}`}>
            {live ? 'Live now' : 'Off'}
          </span>
        </div>
        <div className="flex gap-1.5">
          <button onClick={() => void save()} disabled={saving || !form.name.trim()} className="h-8 px-3 rounded-md text-[12px] font-semibold bg-[#0a6400] text-white flex items-center gap-1.5 hover:bg-[#108000] disabled:opacity-50">
            <span className="material-symbols-outlined text-[16px]">save</span>Save
          </button>
        </div>
      </div>

      <div className="p-6 max-w-[1100px] mx-auto grid grid-cols-[1fr_380px] gap-6">
        <div className="bg-white border border-[#dad9dd] rounded-xl p-5">
          <h3 className="text-[13px] font-semibold mb-4">Content</h3>
          <div className="grid grid-cols-2 gap-4">
            <label className="text-[12px] font-semibold">
              Name
              <input value={form.name} onChange={(e) => set('name', e.target.value)} className={`${input} mt-1`} />
            </label>
            <label className="text-[12px] font-semibold">
              Type
              <select value={form.bannerType || 'promo_bar'} onChange={(e) => set('bannerType', e.target.value)} className={`${input} mt-1`}>
                {TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-[12px] font-semibold">
              Headline
              <input value={form.headline || ''} onChange={(e) => set('headline', e.target.value)} className={`${input} mt-1`} />
            </label>
            <label className="text-[12px] font-semibold">
              Subheadline
              <input value={form.subheadline || ''} onChange={(e) => set('subheadline', e.target.value)} className={`${input} mt-1`} />
            </label>
            <label className="text-[12px] font-semibold col-span-2">
              Body
              <textarea value={form.body || ''} rows={3} onChange={(e) => set('body', e.target.value)} className="mt-1 w-full px-3 py-2 border border-[#dad9dd] rounded-md text-[13px] bg-white" />
            </label>
            <label className="text-[12px] font-semibold">
              Button label
              <input value={form.ctaLabel || ''} onChange={(e) => set('ctaLabel', e.target.value)} className={`${input} mt-1`} />
            </label>
            <label className="text-[12px] font-semibold">
              Button link
              <input value={form.ctaUrl || ''} onChange={(e) => set('ctaUrl', e.target.value)} className={`${input} mt-1`} placeholder="https://…" />
            </label>
            <label className="text-[12px] font-semibold">
              Placement
              <select value={form.placement || 'all_pages'} onChange={(e) => set('placement', e.target.value)} className={`${input} mt-1`}>
                {PLACEMENTS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-[12px] font-semibold">
              Sort order
              <input type="number" value={form.sortOrder} onChange={(e) => set('sortOrder', Number(e.target.value) || 0)} className={`${input} mt-1`} />
            </label>
            <label className="text-[12px] font-semibold col-span-2">
              Image
              <div className="mt-1">
                <MediaPicker value={form.imageUrl || ''} onChange={(u) => set('imageUrl', u || null)} label="Banner image" />
              </div>
            </label>
            <label className="text-[12px] font-semibold">
              Background color
              <div className="flex gap-2 mt-1">
                <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(form.backgroundColor || '') ? form.backgroundColor! : '#0a6400'} onChange={(e) => set('backgroundColor', e.target.value)} className="h-9 w-12 border border-[#dad9dd] rounded-md bg-white p-0.5" />
                <input value={form.backgroundColor || ''} onChange={(e) => set('backgroundColor', e.target.value)} className={`${input} flex-1`} />
              </div>
            </label>
            <label className="text-[12px] font-semibold">
              Text color
              <div className="flex gap-2 mt-1">
                <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(form.textColor || '') ? form.textColor! : '#ffffff'} onChange={(e) => set('textColor', e.target.value)} className="h-9 w-12 border border-[#dad9dd] rounded-md bg-white p-0.5" />
                <input value={form.textColor || ''} onChange={(e) => set('textColor', e.target.value)} className={`${input} flex-1`} />
              </div>
            </label>
          </div>

          <h3 className="text-[13px] font-semibold mt-6 mb-4">Scheduling</h3>
          <div className="grid grid-cols-2 gap-4">
            <label className="flex items-center gap-2 text-[13px] font-normal">
              <input type="checkbox" checked={form.isActive} onChange={(e) => set('isActive', e.target.checked)} />
              Active
            </label>
            <label className="flex items-center gap-2 text-[13px] font-normal">
              <input type="checkbox" checked={form.dismissible} onChange={(e) => set('dismissible', e.target.checked)} />
              Dismissible
            </label>
            <label className="text-[12px] font-semibold">
              Starts at
              <input type="datetime-local" value={toInput(form.startsAt)} onChange={(e) => set('startsAt', fromInput(e.target.value))} className={`${input} mt-1`} />
            </label>
            <label className="text-[12px] font-semibold">
              Ends at
              <input type="datetime-local" value={toInput(form.endsAt)} onChange={(e) => set('endsAt', fromInput(e.target.value))} className={`${input} mt-1`} />
            </label>
          </div>
          <p className="text-[12px] text-[#6f7a69] mt-4">
            {live
              ? 'This banner is live on the storefront right now.'
              : form.isActive
                ? 'Active, but outside its window — it will appear when the window opens and disappear when it ends, with no one touching it.'
                : 'Inactive — it never shows, window or not.'}
          </p>
        </div>

        <div>
          <h3 className="text-[13px] font-semibold mb-3">Live preview</h3>
          <div className="bg-white border border-[#dad9dd] rounded-xl overflow-hidden">
            <div className="px-3 py-2 border-b border-[#dad9dd] bg-[#faf9fc] text-[11px] text-[#6f7a69]">Storefront · {form.placement || 'all_pages'}</div>
            <div className="px-5 py-4 text-center" style={{ backgroundColor: form.backgroundColor || '#0a6400', color: form.textColor || '#ffffff' }}>
              {form.imageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={form.imageUrl} alt="" className="mx-auto mb-3 max-h-28 rounded-md object-cover" />
              )}
              {form.headline && <div className="text-[16px] font-bold">{form.headline}</div>}
              {form.subheadline && <div className="text-[13px] mt-1 opacity-90">{form.subheadline}</div>}
              {form.body && <div className="text-[13px] mt-2 opacity-90">{form.body}</div>}
              {form.ctaLabel && form.ctaUrl && (
                <a href={form.ctaUrl} className="inline-block mt-3 h-9 px-4 rounded-full bg-white text-[#1a1c1e] text-[12px] font-semibold leading-9">
                  {form.ctaLabel}
                </a>
              )}
              {!form.headline && !form.body && <div className="text-[13px] opacity-70">Nothing to show yet — add a headline or body.</div>}
            </div>
            <div className="px-3 py-2 text-[11px] text-[#6f7a69]">{live ? 'Showing now' : 'Not showing — see Scheduling'}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
