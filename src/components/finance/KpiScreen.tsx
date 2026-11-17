'use client';
import { useState, useEffect, useCallback } from 'react';
import type { KpiDefinition, KpiValue } from '@/lib/batchITypes';
import { cap } from '@/lib/batchITypes';

/**
 * KPI screen (doc 28 Batch I) — values from the engine (acct_kpis
 * evaluates each definition against the GL for the range and the
 * prior period) and the definitions themselves. The engine auto-seeds
 * the standard definitions when none exist, so the Values tab is
 * never empty for want of a seed — the definitions tab is where a
 * custom formula lives.
 */

const UNITS = ['number', 'percent', 'ratio', 'days', 'months', 'currency'];

interface Props {
  onToast: (msg: string) => void;
}

export default function KpiScreen({ onToast }: Props) {
  type Tab = 'values' | 'definitions';
  const [tab, setTab] = useState<Tab>('values');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [values, setValues] = useState<KpiValue[] | null>(null);
  const [definitions, setDefinitions] = useState<KpiDefinition[] | null>(null);
  const [from, setFrom] = useState(`${new Date().getFullYear()}-01-01`);
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [showCreate, setShowCreate] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadValues = useCallback(async (f: string, t: string) => {
    setError(null);
    setLoading(true);
    try {
      const j = await fetch(`/api/kpis?from=${f}&to=${t}`).then((r) => r.json()).catch(() => null);
      if (j?.error) throw new Error(j.error.message || 'KPIs load failed');
      setValues((j?.data || []) as KpiValue[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadDefinitions = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const j = await fetch('/api/kpi-definitions').then((r) => r.json()).catch(() => null);
      if (j?.error) throw new Error(j.error.message || 'Definitions load failed');
      setDefinitions((j?.data || []) as KpiDefinition[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadValues(from, to); }, [loadValues, from, to]);

  const post = async (url: string, body: Record<string, unknown>, method = 'POST') => {
    const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j?.error) throw new Error(j?.error?.message || `Request failed (${r.status})`);
    return j;
  };

  const fmtValue = (v: number | null, unit: string) => {
    if (v == null) return '—';
    if (unit === 'percent') return `${(v * 100).toFixed(1)}%`;
    if (unit === 'currency') return (v < 0 ? '−$' : '$') + Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (unit === 'ratio') return v.toFixed(2);
    return v.toLocaleString('en-US', { maximumFractionDigits: 2 });
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">KPIs</h1>
        {tab === 'definitions' && <button className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white" onClick={() => { setShowCreate(true); setFormError(null); }}>New definition</button>}
      </div>

      <div className="mt-4 flex gap-2 border-b pb-2">
        {([['values', 'Values'], ['definitions', 'Definitions']] as [Tab, string][]).map(([k, label]) => (
          <button key={k} className={tab === k ? 'rounded bg-gray-900 px-3 py-1 text-sm text-white' : 'rounded px-3 py-1 text-sm text-gray-600 hover:bg-gray-100'} onClick={() => { setTab(k); if (k === 'definitions') loadDefinitions(); else loadValues(from, to); }}>{label}</button>
        ))}
      </div>

      {error && <div className="mt-4 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {loading && <div className="mt-4 text-sm text-gray-500">Loading…</div>}

      {!loading && tab === 'values' && (
        <div className="mt-4">
          <div className="flex flex-wrap items-end gap-2">
            <label className="block text-sm"><span className="text-gray-600">From</span><div className="mt-1"><input className="w-full rounded border px-2 py-1.5 text-sm" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div></label>
            <label className="block text-sm"><span className="text-gray-600">To</span><div className="mt-1"><input className="w-full rounded border px-2 py-1.5 text-sm" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div></label>
            <button className="rounded bg-gray-900 px-3 py-1.5 text-sm text-white" onClick={() => loadValues(from, to)}>Evaluate</button>
          </div>
          {(values?.length ?? 0) === 0 ? (
            <p className="mt-4 text-sm text-gray-500">No KPI definitions to evaluate.</p>
          ) : (
            <table className="mt-4 w-full text-sm">
              <thead><tr className="text-left text-gray-500"><th className="py-2 pr-3">Code</th><th className="py-2 pr-3">KPI</th><th className="py-2 pr-3">Unit</th><th className="py-2 text-right">Value</th><th className="py-2 text-right">Prior period</th><th className="py-2 pr-3">Formula</th></tr></thead>
              <tbody>
                {values!.map((v) => (
                  <tr key={v.code} className="border-t">
                    <td className="py-2 pr-3 font-mono text-xs">{v.code}</td>
                    <td className="py-2 pr-3">{v.name}</td>
                    <td className="py-2 pr-3">{v.unit}</td>
                    <td className="py-2 text-right">{fmtValue(v.value, v.unit)}</td>
                    <td className="py-2 text-right">{fmtValue(v.priorValue, v.unit)}</td>
                    <td className="py-2 pr-3 font-mono text-xs text-gray-500">{v.formula}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {!loading && tab === 'definitions' && (
        <div className="mt-4 overflow-x-auto">
          {(definitions?.length ?? 0) === 0 ? (
            <p className="text-sm text-gray-500">No definitions yet — the engine auto-seeds the standard set the first time values are evaluated.</p>
          ) : (
            <table className="w-full text-sm">
              <thead><tr className="text-left text-gray-500"><th className="py-2 pr-3">Code</th><th className="py-2 pr-3">Name</th><th className="py-2 pr-3">Formula</th><th className="py-2 pr-3">Unit</th><th className="py-2 pr-3">Sort</th><th className="py-2 pr-3">Active</th><th className="py-2" /></tr></thead>
              <tbody>
                {definitions!.map((d) => (
                  <tr key={d.id} className="border-t">
                    <td className="py-2 pr-3 font-mono text-xs">{d.code}</td>
                    <td className="py-2 pr-3">{d.name}</td>
                    <td className="py-2 pr-3 font-mono text-xs">{d.formula}</td>
                    <td className="py-2 pr-3">{d.unit}</td>
                    <td className="py-2 pr-3">{d.sortOrder}</td>
                    <td className="py-2 pr-3">{d.isActive ? 'Yes' : 'No'}</td>
                    <td className="py-2"><button className="text-xs text-red-600" onClick={async () => {
                      setBusy(true); setError(null);
                      try {
                        const r = await fetch(`/api/kpi-definitions?id=${d.id}`, { method: 'DELETE' });
                        const j = await r.json().catch(() => ({}));
                        if (!r.ok || j?.error) throw new Error(j?.error?.message || 'Delete failed');
                        onToast('Definition deleted');
                        await loadDefinitions();
                      } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
                      finally { setBusy(false); }
                    }}>Delete</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {showCreate && (
        <KpiCreateForm
          error={formError}
          busy={busy}
          onCancel={() => setShowCreate(false)}
          onSubmit={async (body) => {
            setBusy(true); setFormError(null);
            try {
              await post('/api/kpi-definitions', body);
              setShowCreate(false);
              onToast('KPI definition created');
              await loadDefinitions();
            } catch (e) { setFormError(e instanceof Error ? e.message : String(e)); }
            finally { setBusy(false); }
          }}
        />
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="text-gray-600">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

const inputCls = 'w-full rounded border px-2 py-1.5 text-sm';

function KpiCreateForm({ error, busy, onCancel, onSubmit }: {
  error: string | null; busy: boolean;
  onCancel: () => void; onSubmit: (body: Record<string, unknown>) => Promise<void>;
}) {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [formula, setFormula] = useState('');
  const [unit, setUnit] = useState('number');
  const [sortOrder, setSortOrder] = useState('0');
  return (
    <div className="fixed inset-y-0 right-0 w-full max-w-md overflow-y-auto bg-white p-6 shadow-xl">
      <h2 className="text-lg font-semibold">New KPI definition</h2>
      <p className="mt-1 text-sm text-gray-600">The engine validates the formula — it must reference accounts or other KPIs the engine knows.</p>
      {error && <div className="mt-2 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      <div className="mt-4 space-y-3">
        <Field label="Code"><input className={inputCls} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="e.g. GROSS_MARGIN" /></Field>
        <Field label="Name"><input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Formula"><input className={inputCls} value={formula} onChange={(e) => setFormula(e.target.value)} placeholder="e.g. (revenue - cogs) / revenue" /></Field>
        <Field label="Unit"><select className={inputCls} value={unit} onChange={(e) => setUnit(e.target.value)}>{UNITS.map((u) => <option key={u} value={u}>{u}</option>)}</select></Field>
        <Field label="Sort order"><input className={inputCls} type="number" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} /></Field>
      </div>
      <div className="mt-5 flex gap-2">
        <button className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white disabled:opacity-50" disabled={busy || !code || !name || !formula} onClick={() => onSubmit({ code, name, formula, unit, sortOrder: Number(sortOrder) })}>Create definition</button>
        <button className="rounded px-3 py-1.5 text-sm text-gray-600" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
