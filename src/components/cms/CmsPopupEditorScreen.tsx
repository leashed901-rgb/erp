'use client';

import { useCallback, useEffect, useState } from 'react';
import { useCmsEditor } from '@/lib/cmsStore';
import type { DomainKey } from '@/data/shellData';
import MediaPicker from './MediaPicker';
import type { PopupDef } from '@/lib/cmsTypes';

/* Popup editor (SHIP-IT step 3): full field set + live modal preview +
   trigger / frequency / scheduling. "Live now" uses the same window
   rule as banners and the list. */

// Allowed values come from the cms_popups CHECK constraints — 'time'
// and 'once'/'always' could never save.
const TRIGGERS = ['immediate', 'delay', 'scroll', 'exit_intent', 'page_view_count', 'add_to_cart'];
const FREQUENCIES = ['every_page', 'once_per_session', 'once_per_day', 'once_per_visitor'];

function isLiveNow(p: { isActive: boolean; startsAt: string | null; endsAt: string | null }): boolean {
  if (!p.isActive) return false;
  const now = Date.now();
  if (p.startsAt && new Date(p.startsAt).getTime() > now) return false;
  if (p.endsAt && new Date(p.endsAt).getTime() < now) return false;
  return true;
}

const toInput = (iso: string | null) => (iso ? iso.slice(0, 16) : '');
const fromInput = (v: string) => (v ? new Date(v).toISOString() : null);

export default function CmsPopupEditorScreen({
  onToast,
  onNavigate,
}: {
  onToast: (m: string) => void;
  onNavigate: (domain: DomainKey, screenId: string) => void;
}) {
  const popupId = useCmsEditor((s) => s.popupId);
  const openPopup = useCmsEditor((s) => s.openPopup);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<PopupDef | null>(null);

  const blank: PopupDef = {
    id: '',
    name: '',
    headline: '',
    body: '',
    imageUrl: null,
    ctaLabel: '',
    ctaUrl: '',
    collectEmail: false,
    triggerType: 'delay',
    triggerValue: 10,
    frequency: 'once_per_session',
    targetPages: [],
    isActive: true,
    startsAt: null,
    endsAt: null,
    impressions: 0,
    conversions: 0,
  };

  const load = useCallback(async () => {
    if (!popupId) {
      setForm(blank);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/marketing/popups/${encodeURIComponent(popupId)}`);
      const j = await res.json();
      if (!res.ok) throw new Error(j.error?.message || 'Popup failed to load');
      setForm(j.data as PopupDef);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Popup failed to load');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [popupId]);

  useEffect(() => {
    void load();
  }, [load]);

  const set = <K extends keyof PopupDef>(k: K, v: PopupDef[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));

  const save = async () => {
    if (!form) return;
    setSaving(true);
    try {
      const body = {
        name: form.name,
        headline: form.headline,
        body: form.body,
        imageUrl: form.imageUrl,
        ctaLabel: form.ctaLabel,
        ctaUrl: form.ctaUrl,
        collectEmail: form.collectEmail,
        triggerType: form.triggerType,
        triggerValue: form.triggerValue,
        frequency: form.frequency,
        targetPages: form.targetPages,
        isActive: form.isActive,
        startsAt: form.startsAt,
        endsAt: form.endsAt,
      };
      let res: Response;
      if (form.id) {
        res = await fetch(`/api/v1/marketing/popups/${encodeURIComponent(form.id)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
      } else {
        res = await fetch('/api/v1/marketing/popups', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
      }
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error?.message || 'Save failed');
      onToast(form.id ? 'Popup saved' : 'Popup created');
      if (!form.id) openPopup(String(j.data.id));
      else setForm(j.data as PopupDef);
    } catch (e) {
      onToast(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <p className="text-[13px] text-[#6f7a69]">Loading popup editor…</p>
      </div>
    );
  }
  if (error || !form) {
    return (
      <div className="p-6">
        <p className="text-[13px] text-[#ba1a1a]">{error || 'Popup not found'}</p>
        <button className="mt-3 h-8 px-3 border border-[#dad9dd] rounded text-[12px] font-semibold" onClick={() => onNavigate('settings', 'popups')}>
          Back to Popups
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
          <button className="text-[#6f7a69] hover:text-black" onClick={() => onNavigate('settings', 'popups')} aria-label="Back to Popups">
            ←
          </button>
          <span className="material-symbols-outlined text-[18px] text-[#6f7a69]">open_in_new</span>
          <strong className="truncate">{form.name || 'New popup'}</strong>
          <span className={`px-2 py-[3px] rounded-[10px] text-[10px] font-bold uppercase tracking-wide ${live ? 'bg-[#d9f2d0] text-[#0a6400]' : 'bg-[#f4f3f7] text-[#6f7a69]'}`}>
            {live ? 'Live now' : 'Off'}
          </span>
          <span className="text-[#6f7a69]">
            {form.impressions} impressions · {form.conversions} conversions
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
              Button label
              <input value={form.ctaLabel || ''} onChange={(e) => set('ctaLabel', e.target.value)} className={`${input} mt-1`} />
            </label>
            <label className="text-[12px] font-semibold">
              Headline
              <input value={form.headline || ''} onChange={(e) => set('headline', e.target.value)} className={`${input} mt-1`} />
            </label>
            <label className="text-[12px] font-semibold">
              Button link
              <input value={form.ctaUrl || ''} onChange={(e) => set('ctaUrl', e.target.value)} className={`${input} mt-1`} placeholder="https://…" />
            </label>
            <label className="text-[12px] font-semibold col-span-2">
              Body
              <textarea value={form.body || ''} rows={3} onChange={(e) => set('body', e.target.value)} className="mt-1 w-full px-3 py-2 border border-[#dad9dd] rounded-md text-[13px] bg-white" />
            </label>
            <label className="text-[12px] font-semibold col-span-2">
              Image
              <div className="mt-1">
                <MediaPicker value={form.imageUrl || ''} onChange={(u) => set('imageUrl', u || null)} label="Popup image" />
              </div>
            </label>
            <label className="flex items-center gap-2 text-[13px] font-normal">
              <input type="checkbox" checked={form.collectEmail} onChange={(e) => set('collectEmail', e.target.checked)} />
              Collect email address
            </label>
          </div>

          <h3 className="text-[13px] font-semibold mt-6 mb-4">Trigger & frequency</h3>
          <div className="grid grid-cols-2 gap-4">
            <label className="text-[12px] font-semibold">
              Trigger
              <select value={form.triggerType || 'delay'} onChange={(e) => set('triggerType', e.target.value)} className={`${input} mt-1`}>
                {TRIGGERS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-[12px] font-semibold">
              Trigger value
              <input
                type="number"
                value={form.triggerValue ?? ''}
                onChange={(e) => set('triggerValue', e.target.value === '' ? null : Number(e.target.value))}
                className={`${input} mt-1`}
                placeholder="seconds / % scrolled"
              />
            </label>
            <label className="text-[12px] font-semibold">
              Frequency
              <select value={form.frequency || 'once_per_session'} onChange={(e) => set('frequency', e.target.value)} className={`${input} mt-1`}>
                {FREQUENCIES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-[12px] font-semibold">
              Target pages (comma separated slugs, blank = all)
              <input value={(form.targetPages || []).join(', ')} onChange={(e) => set('targetPages', e.target.value.split(',').map((s) => s.trim()).filter(Boolean))} className={`${input} mt-1`} placeholder="/, /shop" />
            </label>
          </div>

          <h3 className="text-[13px] font-semibold mt-6 mb-4">Scheduling</h3>
          <div className="grid grid-cols-2 gap-4">
            <label className="flex items-center gap-2 text-[13px] font-normal">
              <input type="checkbox" checked={form.isActive} onChange={(e) => set('isActive', e.target.checked)} />
              Active
            </label>
            <span />
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
              ? 'This popup is live on the storefront right now.'
              : form.isActive
                ? 'Active, but outside its window — it will appear when the window opens and disappear when it ends, with no one touching it.'
                : 'Inactive — it never shows, window or not.'}
          </p>
        </div>

        <div>
          <h3 className="text-[13px] font-semibold mb-3">Live preview</h3>
          <div className="bg-[#1a1c1e]/80 border border-[#dad9dd] rounded-xl overflow-hidden relative min-h-[320px] flex items-center justify-center p-6">
            <div className="bg-white rounded-xl w-full max-w-[300px] shadow-2xl overflow-hidden">
              {form.imageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={form.imageUrl} alt="" className="w-full h-28 object-cover" />
              )}
              <div className="p-5 text-center">
                {form.headline && <div className="text-[16px] font-bold">{form.headline}</div>}
                {form.body && <p className="text-[13px] text-[#444] mt-2 leading-relaxed">{form.body}</p>}
                {form.collectEmail && <input type="email" placeholder="Email address" className="mt-4 w-full h-9 px-3 border border-[#dad9dd] rounded-md text-[13px]" />}
                {form.ctaLabel && (
                  <button className="mt-4 w-full h-10 rounded-md bg-[#0a6400] text-white text-[13px] font-semibold">{form.ctaLabel}</button>
                )}
                {!form.headline && !form.body && <p className="text-[13px] text-[#6f7a69]">Nothing to show yet — add a headline or body.</p>}
              </div>
            </div>
            <span className="absolute top-2 right-3 text-[11px] text-white/70">{live ? 'Showing now' : 'Not showing — see Scheduling'}</span>
          </div>
          <p className="text-[12px] text-[#6f7a69] mt-3">
            Trigger: {form.triggerType || '—'}
            {form.triggerValue != null ? ` (${form.triggerValue})` : ''} · {form.frequency || '—'}
          </p>
        </div>
      </div>
    </div>
  );
}
