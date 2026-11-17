'use client';
import { useState, useEffect, useCallback } from 'react';
import type { Dimension, DimensionValue, DimensionRule } from '@/lib/batchITypes';
import { cap } from '@/lib/batchITypes';

/**
 * Dimensions screen (doc 28 Batch I) — tracking dimensions, their
 * values, and the per-account rules that say which dimensions a
 * posting must (or may) carry. Dimensions are the reporting axes
 * (department, project, region) the budget lines and journal lines
 * tag with dimension values.
 */

const DATA_TYPES = ['text', 'number', 'date', 'list'];

interface Props {
  onToast: (msg: string) => void;
}

interface Account {
  id: string;
  code: string;
  name: string;
  account_type: string;
}

export default function DimensionsScreen({ onToast }: Props) {
  type Tab = 'dimensions' | 'values' | 'rules';
  const [tab, setTab] = useState<Tab>('dimensions');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dimensions, setDimensions] = useState<Dimension[] | null>(null);
  const [values, setValues] = useState<DimensionValue[] | null>(null);
  const [rules, setRules] = useState<DimensionRule[] | null>(null);
  const [selected, setSelected] = useState<Dimension | null>(null);
  const [detail, setDetail] = useState<DimensionValue[] | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showRule, setShowRule] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadTab = useCallback(async (t: Tab, force = false) => {
    setError(null);
    setLoading(true);
    try {
      if (t === 'dimensions' && (force || !dimensions)) {
        const j = await fetch('/api/dimensions').then((r) => r.json()).catch(() => null);
        if (j?.error) throw new Error(j.error.message || 'Dimensions load failed');
        setDimensions((j?.data || []) as Dimension[]);
      } else if (t === 'values' && (force || !values)) {
        const j = await fetch('/api/dimension-values').then((r) => r.json()).catch(() => null);
        if (j?.error) throw new Error(j.error.message || 'Values load failed');
        setValues((j?.data || []) as DimensionValue[]);
        if (!dimensions) {
          const dj = await fetch('/api/dimensions').then((r) => r.json()).catch(() => null);
          setDimensions((dj?.data || []) as Dimension[]);
        }
      } else if (t === 'rules' && (force || !rules)) {
        const j = await fetch('/api/account-dimension-rules').then((r) => r.json()).catch(() => null);
        if (j?.error) throw new Error(j.error.message || 'Rules load failed');
        setRules((j?.data || []) as DimensionRule[]);
        if (!dimensions) {
          const dj = await fetch('/api/dimensions').then((r) => r.json()).catch(() => null);
          setDimensions((dj?.data || []) as Dimension[]);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [dimensions, values, rules]);

  useEffect(() => { loadTab('dimensions'); }, [loadTab]);

  const openDimension = async (d: Dimension) => {
    setSelected(d);
    const j = await fetch(`/api/dimensions/${d.id}`).then((r) => r.json()).catch(() => null);
    setDetail(((j?.data?.values || []) as DimensionValue[]));
  };

  const post = async (url: string, body: Record<string, unknown>, method = 'POST') => {
    const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j?.error) throw new Error(j?.error?.message || `Request failed (${r.status})`);
    return j;
  };

  const dimName = (id: string) => dimensions?.find((d) => d.id === id)?.code ?? '—';

  return (
    <div className="p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Dimensions</h1>
        <div className="flex gap-2">
          {tab === 'dimensions' && <button className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white" onClick={() => { setShowCreate(true); setFormError(null); }}>New dimension</button>}
          {tab === 'rules' && <button className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white" onClick={() => { setShowRule(true); setFormError(null); }}>New rule</button>}
        </div>
      </div>

      <div className="mt-4 flex gap-2 border-b pb-2">
        {([['dimensions', 'Dimensions'], ['values', 'Values'], ['rules', 'Account rules']] as [Tab, string][]).map(([k, label]) => (
          <button key={k} className={tab === k ? 'rounded bg-gray-900 px-3 py-1 text-sm text-white' : 'rounded px-3 py-1 text-sm text-gray-600 hover:bg-gray-100'} onClick={() => { setTab(k); loadTab(k); }}>{label}</button>
        ))}
      </div>

      {error && <div className="mt-4 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {loading && <div className="mt-4 text-sm text-gray-500">Loading…</div>}

      {!loading && tab === 'dimensions' && (
        <div className="mt-4 overflow-x-auto">
          {(dimensions?.length ?? 0) === 0 ? (
            <p className="text-sm text-gray-500">No dimensions yet. A dimension is a reporting axis — department, project, region — that postings and budget lines can be tagged with.</p>
          ) : (
            <table className="w-full text-sm">
              <thead><tr className="text-left text-gray-500"><th className="py-2 pr-3">Code</th><th className="py-2 pr-3">Name</th><th className="py-2 pr-3">Data type</th><th className="py-2 pr-3">Required</th><th className="py-2 pr-3">Active</th><th className="py-2 text-right">Values</th></tr></thead>
              <tbody>
                {dimensions!.map((d) => (
                  <tr key={d.id} className="cursor-pointer border-t hover:bg-gray-50" onClick={() => openDimension(d)}>
                    <td className="py-2 pr-3 font-mono text-xs">{d.code}</td>
                    <td className="py-2 pr-3">{d.name}</td>
                    <td className="py-2 pr-3">{d.dataType}</td>
                    <td className="py-2 pr-3">{d.isRequired ? 'Yes' : 'No'}</td>
                    <td className="py-2 pr-3">{d.isActive ? 'Yes' : 'No'}</td>
                    <td className="py-2 text-right">{d.valueCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {!loading && tab === 'values' && (
        <div className="mt-4 overflow-x-auto">
          {(values?.length ?? 0) === 0 ? (
            <p className="text-sm text-gray-500">No values yet. Open a dimension to add its values (departments, projects, regions).</p>
          ) : (
            <table className="w-full text-sm">
              <thead><tr className="text-left text-gray-500"><th className="py-2 pr-3">Dimension</th><th className="py-2 pr-3">Code</th><th className="py-2 pr-3">Name</th><th className="py-2 pr-3">Parent</th><th className="py-2 pr-3">Active</th></tr></thead>
              <tbody>
                {values!.map((v) => (
                  <tr key={v.id} className="border-t">
                    <td className="py-2 pr-3 font-mono text-xs">{dimName(v.dimensionId)}</td>
                    <td className="py-2 pr-3 font-mono text-xs">{v.code}</td>
                    <td className="py-2 pr-3">{v.name}</td>
                    <td className="py-2 pr-3">{v.parentValueId ? values!.find((p) => p.id === v.parentValueId)?.code ?? '—' : '—'}</td>
                    <td className="py-2 pr-3">{v.isActive ? 'Yes' : 'No'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {!loading && tab === 'rules' && (
        <div className="mt-4 overflow-x-auto">
          {(rules?.length ?? 0) === 0 ? (
            <p className="text-sm text-gray-500">No account rules yet. A rule says postings to one account must (or may) carry a dimension — optionally restricted to an allowed set of values.</p>
          ) : (
            <table className="w-full text-sm">
              <thead><tr className="text-left text-gray-500"><th className="py-2 pr-3">Account</th><th className="py-2 pr-3">Dimension</th><th className="py-2 pr-3">Required</th><th className="py-2 pr-3">Allowed values</th><th className="py-2" /></tr></thead>
              <tbody>
                {rules!.map((r) => (
                  <tr key={r.id} className="border-t">
                    <td className="py-2 pr-3">{r.account}</td>
                    <td className="py-2 pr-3">{r.dimension}</td>
                    <td className="py-2 pr-3">{r.isRequired ? 'Yes' : 'No'}</td>
                    <td className="py-2 pr-3">{Array.isArray(r.allowedValues) ? (r.allowedValues as string[]).join(', ') : 'Any'}</td>
                    <td className="py-2"><button className="text-xs text-red-600" onClick={async () => {
                      setBusy(true); setError(null);
                      try {
                        const resp = await fetch(`/api/account-dimension-rules?id=${r.id}`, { method: 'DELETE' });
                        const j = await resp.json().catch(() => ({}));
                        if (!resp.ok || j?.error) throw new Error(j?.error?.message || 'Delete failed');
                        onToast('Rule deleted');
                        await loadTab('rules', true);
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
        <DimensionCreateForm
          error={formError}
          busy={busy}
          onCancel={() => setShowCreate(false)}
          onSubmit={async (body) => {
            setBusy(true); setFormError(null);
            try {
              await post('/api/dimensions', body);
              setShowCreate(false);
              onToast('Dimension created');
              await loadTab('dimensions', true);
            } catch (e) { setFormError(e instanceof Error ? e.message : String(e)); }
            finally { setBusy(false); }
          }}
        />
      )}

      {showRule && (
        <RuleCreateForm
          dimensions={dimensions ?? []}
          error={formError}
          busy={busy}
          onCancel={() => setShowRule(false)}
          onSubmit={async (body) => {
            setBusy(true); setFormError(null);
            try {
              await post('/api/account-dimension-rules', body);
              setShowRule(false);
              onToast('Rule created');
              await loadTab('rules', true);
            } catch (e) { setFormError(e instanceof Error ? e.message : String(e)); }
            finally { setBusy(false); }
          }}
        />
      )}

      {selected && (
        <DimensionDrawer
          dimension={selected}
          values={detail}
          onClose={() => { setSelected(null); setDetail(null); }}
          onToast={onToast}
          onReload={async () => { await loadTab('dimensions', true); if (selected) openDimension(selected); }}
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

function DimensionCreateForm({ error, busy, onCancel, onSubmit }: {
  error: string | null; busy: boolean;
  onCancel: () => void; onSubmit: (body: Record<string, unknown>) => Promise<void>;
}) {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [dataType, setDataType] = useState('text');
  const [isRequired, setIsRequired] = useState(false);
  return (
    <div className="fixed inset-y-0 right-0 w-full max-w-md overflow-y-auto bg-white p-6 shadow-xl">
      <h2 className="text-lg font-semibold">New dimension</h2>
      {error && <div className="mt-2 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      <div className="mt-4 space-y-3">
        <Field label="Code"><input className={inputCls} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="e.g. DEPT" /></Field>
        <Field label="Name"><input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Department" /></Field>
        <Field label="Data type"><select className={inputCls} value={dataType} onChange={(e) => setDataType(e.target.value)}>{DATA_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</select></Field>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={isRequired} onChange={(e) => setIsRequired(e.target.checked)} /> Required on postings by default</label>
      </div>
      <div className="mt-5 flex gap-2">
        <button className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white disabled:opacity-50" disabled={busy} onClick={() => onSubmit({ code, name, dataType, isRequired })}>Create dimension</button>
        <button className="rounded px-3 py-1.5 text-sm text-gray-600" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

function RuleCreateForm({ dimensions, error, busy, onCancel, onSubmit }: {
  dimensions: Dimension[]; error: string | null; busy: boolean;
  onCancel: () => void; onSubmit: (body: Record<string, unknown>) => Promise<void>;
}) {
  const [accountId, setAccountId] = useState('');
  const [dimensionId, setDimensionId] = useState('');
  const [isRequired, setIsRequired] = useState(false);
  const [allowed, setAllowed] = useState('');
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  return (
    <div className="fixed inset-y-0 right-0 w-full max-w-md overflow-y-auto bg-white p-6 shadow-xl">
      <h2 className="text-lg font-semibold">New account rule</h2>
      {error && <div className="mt-2 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      <div className="mt-4 space-y-3">
        <Field label="Account"><select className={inputCls} value={accountId} onChange={(e) => setAccountId(e.target.value)} onFocus={async () => { if (!accounts) { const j = await fetch('/api/accounts').then((r) => r.json()).catch(() => null); setAccounts((j?.data || []) as Account[]); } }}><option value="">—</option>{(accounts ?? []).map((a) => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}</select></Field>
        <Field label="Dimension"><select className={inputCls} value={dimensionId} onChange={(e) => setDimensionId(e.target.value)}><option value="">—</option>{dimensions.map((d) => <option key={d.id} value={d.id}>{d.code} — {d.name}</option>)}</select></Field>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={isRequired} onChange={(e) => setIsRequired(e.target.checked)} /> Required on this account</label>
        <Field label="Allowed value codes, comma-separated (blank = any)"><input className={inputCls} value={allowed} onChange={(e) => setAllowed(e.target.value)} placeholder="e.g. SALES, OPS" /></Field>
      </div>
      <div className="mt-5 flex gap-2">
        <button className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white disabled:opacity-50" disabled={busy || !accountId || !dimensionId} onClick={() => onSubmit({ accountId, dimensionId, isRequired, allowedValues: allowed.trim() ? allowed.split(',').map((s) => s.trim()).filter(Boolean) : null })}>Create rule</button>
        <button className="rounded px-3 py-1.5 text-sm text-gray-600" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

function DimensionDrawer({ dimension, values, onClose, onToast, onReload }: {
  dimension: Dimension;
  values: DimensionValue[] | null;
  onClose: () => void; onToast: (msg: string) => void; onReload: () => Promise<void>;
}) {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [parentValueId, setParentValueId] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [isActive, setIsActive] = useState(dimension.isActive);
  const [isRequired, setIsRequired] = useState(dimension.isRequired);

  const post = async (url: string, body: Record<string, unknown>, method = 'POST') => {
    const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j?.error) throw new Error(j?.error?.message || `Request failed (${r.status})`);
    return j;
  };

  return (
    <div className="fixed inset-y-0 right-0 w-full max-w-lg overflow-y-auto bg-white p-6 shadow-xl">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{dimension.code} — {dimension.name}</h2>
        <button className="text-sm text-gray-500" onClick={onClose}>Close</button>
      </div>
      <p className="mt-1 text-sm text-gray-600">Type {dimension.dataType} · {cap(dimension.isRequired ? 'required' : 'optional')}</p>
      {err && <div className="mt-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>}

      <div className="mt-4 flex flex-wrap items-end gap-2">
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={isRequired} onChange={(e) => setIsRequired(e.target.checked)} /> Required</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} /> Active</label>
        <button className="rounded bg-gray-900 px-3 py-1.5 text-sm text-white disabled:opacity-50" disabled={busy || (isActive === dimension.isActive && isRequired === dimension.isRequired)} onClick={async () => {
          setBusy(true); setErr(null);
          try {
            await post(`/api/dimensions/${dimension.id}`, { isRequired, isActive }, 'PATCH');
            onToast('Dimension updated');
            await onReload();
          } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
          finally { setBusy(false); }
        }}>Save</button>
        <button className="rounded px-3 py-1.5 text-sm text-red-600 disabled:opacity-50" disabled={busy || (values?.length ?? 0) > 0} title={(values?.length ?? 0) > 0 ? 'Delete the values first' : ''} onClick={async () => {
          setBusy(true); setErr(null);
          try {
            const r = await fetch(`/api/dimensions/${dimension.id}`, { method: 'DELETE' });
            const j = await r.json().catch(() => ({}));
            if (!r.ok || j?.error) throw new Error(j?.error?.message || 'Delete failed');
            onToast('Dimension deleted');
            onClose();
            await onReload();
          } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
          finally { setBusy(false); }
        }}>Delete dimension</button>
      </div>

      <h3 className="mt-6 font-medium">Values</h3>
      {(values?.length ?? 0) === 0 ? (
        <p className="mt-1 text-sm text-gray-500">No values yet.</p>
      ) : (
        <table className="mt-2 w-full text-sm">
          <thead><tr className="text-left text-gray-500"><th className="py-1 pr-3">Code</th><th className="py-1 pr-3">Name</th><th className="py-1 pr-3">Parent</th><th className="py-1" /></tr></thead>
          <tbody>
            {values!.map((v) => (
              <tr key={v.id} className="border-t">
                <td className="py-1 pr-3 font-mono text-xs">{v.code}</td>
                <td className="py-1 pr-3">{v.name}</td>
                <td className="py-1 pr-3">{v.parentValueId ? values!.find((p) => p.id === v.parentValueId)?.code ?? '—' : '—'}</td>
                <td className="py-1"><button className="text-xs text-red-600" onClick={async () => {
                  setBusy(true); setErr(null);
                  try {
                    const r = await fetch(`/api/dimension-values?id=${v.id}`, { method: 'DELETE' });
                    const j = await r.json().catch(() => ({}));
                    if (!r.ok || j?.error) throw new Error(j?.error?.message || 'Delete failed');
                    await onReload();
                  } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
                  finally { setBusy(false); }
                }}>Delete</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="mt-4 rounded border p-3">
        <h3 className="font-medium">Add value</h3>
        <div className="mt-3 space-y-3">
          <Field label="Code"><input className={inputCls} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} /></Field>
          <Field label="Name"><input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="Parent value (for hierarchies)"><select className={inputCls} value={parentValueId} onChange={(e) => setParentValueId(e.target.value)}><option value="">None</option>{(values ?? []).map((v) => <option key={v.id} value={v.id}>{v.code} — {v.name}</option>)}</select></Field>
          <button className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white disabled:opacity-50" disabled={busy || !code || !name} onClick={async () => {
            setBusy(true); setErr(null);
            try {
              await post('/api/dimension-values', { dimensionId: dimension.id, code, name, parentValueId: parentValueId || null });
              setCode(''); setName(''); setParentValueId('');
              onToast('Value added');
              await onReload();
            } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
            finally { setBusy(false); }
          }}>Add value</button>
        </div>
      </div>
    </div>
  );
}
