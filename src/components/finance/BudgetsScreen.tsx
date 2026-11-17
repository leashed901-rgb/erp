'use client';
import { useState, useEffect, useCallback } from 'react';
import type { BudgetVersion, BudgetLine, BudgetVsActualRow } from '@/lib/batchITypes';
import { fmtMoney, fmtDate, cap } from '@/lib/batchITypes';

/**
 * Budgets screen (doc 28 Batch I) — budget versions, their lines,
 * and budget-vs-actual from the engine (acct_budget_vs_actual).
 * Fill-from-actuals is the engine's acct_budget_from_actuals: it
 * deletes the version's existing lines first, so the screen asks
 * before running it. Locked / archived versions refuse new lines.
 */

const STATUSES = ['draft', 'under_review', 'approved', 'active', 'locked', 'archived', 'rejected'];

interface Props {
  onToast: (msg: string) => void;
}

interface Account {
  id: string;
  code: string;
  name: string;
  account_type: string;
}

interface Period {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
}

export default function BudgetsScreen({ onToast }: Props) {
  const [versions, setVersions] = useState<BudgetVersion[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<BudgetVersion | null>(null);
  const [detail, setDetail] = useState<{ lines: BudgetLine[]; total: number } | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const j = await fetch('/api/budgets').then((r) => r.json()).catch(() => null);
      if (j?.error) throw new Error(j.error.message || 'Budgets load failed');
      setVersions((j?.data || []) as BudgetVersion[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openVersion = async (v: BudgetVersion) => {
    setSelected(v);
    const j = await fetch(`/api/budgets/${v.id}`).then((r) => r.json()).catch(() => null);
    setDetail(j?.data ? { lines: (j.data.lines || []) as BudgetLine[], total: Number(j.data.total || 0) } : null);
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
        <h1 className="text-xl font-semibold">Budgets</h1>
        <button className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white" onClick={() => { setShowCreate(true); setFormError(null); }}>New budget</button>
      </div>
      <p className="mt-1 text-sm text-gray-600">One version per fiscal year and scenario. Fill from actuals builds the lines from a prior year&apos;s posted activity — it replaces the version&apos;s existing lines.</p>

      {error && <div className="mt-4 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {loading && <div className="mt-4 text-sm text-gray-500">Loading…</div>}

      {!loading && (
        <div className="mt-4 overflow-x-auto">
          {(versions?.length ?? 0) === 0 ? (
            <p className="text-sm text-gray-500">No budgets yet. Create one, then fill it from last year&apos;s actuals or add lines by hand.</p>
          ) : (
            <table className="w-full text-sm">
              <thead><tr className="text-left text-gray-500"><th className="py-2 pr-3">Name</th><th className="py-2 pr-3">Fiscal year</th><th className="py-2 pr-3">Version</th><th className="py-2 pr-3">Scenario</th><th className="py-2 pr-3">Status</th><th className="py-2 pr-3">Currency</th><th className="py-2 pr-3 text-right">Lines</th><th className="py-2 text-right">Total</th></tr></thead>
              <tbody>
                {versions!.map((v) => (
                  <tr key={v.id} className="cursor-pointer border-t hover:bg-gray-50" onClick={() => openVersion(v)}>
                    <td className="py-2 pr-3">{v.name}</td>
                    <td className="py-2 pr-3">{v.fiscalYear}</td>
                    <td className="py-2 pr-3">v{v.versionNo}</td>
                    <td className="py-2 pr-3">{v.scenario}</td>
                    <td className="py-2 pr-3">{cap(v.status)}</td>
                    <td className="py-2 pr-3">{v.currency}</td>
                    <td className="py-2 pr-3 text-right">{v.lineCount}</td>
                    <td className="py-2 text-right">{fmtMoney(v.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {showCreate && (
        <BudgetCreateForm
          error={formError}
          busy={busy}
          onCancel={() => setShowCreate(false)}
          onSubmit={async (body) => {
            setBusy(true); setFormError(null);
            try {
              await post('/api/budgets', body);
              setShowCreate(false);
              onToast('Budget created');
              await load();
            } catch (e) { setFormError(e instanceof Error ? e.message : String(e)); }
            finally { setBusy(false); }
          }}
        />
      )}

      {selected && (
        <BudgetDrawer
          version={selected}
          detail={detail}
          onClose={() => { setSelected(null); setDetail(null); }}
          onToast={onToast}
          onReload={async () => { await load(); if (selected) openVersion(selected); }}
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

function BudgetCreateForm({ error, busy, onCancel, onSubmit }: {
  error: string | null; busy: boolean;
  onCancel: () => void; onSubmit: (body: Record<string, unknown>) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [fiscalYear, setFiscalYear] = useState(String(new Date().getFullYear()));
  const [scenario, setScenario] = useState('budget');
  const [currency, setCurrency] = useState('USD');
  return (
    <div className="fixed inset-y-0 right-0 w-full max-w-md overflow-y-auto bg-white p-6 shadow-xl">
      <h2 className="text-lg font-semibold">New budget</h2>
      {error && <div className="mt-2 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      <div className="mt-4 space-y-3">
        <Field label="Name"><input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. FY 2026 operating budget" /></Field>
        <Field label="Fiscal year"><input className={inputCls} type="number" value={fiscalYear} onChange={(e) => setFiscalYear(e.target.value)} /></Field>
        <Field label="Scenario"><select className={inputCls} value={scenario} onChange={(e) => setScenario(e.target.value)}><option value="budget">Budget</option><option value="forecast">Forecast</option><option value="stretch">Stretch</option><option value="conservative">Conservative</option></select></Field>
        <Field label="Currency"><input className={inputCls} value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} maxLength={3} /></Field>
      </div>
      <div className="mt-5 flex gap-2">
        <button className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white disabled:opacity-50" disabled={busy} onClick={() => onSubmit({ name, fiscalYear: Number(fiscalYear), scenario, currency })}>Create budget</button>
        <button className="rounded px-3 py-1.5 text-sm text-gray-600" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

function BudgetDrawer({ version, detail, onClose, onToast, onReload }: {
  version: BudgetVersion;
  detail: { lines: BudgetLine[]; total: number } | null;
  onClose: () => void; onToast: (msg: string) => void; onReload: () => Promise<void>;
}) {
  const [status, setStatus] = useState(version.status);
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [periods, setPeriods] = useState<Period[] | null>(null);
  const [periodId, setPeriodId] = useState('');
  const [accountId, setAccountId] = useState('');
  const [amount, setAmount] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [vsFrom, setVsFrom] = useState(`${version.fiscalYear}-01-01`);
  const [vsTo, setVsTo] = useState(`${version.fiscalYear}-12-31`);
  const [vsRows, setVsRows] = useState<BudgetVsActualRow[] | null>(null);
  const [vsLoading, setVsLoading] = useState(false);
  const [fillYear, setFillYear] = useState(String(version.fiscalYear - 1));
  const [fillGrowth, setFillGrowth] = useState('0');
  const [confirmFill, setConfirmFill] = useState(false);

  const frozen = ['locked', 'archived'].includes(version.status);

  const loadPickers = useCallback(async () => {
    if (!accounts) {
      const j = await fetch('/api/accounts').then((r) => r.json()).catch(() => null);
      setAccounts((j?.data || []) as Account[]);
    }
    if (!periods) {
      const j = await fetch('/api/close/periods').then((r) => r.json()).catch(() => null);
      setPeriods(((j?.data?.periods || []) as Period[]).filter((p) => p.startDate.startsWith(String(version.fiscalYear))));
    }
  }, [accounts, periods, version.fiscalYear]);

  const post = async (url: string, body: Record<string, unknown>, method = 'POST') => {
    const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j?.error) throw new Error(j?.error?.message || `Request failed (${r.status})`);
    return j;
  };

  const runVsActual = async () => {
    setVsLoading(true);
    try {
      const j = await fetch(`/api/budgets/${version.id}/vs-actual?from=${vsFrom}&to=${vsTo}`).then((r) => r.json()).catch(() => null);
      if (j?.error) throw new Error(j.error.message || 'Comparison failed');
      setVsRows((j?.data || []) as BudgetVsActualRow[]);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setVsLoading(false);
    }
  };

  return (
    <div className="fixed inset-y-0 right-0 w-full max-w-2xl overflow-y-auto bg-white p-6 shadow-xl">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{version.name}</h2>
        <button className="text-sm text-gray-500" onClick={onClose}>Close</button>
      </div>
      <p className="mt-1 text-sm text-gray-600">FY {version.fiscalYear} · v{version.versionNo} · {version.scenario} · {version.currency} · total {fmtMoney(detail?.total ?? version.total)}{version.approvedAt ? ` · approved ${fmtDate(version.approvedAt)}` : ''}</p>
      {err && <div className="mt-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>}

      <div className="mt-4 flex flex-wrap items-end gap-2">
        <Field label="Status"><select className={inputCls} value={status} onChange={(e) => setStatus(e.target.value)}>{STATUSES.map((s) => <option key={s} value={s}>{cap(s)}</option>)}</select></Field>
        <button className="rounded bg-gray-900 px-3 py-1.5 text-sm text-white disabled:opacity-50" disabled={busy || status === version.status} onClick={async () => {
          setBusy(true); setErr(null);
          try {
            await post(`/api/budgets/${version.id}`, { status }, 'PATCH');
            onToast(`Budget ${cap(status)}`);
            await onReload();
          } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
          finally { setBusy(false); }
        }}>Set status</button>
      </div>

      <h3 className="mt-6 font-medium">Lines</h3>
      {(detail?.lines.length ?? 0) === 0 ? (
        <p className="mt-1 text-sm text-gray-500">No lines yet — add them by hand or fill from a prior year&apos;s actuals below.</p>
      ) : (
        <table className="mt-2 w-full text-sm">
          <thead><tr className="text-left text-gray-500"><th className="py-1 pr-3">Period</th><th className="py-1 pr-3">Account</th><th className="py-1 text-right">Amount</th><th className="py-1 pr-3">Notes</th><th className="py-1" /></tr></thead>
          <tbody>
            {detail!.lines.map((l) => (
              <tr key={l.id} className="border-t">
                <td className="py-1 pr-3">{l.periodName}</td>
                <td className="py-1 pr-3">{l.account}</td>
                <td className="py-1 text-right">{fmtMoney(l.amount)}</td>
                <td className="py-1 pr-3">{l.notes ?? '—'}</td>
                <td className="py-1">{!frozen && <button className="text-xs text-red-600" onClick={async () => {
                  setBusy(true); setErr(null);
                  try {
                    const r = await fetch(`/api/budgets/${version.id}/lines?lineId=${l.id}`, { method: 'DELETE' });
                    const j = await r.json().catch(() => ({}));
                    if (!r.ok || j?.error) throw new Error(j?.error?.message || 'Delete failed');
                    await onReload();
                  } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
                  finally { setBusy(false); }
                }}>Delete</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {!frozen && (
        <div className="mt-4 rounded border p-3">
          <h3 className="font-medium">Add line</h3>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <Field label="Period"><select className={inputCls} value={periodId} onChange={(e) => setPeriodId(e.target.value)} onFocus={() => loadPickers()}><option value="">—</option>{(periods ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
            <Field label="Account"><select className={inputCls} value={accountId} onChange={(e) => setAccountId(e.target.value)} onFocus={() => loadPickers()}><option value="">—</option>{(accounts ?? []).map((a) => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}</select></Field>
            <Field label="Amount"><input className={inputCls} type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
          </div>
          <button className="mt-3 rounded bg-blue-600 px-3 py-1.5 text-sm text-white disabled:opacity-50" disabled={busy || !periodId || !accountId || !amount} onClick={async () => {
            setBusy(true); setErr(null);
            try {
              await post(`/api/budgets/${version.id}/lines`, { periodId, accountId, amount: Number(amount) });
              setPeriodId(''); setAccountId(''); setAmount('');
              onToast('Line added');
              await onReload();
            } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
            finally { setBusy(false); }
          }}>Add line</button>
        </div>
      )}

      {!frozen && (
        <div className="mt-4 rounded border p-3">
          <h3 className="font-medium">Fill from actuals</h3>
          <p className="mt-1 text-sm text-gray-600">Rebuilds this version&apos;s lines from a prior year&apos;s posted activity, scaled by the growth %. The version&apos;s existing lines are deleted first.</p>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <Field label="Source year"><input className={inputCls} type="number" value={fillYear} onChange={(e) => setFillYear(e.target.value)} /></Field>
            <Field label="Growth %"><input className={inputCls} type="number" step="0.01" value={fillGrowth} onChange={(e) => setFillGrowth(e.target.value)} /></Field>
          </div>
          {confirmFill ? (
            <div className="mt-3 flex gap-2">
              <button className="rounded bg-red-600 px-3 py-1.5 text-sm text-white disabled:opacity-50" disabled={busy} onClick={async () => {
                setBusy(true); setErr(null);
                try {
                  const j = await post(`/api/budgets/${version.id}/from-actuals`, { sourceYear: Number(fillYear), growthPct: Number(fillGrowth) });
                  setConfirmFill(false);
                  onToast(`Filled from ${fillYear} actuals — ${j?.data?.linesInserted ?? 0} lines`);
                  await onReload();
                } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
                finally { setBusy(false); }
              }}>Replace lines with {fillYear} actuals</button>
              <button className="rounded px-3 py-1.5 text-sm text-gray-600" onClick={() => setConfirmFill(false)}>Keep lines</button>
            </div>
          ) : (
            <button className="mt-3 rounded bg-blue-600 px-3 py-1.5 text-sm text-white" onClick={() => setConfirmFill(true)}>Fill from actuals…</button>
          )}
        </div>
      )}

      <div className="mt-6">
        <h3 className="font-medium">Budget vs actual</h3>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <Field label="From"><input className={inputCls} type="date" value={vsFrom} onChange={(e) => setVsFrom(e.target.value)} /></Field>
          <Field label="To"><input className={inputCls} type="date" value={vsTo} onChange={(e) => setVsTo(e.target.value)} /></Field>
          <button className="rounded bg-gray-900 px-3 py-1.5 text-sm text-white disabled:opacity-50" disabled={vsLoading} onClick={runVsActual}>Compare</button>
        </div>
        {vsRows && (
          <table className="mt-3 w-full text-sm">
            <thead><tr className="text-left text-gray-500"><th className="py-1 pr-3">Account</th><th className="py-1 pr-3">Type</th><th className="py-1 text-right">Budget</th><th className="py-1 text-right">Actual</th><th className="py-1 text-right">Variance</th><th className="py-1 text-right">Var %</th></tr></thead>
            <tbody>
              {vsRows.map((r) => (
                <tr key={r.accountId} className="border-t">
                  <td className="py-1 pr-3">{r.code} · {r.name}</td>
                  <td className="py-1 pr-3">{r.accountType}</td>
                  <td className="py-1 text-right">{fmtMoney(r.budget)}</td>
                  <td className="py-1 text-right">{fmtMoney(r.actual)}</td>
                  <td className="py-1 text-right">{fmtMoney(r.variance)}</td>
                  <td className="py-1 text-right">{r.variancePct == null ? '—' : `${(r.variancePct * 100).toFixed(1)}%`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {vsRows && vsRows.length === 0 && <p className="mt-3 text-sm text-gray-500">No accounts with a budget or activity in this range.</p>}
      </div>
    </div>
  );
}
