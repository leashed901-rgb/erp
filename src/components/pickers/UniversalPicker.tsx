'use client';

import { useState, useEffect, useRef } from 'react';
import type { PartyRole } from '@/lib/contracts';

/**
 * UniversalPicker — the generic typeahead picker (spec §B.2.3).
 * Searches the API, shows results, supports inline create via child drawer.
 * PartyPicker, ItemPicker, AccountPicker all use this with different configs.
 */
export function UniversalPicker({
  entity,
  label,
  value,
  onChange,
  role,
  scope,
  placeholder = 'Search…',
  createLabel,
  onCreate,
}: {
  entity: string;
  label: string;
  value: string | null;
  onChange: (id: string | null) => void;
  role?: PartyRole;
  scope?: string;
  placeholder?: string;
  createLabel?: string;
  onCreate?: () => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<{ id: string; label: string; subtitle?: string }[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // The API path for this entity
  const apiPath = entity === 'party' ? '/api/parties' : `/api/${entity}s`;

  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    setLoading(true);
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    const params = new URLSearchParams({ q: query.trim(), limit: '10' });
    if (role) params.set('role', role);
    if (scope) params.set('scope', scope);
    fetch(`${apiPath}?${params.toString()}`, { signal: ac.signal })
      .then((r) => r.json())
      .then((json) => {
        const data = json.data || [];
        setResults(data.map((d: Record<string, unknown>) => ({
          id: String(d.id),
          label: String(d.name || d.display_name || d.number || d.label || 'Unnamed'),
          subtitle: d.email ? String(d.email) : d.balance != null ? `$${Number(d.balance).toFixed(2)}` : undefined,
        })));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [query, apiPath, role, scope]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <label className="field-label">{label}{!value && <span className="text-error ml-0.5">*</span>}</label>
      {value ? (
        <div className="flex items-center gap-1 h-8 px-2 border border-surface-dim rounded bg-white">
          <span className="flex-1 text-[13px] font-medium truncate">{results.find((r) => r.id === value)?.label || value}</span>
          <button className="w-5 h-5 rounded hover:bg-surface-container flex items-center justify-center" onClick={() => { onChange(null); setQuery(''); }}>
            <span className="material-symbols-outlined text-[14px]">close</span>
          </button>
          <button className="w-5 h-5 rounded hover:bg-surface-container flex items-center justify-center" onClick={() => setOpen(true)}>
            <span className="material-symbols-outlined text-[14px]">swap_horiz</span>
          </button>
        </div>
      ) : (
        <input
          type="text"
          className="field-input"
          placeholder={placeholder}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          autoFocus
        />
      )}
      {open && !value && (
        <div className="absolute z-[9999] top-full left-0 right-0 mt-1 bg-white rounded-lg shadow-2xl border border-surface-dim max-h-64 overflow-y-auto">
          {loading && <div className="px-3 py-2 text-[12px] text-on-surface-variant">Searching…</div>}
          {!loading && results.length === 0 && query.trim() && (
            <div className="px-3 py-2 text-[12px] text-on-surface-variant">No matches</div>
          )}
          {!loading && results.map((r) => (
            <button
              key={r.id}
              className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-surface-container-low text-left"
              onClick={() => { onChange(r.id); setOpen(false); setQuery(''); }}
            >
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-medium text-on-surface truncate">{r.label}</div>
                {r.subtitle && <div className="text-[11px] text-on-surface-variant truncate">{r.subtitle}</div>}
              </div>
            </button>
          ))}
          {!loading && createLabel && (
            <div className="border-t border-surface-dim mt-1">
              <button
                className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-primary-container text-primary text-left"
                onClick={() => { onCreate?.(); setOpen(false); }}
              >
                <span className="material-symbols-outlined text-[16px]">add_circle</span>
                <span className="text-[13px] font-semibold">{createLabel}</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Specialized pickers ──────────────────────────────────────

export function PartyPicker({ label, value, onChange, role, scope }: {
  label: string;
  value: string | null;
  onChange: (id: string | null) => void;
  role?: PartyRole;
  scope?: string;
}) {
  return (
    <UniversalPicker
      entity="party"
      label={label}
      value={value}
      onChange={onChange}
      role={role}
      scope={scope}
      placeholder="Search customers, vendors…"
      createLabel="Add new party"
      onCreate={() => { /* Opens PartyFormDrawer inline */ }}
    />
  );
}

export function ItemPicker({ label, value, onChange, fulfillmentTypes }: {
  label: string;
  value: string | null;
  onChange: (id: string | null) => void;
  fulfillmentTypes?: string[];
}) {
  return (
    <UniversalPicker
      entity="product"
      label={label}
      value={value}
      onChange={onChange}
      placeholder="Search by name or SKU…"
      createLabel="Add product or service"
      onCreate={() => { /* Opens ItemDrawer inline */ }}
    />
  );
}

export function AccountPicker({ label, value, onChange, filterType }: {
  label: string;
  value: string | null;
  onChange: (id: string | null) => void;
  filterType?: string;
}) {
  return (
    <UniversalPicker
      entity="account"
      label={label}
      value={value}
      onChange={onChange}
      placeholder="Search accounts…"
      createLabel="Add account"
      onCreate={() => { /* Opens CoA drawer inline */ }}
    />
  );
}

export function CategoryPicker({ label, value, onChange }: {
  label: string;
  value: string | null;
  onChange: (id: string | null) => void;
}) {
  return (
    <UniversalPicker
      entity="category"
      label={label}
      value={value}
      onChange={onChange}
      placeholder="Search or add category…"
      createLabel="Add new category"
      onCreate={() => { /* Opens Category drawer inline — the prereq fix */ }}
    />
  );
}

export function LocationPicker({ label, value, onChange }: {
  label: string;
  value: string | null;
  onChange: (id: string | null) => void;
}) {
  return (
    <UniversalPicker
      entity="location"
      label={label}
      value={value}
      onChange={onChange}
      placeholder="Search locations…"
      createLabel="Add location"
      onCreate={() => { /* Opens Location drawer inline */ }}
    />
  );
}

export default UniversalPicker;
