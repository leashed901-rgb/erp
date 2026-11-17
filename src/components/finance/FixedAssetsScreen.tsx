'use client';
import { useState, useEffect, useCallback } from 'react';
import type { FixedAsset, AssetClass, DepreciationRun } from '@/lib/batchHTypes';

/**
 * Fixed assets screen (doc 28 Batch H) — the fixed-asset register,
 * asset classes, and depreciation runs. The 'tax-assets' nav id
 * renders the TaxSummary screen (its Assets tab is the tax-mapping
 * view), so the register lives here under its own nav id. All 13
 * Batch H tables were BASE TABLEs with zero src references and zero
 * rows; the engine owns the math (acct_add_fixed_asset,
 * acct_place_asset_in_service, acct_dispose_fixed_asset,
 * acct_run_depreciation, acct_fixed_asset_register).
 */

const money0 = (n: number) =>
  '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

interface Props {
  onToast: (msg: string) => void;
}

interface Account {
  id: string;
  code: string;
  name: string;
  account_type: string;
}

interface BankAccount {
  id: string;
  name: string;
}

export default function FixedAssetsScreen({ onToast }: Props) {
  type Tab = 'register' | 'classes' | 'runs';
  const [tab, setTab] = useState<Tab>('register');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [assets, setAssets] = useState<FixedAsset[] | null>(null);
  const [classes, setClasses] = useState<AssetClass[] | null>(null);
  const [runs, setRuns] = useState<DepreciationRun[] | null>(null);
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [banks, setBanks] = useState<BankAccount[] | null>(null);
  const [selected, setSelected] = useState<FixedAsset | null>(null);
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);
  const [selectedRun, setSelectedRun] = useState<DepreciationRun | null>(null);
  const [runDetail, setRunDetail] = useState<DepreciationRun | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showClass, setShowClass] = useState(false);
  const [showRun, setShowRun] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadAccounts = useCallback(async () => {
    if (accounts) return accounts;
    const j = await fetch('/api/accounts').then((r) => r.json()).catch(() => null);
    const list = (j?.data || []) as Account[];
    setAccounts(list);
    return list;
  }, [accounts]);

  const loadBanks = useCallback(async () => {
    if (banks) return banks;
    const j = await fetch('/api/bank-accounts').then((r) => r.json()).catch(() => null);
    const list = ((j?.data || j?.rows || []) as { id: string; name: string }[]).map((b) => ({ id: b.id, name: b.name }));
    setBanks(list);
    return list;
  }, [banks]);

  const loadTab = useCallback(async (t: Tab, force = false) => {
    setError(null);
    setLoading(true);
    try {
      if (t === 'register' && (force || !assets)) {
        const j = await fetch('/api/fixed-assets').then((r) => r.json()).catch(() => null);
        if (j?.error) throw new Error(j.error.message || 'Assets load failed');
        setAssets((j?.data || []) as FixedAsset[]);
        if (!classes) {
          const cj = await fetch('/api/asset-classes').then((r) => r.json()).catch(() => null);
          setClasses((cj?.data || []) as AssetClass[]);
        }
      } else if (t === 'classes' && (force || !classes)) {
        const j = await fetch('/api/asset-classes').then((r) => r.json()).catch(() => null);
        if (j?.error) throw new Error(j.error.message || 'Classes load failed');
        setClasses((j?.data || []) as AssetClass[]);
      } else if (t === 'runs' && (force || !runs)) {
        const j = await fetch('/api/depreciation-runs').then((r) => r.json()).catch(() => null);
        if (j?.error) throw new Error(j.error.message || 'Runs load failed');
        setRuns((j?.data || []) as DepreciationRun[]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [assets, classes, runs]);

  useEffect(() => { loadTab('register'); }, [loadTab]);

  const openAsset = async (a: FixedAsset) => {
    setSelected(a);
    const j = await fetch(`/api/fixed-assets/${a.id}`).then((r) => r.json()).catch(() => null);
    setDetail(j?.data ?? null);
  };

  const openRun = async (r: DepreciationRun) => {
    setSelectedRun(r);
    const j = await fetch(`/api/depreciation-runs/${r.id}`).then((r) => r.json()).catch(() => null);
    setRunDetail((j?.data ?? null) as DepreciationRun | null);
  };

  const post = async (url: string, body: Record<string, unknown>) => {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j?.error) throw new Error(j?.error?.message || `Request failed (${r.status})`);
    return j;
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Fixed assets</h1>
        <div className="flex gap-2">
          {tab === 'register' && <button className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white" onClick={() => { setShowCreate(true); setFormError(null); loadBanks(); }}>Add asset</button>}
          {tab === 'classes' && <button className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white" onClick={() => { setShowClass(true); setFormError(null); loadAccounts(); }}>New class</button>}
          {tab === 'runs' && <button className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white" onClick={() => { setShowRun(true); setFormError(null); }}>Run depreciation</button>}
        </div>
      </div>

      <div className="mt-4 flex gap-2 border-b pb-2">
        {([['register', 'Register'], ['classes', 'Asset classes'], ['runs', 'Depreciation runs']] as [Tab, string][]).map(([k, label]) => (
          <button key={k} className={tab === k ? 'rounded bg-gray-900 px-3 py-1 text-sm text-white' : 'rounded px-3 py-1 text-sm text-gray-600 hover:bg-gray-100'} onClick={() => { setTab(k); loadTab(k); }}>{label}</button>
        ))}
      </div>

      {error && <div className="mt-4 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {loading && <div className="mt-4 text-sm text-gray-500">Loading…</div>}

      {!loading && tab === 'register' && (
        <div className="mt-4 overflow-x-auto">
          {(assets?.length ?? 0) === 0 ? (
            <p className="text-sm text-gray-500">No fixed assets yet. Add one — the engine posts the acquisition journal unless it is already on the books.</p>
          ) : (
            <table className="w-full text-sm">
              <thead><tr className="text-left text-gray-500"><th className="py-2 pr-3">Number</th><th className="py-2 pr-3">Asset</th><th className="py-2 pr-3">Class</th><th className="py-2 pr-3">Status</th><th className="py-2 pr-3">In service</th><th className="py-2 pr-3 text-right">Cost</th><th className="py-2 pr-3 text-right">Accum. depr.</th><th className="py-2 text-right">Book value</th></tr></thead>
              <tbody>
                {assets!.map((a) => (
                  <tr key={a.id} className="cursor-pointer border-t hover:bg-gray-50" onClick={() => openAsset(a)}>
                    <td className="py-2 pr-3 font-mono text-xs">{a.assetNumber}</td>
                    <td className="py-2 pr-3">{a.name}</td>
                    <td className="py-2 pr-3">{a.className ?? '—'}</td>
                    <td className="py-2 pr-3">{a.status.replace(/_/g, ' ')}</td>
                    <td className="py-2 pr-3">{a.inService ? a.inService.slice(0, 10) : '—'}</td>
                    <td className="py-2 pr-3 text-right">{money0(a.cost)}</td>
                    <td className="py-2 pr-3 text-right">{money0(a.accumulated)}</td>
                    <td className="py-2 text-right">{money0(a.netBookValue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {!loading && tab === 'classes' && (
        <div className="mt-4 overflow-x-auto">
          {(classes?.length ?? 0) === 0 ? (
            <p className="text-sm text-gray-500">No asset classes. The engine creates a default EQUIP class (Furniture and Equipment, 84 months, straight-line) the first time an asset is added without a class.</p>
          ) : (
            <table className="w-full text-sm">
              <thead><tr className="text-left text-gray-500"><th className="py-2 pr-3">Code</th><th className="py-2 pr-3">Name</th><th className="py-2 pr-3">Life (mo)</th><th className="py-2 pr-3">Method</th><th className="py-2 pr-3">Residual %</th></tr></thead>
              <tbody>
                {classes!.map((c) => (
                  <tr key={c.id} className="border-t"><td className="py-2 pr-3 font-mono text-xs">{c.code}</td><td className="py-2 pr-3">{c.name}</td><td className="py-2 pr-3">{c.lifeMonths ?? '—'}</td><td className="py-2 pr-3">{c.method ?? '—'}</td><td className="py-2 pr-3">{c.residualPercent ?? '—'}</td></tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {!loading && tab === 'runs' && (
        <div className="mt-4 overflow-x-auto">
          {(runs?.length ?? 0) === 0 ? (
            <p className="text-sm text-gray-500">No depreciation runs yet. A run depreciates whole months only — through a month-end date includes that month.</p>
          ) : (
            <table className="w-full text-sm">
              <thead><tr className="text-left text-gray-500"><th className="py-2 pr-3">Run date</th><th className="py-2 pr-3">Status</th><th className="py-2 pr-3">Assets</th><th className="py-2 text-right">Total depreciation</th></tr></thead>
              <tbody>
                {runs!.map((r) => (
                  <tr key={r.id} className="cursor-pointer border-t hover:bg-gray-50" onClick={() => openRun(r)}>
                    <td className="py-2 pr-3">{r.runDate.slice(0, 10)}</td>
                    <td className="py-2 pr-3">{r.status}</td>
                    <td className="py-2 pr-3">{(r as DepreciationRun & { lineCount?: number }).lineCount ?? r.lines.length}</td>
                    <td className="py-2 text-right">{money0(r.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {showCreate && (
        <AssetCreateForm
          classes={classes ?? []}
          banks={banks ?? []}
          error={formError}
          busy={busy}
          onCancel={() => setShowCreate(false)}
          onSubmit={async (body) => {
            setBusy(true); setFormError(null);
            try {
              await post('/api/fixed-assets', body);
              setShowCreate(false);
              onToast('Asset added');
              await loadTab('register', true);
            } catch (e) { setFormError(e instanceof Error ? e.message : String(e)); }
            finally { setBusy(false); }
          }}
        />
      )}

      {showClass && (
        <ClassCreateForm
          accounts={accounts ?? []}
          error={formError}
          busy={busy}
          onCancel={() => setShowClass(false)}
          onSubmit={async (body) => {
            setBusy(true); setFormError(null);
            try {
              await post('/api/asset-classes', body);
              setShowClass(false);
              onToast('Asset class created');
              await loadTab('classes', true);
            } catch (e) { setFormError(e instanceof Error ? e.message : String(e)); }
            finally { setBusy(false); }
          }}
        />
      )}

      {showRun && (
        <RunForm
          error={formError}
          busy={busy}
          onCancel={() => setShowRun(false)}
          onSubmit={async (through) => {
            setBusy(true); setFormError(null);
            try {
              const j = await post('/api/depreciation-runs', { through });
              setShowRun(false);
              const s = j?.data as Record<string, unknown> | undefined;
              onToast(`Depreciation run posted — ${s?.assets ?? 0} assets, ${money0(Number(s?.amount ?? 0))}`);
              await loadTab('runs', true);
            } catch (e) { setFormError(e instanceof Error ? e.message : String(e)); }
            finally { setBusy(false); }
          }}
        />
      )}

      {selected && (
        <AssetDrawer
          asset={selected}
          detail={detail}
          banks={banks ?? []}
          classes={classes ?? []}
          onClose={() => { setSelected(null); setDetail(null); }}
          onToast={onToast}
          onReload={async () => { await loadTab('register', true); if (selected) openAsset(selected); }}
          onLoadBanks={loadBanks}
        />
      )}

      {selectedRun && (
        <div className="fixed inset-y-0 right-0 w-full max-w-lg overflow-y-auto bg-white p-6 shadow-xl">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Depreciation run — {selectedRun.runDate.slice(0, 10)}</h2>
            <button className="text-sm text-gray-500" onClick={() => { setSelectedRun(null); setRunDetail(null); }}>Close</button>
          </div>
          <p className="mt-1 text-sm text-gray-600">Status {selectedRun.status} · total {money0(runDetail?.total ?? selectedRun.total)} · journal {runDetail?.journalId ?? selectedRun.journalId ?? '—'}</p>
          <table className="mt-4 w-full text-sm">
            <thead><tr className="text-left text-gray-500"><th className="py-2 pr-3">Asset</th><th className="py-2 text-right">Amount</th><th className="py-2 text-right">Accum. after</th><th className="py-2 text-right">NBV after</th></tr></thead>
            <tbody>
              {(runDetail?.lines ?? []).map((l) => (
                <tr key={l.id} className="border-t"><td className="py-2 pr-3">{l.assetName} <span className="font-mono text-xs text-gray-400">{l.assetNumber}</span></td><td className="py-2 text-right">{money0(l.amount)}</td><td className="py-2 text-right">{money0(l.accumulatedAfter)}</td><td className="py-2 text-right">{money0(l.nbvAfter)}</td></tr>
              ))}
            </tbody>
          </table>
          {(runDetail?.lines.length ?? 0) === 0 && <p className="mt-4 text-sm text-gray-500">No lines on this run.</p>}
        </div>
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

function AssetCreateForm({ classes, banks, error, busy, onCancel, onSubmit }: {
  classes: AssetClass[]; banks: BankAccount[]; error: string | null; busy: boolean;
  onCancel: () => void; onSubmit: (body: Record<string, unknown>) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [cost, setCost] = useState('');
  const [acquired, setAcquired] = useState(new Date().toISOString().slice(0, 10));
  const [classId, setClassId] = useState('');
  const [paidFrom, setPaidFrom] = useState('');
  const [already, setAlready] = useState(false);
  const [accum, setAccum] = useState('');
  const [serial, setSerial] = useState('');
  const [location, setLocation] = useState('');
  return (
    <div className="fixed inset-y-0 right-0 w-full max-w-md overflow-y-auto bg-white p-6 shadow-xl">
      <h2 className="text-lg font-semibold">Add asset</h2>
      {error && <div className="mt-2 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      <div className="mt-4 space-y-3">
        <Field label="Name"><input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Delivery van" /></Field>
        <Field label="Cost"><input className={inputCls} type="number" step="0.01" min="0" value={cost} onChange={(e) => setCost(e.target.value)} /></Field>
        <Field label="Acquisition date"><input className={inputCls} type="date" value={acquired} onChange={(e) => setAcquired(e.target.value)} /></Field>
        <Field label="Class (blank = engine default EQUIP)"><select className={inputCls} value={classId} onChange={(e) => setClassId(e.target.value)}><option value="">Default</option>{classes.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}</select></Field>
        <Field label="Paid from bank account (blank = books against the fixed-assets role account)"><select className={inputCls} value={paidFrom} onChange={(e) => setPaidFrom(e.target.value)}><option value="">—</option>{banks.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={already} onChange={(e) => setAlready(e.target.checked)} /> Already on the books (no acquisition journal)</label>
        {already && <Field label="Accumulated depreciation to date"><input className={inputCls} type="number" step="0.01" min="0" value={accum} onChange={(e) => setAccum(e.target.value)} /></Field>}
        <Field label="Serial number"><input className={inputCls} value={serial} onChange={(e) => setSerial(e.target.value)} /></Field>
        <Field label="Location"><input className={inputCls} value={location} onChange={(e) => setLocation(e.target.value)} /></Field>
      </div>
      <div className="mt-5 flex gap-2">
        <button className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white disabled:opacity-50" disabled={busy} onClick={() => onSubmit({ name, cost: Number(cost), acquired, classId: classId || null, paidFromBankAccountId: paidFrom || null, alreadyOnBooks: already, accumulatedToDate: Number(accum || 0), serial: serial || null, location: location || null })}>Add asset</button>
        <button className="rounded px-3 py-1.5 text-sm text-gray-600" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

function ClassCreateForm({ accounts, error, busy, onCancel, onSubmit }: {
  accounts: Account[]; error: string | null; busy: boolean;
  onCancel: () => void; onSubmit: (body: Record<string, unknown>) => Promise<void>;
}) {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [asset, setAsset] = useState('');
  const [accum, setAccum] = useState('');
  const [expense, setExpense] = useState('');
  const [life, setLife] = useState('84');
  const [method, setMethod] = useState('straight_line');
  const [residual, setResidual] = useState('0');
  const assetAccts = accounts.filter((a) => a.account_type === 'asset');
  const expenseAccts = accounts.filter((a) => a.account_type === 'expense');
  return (
    <div className="fixed inset-y-0 right-0 w-full max-w-md overflow-y-auto bg-white p-6 shadow-xl">
      <h2 className="text-lg font-semibold">New asset class</h2>
      {error && <div className="mt-2 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      <div className="mt-4 space-y-3">
        <Field label="Code"><input className={inputCls} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="e.g. VEHICLE" /></Field>
        <Field label="Name"><input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Vehicles" /></Field>
        <Field label="Asset account"><select className={inputCls} value={asset} onChange={(e) => setAsset(e.target.value)}><option value="">—</option>{assetAccts.map((a) => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}</select></Field>
        <Field label="Accumulated depreciation account"><select className={inputCls} value={accum} onChange={(e) => setAccum(e.target.value)}><option value="">—</option>{assetAccts.map((a) => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}</select></Field>
        <Field label="Depreciation expense account"><select className={inputCls} value={expense} onChange={(e) => setExpense(e.target.value)}><option value="">—</option>{expenseAccts.map((a) => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}</select></Field>
        <Field label="Default useful life (months)"><input className={inputCls} type="number" min="1" value={life} onChange={(e) => setLife(e.target.value)} /></Field>
        <Field label="Default method"><select className={inputCls} value={method} onChange={(e) => setMethod(e.target.value)}><option value="straight_line">Straight line</option><option value="declining_balance">Declining balance</option><option value="double_declining">Double declining</option></select></Field>
        <Field label="Residual %"><input className={inputCls} type="number" step="0.01" min="0" max="100" value={residual} onChange={(e) => setResidual(e.target.value)} /></Field>
      </div>
      <div className="mt-5 flex gap-2">
        <button className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white disabled:opacity-50" disabled={busy} onClick={() => onSubmit({ code, name, assetAccountId: asset, accumAccountId: accum, expenseAccountId: expense, lifeMonths: Number(life), method, residualPercent: Number(residual) })}>Create class</button>
        <button className="rounded px-3 py-1.5 text-sm text-gray-600" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

function RunForm({ error, busy, onCancel, onSubmit }: {
  error: string | null; busy: boolean; onCancel: () => void; onSubmit: (through: string) => Promise<void>;
}) {
  const [through, setThrough] = useState(new Date().toISOString().slice(0, 10));
  return (
    <div className="fixed inset-y-0 right-0 w-full max-w-md overflow-y-auto bg-white p-6 shadow-xl">
      <h2 className="text-lg font-semibold">Run depreciation</h2>
      <p className="mt-1 text-sm text-gray-600">Depreciates every in-service asset through whole months only. A run through a month-end date includes that month; a mid-month date stops at the end of the prior month.</p>
      {error && <div className="mt-2 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      <div className="mt-4 space-y-3">
        <Field label="Through date"><input className={inputCls} type="date" value={through} onChange={(e) => setThrough(e.target.value)} /></Field>
      </div>
      <div className="mt-5 flex gap-2">
        <button className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white disabled:opacity-50" disabled={busy} onClick={() => onSubmit(through)}>Run</button>
        <button className="rounded px-3 py-1.5 text-sm text-gray-600" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

function AssetDrawer({ asset, detail, banks, classes, onClose, onToast, onReload, onLoadBanks }: {
  asset: FixedAsset; detail: Record<string, unknown> | null; banks: BankAccount[]; classes: AssetClass[];
  onClose: () => void; onToast: (msg: string) => void; onReload: () => Promise<void>; onLoadBanks: () => Promise<BankAccount[]>;
}) {
  const [pis, setPis] = useState(new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState('');
  const [life, setLife] = useState('');
  const [convention, setConvention] = useState('full_month');
  const [disDate, setDisDate] = useState(new Date().toISOString().slice(0, 10));
  const [proceeds, setProceeds] = useState('0');
  const [depositBank, setDepositBank] = useState('');
  const [memo, setMemo] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const post = async (url: string, body: Record<string, unknown>) => {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j?.error) throw new Error(j?.error?.message || `Request failed (${r.status})`);
    return j;
  };

  const books = (detail?.books ?? []) as Record<string, unknown>[];
  const lines = (detail?.lines ?? []) as Record<string, unknown>[];
  const canPlace = asset.status === 'draft' || asset.status === 'in_service';
  const canDispose = asset.status !== 'disposed' && asset.status !== 'retired';

  return (
    <div className="fixed inset-y-0 right-0 w-full max-w-lg overflow-y-auto bg-white p-6 shadow-xl">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{asset.name}</h2>
        <button className="text-sm text-gray-500" onClick={onClose}>Close</button>
      </div>
      <p className="mt-1 text-sm text-gray-600">{asset.assetNumber} · {asset.status.replace(/_/g, ' ')} · cost {money0(asset.cost)} · accum. {money0(asset.accumulated)} · book {money0(asset.netBookValue)}</p>
      {err && <div className="mt-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>}

      <h3 className="mt-5 font-medium">Depreciation books</h3>
      {books.length === 0 ? <p className="mt-1 text-sm text-gray-500">Not placed in service yet — no book exists.</p> : (
        <table className="mt-2 w-full text-sm">
          <thead><tr className="text-left text-gray-500"><th className="py-1 pr-3">Method</th><th className="py-1 pr-3">Convention</th><th className="py-1 pr-3">Life</th><th className="py-1 pr-3">Last depr.</th><th className="py-1 text-right">NBV</th></tr></thead>
          <tbody>{books.map((b) => (
            <tr key={String(b.id)} className="border-t"><td className="py-1 pr-3">{String(b.method)}</td><td className="py-1 pr-3">{String(b.convention)}</td><td className="py-1 pr-3">{String(b.lifeMonths)} mo</td><td className="py-1 pr-3">{b.lastDepreciationDate ? String(b.lastDepreciationDate).slice(0, 10) : '—'}</td><td className="py-1 text-right">{money0(Number(b.netBookValue || 0))}</td></tr>
          ))}</tbody>
        </table>
      )}

      <h3 className="mt-5 font-medium">Depreciation lines</h3>
      {lines.length === 0 ? <p className="mt-1 text-sm text-gray-500">No depreciation posted yet.</p> : (
        <table className="mt-2 w-full text-sm">
          <thead><tr className="text-left text-gray-500"><th className="py-1 pr-3">Run</th><th className="py-1 text-right">Amount</th><th className="py-1 text-right">Accum. after</th><th className="py-1 text-right">NBV after</th></tr></thead>
          <tbody>{lines.map((l) => (
            <tr key={String(l.id)} className="border-t"><td className="py-1 pr-3">{l.runDate ? String(l.runDate).slice(0, 10) : '—'}</td><td className="py-1 text-right">{money0(Number(l.amount || 0))}</td><td className="py-1 text-right">{money0(Number(l.accumulatedAfter || 0))}</td><td className="py-1 text-right">{money0(Number(l.nbvAfter || 0))}</td></tr>
          ))}</tbody>
        </table>
      )}

      {canPlace && (
        <div className="mt-5 rounded border p-3">
          <h3 className="font-medium">Place in service</h3>
          <div className="mt-3 space-y-3">
            <Field label="In-service date"><input className={inputCls} type="date" value={pis} onChange={(e) => setPis(e.target.value)} /></Field>
            <Field label="Method (blank = class default)"><select className={inputCls} value={method} onChange={(e) => setMethod(e.target.value)}><option value="">Default</option><option value="straight_line">Straight line</option><option value="declining_balance">Declining balance</option><option value="double_declining">Double declining</option></select></Field>
            <Field label="Useful life, months (blank = asset / class)"><input className={inputCls} type="number" min="1" value={life} onChange={(e) => setLife(e.target.value)} /></Field>
            <Field label="Convention"><select className={inputCls} value={convention} onChange={(e) => setConvention(e.target.value)}><option value="full_month">Full month</option><option value="mid_month">Mid month</option><option value="next_month">Next month</option></select></Field>
            <button className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white disabled:opacity-50" disabled={busy} onClick={async () => {
              setBusy(true); setErr(null);
              try {
                await post(`/api/fixed-assets/${asset.id}/place-in-service`, { inService: pis, method: method || null, lifeMonths: life ? Number(life) : null, convention });
                onToast('Asset placed in service');
                await onReload();
              } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
              finally { setBusy(false); }
            }}>Place in service</button>
          </div>
        </div>
      )}

      {canDispose && (
        <div className="mt-5 rounded border p-3">
          <h3 className="font-medium">Dispose</h3>
          <p className="mt-1 text-sm text-gray-600">Writes off the remaining book value, books the gain or loss, and deposits the proceeds.</p>
          <div className="mt-3 space-y-3">
            <Field label="Disposal date"><input className={inputCls} type="date" value={disDate} onChange={(e) => setDisDate(e.target.value)} /></Field>
            <Field label="Proceeds"><input className={inputCls} type="number" step="0.01" min="0" value={proceeds} onChange={(e) => setProceeds(e.target.value)} /></Field>
            <Field label="Deposit into bank account"><select className={inputCls} value={depositBank} onChange={(e) => setDepositBank(e.target.value)} onFocus={() => onLoadBanks()}><option value="">—</option>{banks.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>
            <Field label="Memo"><input className={inputCls} value={memo} onChange={(e) => setMemo(e.target.value)} /></Field>
            <button className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white disabled:opacity-50" disabled={busy} onClick={async () => {
              setBusy(true); setErr(null);
              try {
                await post(`/api/fixed-assets/${asset.id}/dispose`, { date: disDate, proceeds: Number(proceeds), depositBankAccountId: depositBank || null, memo: memo || null });
                onToast('Asset disposed');
                await onReload();
              } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
              finally { setBusy(false); }
            }}>Dispose asset</button>
          </div>
        </div>
      )}
    </div>
  );
}
