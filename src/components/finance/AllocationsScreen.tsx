'use client';
import { useState, useEffect, useCallback } from 'react';
import type { Allocation, AllocationRule, Dimension } from '@/lib/batchITypes';
import { fmtMoney, fmtDate } from '@/lib/batchITypes';

/**
 * Allocations screen (doc 28 Batch I) — cost allocations. An
 * allocation spreads a source account's balance across destination
 * accounts by percentage or fixed amount, optionally driven by a
 * dimension. The engine has no allocation runner — the rules are
 * recorded here and the allocation is applied by the posting
 * process, not by this screen.
 */

interface Props {
  onToast: (msg: string) => void;
}

interface Account {
  id: string;
  code: string;
  name: string;
  account_type: string;
}

export default function AllocationsScreen({ onToast }: Props) {
  const [allocations, setAllocations] = useState<Allocation[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Allocation | null>(null);
  const [detail, setDetail] = useState<AllocationRule[] | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const j = await fetch('/api/allocations').then((r) => r.json()).catch(() => null);
      if (j?.error) throw new Error(j.error.message || 'Allocations load failed');
      setAllocations((j?.data || []) as Allocation[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openAllocation = async (a: Allocation) => {
    setSelected(a);
    const j = await fetch(`/api/allocations/${a.id}`).then((r) => r.json()).catch(() => null);
    setDetail(((j?.data?.rules || []) as AllocationRule[]));
  };

  const post = async (url: string, body: Record<string, unknown>, method = 'POST') => {
    const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j?.error) throw new Error(j?.error?.message || `Request failed (${r.status})`);
    return j;
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Allocations</h1>
        <button className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white" onClick={() => { setShowCreate(true); setFormError(null); }}>New allocation</button>
      </div>
      <p className="mt-1 text-sm text-gray-600">Spread a source account&apos;s balance across destination accounts — by percentage or fixed amount, optionally driven by a dimension.</p>

      {error && <div className="mt-4 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {loading && <div className="mt-4 text-sm text-gray-500">Loading…</div>}

      {!loading && (
        <div className="mt-4 overflow-x-auto">
          {(allocations?.length ?? 0) === 0 ? (
            <p className="text-sm text-gray-500">No allocations yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead><tr className="text-left text-gray-500"><th className="py-2 pr-3">Name</th><th className="py-2 pr-3">Type</th><th className="py-2 pr-3">Source account</th><th className="py-2 pr-3">Driver dimension</th><th className="py-2 pr-3">Effective</th><th className="py-2 pr-3">Active</th><th className="py-2 text-right">Rules</th></tr></thead>
              <tbody>
                {allocations!.map((a) => (
                  <tr key={a.id} className="cursor-pointer border-t hover:bg-gray-50" onClick={() => openAllocation(a)}>
                    <td className="py-2 pr-3">{a.name}</td>
                    <td className="py-2 pr-3">{a.allocationType ?? '—'}</td>
                    <td className="py-2 pr-3">{a.sourceAccount}</td>
                    <td className="py-2 pr-3">{a.driverDimension ?? '—'}</td>
                    <td className="py-2 pr-3">{a.effectiveFrom ? `${fmtDate(a.effectiveFrom)}${a.effectiveTo ? ` – ${fmtDate(a.effectiveTo)}` : ''}` : '—'}</td>
                    <td className="py-2 pr-3">{a.active ? 'Yes' : 'No'}</td>
                    <td className="py-2 text-right">{a.ruleCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {showCreate && (
        <AllocationCreateForm
          error={formError}
          busy={busy}
          onCancel={() => setShowCreate(false)}
          onSubmit={async (body) => {
            setBusy(true); setFormError(null);
            try {
              await post('/api/allocations', body);
              setShowCreate(false);
              onToast('Allocation created');
              await load();
            } catch (e) { setFormError(e instanceof Error ? e.message : String(e)); }
            finally { setBusy(false); }
          }}
        />
      )}

      {selected && (
        <AllocationDrawer
          allocation={selected}
          rules={detail}
          onClose={() => { setSelected(null); setDetail(null); }}
          onToast={onToast}
          onReload={async () => { await load(); if (selected) openAllocation(selected); }}
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

function AllocationCreateForm({ error, busy, onCancel, onSubmit }: {
  error: string | null; busy: boolean;
  onCancel: () => void; onSubmit: (body: Record<string, unknown>) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [allocationType, setAllocationType] = useState('');
  const [sourceAccountId, setSourceAccountId] = useState('');
  const [driverDimensionId, setDriverDimensionId] = useState('');
  const [effectiveFrom, setEffectiveFrom] = useState('');
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [dimensions, setDimensions] = useState<Dimension[] | null>(null);
  return (
    <div className="fixed inset-y-0 right-0 w-full max-w-md overflow-y-auto bg-white p-6 shadow-xl">
      <h2 className="text-lg font-semibold">New allocation</h2>
      {error && <div className="mt-2 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      <div className="mt-4 space-y-3">
        <Field label="Name"><input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Rent by headcount" /></Field>
        <Field label="Type"><input className={inputCls} value={allocationType} onChange={(e) => setAllocationType(e.target.value)} placeholder="e.g. percentage, fixed" /></Field>
        <Field label="Source account"><select className={inputCls} value={sourceAccountId} onChange={(e) => setSourceAccountId(e.target.value)} onFocus={async () => { if (!accounts) { const j = await fetch('/api/accounts').then((r) => r.json()).catch(() => null); setAccounts((j?.data || []) as Account[]); } }}><option value="">—</option>{(accounts ?? []).map((a) => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}</select></Field>
        <Field label="Driver dimension (optional)"><select className={inputCls} value={driverDimensionId} onChange={(e) => setDriverDimensionId(e.target.value)} onFocus={async () => { if (!dimensions) { const j = await fetch('/api/dimensions').then((r) => r.json()).catch(() => null); setDimensions((j?.data || []) as Dimension[]); } }}><option value="">—</option>{(dimensions ?? []).map((d) => <option key={d.id} value={d.id}>{d.code} — {d.name}</option>)}</select></Field>
        <Field label="Effective from"><input className={inputCls} type="date" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} /></Field>
      </div>
      <div className="mt-5 flex gap-2">
        <button className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white disabled:opacity-50" disabled={busy || !name || !sourceAccountId} onClick={() => onSubmit({ name, allocationType: allocationType || null, sourceAccountId, driverDimensionId: driverDimensionId || null, effectiveFrom: effectiveFrom || null })}>Create allocation</button>
        <button className="rounded px-3 py-1.5 text-sm text-gray-600" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

function AllocationDrawer({ allocation, rules, onClose, onToast, onReload }: {
  allocation: Allocation;
  rules: AllocationRule[] | null;
  onClose: () => void; onToast: (msg: string) => void; onReload: () => Promise<void>;
}) {
  const [destinationAccountId, setDestinationAccountId] = useState('');
  const [percentage, setPercentage] = useState('');
  const [fixedAmount, setFixedAmount] = useState('');
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState(allocation.active);

  const post = async (url: string, body: Record<string, unknown>, method = 'POST') => {
    const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j?.error) throw new Error(j?.error?.message || `Request failed (${r.status})`);
    return j;
  };

  const pctTotal = (rules ?? []).reduce((s, r) => s + (r.percentage ?? 0), 0);

  return (
    <div className="fixed inset-y-0 right-0 w-full max-w-lg overflow-y-auto bg-white p-6 shadow-xl">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{allocation.name}</h2>
        <button className="text-sm text-gray-500" onClick={onClose}>Close</button>
      </div>
      <p className="mt-1 text-sm text-gray-600">{allocation.sourceAccount} · {allocation.allocationType ?? '—'} · driver {allocation.driverDimension ?? '—'} · rules total {pctTotal.toFixed(1)}%</p>
      {err && <div className="mt-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>}

      <div className="mt-4 flex flex-wrap items-end gap-2">
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Active</label>
        <button className="rounded bg-gray-900 px-3 py-1.5 text-sm text-white disabled:opacity-50" disabled={busy || active === allocation.active} onClick={async () => {
          setBusy(true); setErr(null);
          try {
            await post(`/api/allocations/${allocation.id}`, { active }, 'PATCH');
            onToast('Allocation updated');
            await onReload();
          } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
          finally { setBusy(false); }
        }}>Save</button>
        <button className="rounded px-3 py-1.5 text-sm text-red-600 disabled:opacity-50" disabled={busy} onClick={async () => {
          setBusy(true); setErr(null);
          try {
            const r = await fetch(`/api/allocations/${allocation.id}`, { method: 'DELETE' });
            const j = await r.json().catch(() => ({}));
            if (!r.ok || j?.error) throw new Error(j?.error?.message || 'Delete failed');
            onToast('Allocation deleted');
            onClose();
            await onReload();
          } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
          finally { setBusy(false); }
        }}>Delete allocation</button>
      </div>

      <h3 className="mt-6 font-medium">Rules</h3>
      {(rules?.length ?? 0) === 0 ? (
        <p className="mt-1 text-sm text-gray-500">No rules yet — a rule sends a percentage or a fixed amount of the source balance to one destination account.</p>
      ) : (
        <table className="mt-2 w-full text-sm">
          <thead><tr className="text-left text-gray-500"><th className="py-1 pr-3">Destination</th><th className="py-1 text-right">Percentage</th><th className="py-1 text-right">Fixed</th><th className="py-1" /></tr></thead>
          <tbody>
            {rules!.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="py-1 pr-3">{r.destinationAccount}</td>
                <td className="py-1 text-right">{r.percentage == null ? '—' : `${r.percentage}%`}</td>
                <td className="py-1 text-right">{r.fixedAmount == null ? '—' : fmtMoney(r.fixedAmount)}</td>
                <td className="py-1"><button className="text-xs text-red-600" onClick={async () => {
                  setBusy(true); setErr(null);
                  try {
                    const resp = await fetch(`/api/allocation-rules?id=${r.id}`, { method: 'DELETE' });
                    const j = await resp.json().catch(() => ({}));
                    if (!resp.ok || j?.error) throw new Error(j?.error?.message || 'Delete failed');
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
        <h3 className="font-medium">Add rule</h3>
        <div className="mt-3 space-y-3">
          <Field label="Destination account"><select className={inputCls} value={destinationAccountId} onChange={(e) => setDestinationAccountId(e.target.value)} onFocus={async () => { if (!accounts) { const j = await fetch('/api/accounts').then((r) => r.json()).catch(() => null); setAccounts((j?.data || []) as Account[]); } }}><option value="">—</option>{(accounts ?? []).map((a) => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}</select></Field>
          <Field label="Percentage (0–100)"><input className={inputCls} type="number" step="0.01" min="0" max="100" value={percentage} onChange={(e) => setPercentage(e.target.value)} /></Field>
          <Field label="Fixed amount"><input className={inputCls} type="number" step="0.01" min="0" value={fixedAmount} onChange={(e) => setFixedAmount(e.target.value)} /></Field>
        </div>
        <button className="mt-3 rounded bg-blue-600 px-3 py-1.5 text-sm text-white disabled:opacity-50" disabled={busy || !destinationAccountId || (!percentage && !fixedAmount)} onClick={async () => {
          setBusy(true); setErr(null);
          try {
            await post('/api/allocation-rules', { allocationId: allocation.id, destinationAccountId, percentage: percentage ? Number(percentage) : null, fixedAmount: fixedAmount ? Number(fixedAmount) : null });
            setDestinationAccountId(''); setPercentage(''); setFixedAmount('');
            onToast('Rule added');
            await onReload();
          } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
          finally { setBusy(false); }
        }}>Add rule</button>
      </div>
    </div>
  );
}
