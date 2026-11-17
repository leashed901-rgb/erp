'use client';
import { useState, useEffect, useCallback } from 'react';
import type { DebtInstrument, Lease } from '@/lib/batchHTypes';

/**
 * Liabilities screen (doc 28 Batch H) — debt instruments, leases, and
 * the credit-kind bank accounts. The 'liabilities-credit' nav id
 * rendered a generic ListView of credit-kind bank accounts (the
 * tenant has none, so it was honestly empty); this dedicated screen
 * keeps that list as its third tab and adds the two real liability
 * families. Debt draw/pay go through the engine RPCs
 * (acct_record_debt_draw / acct_record_debt_payment); lease payments
 * post Dr liability + Dr interest / Cr bank through the existing
 * acct_post_entry primitive — the engine assigns no lease-liability
 * role account, so the accounts are picked, never guessed.
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
  gl_account_id?: string;
}

interface Party {
  id: string;
  displayName: string;
}

const DEBT_KINDS = ['credit_card', 'line_of_credit', 'term_loan', 'sba_loan', 'equipment_loan', 'mortgage', 'merchant_cash_advance', 'other'];
const DEBT_STATUSES = ['active', 'paid_off', 'closed', 'default'];
const LEASE_STATUSES = ['draft', 'active', 'expired', 'terminated', 'renewed', 'cancelled'];

export default function LiabilitiesScreen({ onToast }: Props) {
  type Tab = 'debt' | 'leases' | 'credit';
  const [tab, setTab] = useState<Tab>('debt');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [debts, setDebts] = useState<DebtInstrument[] | null>(null);
  const [leases, setLeases] = useState<Lease[] | null>(null);
  const [creditRows, setCreditRows] = useState<Record<string, unknown>[] | null>(null);
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [banks, setBanks] = useState<BankAccount[] | null>(null);
  const [vendors, setVendors] = useState<Party[] | null>(null);
  const [selectedDebt, setSelectedDebt] = useState<DebtInstrument | null>(null);
  const [debtDetail, setDebtDetail] = useState<Record<string, unknown> | null>(null);
  const [selectedLease, setSelectedLease] = useState<Lease | null>(null);
  const [leaseDetail, setLeaseDetail] = useState<Record<string, unknown> | null>(null);
  const [showDebt, setShowDebt] = useState(false);
  const [showLease, setShowLease] = useState(false);
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
    const list = ((j?.data || j?.rows || []) as BankAccount[]).map((b) => ({ id: b.id, name: b.name }));
    setBanks(list);
    return list;
  }, [banks]);

  const loadVendors = useCallback(async () => {
    if (vendors) return vendors;
    const j = await fetch('/api/parties?role=vendor').then((r) => r.json()).catch(() => null);
    const list = ((j?.data || []) as { id: string; displayName?: string; name?: string }[]).map((p) => ({ id: p.id, displayName: p.displayName || p.name || p.id }));
    setVendors(list);
    return list;
  }, [vendors]);

  const loadTab = useCallback(async (t: Tab, force = false) => {
    setError(null);
    setLoading(true);
    try {
      if (t === 'debt' && (force || !debts)) {
        const j = await fetch('/api/debt').then((r) => r.json()).catch(() => null);
        if (j?.error) throw new Error(j.error.message || 'Debt load failed');
        setDebts((j?.data || []) as DebtInstrument[]);
      } else if (t === 'leases' && (force || !leases)) {
        const j = await fetch('/api/leases').then((r) => r.json()).catch(() => null);
        if (j?.error) throw new Error(j.error.message || 'Leases load failed');
        setLeases((j?.data || []) as Lease[]);
      } else if (t === 'credit' && (force || !creditRows)) {
        const j = await fetch('/api/list-rows?screen=liabilities-credit').then((r) => r.json()).catch(() => null);
        if (j?.error) throw new Error(j.error.message || 'Credit accounts load failed');
        setCreditRows((j?.data || []) as Record<string, unknown>[]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [debts, leases, creditRows]);

  useEffect(() => { loadTab('debt'); }, [loadTab]);

  const openDebt = async (d: DebtInstrument) => {
    setSelectedDebt(d);
    const j = await fetch(`/api/debt/${d.id}`).then((r) => r.json()).catch(() => null);
    setDebtDetail(j?.data ?? null);
  };

  const openLease = async (l: Lease) => {
    setSelectedLease(l);
    const j = await fetch(`/api/leases/${l.id}`).then((r) => r.json()).catch(() => null);
    setLeaseDetail(j?.data ?? null);
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
        <h1 className="text-xl font-semibold">Liabilities and credit</h1>
        <div className="flex gap-2">
          {tab === 'debt' && <button className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white" onClick={() => { setShowDebt(true); setFormError(null); loadBanks(); loadVendors(); loadAccounts(); }}>New debt</button>}
          {tab === 'leases' && <button className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white" onClick={() => { setShowLease(true); setFormError(null); }}>New lease</button>}
        </div>
      </div>

      <div className="mt-4 flex gap-2 border-b pb-2">
        {([['debt', 'Debt'], ['leases', 'Leases'], ['credit', 'Credit accounts']] as [Tab, string][]).map(([k, label]) => (
          <button key={k} className={tab === k ? 'rounded bg-gray-900 px-3 py-1 text-sm text-white' : 'rounded px-3 py-1 text-sm text-gray-600 hover:bg-gray-100'} onClick={() => { setTab(k); loadTab(k); }}>{label}</button>
        ))}
      </div>

      {error && <div className="mt-4 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {loading && <div className="mt-4 text-sm text-gray-500">Loading…</div>}

      {!loading && tab === 'debt' && (
        <div className="mt-4 overflow-x-auto">
          {(debts?.length ?? 0) === 0 ? (
            <p className="text-sm text-gray-500">No debt instruments yet. APR is a fraction (0.07 = 7%/yr); credit cards and lines of credit need a credit limit.</p>
          ) : (
            <table className="w-full text-sm">
              <thead><tr className="text-left text-gray-500"><th className="py-2 pr-3">Name</th><th className="py-2 pr-3">Kind</th><th className="py-2 pr-3">APR</th><th className="py-2 pr-3">Status</th><th className="py-2 text-right">Balance owed</th></tr></thead>
              <tbody>
                {debts!.map((d) => (
                  <tr key={d.id} className="cursor-pointer border-t hover:bg-gray-50" onClick={() => openDebt(d)}>
                    <td className="py-2 pr-3">{d.name}</td>
                    <td className="py-2 pr-3">{d.kind.replace(/_/g, ' ')}</td>
                    <td className="py-2 pr-3">{(d.apr * 100).toFixed(2)}%</td>
                    <td className="py-2 pr-3">{d.status.replace(/_/g, ' ')}</td>
                    <td className="py-2 text-right">{money0(d.balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {!loading && tab === 'leases' && (
        <div className="mt-4 overflow-x-auto">
          {(leases?.length ?? 0) === 0 ? (
            <p className="text-sm text-gray-500">No leases yet. The ROU asset and lease liability are amounts on the lease — the engine books no journal at creation.</p>
          ) : (
            <table className="w-full text-sm">
              <thead><tr className="text-left text-gray-500"><th className="py-2 pr-3">Number</th><th className="py-2 pr-3">Counterparty</th><th className="py-2 pr-3">Term</th><th className="py-2 pr-3">Status</th><th className="py-2 text-right">ROU asset</th><th className="py-2 text-right">Liability</th></tr></thead>
              <tbody>
                {leases!.map((l) => (
                  <tr key={l.id} className="cursor-pointer border-t hover:bg-gray-50" onClick={() => openLease(l)}>
                    <td className="py-2 pr-3 font-mono text-xs">{l.leaseNumber}</td>
                    <td className="py-2 pr-3">{l.counterparty}</td>
                    <td className="py-2 pr-3">{l.commencement.slice(0, 10)} → {l.end.slice(0, 10)}</td>
                    <td className="py-2 pr-3">{l.status}</td>
                    <td className="py-2 text-right">{money0(l.rouAsset)}</td>
                    <td className="py-2 text-right">{money0(l.liability)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {!loading && tab === 'credit' && (
        <div className="mt-4 overflow-x-auto">
          {(creditRows?.length ?? 0) === 0 ? (
            <p className="text-sm text-gray-500">No credit-card, loan, or credit-line bank accounts. The tenant has none, so this is honestly empty.</p>
          ) : (
            <table className="w-full text-sm">
              <thead><tr className="text-left text-gray-500"><th className="py-2 pr-3">Account</th><th className="py-2 pr-3">Institution</th><th className="py-2 pr-3">Kind</th><th className="py-2 pr-3">Limit</th><th className="py-2 text-right">Balance</th></tr></thead>
              <tbody>
                {creditRows!.map((r, i) => (
                  <tr key={i} className="border-t"><td className="py-2 pr-3">{String(r.account ?? '—')}</td><td className="py-2 pr-3">{String(r.institution ?? '—')}</td><td className="py-2 pr-3">{String(r.kind ?? '—')}</td><td className="py-2 pr-3">{String(r.limit ?? '—')}</td><td className="py-2 text-right">{String(r.balance ?? '—')}</td></tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {showDebt && (
        <DebtCreateForm
          banks={banks ?? []}
          vendors={vendors ?? []}
          accounts={accounts ?? []}
          error={formError}
          busy={busy}
          onCancel={() => setShowDebt(false)}
          onSubmit={async (body) => {
            setBusy(true); setFormError(null);
            try {
              await post('/api/debt', body);
              setShowDebt(false);
              onToast('Debt instrument created');
              await loadTab('debt', true);
            } catch (e) { setFormError(e instanceof Error ? e.message : String(e)); }
            finally { setBusy(false); }
          }}
        />
      )}

      {showLease && (
        <LeaseCreateForm
          error={formError}
          busy={busy}
          onCancel={() => setShowLease(false)}
          onSubmit={async (body) => {
            setBusy(true); setFormError(null);
            try {
              await post('/api/leases', body);
              setShowLease(false);
              onToast('Lease created');
              await loadTab('leases', true);
            } catch (e) { setFormError(e instanceof Error ? e.message : String(e)); }
            finally { setBusy(false); }
          }}
        />
      )}

      {selectedDebt && (
        <DebtDrawer
          debt={selectedDebt}
          detail={debtDetail}
          banks={banks ?? []}
          onClose={() => { setSelectedDebt(null); setDebtDetail(null); }}
          onToast={onToast}
          onLoadBanks={loadBanks}
          onReload={async () => { await loadTab('debt', true); if (selectedDebt) openDebt(selectedDebt); }}
        />
      )}

      {selectedLease && (
        <LeaseDrawer
          lease={selectedLease}
          detail={leaseDetail}
          banks={banks ?? []}
          accounts={accounts ?? []}
          onClose={() => { setSelectedLease(null); setLeaseDetail(null); }}
          onToast={onToast}
          onLoadBanks={loadBanks}
          onLoadAccounts={loadAccounts}
          onReload={async () => { await loadTab('leases', true); if (selectedLease) openLease(selectedLease); }}
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

function DebtCreateForm({ banks, vendors, accounts, error, busy, onCancel, onSubmit }: {
  banks: BankAccount[]; vendors: Party[]; accounts: Account[]; error: string | null; busy: boolean;
  onCancel: () => void; onSubmit: (body: Record<string, unknown>) => Promise<void>;
}) {
  const [kind, setKind] = useState('term_loan');
  const [name, setName] = useState('');
  const [lender, setLender] = useState('');
  const [bank, setBank] = useState('');
  const [apr, setApr] = useState('');
  const [principal, setPrincipal] = useState('');
  const [limit, setLimit] = useState('');
  const [term, setTerm] = useState('');
  const [start, setStart] = useState(new Date().toISOString().slice(0, 10));
  const [freq, setFreq] = useState('monthly');
  const [amount, setAmount] = useState('');
  const [day, setDay] = useState('');
  const [interestAcct, setInterestAcct] = useState('');
  const [feesAcct, setFeesAcct] = useState('');
  const [notes, setNotes] = useState('');
  const expenseAccts = accounts.filter((a) => a.account_type === 'expense');
  return (
    <div className="fixed inset-y-0 right-0 w-full max-w-md overflow-y-auto bg-white p-6 shadow-xl">
      <h2 className="text-lg font-semibold">New debt instrument</h2>
      {error && <div className="mt-2 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      <div className="mt-4 space-y-3">
        <Field label="Kind"><select className={inputCls} value={kind} onChange={(e) => setKind(e.target.value)}>{DEBT_KINDS.map((k) => <option key={k} value={k}>{k.replace(/_/g, ' ')}</option>)}</select></Field>
        <Field label="Name"><input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. SBA 7(a) loan" /></Field>
        <Field label="Lender (vendor)"><select className={inputCls} value={lender} onChange={(e) => setLender(e.target.value)}><option value="">—</option>{vendors.map((v) => <option key={v.id} value={v.id}>{v.displayName}</option>)}</select></Field>
        <Field label="Bank account (the instrument books against it)"><select className={inputCls} value={bank} onChange={(e) => setBank(e.target.value)}><option value="">—</option>{banks.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>
        <Field label="APR, as a fraction (0.07 = 7%/yr)"><input className={inputCls} type="number" step="0.0001" min="0" max="0.9999" value={apr} onChange={(e) => setApr(e.target.value)} placeholder="0.07" /></Field>
        <Field label="Original principal"><input className={inputCls} type="number" step="0.01" min="0" value={principal} onChange={(e) => setPrincipal(e.target.value)} /></Field>
        {(kind === 'credit_card' || kind === 'line_of_credit') && <Field label="Credit limit (required for this kind)"><input className={inputCls} type="number" step="0.01" min="0" value={limit} onChange={(e) => setLimit(e.target.value)} /></Field>}
        <Field label="Term (months)"><input className={inputCls} type="number" min="1" value={term} onChange={(e) => setTerm(e.target.value)} /></Field>
        <Field label="Start date"><input className={inputCls} type="date" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
        <Field label="Payment frequency"><select className={inputCls} value={freq} onChange={(e) => setFreq(e.target.value)}>{['weekly', 'biweekly', 'monthly', 'quarterly', 'annual'].map((f) => <option key={f} value={f}>{f}</option>)}</select></Field>
        <Field label="Payment amount"><input className={inputCls} type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
        <Field label="Payment day of month"><input className={inputCls} type="number" min="1" max="31" value={day} onChange={(e) => setDay(e.target.value)} /></Field>
        <Field label="Interest expense account"><select className={inputCls} value={interestAcct} onChange={(e) => setInterestAcct(e.target.value)}><option value="">—</option>{expenseAccts.map((a) => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}</select></Field>
        <Field label="Fees account"><select className={inputCls} value={feesAcct} onChange={(e) => setFeesAcct(e.target.value)}><option value="">—</option>{expenseAccts.map((a) => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}</select></Field>
        <Field label="Notes"><input className={inputCls} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      </div>
      <div className="mt-5 flex gap-2">
        <button className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white disabled:opacity-50" disabled={busy} onClick={() => onSubmit({ kind, name, lenderVendorId: lender || null, bankAccountId: bank, apr: Number(apr), originalPrincipal: principal ? Number(principal) : null, creditLimit: limit ? Number(limit) : null, termMonths: term ? Number(term) : null, startDate: start, paymentFrequency: freq, paymentAmount: amount ? Number(amount) : null, paymentDay: day ? Number(day) : null, interestExpenseAccountId: interestAcct || null, feesAccountId: feesAcct || null, notes: notes || null })}>Create debt</button>
        <button className="rounded px-3 py-1.5 text-sm text-gray-600" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

function LeaseCreateForm({ error, busy, onCancel, onSubmit }: {
  error: string | null; busy: boolean; onCancel: () => void; onSubmit: (body: Record<string, unknown>) => Promise<void>;
}) {
  const [counterparty, setCounterparty] = useState('');
  const [commencement, setCommencement] = useState(new Date().toISOString().slice(0, 10));
  const [end, setEnd] = useState('');
  const [freq, setFreq] = useState('monthly');
  const [discount, setDiscount] = useState('');
  const [rou, setRou] = useState('');
  const [liability, setLiability] = useState('');
  const [direct, setDirect] = useState('');
  const [incentive, setIncentive] = useState('');
  return (
    <div className="fixed inset-y-0 right-0 w-full max-w-md overflow-y-auto bg-white p-6 shadow-xl">
      <h2 className="text-lg font-semibold">New lease</h2>
      {error && <div className="mt-2 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      <div className="mt-4 space-y-3">
        <Field label="Counterparty"><input className={inputCls} value={counterparty} onChange={(e) => setCounterparty(e.target.value)} placeholder="e.g. Memphis Industrial LLC" /></Field>
        <Field label="Commencement date"><input className={inputCls} type="date" value={commencement} onChange={(e) => setCommencement(e.target.value)} /></Field>
        <Field label="End date"><input className={inputCls} type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></Field>
        <Field label="Payment frequency"><select className={inputCls} value={freq} onChange={(e) => setFreq(e.target.value)}>{['weekly', 'biweekly', 'monthly', 'quarterly', 'annual'].map((f) => <option key={f} value={f}>{f}</option>)}</select></Field>
        <Field label="Discount rate, as a fraction (0.07 = 7%)"><input className={inputCls} type="number" step="0.0001" min="0" max="0.9999" value={discount} onChange={(e) => setDiscount(e.target.value)} placeholder="0.07" /></Field>
        <Field label="Right-of-use asset"><input className={inputCls} type="number" step="0.01" min="0" value={rou} onChange={(e) => setRou(e.target.value)} /></Field>
        <Field label="Lease liability"><input className={inputCls} type="number" step="0.01" min="0" value={liability} onChange={(e) => setLiability(e.target.value)} /></Field>
        <Field label="Initial direct cost"><input className={inputCls} type="number" step="0.01" min="0" value={direct} onChange={(e) => setDirect(e.target.value)} /></Field>
        <Field label="Lease incentive"><input className={inputCls} type="number" step="0.01" min="0" value={incentive} onChange={(e) => setIncentive(e.target.value)} /></Field>
      </div>
      <div className="mt-5 flex gap-2">
        <button className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white disabled:opacity-50" disabled={busy} onClick={() => onSubmit({ counterparty, commencement, end, paymentFrequency: freq, discountRate: Number(discount), rouAsset: Number(rou || 0), liability: Number(liability || 0), initialDirectCost: Number(direct || 0), incentive: Number(incentive || 0) })}>Create lease</button>
        <button className="rounded px-3 py-1.5 text-sm text-gray-600" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

function DebtDrawer({ debt, detail, banks, onClose, onToast, onLoadBanks, onReload }: {
  debt: DebtInstrument; detail: Record<string, unknown> | null; banks: BankAccount[];
  onClose: () => void; onToast: (msg: string) => void; onLoadBanks: () => Promise<BankAccount[]>; onReload: () => Promise<void>;
}) {
  const [drawTo, setDrawTo] = useState('');
  const [drawDate, setDrawDate] = useState(new Date().toISOString().slice(0, 10));
  const [drawAmount, setDrawAmount] = useState('');
  const [drawFees, setDrawFees] = useState('');
  const [payFrom, setPayFrom] = useState('');
  const [payDate, setPayDate] = useState(new Date().toISOString().slice(0, 10));
  const [payAmount, setPayAmount] = useState('');
  const [payInterest, setPayInterest] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const post = async (url: string, body: Record<string, unknown>) => {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j?.error) throw new Error(j?.error?.message || `Request failed (${r.status})`);
    return j;
  };

  const schedule = (detail?.schedule ?? []) as Record<string, unknown>[];
  const balance = detail ? Number((detail as Record<string, unknown>).balance ?? debt.balance) : debt.balance;

  return (
    <div className="fixed inset-y-0 right-0 w-full max-w-lg overflow-y-auto bg-white p-6 shadow-xl">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{debt.name}</h2>
        <button className="text-sm text-gray-500" onClick={onClose}>Close</button>
      </div>
      <p className="mt-1 text-sm text-gray-600">{debt.kind.replace(/_/g, ' ')} · {(debt.apr * 100).toFixed(2)}% APR · {debt.status.replace(/_/g, ' ')} · balance owed {money0(balance)}</p>
      {err && <div className="mt-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>}

      <div className="mt-4 flex gap-2">
        {DEBT_STATUSES.filter((s) => s !== debt.status).map((s) => (
          <button key={s} className="rounded border px-2 py-1 text-xs" onClick={async () => {
            setBusy(true); setErr(null);
            try { await post(`/api/debt/${debt.id}/status`, { status: s }); onToast(`Debt marked ${s.replace(/_/g, ' ')}`); await onReload(); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
          }}>{s.replace(/_/g, ' ')}</button>
        ))}
      </div>

      <h3 className="mt-5 font-medium">Amortization schedule</h3>
      {schedule.length === 0 ? <p className="mt-1 text-sm text-gray-500">No schedule rows — draws record against the balance without a schedule.</p> : (
        <table className="mt-2 w-full text-sm">
          <thead><tr className="text-left text-gray-500"><th className="py-1 pr-3">#</th><th className="py-1 pr-3">Due</th><th className="py-1 text-right">Payment</th><th className="py-1 text-right">Principal</th><th className="py-1 text-right">Interest</th><th className="py-1 pr-3">Status</th></tr></thead>
          <tbody>{schedule.map((s) => (
            <tr key={String(s.id)} className="border-t"><td className="py-1 pr-3">{String(s.installmentNo)}</td><td className="py-1 pr-3">{String(s.dueDate).slice(0, 10)}</td><td className="py-1 text-right">{money0(Number(s.payment || 0))}</td><td className="py-1 text-right">{money0(Number(s.principal || 0))}</td><td className="py-1 text-right">{money0(Number(s.interest || 0))}</td><td className="py-1 pr-3">{String(s.status)}</td></tr>
          ))}</tbody>
        </table>
      )}

      <div className="mt-5 rounded border p-3">
        <h3 className="font-medium">Record a draw</h3>
        <div className="mt-3 space-y-3">
          <Field label="Draw into bank account"><select className={inputCls} value={drawTo} onChange={(e) => setDrawTo(e.target.value)} onFocus={() => onLoadBanks()}><option value="">—</option>{banks.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>
          <Field label="Date"><input className={inputCls} type="date" value={drawDate} onChange={(e) => setDrawDate(e.target.value)} /></Field>
          <Field label="Amount"><input className={inputCls} type="number" step="0.01" min="0" value={drawAmount} onChange={(e) => setDrawAmount(e.target.value)} /></Field>
          <Field label="Fees"><input className={inputCls} type="number" step="0.01" min="0" value={drawFees} onChange={(e) => setDrawFees(e.target.value)} /></Field>
          <button className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white disabled:opacity-50" disabled={busy} onClick={async () => {
            setBusy(true); setErr(null);
            try { await post(`/api/debt/${debt.id}/draw`, { toBankAccountId: drawTo, date: drawDate, amount: Number(drawAmount), fees: drawFees ? Number(drawFees) : null }); onToast('Draw recorded'); await onReload(); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
          }}>Record draw</button>
        </div>
      </div>

      <div className="mt-5 rounded border p-3">
        <h3 className="font-medium">Record a payment</h3>
        <p className="mt-1 text-sm text-gray-600">Interest defaults to the next scheduled installment&apos;s interest; principal above the balance owed is refused.</p>
        <div className="mt-3 space-y-3">
          <Field label="Pay from bank account"><select className={inputCls} value={payFrom} onChange={(e) => setPayFrom(e.target.value)} onFocus={() => onLoadBanks()}><option value="">—</option>{banks.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>
          <Field label="Date"><input className={inputCls} type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} /></Field>
          <Field label="Amount"><input className={inputCls} type="number" step="0.01" min="0" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} /></Field>
          <Field label="Interest portion (blank = from schedule)"><input className={inputCls} type="number" step="0.01" min="0" value={payInterest} onChange={(e) => setPayInterest(e.target.value)} /></Field>
          <button className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white disabled:opacity-50" disabled={busy} onClick={async () => {
            setBusy(true); setErr(null);
            try { await post(`/api/debt/${debt.id}/pay`, { fromBankAccountId: payFrom, date: payDate, amount: Number(payAmount), interest: payInterest ? Number(payInterest) : null, idempotencyKey: `debt-pay-${debt.id}-${payDate}-${payAmount}-${Date.now()}` }); onToast('Payment recorded'); await onReload(); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
          }}>Record payment</button>
        </div>
      </div>
    </div>
  );
}

function LeaseDrawer({ lease, detail, banks, accounts, onClose, onToast, onLoadBanks, onLoadAccounts, onReload }: {
  lease: Lease; detail: Record<string, unknown> | null; banks: BankAccount[]; accounts: Account[];
  onClose: () => void; onToast: (msg: string) => void; onLoadBanks: () => Promise<BankAccount[]>; onLoadAccounts: () => Promise<Account[]>; onReload: () => Promise<void>;
}) {
  const [payDate, setPayDate] = useState(new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState('');
  const [principal, setPrincipal] = useState('');
  const [interest, setInterest] = useState('');
  const [fromBank, setFromBank] = useState('');
  const [liabAcct, setLiabAcct] = useState('');
  const [intAcct, setIntAcct] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const post = async (url: string, body: Record<string, unknown>, method = 'POST') => {
    const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j?.error) throw new Error(j?.error?.message || `Request failed (${r.status})`);
    return j;
  };

  const payments = (detail?.payments ?? []) as Record<string, unknown>[];
  const liabilityAccts = accounts.filter((a) => a.account_type === 'liability');
  const expenseAccts = accounts.filter((a) => a.account_type === 'expense');

  return (
    <div className="fixed inset-y-0 right-0 w-full max-w-lg overflow-y-auto bg-white p-6 shadow-xl">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{lease.leaseNumber}</h2>
        <button className="text-sm text-gray-500" onClick={onClose}>Close</button>
      </div>
      <p className="mt-1 text-sm text-gray-600">{lease.counterparty} · {lease.commencement.slice(0, 10)} → {lease.end.slice(0, 10)} · {lease.status} · ROU {money0(lease.rouAsset)} · liability {money0(lease.liability)}</p>
      {err && <div className="mt-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>}

      <div className="mt-4 flex gap-2">
        {LEASE_STATUSES.filter((s) => s !== lease.status).map((s) => (
          <button key={s} className="rounded border px-2 py-1 text-xs" onClick={async () => {
            setBusy(true); setErr(null);
            try { await post(`/api/leases/${lease.id}`, { status: s }, 'PATCH'); onToast(`Lease marked ${s}`); await onReload(); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
          }}>{s}</button>
        ))}
      </div>

      <h3 className="mt-5 font-medium">Payments</h3>
      {payments.length === 0 ? <p className="mt-1 text-sm text-gray-500">No payments recorded yet.</p> : (
        <table className="mt-2 w-full text-sm">
          <thead><tr className="text-left text-gray-500"><th className="py-1 pr-3">Date</th><th className="py-1 text-right">Amount</th><th className="py-1 text-right">Principal</th><th className="py-1 text-right">Interest</th><th className="py-1 pr-3">Status</th></tr></thead>
          <tbody>{payments.map((p) => (
            <tr key={String(p.id)} className="border-t"><td className="py-1 pr-3">{String(p.paymentDate).slice(0, 10)}</td><td className="py-1 text-right">{money0(Number(p.amount || 0))}</td><td className="py-1 text-right">{money0(Number(p.principal || 0))}</td><td className="py-1 text-right">{money0(Number(p.interest || 0))}</td><td className="py-1 pr-3">{String(p.status)}</td></tr>
          ))}</tbody>
        </table>
      )}

      <div className="mt-5 rounded border p-3">
        <h3 className="font-medium">Record a payment</h3>
        <p className="mt-1 text-sm text-gray-600">Posts Dr lease liability (principal) + Dr interest expense / Cr bank. The engine assigns no lease-liability role account, so pick both accounts.</p>
        <div className="mt-3 space-y-3">
          <Field label="Payment date"><input className={inputCls} type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} /></Field>
          <Field label="Amount"><input className={inputCls} type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
          <Field label="Principal"><input className={inputCls} type="number" step="0.01" min="0" value={principal} onChange={(e) => setPrincipal(e.target.value)} /></Field>
          <Field label="Interest"><input className={inputCls} type="number" step="0.01" min="0" value={interest} onChange={(e) => setInterest(e.target.value)} /></Field>
          <Field label="Pay from bank account"><select className={inputCls} value={fromBank} onChange={(e) => setFromBank(e.target.value)} onFocus={() => onLoadBanks()}><option value="">—</option>{banks.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>
          <Field label="Lease liability account"><select className={inputCls} value={liabAcct} onChange={(e) => setLiabAcct(e.target.value)} onFocus={() => onLoadAccounts()}><option value="">—</option>{liabilityAccts.map((a) => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}</select></Field>
          <Field label="Interest expense account"><select className={inputCls} value={intAcct} onChange={(e) => setIntAcct(e.target.value)} onFocus={() => onLoadAccounts()}><option value="">—</option>{expenseAccts.map((a) => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}</select></Field>
          <button className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white disabled:opacity-50" disabled={busy} onClick={async () => {
            setBusy(true); setErr(null);
            try { await post(`/api/leases/${lease.id}/payments`, { paymentDate: payDate, amount: Number(amount), principal: Number(principal), interest: Number(interest), fromBankAccountId: fromBank, liabilityAccountId: liabAcct, interestAccountId: intAcct || null }); onToast('Lease payment recorded'); await onReload(); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
          }}>Record payment</button>
        </div>
      </div>
    </div>
  );
}
