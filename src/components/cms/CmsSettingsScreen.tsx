'use client';

import { useCallback, useEffect, useState } from 'react';
import type { DomainKey } from '@/data/shellData';

/* Website settings (SHIP-IT step 4): the mode switch. 'template' renders
   the deployed template with manifest overrides; 'cms' renders composed
   pages from the CMS — the storefront then reflects a publish with no
   redeploy. Plus brand + maintenance settings from cms_website_settings. */

interface SettingsData {
  websiteMode: string;
  websiteUrl: string | null;
  settings: {
    brandName: string | null;
    logoUrl: string | null;
    faviconUrl: string | null;
    canonicalOrigin: string | null;
    defaultLocale: string | null;
    defaultCurrency: string | null;
    maintenanceMode: boolean;
    maintenanceMessage: string | null;
  } | null;
}

export default function CmsSettingsScreen({
  onToast,
  onNavigate,
}: {
  onToast: (m: string) => void;
  onNavigate: (domain: DomainKey, screenId: string) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState('template');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [brandName, setBrandName] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [canonicalOrigin, setCanonicalOrigin] = useState('');
  const [defaultLocale, setDefaultLocale] = useState('en');
  const [defaultCurrency, setDefaultCurrency] = useState('USD');
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [maintenanceMessage, setMaintenanceMessage] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/cms/settings');
      const j = await res.json();
      if (!res.ok) throw new Error(j.error?.message || 'Settings failed to load');
      const d = j.data as SettingsData;
      setMode(d.websiteMode);
      setWebsiteUrl(d.websiteUrl || '');
      setBrandName(d.settings?.brandName || '');
      setLogoUrl(d.settings?.logoUrl || '');
      setCanonicalOrigin(d.settings?.canonicalOrigin || '');
      setDefaultLocale(d.settings?.defaultLocale || 'en');
      setDefaultCurrency(d.settings?.defaultCurrency || 'USD');
      setMaintenanceMode(!!d.settings?.maintenanceMode);
      setMaintenanceMessage(d.settings?.maintenanceMessage || '');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Settings failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async (patch: Record<string, unknown>) => {
    setSaving(true);
    try {
      const res = await fetch('/api/cms/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error?.message || 'Save failed');
      const d = j.data as SettingsData;
      setMode(d.websiteMode);
      onToast('Website settings saved');
    } catch (e) {
      onToast(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <p className="text-[13px] text-[#6f7a69]">Loading website settings…</p>
      </div>
    );
  }
  if (error) {
    return (
      <div className="p-6">
        <p className="text-[13px] text-[#ba1a1a]">{error}</p>
        <button className="mt-3 h-8 px-3 border border-[#dad9dd] rounded text-[12px] font-semibold" onClick={() => onNavigate('settings', 'website-cms')}>
          Back to Website / CMS
        </button>
      </div>
    );
  }

  const input = 'w-full h-9 px-3 border border-[#dad9dd] rounded-md text-[13px] bg-white';

  return (
    <div className="min-h-full bg-[#faf9fc]">
      <div className="h-[52px] bg-white border-b border-[#dad9dd] flex items-center justify-between px-5 sticky top-0 z-40">
        <div className="flex items-center gap-2.5 text-[13px] min-w-0">
          <button className="text-[#6f7a69] hover:text-black" onClick={() => onNavigate('settings', 'website-cms')} aria-label="Back to Website / CMS">
            ←
          </button>
          <span className="material-symbols-outlined text-[18px] text-[#6f7a69]">web</span>
          <strong>Website settings</strong>
        </div>
      </div>

      <div className="p-6 max-w-[720px] mx-auto">
        <div className="bg-white border border-[#dad9dd] rounded-xl p-5 mb-4">
          <h3 className="text-[13px] font-semibold">How the storefront renders</h3>
          <p className="text-[12px] text-[#6f7a69] mt-1">One toggle, one deploy pipeline. Switching to CMS makes the storefront render composed pages — a publish shows up with no redeploy.</p>
          <div className="grid grid-cols-2 gap-3 mt-4">
            <button
              onClick={() => void save({ websiteMode: 'template' })}
              disabled={saving}
              className={`rounded-xl border p-4 text-left ${mode === 'template' ? 'border-[#0a6400] bg-[#eaf5e8]' : 'border-[#dad9dd] hover:bg-[#f4f3f7]'}`}
            >
              <span className="block text-[13px] font-semibold">Template {mode === 'template' && '· current'}</span>
              <span className="block text-[12px] text-[#6f7a69] mt-1">The deployed template, with manifest overrides.</span>
            </button>
            <button
              onClick={() => void save({ websiteMode: 'cms' })}
              disabled={saving}
              className={`rounded-xl border p-4 text-left ${mode === 'cms' ? 'border-[#0a6400] bg-[#eaf5e8]' : 'border-[#dad9dd] hover:bg-[#f4f3f7]'}`}
            >
              <span className="block text-[13px] font-semibold">CMS {mode === 'cms' && '· current'}</span>
              <span className="block text-[12px] text-[#6f7a69] mt-1">Composed pages from the CMS, live on publish.</span>
            </button>
          </div>
          <p className="text-[12px] text-[#6f7a69] mt-3">
            {mode === 'cms'
              ? 'CMS mode is on — published pages render at /s/<slug> and the storefront reads them from there.'
              : 'Template mode is on — the storefront serves the deployed template.'}
          </p>
        </div>

        <div className="bg-white border border-[#dad9dd] rounded-xl p-5">
          <h3 className="text-[13px] font-semibold mb-4">Brand & storefront</h3>
          <div className="grid grid-cols-2 gap-4">
            <label className="text-[12px] font-semibold">
              Brand name
              <input value={brandName} onChange={(e) => setBrandName(e.target.value)} className={`${input} mt-1`} />
            </label>
            <label className="text-[12px] font-semibold">
              Website URL
              <input value={websiteUrl} onChange={(e) => setWebsiteUrl(e.target.value)} className={`${input} mt-1`} placeholder="https://…" />
            </label>
            <label className="text-[12px] font-semibold">
              Logo URL
              <input value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} className={`${input} mt-1`} placeholder="https://…" />
            </label>
            <label className="text-[12px] font-semibold">
              Canonical origin
              <input value={canonicalOrigin} onChange={(e) => setCanonicalOrigin(e.target.value)} className={`${input} mt-1`} placeholder="https://example.com" />
            </label>
            <label className="text-[12px] font-semibold">
              Default locale
              <input value={defaultLocale} onChange={(e) => setDefaultLocale(e.target.value)} className={`${input} mt-1`} />
            </label>
            <label className="text-[12px] font-semibold">
              Default currency
              <input value={defaultCurrency} onChange={(e) => setDefaultCurrency(e.target.value)} className={`${input} mt-1`} />
            </label>
            <label className="flex items-center gap-2 text-[13px] font-normal">
              <input type="checkbox" checked={maintenanceMode} onChange={(e) => setMaintenanceMode(e.target.checked)} />
              Maintenance mode
            </label>
            <label className="text-[12px] font-semibold">
              Maintenance message
              <input value={maintenanceMessage} onChange={(e) => setMaintenanceMessage(e.target.value)} className={`${input} mt-1`} />
            </label>
          </div>
          <button
            onClick={() =>
              void save({
                websiteUrl,
                brandName,
                logoUrl,
                canonicalOrigin,
                defaultLocale,
                defaultCurrency,
                maintenanceMode,
                maintenanceMessage,
              })
            }
            disabled={saving}
            className="mt-5 h-9 px-4 rounded-md bg-[#0a6400] text-white text-[13px] font-semibold disabled:opacity-50"
          >
            Save settings
          </button>
        </div>
      </div>
    </div>
  );
}
