'use client';
import { useState, useEffect, useCallback } from 'react';
import type { RevenueContract, RecognitionSchedule } from '@/lib/batchHTypes';

/**
 * Revenue recognition screen (doc 28 Batch H) — revenue contracts
 * with performance obligations and their recognition schedules, plus
 * the generic prepaid / deferred / accrued schedules. The engine has
 * no RPCs for contracts or leases: contracts and obligations are
 * direct-table rows, and schedule rows are built by the route from
 * the obligation's own method and window (straight-line over the
 * periods, point-in-time as a single row; milestone/usage/percentage/
 * manual are event-driven and are not invented). Recognizing a
 * contract row posts Dr deferred revenue / Cr revenue through the
 * existing acct_post_entry primitive. Generic schedules go through
 * the engine's acct_create_recognition_schedule /
 * acct_run_recognition / acct_recognition_tieout.
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

interface Party {
  id: string;
  displayName: string;
}

const SCHEDULE_KINDS = ['prepaid_expense', 'deferred_revenue', 'accrued_expense', 'accrued_revenue'];
const OB_METHODS = ['point_in_time', 'straight_line', 'milestone', 'usage', 'percentage_complete', 'manual'];

export default function RevenueScreen({ onToast }: Props) {
  type Tab = 'contracts' | 'schedules';
  const [tab, setTab] = useState<Tab>('contracts');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [contracts, setContracts] = useState<RevenueContract[] | null>(null);
  const [schedules, setSchedules] = useState<RecognitionSchedule[] | null>(null);
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [customers, setCustomers] = useState<Party[] | null>(null);
  const [selected, setSelected] = useState<RevenueContract | null>(null);
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);
  const [selectedSched, setSelectedSched] = useState<RecognitionSchedule | null>(null);
  const [schedDetail, setSchedDetail] = useState<Record<string, unknown> | null>(null);
  const [showContract, setShowContract] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tieout, setTieout] = useState<unknown>(null);

  const loadAccounts = useCallback(async () => {
    if (accounts) return accounts;
    const j = await fetch('/api/accounts').then((r) => r.json()).catch(() => null);
    const list = (j?.data || []) as Account[];
    setAccounts(list);
    return list;
  }, [accounts]);

  const loadCustomers = useCallback(async () => {
    if (customers) return customers;
    const j = await fetch('/api/parties?role=customer').then((r) => r.json()).catch(() => null);
    const list = ((j?.data || []) as { id: string; displayName?: string; name?: string }[]).map((p) => ({ id: p.id, displayName: p.displayName || p.name || p.id }));
    setCustomers(list);
    return list;
  }, [customers]);

  const loadTab = useCallback(async (t: Tab, force = false) => {
    setError(null);
    setLoading(true);
    try {
      if (t === 'contracts' && (force || !contracts)) {
        const j = await fetch('/api/revenue-contracts').then((r) => r.json()).catch(() => null);
        if (j?.error) throw new Error(j.error.message || 'Contracts load failed');
        setContracts((j?.data || []) as RevenueContract[]);
      } else if (t === 'schedules' && (force || !schedules)) {
        const j = await fetch('/api/recognition-schedules').then((r) => r.json()).catch(() => null);
        if (j?.error) throw new Error(j.error.message || 'Schedules load failed');
        setSchedules((j?.data || []) as RecognitionSchedule[]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [contracts, schedules]);

  useEffect(() => { loadTab('contracts'); }, [loadTab]);

  const openContract = async (c: RevenueContract) => {
    setSelected(c);
    const j = await fetch(`/api/revenue-contracts/${c.id}`).then((r) => r.json()).catch(() => null);
    setDetail(j?.data ?? null);
  };

  const openSchedule = async (s: RecognitionSchedule) => {
    setSelectedSched(s);
    const j = await fetch(`/api/recognition-schedules/${s.id}`).then((r) => r.json()).catch(() => null);
    setSchedDetail(j?.data ?? null);
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
        <h1 className="text-xl font-semibold">Revenue recognition</h1>
        <div className="flex gap-2">
          {tab === 'contracts' && <button className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white" onClick={() => { setShowContract(true); setFormError(null); loadCustomers(); }}>New contract</button>}
          {tab === 'schedules' && (
            <>
              <button className="rounded border px-3 py-1.5 text-sm" onClick={async () => {
                setBusy(true);
                try {
                  const j = await post('/api/recognition/run', { asOf: new Date().toISOString().slice(0, 10) });
                  const s = j?.data as Record<string, unknown> | undefined;
                  onToast(`Recognition run posted — ${s?.recognized ?? s?.count ?? 0} lines`);
                  await loadTab('schedules', true);
                } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
                finally { setBusy(false); }
              }}>Run recognition</button>
              <button className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white" onClick={() => { setShowSchedule(true); setFormError(null); loadAccounts(); }}>New schedule</button>
            </>
          )}
        </div>
      </div>

      <div className="mt-4 flex gap-2 border-b pb-2">
        {([['contracts', 'Contracts'], ['schedules', 'Recognition schedules']] as [Tab, string][]).map(([k, label]) => (
          <button key={k} className={tab === k ? 'rounded bg-gray-900 px-3 py-1 text-sm text-white' : 'rounded px-3 py-1 text-sm text-gray-600 hover:bg-gray-100'} onClick={() => { setTab(k); loadTab(k); }}>{label}</button>
        ))}
      </div>

      {error && <div className="mt-4 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {loading && <div className="mt-4 text-sm text-gray-500">Loading…</div>}

      {!loading && tab === 'contracts' && (
        <div className="mt-4 overflow-x-auto">
          {(contracts?.length ?? 0) === 0 ? (
            <p className="text-sm text-gray-500">No revenue contracts yet. A contract splits its transaction price across performance obligations; each obligation recognizes on its own method.</p>
          ) : (
            <table className="w-full text-sm">
              <thead><tr className="text-left text-gray-500"><th className="py-2 pr-3">Number</th><th className="py-2 pr-3">Customer</th><th className="py-2 pr-3">Date</th><th className="py-2 pr-3">Status</th><th className="py-2 text-right">Transaction price</th></tr></thead>
              <tbody>
                {contracts!.map((c) => (
                  <tr key={c.id} className="cursor-pointer border-t hover:bg-gray-50" onClick={() => openContract(c)}>
                    <td className="py-2 pr-3 font-mono text-xs">{c.contractNumber}</td>
                    <td className="py-2 pr-3">{c.customerName ?? '—'}</td>
                    <td className="py-2 pr-3">{c.contractDate.slice(0, 10)}</td>
                    <td className="py-2 pr-3">{c.status}</td>
                    <td className="py-2 text-right">{money0(c.totalPrice)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {!loading && tab === 'schedules' && (
        <div className="mt-4 overflow-x-auto">
          {(schedules?.length ?? 0) === 0 ? (
            <p className="text-sm text-gray-500">No recognition schedules yet. Prepaid expense and deferred revenue spread over months; accrued expense and revenue are a single month.</p>
          ) : (
            <table className="w-full text-sm">
              <thead><tr className="text-left text-gray-500"><th className="py-2 pr-3">Name</th><th className="py-2 pr-3">Kind</th><th className="py-2 pr-3">Start</th><th className="py-2 pr-3">Months</th><th className="py-2 pr-3">Status</th><th className="py-2 text-right">Total</th></tr></thead>
              <tbody>
                {schedules!.map((s) => (
                  <tr key={s.id} className="cursor-pointer border-t hover:bg-gray-50" onClick={() => openSchedule(s)}>
                    <td className="py-2 pr-3">{s.name}</td>
                    <td className="py-2 pr-3">{s.kind.replace(/_/g, ' ')}</td>
                    <td className="py-2 pr-3">{s.startDate.slice(0, 10)}</td>
                    <td className="py-2 pr-3">{s.months}</td>
                    <td className="py-2 pr-3">{s.status}</td>
                    <td className="py-2 text-right">{money0(s.totalAmount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {tieout !== null && (
            <pre className="mt-4 max-h-64 overflow-auto rounded bg-gray-50 p-3 text-xs">{JSON.stringify(tieout, null, 2)}</pre>
          )}
          <button className="mt-3 rounded border px-3 py-1.5 text-sm" onClick={async () => {
            const j = await fetch('/api/recognition/tieout').then((r) => r.json()).catch(() => null);
            if (j?.error) setError(j.error.message);
            else setTieout(j?.data ?? null);
          }}>Show tie-out</button>
        </div>
      )}

      {showContract && (
        <ContractCreateForm
          customers={customers ?? []}
          error={formError}
          busy={busy}
          onCancel={() => setShowContract(false)}
          onSubmit={async (body) => {
            setBusy(true); setFormError(null);
            try {
              await post('/api/revenue-contracts', body);
              setShowContract(false);
              onToast('Contract created');
              await loadTab('contracts', true);
            } catch (e) { setFormError(e instanceof Error ? e.message : String(e)); }
            finally { setBusy(false); }
          }}
        />
      )}

      {showSchedule && (
        <ScheduleCreateForm
          accounts={accounts ?? []}
          error={formError}
          busy={busy}
          onCancel={() => setShowSchedule(false)}
          onSubmit={async (body) => {
            setBusy(true); setFormError(null);
            try {
              await post('/api/recognition-schedules', body);
              setShowSchedule(false);
              onToast('Recognition schedule created');
              await loadTab('schedules', true);
            } catch (e) { setFormError(e instanceof Error ? e.message : String(e)); }
            finally { setBusy(false); }
          }}
        />
      )}

      {selected && (
        <ContractDrawer
          contract={selected}
          detail={detail}
          accounts={accounts ?? []}
          onClose={() => { setSelected(null); setDetail(null); }}
          onToast={onToast}
          onLoadAccounts={loadAccounts}
          onReload={async () => { await loadTab('contracts', true); if (selected) openContract(selected); }}
        />
      )}

      {selectedSched && (
        <ScheduleDrawer
          schedule={selectedSched}
          detail={schedDetail}
          onClose={() => { setSelectedSched(null); setSchedDetail(null); }}
          onToast={onToast}
          onReload={async () => { await loadTab('schedules', true); if (selectedSched) openSchedule(selectedSched); }}
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

function ContractCreateForm({ customers, error, busy, onCancel, onSubmit }: {
  customers: Party[]; error: string | null; busy: boolean;
  onCancel: () => void; onSubmit: (body: Record<string, unknown>) => Promise<void>;
}) {
  const [customer, setCustomer] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [total, setTotal] = useState('');
  return (
    <div className="fixed inset-y-0 right-0 w-full max-w-md overflow-y-auto bg-white p-6 shadow-xl">
      <h2 className="text-lg font-semibold">New revenue contract</h2>
      {error && <div className="mt-2 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      <div className="mt-4 space-y-3">
        <Field label="Customer"><select className={inputCls} value={customer} onChange={(e) => setCustomer(e.target.value)}><option value="">—</option>{customers.map((c) => <option key={c.id} value={c.id}>{c.displayName}</option>)}</select></Field>
        <Field label="Contract date"><input className={inputCls} type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Start date"><input className={inputCls} type="date" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
        <Field label="End date"><input className={inputCls} type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></Field>
        <Field label="Total transaction price"><input className={inputCls} type="number" step="0.01" min="0" value={total} onChange={(e) => setTotal(e.target.value)} /></Field>
      </div>
      <div className="mt-5 flex gap-2">
        <button className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white disabled:opacity-50" disabled={busy} onClick={() => onSubmit({ customerId: customer, contractDate: date, startDate: start || null, endDate: end || null, totalPrice: Number(total) })}>Create contract</button>
        <button className="rounded px-3 py-1.5 text-sm text-gray-600" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

function ScheduleCreateForm({ accounts, error, busy, onCancel, onSubmit }: {
  accounts: Account[]; error: string | null; busy: boolean;
  onCancel: () => void; onSubmit: (body: Record<string, unknown>) => Promise<void>;
}) {
  const [kind, setKind] = useState('prepaid_expense');
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [start, setStart] = useState(new Date().toISOString().slice(0, 10));
  const [months, setMonths] = useState('12');
  const [method, setMethod] = useState('straight_line');
  const [pl, setPl] = useState('');
  const [bal, setBal] = useState('');
  const expenseAccts = accounts.filter((a) => a.account_type === 'expense');
  const revenueAccts = accounts.filter((a) => a.account_type === 'revenue');
  const plOptions = kind === 'prepaid_expense' || kind === 'accrued_expense' ? expenseAccts : revenueAccts;
  return (
    <div className="fixed inset-y-0 right-0 w-full max-w-md overflow-y-auto bg-white p-6 shadow-xl">
      <h2 className="text-lg font-semibold">New recognition schedule</h2>
      <p className="mt-1 text-sm text-gray-600">Expense kinds need an expense account; revenue kinds need a revenue account. The balance account defaults from the role accounts when left blank.</p>
      {error && <div className="mt-2 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      <div className="mt-4 space-y-3">
        <Field label="Kind"><select className={inputCls} value={kind} onChange={(e) => setKind(e.target.value)}>{SCHEDULE_KINDS.map((k) => <option key={k} value={k}>{k.replace(/_/g, ' ')}</option>)}</select></Field>
        <Field label="Name"><input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Annual insurance premium" /></Field>
        <Field label="Total amount"><input className={inputCls} type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
        <Field label="Start date"><input className={inputCls} type="date" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
        <Field label="Months"><input className={inputCls} type="number" min="1" value={months} onChange={(e) => setMonths(e.target.value)} /></Field>
        <Field label="Method"><select className={inputCls} value={method} onChange={(e) => setMethod(e.target.value)}><option value="straight_line">Straight line</option><option value="daily">Daily</option></select></Field>
        <Field label="P&L account"><select className={inputCls} value={pl} onChange={(e) => setPl(e.target.value)}><option value="">—</option>{plOptions.map((a) => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}</select></Field>
        <Field label="Balance account (blank = role default)"><select className={inputCls} value={bal} onChange={(e) => setBal(e.target.value)}><option value="">Default</option>{accounts.filter((a) => a.account_type === 'asset' || a.account_type === 'liability').map((a) => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}</select></Field>
      </div>
      <div className="mt-5 flex gap-2">
        <button className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white disabled:opacity-50" disabled={busy} onClick={() => onSubmit({ kind, name, totalAmount: Number(amount), startDate: start, months: Number(months), method, plAccountId: pl, balanceAccountId: bal || null })}>Create schedule</button>
        <button className="rounded px-3 py-1.5 text-sm text-gray-600" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

function ContractDrawer({ contract, detail, accounts, onClose, onToast, onLoadAccounts, onReload }: {
  contract: RevenueContract; detail: Record<string, unknown> | null; accounts: Account[];
  onClose: () => void; onToast: (msg: string) => void; onLoadAccounts: () => Promise<Account[]>; onReload: () => Promise<void>;
}) {
  const [code, setCode] = useState('');
  const [desc, setDesc] = useState('');
  const [standalone, setStandalone] = useState('');
  const [allocated, setAllocated] = useState('');
  const [method, setMethod] = useState('straight_line');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [deferred, setDeferred] = useState('');
  const [revenue, setRevenue] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const post = async (url: string, body: Record<string, unknown>) => {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j?.error) throw new Error(j?.error?.message || `Request failed (${r.status})`);
    return j;
  };

  const obligations = (detail?.obligations ?? []) as Record<string, unknown>[];
  const revenueAccts = accounts.filter((a) => a.account_type === 'revenue');
  const liabilityAccts = accounts.filter((a) => a.account_type === 'liability');

  return (
    <div className="fixed inset-y-0 right-0 w-full max-w-lg overflow-y-auto bg-white p-6 shadow-xl">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{contract.contractNumber}</h2>
        <button className="text-sm text-gray-500" onClick={onClose}>Close</button>
      </div>
      <p className="mt-1 text-sm text-gray-600">{contract.customerName ?? '—'} · {contract.contractDate.slice(0, 10)} · {contract.status} · price {money0(contract.totalPrice)}</p>
      {err && <div className="mt-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>}

      <h3 className="mt-5 font-medium">Performance obligations</h3>
      {obligations.length === 0 ? <p className="mt-1 text-sm text-gray-500">No obligations yet.</p> : obligations.map((o) => {
        const schedules = (o.schedules ?? []) as Record<string, unknown>[];
        const schedTotal = schedules.reduce((s, x) => s + Number(x.scheduledAmount || 0), 0);
        const recogTotal = schedules.reduce((s, x) => s + Number(x.recognizedAmount || 0), 0);
        return (
          <div key={String(o.id)} className="mt-3 rounded border p-3">
            <div className="flex items-center justify-between">
              <div><span className="font-mono text-xs">{String(o.code)}</span> <span className="text-sm">{String(o.description || '')}</span></div>
              <span className="text-sm">{String(o.method).replace(/_/g, ' ')}</span>
            </div>
            <p className="mt-1 text-sm text-gray-600">Allocated {money0(Number(o.allocatedPrice || 0))} · scheduled {money0(schedTotal)} · recognized {money0(recogTotal)} · {o.start ? String(o.start).slice(0, 10) : '—'} → {o.end ? String(o.end).slice(0, 10) : '—'}</p>
            {schedules.length > 0 && (
              <table className="mt-2 w-full text-sm">
                <thead><tr className="text-left text-gray-500"><th className="py-1 pr-3">Period</th><th className="py-1 text-right">Scheduled</th><th className="py-1 text-right">Recognized</th><th className="py-1 pr-3">Status</th><th className="py-1" /></tr></thead>
                <tbody>{schedules.map((s) => (
                  <tr key={String(s.id)} className="border-t">
                    <td className="py-1 pr-3">{String(s.periodName ?? '—')}</td>
                    <td className="py-1 text-right">{money0(Number(s.scheduledAmount || 0))}</td>
                    <td className="py-1 text-right">{money0(Number(s.recognizedAmount || 0))}</td>
                    <td className="py-1 pr-3">{String(s.status)}</td>
                    <td className="py-1">
                      {String(s.status) !== 'recognized' && (
                        <button className="rounded border px-2 py-0.5 text-xs disabled:opacity-50" disabled={busy} onClick={async () => {
                          setBusy(true); setErr(null);
                          try { await post(`/api/revenue-schedules/${s.id}/recognize`, {}); onToast('Revenue recognized'); await onReload(); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
                        }}>Recognize</button>
                      )}
                    </td>
                  </tr>
                ))}</tbody>
              </table>
            )}
            <button className="mt-2 rounded border px-2 py-1 text-xs disabled:opacity-50" disabled={busy} onClick={async () => {
              setBusy(true); setErr(null);
              try {
                const j = await post(`/api/revenue-contracts/${contract.id}/build-schedule`, { obligationId: o.id });
                onToast(`Schedule built — ${j?.data?.rows ?? 0} rows`);
                await onReload();
              } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
              finally { setBusy(false); }
            }}>Build schedule</button>
          </div>
        );
      })}

      <div className="mt-5 rounded border p-3">
        <h3 className="font-medium">Add obligation</h3>
        <div className="mt-3 space-y-3">
          <Field label="Code"><input className={inputCls} value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. OB-1" /></Field>
          <Field label="Description"><input className={inputCls} value={desc} onChange={(e) => setDesc(e.target.value)} /></Field>
          <Field label="Standalone price"><input className={inputCls} type="number" step="0.01" min="0" value={standalone} onChange={(e) => setStandalone(e.target.value)} /></Field>
          <Field label="Allocated price"><input className={inputCls} type="number" step="0.01" min="0" value={allocated} onChange={(e) => setAllocated(e.target.value)} /></Field>
          <Field label="Recognition method"><select className={inputCls} value={method} onChange={(e) => setMethod(e.target.value)}>{OB_METHODS.map((m) => <option key={m} value={m}>{m.replace(/_/g, ' ')}</option>)}</select></Field>
          <Field label="Recognition start"><input className={inputCls} type="date" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
          <Field label="Recognition end"><input className={inputCls} type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></Field>
          <Field label="Deferred revenue account"><select className={inputCls} value={deferred} onChange={(e) => setDeferred(e.target.value)} onFocus={() => onLoadAccounts()}><option value="">—</option>{liabilityAccts.map((a) => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}</select></Field>
          <Field label="Revenue account"><select className={inputCls} value={revenue} onChange={(e) => setRevenue(e.target.value)} onFocus={() => onLoadAccounts()}><option value="">—</option>{revenueAccts.map((a) => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}</select></Field>
          <button className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white disabled:opacity-50" disabled={busy} onClick={async () => {
            setBusy(true); setErr(null);
            try {
              await post(`/api/revenue-contracts/${contract.id}/obligations`, { code, description: desc || null, standalonePrice: standalone ? Number(standalone) : null, allocatedPrice: Number(allocated), method, start: start || null, end: end || null, deferredAccountId: deferred || null, revenueAccountId: revenue || null });
              onToast('Obligation added');
              await onReload();
            } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
            finally { setBusy(false); }
          }}>Add obligation</button>
        </div>
      </div>
    </div>
  );
}

function ScheduleDrawer({ schedule, detail, onClose, onToast, onReload }: {
  schedule: RecognitionSchedule; detail: Record<string, unknown> | null;
  onClose: () => void; onToast: (msg: string) => void; onReload: () => Promise<void>;
}) {
  const [reason, setReason] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const lines = (detail?.lines ?? []) as Record<string, unknown>[];
  const recognized = lines.filter((l) => l.status === 'posted').reduce((s, l) => s + Number(l.amount || 0), 0);

  return (
    <div className="fixed inset-y-0 right-0 w-full max-w-lg overflow-y-auto bg-white p-6 shadow-xl">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{schedule.name}</h2>
        <button className="text-sm text-gray-500" onClick={onClose}>Close</button>
      </div>
      <p className="mt-1 text-sm text-gray-600">{schedule.kind.replace(/_/g, ' ')} · {schedule.method} · {schedule.months} months · total {money0(schedule.totalAmount)} · recognized {money0(recognized)} · {schedule.status}</p>
      <p className="mt-1 text-sm text-gray-600">Balance: {schedule.balanceAccountName ?? '—'} · P&L: {schedule.plAccountName ?? '—'}</p>
      {err && <div className="mt-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>}

      <h3 className="mt-5 font-medium">Lines</h3>
      {lines.length === 0 ? <p className="mt-1 text-sm text-gray-500">No lines yet.</p> : (
        <table className="mt-2 w-full text-sm">
          <thead><tr className="text-left text-gray-500"><th className="py-1 pr-3">#</th><th className="py-1 pr-3">Recognize on</th><th className="py-1 text-right">Amount</th><th className="py-1 pr-3">Status</th></tr></thead>
          <tbody>{lines.map((l) => (
            <tr key={String(l.id)} className="border-t"><td className="py-1 pr-3">{String(l.lineNo)}</td><td className="py-1 pr-3">{String(l.recognizeOn).slice(0, 10)}</td><td className="py-1 text-right">{money0(Number(l.amount || 0))}</td><td className="py-1 pr-3">{String(l.status)}</td></tr>
          ))}</tbody>
        </table>
      )}

      {schedule.status === 'active' && (
        <div className="mt-5 rounded border p-3">
          <h3 className="font-medium">Cancel schedule</h3>
          <div className="mt-3 space-y-3">
            <Field label="Reason (required)"><input className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
            <button className="rounded bg-red-600 px-3 py-1.5 text-sm text-white disabled:opacity-50" disabled={busy} onClick={async () => {
              setBusy(true); setErr(null);
              try {
                const r = await fetch(`/api/recognition-schedules/${schedule.id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason }) });
                const j = await r.json().catch(() => ({}));
                if (!r.ok || j?.error) throw new Error(j?.error?.message || `Request failed (${r.status})`);
                onToast('Schedule cancelled');
                await onReload();
              } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
              finally { setBusy(false); }
            }}>Cancel schedule</button>
          </div>
        </div>
      )}
    </div>
  );
}
