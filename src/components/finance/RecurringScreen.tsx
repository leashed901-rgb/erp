'use client';
import { useState, useEffect, useCallback } from 'react';
import type { RecurringInvoice, RecurringBill, RecurringJournal, RecurringInvoiceLine } from '@/lib/batchITypes';
import { fmtMoney, fmtDate, cap } from '@/lib/batchITypes';

/**
 * Recurring screen (doc 28 Batch I) — recurring invoices, bills
 * and journals. Invoices and bills run through the engine runners
 * (acct_run_recurring_invoices / acct_run_recurring_bills); journals
 * run through POST /api/recurring-journals/run, which posts every due
 * active template through acct_post_entry and advances the schedule.
 * Only active schedules whose next run date has arrived produce
 * documents, and the runner advances the schedule.
 */

const FREQUENCIES = ['weekly', 'biweekly', 'monthly', 'quarterly', 'annually', 'yearly'];

interface Props {
  onToast: (msg: string) => void;
}

interface Vendor {
  id: string;
  name: string;
}

interface Book {
  id: string;
  name: string;
}

interface LineDraft {
  description: string;
  quantity: string;
  unitPrice: string;
  taxAmount: string;
  accountId: string;
}

interface ChartAccount {
  id: string;
  code: string;
  name: string;
}

export default function RecurringScreen({ onToast }: Props) {
  type Tab = 'invoices' | 'bills' | 'journals';
  const [tab, setTab] = useState<Tab>('invoices');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [invoices, setInvoices] = useState<RecurringInvoice[] | null>(null);
  const [bills, setBills] = useState<RecurringBill[] | null>(null);
  const [journals, setJournals] = useState<RecurringJournal[] | null>(null);
  const [selectedInvoice, setSelectedInvoice] = useState<RecurringInvoice | null>(null);
  const [invoiceDetail, setInvoiceDetail] = useState<RecurringInvoiceLine[] | null>(null);
  const [selectedBill, setSelectedBill] = useState<RecurringBill | null>(null);
  const [billDetail, setBillDetail] = useState<{ lines: { description?: string; quantity?: number; unit_price?: number; line_total?: number }[] } | null>(null);
  const [selectedJournal, setSelectedJournal] = useState<RecurringJournal | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [asOf, setAsOf] = useState(new Date().toISOString().slice(0, 10));

  const loadTab = useCallback(async (t: Tab, force = false) => {
    setError(null);
    setLoading(true);
    try {
      if (t === 'invoices' && (force || !invoices)) {
        const j = await fetch('/api/recurring-invoices').then((r) => r.json()).catch(() => null);
        if (j?.error) throw new Error(j.error.message || 'Recurring invoices load failed');
        setInvoices((j?.data || []) as RecurringInvoice[]);
      } else if (t === 'bills' && (force || !bills)) {
        const j = await fetch('/api/recurring-bills').then((r) => r.json()).catch(() => null);
        if (j?.error) throw new Error(j.error.message || 'Recurring bills load failed');
        setBills((j?.data || []) as RecurringBill[]);
      } else if (t === 'journals' && (force || !journals)) {
        const j = await fetch('/api/recurring-journals').then((r) => r.json()).catch(() => null);
        if (j?.error) throw new Error(j.error.message || 'Recurring journals load failed');
        setJournals((j?.data || []) as RecurringJournal[]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [invoices, bills, journals]);

  useEffect(() => { loadTab('invoices'); }, [loadTab]);

  const openInvoice = async (r: RecurringInvoice) => {
    setSelectedInvoice(r);
    const j = await fetch(`/api/recurring-invoices/${r.id}`).then((r) => r.json()).catch(() => null);
    setInvoiceDetail(((j?.data?.lines || []) as RecurringInvoiceLine[]));
  };

  const openBill = async (r: RecurringBill) => {
    setSelectedBill(r);
    const j = await fetch(`/api/recurring-bills/${r.id}`).then((r) => r.json()).catch(() => null);
    setBillDetail(j?.data ? { lines: (j.data.lines || []) as { description?: string; quantity?: number; unit_price?: number; line_total?: number }[] } : null);
  };
  const post = async (url: string, body: Record<string, unknown>, method = 'POST') => {
    const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j?.error) throw new Error(j?.error?.message || `Request failed (${r.status})`);
    return j;
  };

  const run = async (kind: 'invoices' | 'bills' | 'journals') => {
    setBusy(true); setError(null);
    try {
      const j = await post(`/api/recurring-${kind}/run`, { asOf });
      if (kind === 'journals') {
        const posted = Number(j?.data?.postedCount ?? 0);
        const failed = Number(j?.data?.failedCount ?? 0);
        onToast(posted === 0 && failed === 0 ? `Nothing due as of ${asOf}` : `Ran journals — ${posted} posted${failed ? `, ${failed} failed` : ''}`);
        if (failed > 0) setError((j?.data?.failed as { name: string; reason: string }[] || []).map((f) => `${f.name}: ${f.reason}`).join('; '));
      } else {
        const n = kind === 'invoices' ? Number(j?.data?.invoicesCreated ?? 0) : Number(j?.data?.billsCreated ?? 0);
        onToast(n === 0 ? `Nothing due as of ${asOf}` : `Ran ${kind} — ${n} created`);
      }
      await loadTab(kind, true);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Recurring</h1>
        <div className="flex gap-2">
          {tab !== 'journals' && <button className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white" onClick={() => { setShowCreate(true); setFormError(null); }}>New schedule</button>}
          {tab === 'journals' && <button className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white" onClick={() => { setShowCreate(true); setFormError(null); }}>New template</button>}
        </div>
      </div>

      <div className="mt-4 flex gap-2 border-b pb-2">
        {([['invoices', 'Invoices'], ['bills', 'Bills'], ['journals', 'Journals']] as [Tab, string][]).map(([k, label]) => (
          <button key={k} className={tab === k ? 'rounded bg-gray-900 px-3 py-1 text-sm text-white' : 'rounded px-3 py-1 text-sm text-gray-600 hover:bg-gray-100'} onClick={() => { setTab(k); loadTab(k); }}>{label}</button>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-end gap-2">
        <label className="block text-sm"><span className="text-gray-600">Run as of</span><div className="mt-1"><input className="w-full rounded border px-2 py-1.5 text-sm" type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} /></div></label>
        <button className="rounded bg-gray-900 px-3 py-1.5 text-sm text-white disabled:opacity-50" disabled={busy} onClick={() => run(tab)}>{tab === 'journals' ? 'Run journals' : tab === 'invoices' ? 'Run invoices' : 'Run bills'}</button>
        <span className="text-sm text-gray-500">{tab === 'journals' ? 'Posts every due active template as a journal, then advances the schedule.' : 'Creates documents for every active schedule whose next run date has arrived, then advances the schedule.'}</span>
      </div>

      {error && <div className="mt-4 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {loading && <div className="mt-4 text-sm text-gray-500">Loading…</div>}

      {!loading && tab === 'invoices' && (
        <div className="mt-4 overflow-x-auto">
          {(invoices?.length ?? 0) === 0 ? (
            <p className="text-sm text-gray-500">No recurring invoice schedules. A schedule bills a customer on a frequency — the runner creates and posts the invoice when its next run date arrives.</p>
          ) : (
            <table className="w-full text-sm">
              <thead><tr className="text-left text-gray-500"><th className="py-2 pr-3">Name</th><th className="py-2 pr-3">Customer</th><th className="py-2 pr-3">Frequency</th><th className="py-2 pr-3">Next run</th><th className="py-2 pr-3">Status</th><th className="py-2 text-right">Amount</th></tr></thead>
              <tbody>
                {invoices!.map((r) => (
                  <tr key={r.id} className="cursor-pointer border-t hover:bg-gray-50" onClick={() => openInvoice(r)}>
                    <td className="py-2 pr-3">{r.name}</td>
                    <td className="py-2 pr-3">{r.customer}</td>
                    <td className="py-2 pr-3">{r.frequency}{r.intervalCount > 1 ? ` × ${r.intervalCount}` : ''}</td>
                    <td className="py-2 pr-3">{fmtDate(r.nextRunDate)}</td>
                    <td className="py-2 pr-3">{cap(r.status)}</td>
                    <td className="py-2 text-right">{fmtMoney(r.totalAmount)} {r.currency}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {!loading && tab === 'bills' && (
        <div className="mt-4 overflow-x-auto">
          {(bills?.length ?? 0) === 0 ? (
            <p className="text-sm text-gray-500">No recurring bill schedules. A schedule creates an AP bill from a vendor on a frequency — auto-post bills are posted by the runner.</p>
          ) : (
            <table className="w-full text-sm">
              <thead><tr className="text-left text-gray-500"><th className="py-2 pr-3">Name</th><th className="py-2 pr-3">Vendor</th><th className="py-2 pr-3">Frequency</th><th className="py-2 pr-3">Next run</th><th className="py-2 pr-3">Auto-post</th><th className="py-2 pr-3">Active</th><th className="py-2 text-right">Amount</th></tr></thead>
              <tbody>
                {bills!.map((r) => (
                  <tr key={r.id} className="cursor-pointer border-t hover:bg-gray-50" onClick={() => openBill(r)}>
                    <td className="py-2 pr-3">{r.name}</td>
                    <td className="py-2 pr-3">{r.vendor}</td>
                    <td className="py-2 pr-3">{r.frequency}{r.intervalCount > 1 ? ` × ${r.intervalCount}` : ''}</td>
                    <td className="py-2 pr-3">{fmtDate(r.nextRunDate)}</td>
                    <td className="py-2 pr-3">{r.autoPost ? 'Yes' : 'No'}</td>
                    <td className="py-2 pr-3">{r.isActive ? 'Yes' : 'No'}</td>
                    <td className="py-2 text-right">{fmtMoney(r.totalAmount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {!loading && tab === 'journals' && (
        <div className="mt-4 overflow-x-auto">
          {(journals?.length ?? 0) === 0 ? (
            <p className="text-sm text-gray-500">No recurring journal templates. A template is a balanced set of lines the runner posts on a frequency — run it from the Run journals button above.</p>
          ) : (
            <table className="w-full text-sm">
              <thead><tr className="text-left text-gray-500"><th className="py-2 pr-3">Name</th><th className="py-2 pr-3">Book</th><th className="py-2 pr-3">Frequency</th><th className="py-2 pr-3">Next run</th><th className="py-2 pr-3">Active</th></tr></thead>
              <tbody>
                {journals!.map((r) => (
                  <tr key={r.id} className="cursor-pointer border-t hover:bg-gray-50" onClick={() => setSelectedJournal(r)}>
                    <td className="py-2 pr-3">{r.name}</td>
                    <td className="py-2 pr-3">{r.book}</td>
                    <td className="py-2 pr-3">{r.frequency}{r.intervalN > 1 ? ` × ${r.intervalN}` : ''}</td>
                    <td className="py-2 pr-3">{fmtDate(r.nextRunDate)}</td>
                    <td className="py-2 pr-3">{r.active ? 'Yes' : 'No'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {showCreate && tab === 'invoices' && (
        <ScheduleCreateForm
          kind="invoices"
          error={formError}
          busy={busy}
          onCancel={() => setShowCreate(false)}
          onSubmit={async (body) => {
            setBusy(true); setFormError(null);
            try {
              await post('/api/recurring-invoices', body);
              setShowCreate(false);
              onToast('Recurring invoice schedule created');
              await loadTab('invoices', true);
            } catch (e) { setFormError(e instanceof Error ? e.message : String(e)); }
            finally { setBusy(false); }
          }}
        />
      )}

      {showCreate && tab === 'bills' && (
        <ScheduleCreateForm
          kind="bills"
          error={formError}
          busy={busy}
          onCancel={() => setShowCreate(false)}
          onSubmit={async (body) => {
            setBusy(true); setFormError(null);
            try {
              await post('/api/recurring-bills', body);
              setShowCreate(false);
              onToast('Recurring bill schedule created');
              await loadTab('bills', true);
            } catch (e) { setFormError(e instanceof Error ? e.message : String(e)); }
            finally { setBusy(false); }
          }}
        />
      )}

      {showCreate && tab === 'journals' && (
        <JournalCreateForm
          error={formError}
          busy={busy}
          onCancel={() => setShowCreate(false)}
          onSubmit={async (body) => {
            setBusy(true); setFormError(null);
            try {
              await post('/api/recurring-journals', body);
              setShowCreate(false);
              onToast('Recurring journal template created');
              await loadTab('journals', true);
            } catch (e) { setFormError(e instanceof Error ? e.message : String(e)); }
            finally { setBusy(false); }
          }}
        />
      )}

      {selectedInvoice && (
        <InvoiceDrawer
          schedule={selectedInvoice}
          lines={invoiceDetail}
          onClose={() => { setSelectedInvoice(null); setInvoiceDetail(null); }}
          onToast={onToast}
          onReload={async () => { await loadTab('invoices', true); if (selectedInvoice) openInvoice(selectedInvoice); }}
        />
      )}

      {selectedBill && (
        <BillDrawer
          schedule={selectedBill}
          lines={billDetail?.lines ?? null}
          onClose={() => { setSelectedBill(null); setBillDetail(null); }}
          onToast={onToast}
          onReload={async () => { await loadTab('bills', true); }}
        />
      )}

      {selectedJournal && (
        <JournalDrawer
          schedule={selectedJournal}
          onClose={() => setSelectedJournal(null)}
          onToast={onToast}
          onReload={async () => { await loadTab('journals', true); }}
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

function LineEditor({ lines, setLines, accounts, accountLabel }: { lines: LineDraft[]; setLines: (l: LineDraft[]) => void; accounts: ChartAccount[]; accountLabel: string }) {
  return (
    <div className="space-y-2">
      {lines.map((l, i) => (
        <div key={i} className="grid grid-cols-[1fr_64px_80px_80px_24px] gap-2">
          <input className={inputCls} value={l.description} onChange={(e) => setLines(lines.map((x, j) => j === i ? { ...x, description: e.target.value } : x))} placeholder="Description" />
          <input className={inputCls} type="number" step="0.01" min="0" value={l.quantity} onChange={(e) => setLines(lines.map((x, j) => j === i ? { ...x, quantity: e.target.value } : x))} placeholder="Qty" />
          <input className={inputCls} type="number" step="0.01" min="0" value={l.unitPrice} onChange={(e) => setLines(lines.map((x, j) => j === i ? { ...x, unitPrice: e.target.value } : x))} placeholder="Unit price" />
          <input className={inputCls} type="number" step="0.01" min="0" value={l.taxAmount} onChange={(e) => setLines(lines.map((x, j) => j === i ? { ...x, taxAmount: e.target.value } : x))} placeholder="Tax" />
          <button className="text-sm text-red-600" onClick={() => setLines(lines.filter((_, j) => j !== i))}>×</button>
          <select className={`${inputCls} col-span-5`} value={l.accountId} onChange={(e) => setLines(lines.map((x, j) => j === i ? { ...x, accountId: e.target.value } : x))}>
            <option value="">{accountLabel} (blank = default income/expense role account)</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}
          </select>
        </div>
      ))}
      <button className="text-sm text-blue-600" onClick={() => setLines([...lines, { description: '', quantity: '1', unitPrice: '', taxAmount: '0', accountId: '' }])}>+ Add line</button>
    </div>
  );
}

function ScheduleCreateForm({ kind, error, busy, onCancel, onSubmit }: {
  kind: 'invoices' | 'bills'; error: string | null; busy: boolean;
  onCancel: () => void; onSubmit: (body: Record<string, unknown>) => Promise<void>;
}) {
  const [partyId, setPartyId] = useState('');
  const [name, setName] = useState('');
  const [frequency, setFrequency] = useState('monthly');
  const [nextRunDate, setNextRunDate] = useState(new Date().toISOString().slice(0, 10));
  const [currency, setCurrency] = useState('USD');
  const [autoPost, setAutoPost] = useState(true);
  const [lines, setLines] = useState<LineDraft[]>([{ description: '', quantity: '1', unitPrice: '', taxAmount: '0', accountId: '' }]);
  const [customers, setCustomers] = useState<{ id: string; legalName: string }[] | null>(null);
  const [vendors, setVendors] = useState<Vendor[] | null>(null);
  const [accounts, setAccounts] = useState<ChartAccount[]>([]);
  const isInvoice = kind === 'invoices';

  useEffect(() => {
    fetch('/api/accounts').then((r) => r.json()).then((j) => setAccounts(((j?.data || []) as ChartAccount[]))).catch(() => null);
  }, []);

  const parsedLines = lines.map((l) => ({ description: l.description, quantity: Number(l.quantity || 1), unitPrice: Number(l.unitPrice || 0), taxAmount: Number(l.taxAmount || 0), ...(isInvoice ? { revenueAccountId: l.accountId || undefined } : { expenseAccountId: l.accountId || undefined }) }));
  const total = parsedLines.reduce((s, l) => s + l.quantity * l.unitPrice + l.taxAmount, 0);

  return (
    <div className="fixed inset-y-0 right-0 w-full max-w-lg overflow-y-auto bg-white p-6 shadow-xl">
      <h2 className="text-lg font-semibold">New recurring {isInvoice ? 'invoice' : 'bill'} schedule</h2>
      {error && <div className="mt-2 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      <div className="mt-4 space-y-3">
        <Field label={isInvoice ? 'Customer (CRM)' : 'Vendor'}><select className={inputCls} value={partyId} onChange={(e) => setPartyId(e.target.value)} onFocus={async () => {
          if (isInvoice && !customers) { const j = await fetch('/api/crm/customers?limit=200').then((r) => r.json()).catch(() => null); setCustomers(((j?.data || []) as { id: string; company_name?: string | null; first_name?: string | null; last_name?: string | null }[]).map((c) => ({ id: c.id, legalName: c.company_name || `${c.first_name || ''} ${c.last_name || ''}`.trim() || '—' }))); }
          if (!isInvoice && !vendors) { const j = await fetch('/api/parties?role=vendor').then((r) => r.json()).catch(() => null); setVendors(((j?.data || []) as { id: string; name?: string }[]).map((v) => ({ id: v.id, name: v.name || '—' }))); }
        }}>
          <option value="">—</option>
          {isInvoice
            ? (customers ?? []).map((c) => <option key={c.id} value={c.id}>{c.legalName || '—'}</option>)
            : (vendors ?? []).map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
        </select></Field>
        {isInvoice && customers !== null && customers.length === 0 && <p className="text-sm text-gray-500">No CRM customers yet — recurring invoices bill CRM customers (the invoice customer_id is an FK to crm_customers).</p>}
        <Field label="Name"><input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder={isInvoice ? 'e.g. Monthly hosting retainer' : 'e.g. Monthly rent'} /></Field>
        <Field label="Frequency"><select className={inputCls} value={frequency} onChange={(e) => setFrequency(e.target.value)}>{FREQUENCIES.map((f) => <option key={f} value={f}>{f}</option>)}</select></Field>
        <Field label="First run date"><input className={inputCls} type="date" value={nextRunDate} onChange={(e) => setNextRunDate(e.target.value)} /></Field>
        {isInvoice && <Field label="Currency"><input className={inputCls} value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} maxLength={3} /></Field>}
        {!isInvoice && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={autoPost} onChange={(e) => setAutoPost(e.target.checked)} /> Auto-post bills the runner creates</label>}
        <Field label="Lines"><LineEditor lines={lines} setLines={setLines} accounts={accounts} accountLabel={isInvoice ? 'Revenue account' : 'Expense account'} /></Field>
        <p className="text-sm text-gray-600">Total {fmtMoney(total)}</p>
      </div>
      <div className="mt-5 flex gap-2">
        <button className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white disabled:opacity-50" disabled={busy || !partyId || !name || lines.length === 0} onClick={() => onSubmit(isInvoice ? { customerId: partyId, name, frequency, nextRunDate, currency, lines: parsedLines } : { vendorId: partyId, name, frequency, nextRunDate, autoPost, lines: parsedLines })}>Create schedule</button>
        <button className="rounded px-3 py-1.5 text-sm text-gray-600" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

function JournalCreateForm({ error, busy, onCancel, onSubmit }: {
  error: string | null; busy: boolean;
  onCancel: () => void; onSubmit: (body: Record<string, unknown>) => Promise<void>;
}) {
  const [bookId, setBookId] = useState('');
  const [name, setName] = useState('');
  const [frequency, setFrequency] = useState('monthly');
  const [nextRunDate, setNextRunDate] = useState(new Date().toISOString().slice(0, 10));
  const [books, setBooks] = useState<Book[] | null>(null);
  const [accounts, setAccounts] = useState<{ id: string; code: string; name: string }[] | null>(null);
  const [template, setTemplate] = useState<{ accountId: string; debit: string; credit: string }[]>([
    { accountId: '', debit: '', credit: '0' },
    { accountId: '', debit: '0', credit: '' },
  ]);
  const debits = template.reduce((s, l) => s + Number(l.debit || 0), 0);
  const credits = template.reduce((s, l) => s + Number(l.credit || 0), 0);
  const balanced = Math.abs(debits - credits) < 0.005 && template.every((l) => l.accountId);
  return (
    <div className="fixed inset-y-0 right-0 w-full max-w-lg overflow-y-auto bg-white p-6 shadow-xl">
      <h2 className="text-lg font-semibold">New recurring journal template</h2>
      <p className="mt-1 text-sm text-gray-600">No runner exists for these — the template is recorded, nothing posts automatically.</p>
      {error && <div className="mt-2 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      <div className="mt-4 space-y-3">
        <Field label="Book"><select className={inputCls} value={bookId} onChange={(e) => setBookId(e.target.value)} onFocus={async () => { if (!books) { const j = await fetch('/api/books').then((r) => r.json()).catch(() => null); setBooks((j?.data || []) as Book[]); } }}><option value="">—</option>{(books ?? []).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>
        <Field label="Name"><input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Monthly accrual" /></Field>
        <Field label="Frequency"><select className={inputCls} value={frequency} onChange={(e) => setFrequency(e.target.value)}>{FREQUENCIES.map((f) => <option key={f} value={f}>{f}</option>)}</select></Field>
        <Field label="First run date"><input className={inputCls} type="date" value={nextRunDate} onChange={(e) => setNextRunDate(e.target.value)} /></Field>
        <Field label="Template lines"><div className="space-y-2">
          {template.map((l, i) => (
            <div key={i} className="grid grid-cols-[1fr_90px_90px_24px] gap-2">
              <select className={inputCls} value={l.accountId} onChange={(e) => setTemplate(template.map((x, j) => j === i ? { ...x, accountId: e.target.value } : x))} onFocus={async () => { if (!accounts) { const j = await fetch('/api/accounts').then((r) => r.json()).catch(() => null); setAccounts((j?.data || []) as { id: string; code: string; name: string }[]); } }}><option value="">—</option>{(accounts ?? []).map((a) => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}</select>
              <input className={inputCls} type="number" step="0.01" min="0" value={l.debit} onChange={(e) => setTemplate(template.map((x, j) => j === i ? { ...x, debit: e.target.value } : x))} placeholder="Debit" />
              <input className={inputCls} type="number" step="0.01" min="0" value={l.credit} onChange={(e) => setTemplate(template.map((x, j) => j === i ? { ...x, credit: e.target.value } : x))} placeholder="Credit" />
              <button className="text-sm text-red-600" onClick={() => setTemplate(template.filter((_, j) => j !== i))}>×</button>
            </div>
          ))}
          <button className="text-sm text-blue-600" onClick={() => setTemplate([...template, { accountId: '', debit: '0', credit: '0' }])}>+ Add line</button>
          <p className="text-sm text-gray-600">Debits {fmtMoney(debits)} · Credits {fmtMoney(credits)} · {balanced ? 'Balanced' : 'Must balance'}</p>
        </div></Field>
      </div>
      <div className="mt-5 flex gap-2">
        <button className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white disabled:opacity-50" disabled={busy || !bookId || !name || !balanced || template.length < 2} onClick={() => onSubmit({ bookId, name, frequency, nextRunDate, template: template.map((l) => ({ account_id: l.accountId, debit: Number(l.debit || 0), credit: Number(l.credit || 0) })) })}>Create template</button>
        <button className="rounded px-3 py-1.5 text-sm text-gray-600" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

function InvoiceDrawer({ schedule, lines, onClose, onToast, onReload }: {
  schedule: RecurringInvoice;
  lines: RecurringInvoiceLine[] | null;
  onClose: () => void; onToast: (msg: string) => void; onReload: () => Promise<void>;
}) {
  const [status, setStatus] = useState(schedule.status);
  const [nextRunDate, setNextRunDate] = useState(schedule.nextRunDate);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const post = async (url: string, body: Record<string, unknown>, method = 'POST') => {
    const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j?.error) throw new Error(j?.error?.message || `Request failed (${r.status})`);
    return j;
  };
  return (
    <div className="fixed inset-y-0 right-0 w-full max-w-lg overflow-y-auto bg-white p-6 shadow-xl">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{schedule.name}</h2>
        <button className="text-sm text-gray-500" onClick={onClose}>Close</button>
      </div>
      <p className="mt-1 text-sm text-gray-600">{schedule.customer} · {schedule.frequency} · total {fmtMoney(schedule.totalAmount)} {schedule.currency}</p>
      {err && <div className="mt-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>}
      <h3 className="mt-5 font-medium">Lines</h3>
      <table className="mt-2 w-full text-sm">
        <thead><tr className="text-left text-gray-500"><th className="py-1 pr-3">Description</th><th className="py-1 pr-3">Qty</th><th className="py-1 text-right">Unit</th><th className="py-1 text-right">Tax</th><th className="py-1 text-right">Total</th></tr></thead>
        <tbody>
          {(lines ?? []).map((l) => (
            <tr key={l.id} className="border-t"><td className="py-1 pr-3">{l.description}</td><td className="py-1 pr-3">{l.quantity}</td><td className="py-1 text-right">{fmtMoney(l.unitPrice)}</td><td className="py-1 text-right">{fmtMoney(l.taxAmount)}</td><td className="py-1 text-right">{fmtMoney(l.lineTotal)}</td></tr>
          ))}
        </tbody>
      </table>
      <div className="mt-5 flex flex-wrap items-end gap-2">
        <Field label="Status"><select className={inputCls} value={status} onChange={(e) => setStatus(e.target.value)}><option value="active">Active</option><option value="paused">Paused</option><option value="cancelled">Cancelled</option></select></Field>
        <Field label="Next run date"><input className={inputCls} type="date" value={nextRunDate} onChange={(e) => setNextRunDate(e.target.value)} /></Field>
        <button className="rounded bg-gray-900 px-3 py-1.5 text-sm text-white disabled:opacity-50" disabled={busy || (status === schedule.status && nextRunDate === schedule.nextRunDate)} onClick={async () => {
          setBusy(true); setErr(null);
          try {
            await post(`/api/recurring-invoices/${schedule.id}`, { status, nextRunDate }, 'PATCH');
            onToast('Schedule updated');
            await onReload();
          } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
          finally { setBusy(false); }
        }}>Save</button>
        <button className="rounded px-3 py-1.5 text-sm text-red-600 disabled:opacity-50" disabled={busy} onClick={async () => {
          setBusy(true); setErr(null);
          try {
            const r = await fetch(`/api/recurring-invoices/${schedule.id}`, { method: 'DELETE' });
            const j = await r.json().catch(() => ({}));
            if (!r.ok || j?.error) throw new Error(j?.error?.message || 'Delete failed');
            onToast('Schedule deleted');
            onClose();
            await onReload();
          } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
          finally { setBusy(false); }
        }}>Delete</button>
      </div>
    </div>
  );
}

function BillDrawer({ schedule, lines, onClose, onToast, onReload }: {
  schedule: RecurringBill;
  lines: { description?: string; quantity?: number; unit_price?: number; line_total?: number }[] | null;
  onClose: () => void; onToast: (msg: string) => void; onReload: () => Promise<void>;
}) {
  const [isActive, setIsActive] = useState(schedule.isActive);
  const [autoPost, setAutoPost] = useState(schedule.autoPost);
  const [nextRunDate, setNextRunDate] = useState(schedule.nextRunDate);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const post = async (url: string, body: Record<string, unknown>, method = 'POST') => {
    const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j?.error) throw new Error(j?.error?.message || `Request failed (${r.status})`);
    return j;
  };
  const billLines = lines;
  return (
    <div className="fixed inset-y-0 right-0 w-full max-w-lg overflow-y-auto bg-white p-6 shadow-xl">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{schedule.name}</h2>
        <button className="text-sm text-gray-500" onClick={onClose}>Close</button>
      </div>
      <p className="mt-1 text-sm text-gray-600">{schedule.vendor} · {schedule.frequency} · total {fmtMoney(schedule.totalAmount)} · {schedule.lineCount} line(s)</p>
      {err && <div className="mt-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>}
      <div className="mt-5 flex flex-wrap items-end gap-2">
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} /> Active</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={autoPost} onChange={(e) => setAutoPost(e.target.checked)} /> Auto-post</label>
        <Field label="Next run date"><input className={inputCls} type="date" value={nextRunDate} onChange={(e) => setNextRunDate(e.target.value)} /></Field>
        <button className="rounded bg-gray-900 px-3 py-1.5 text-sm text-white disabled:opacity-50" disabled={busy || (isActive === schedule.isActive && autoPost === schedule.autoPost && nextRunDate === schedule.nextRunDate)} onClick={async () => {
          setBusy(true); setErr(null);
          try {
            await post(`/api/recurring-bills/${schedule.id}`, { isActive, autoPost, nextRunDate }, 'PATCH');
            onToast('Schedule updated');
            await onReload();
          } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
          finally { setBusy(false); }
        }}>Save</button>
        <button className="rounded px-3 py-1.5 text-sm text-red-600 disabled:opacity-50" disabled={busy} onClick={async () => {
          setBusy(true); setErr(null);
          try {
            const r = await fetch(`/api/recurring-bills/${schedule.id}`, { method: 'DELETE' });
            const j = await r.json().catch(() => ({}));
            if (!r.ok || j?.error) throw new Error(j?.error?.message || 'Delete failed');
            onToast('Schedule deleted');
            onClose();
            await onReload();
          } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
          finally { setBusy(false); }
        }}>Delete</button>
      </div>
      {Array.isArray(billLines) && billLines.length > 0 && (
        <table className="mt-5 w-full text-sm">
          <thead><tr className="text-left text-gray-500"><th className="py-1 pr-3">Description</th><th className="py-1 pr-3">Qty</th><th className="py-1 text-right">Unit</th><th className="py-1 text-right">Total</th></tr></thead>
          <tbody>
            {(billLines as { description?: string; quantity?: number; unit_price?: number; line_total?: number }[]).map((l, i) => (
              <tr key={i} className="border-t"><td className="py-1 pr-3">{l.description || '—'}</td><td className="py-1 pr-3">{l.quantity ?? '—'}</td><td className="py-1 text-right">{fmtMoney(Number(l.unit_price || 0))}</td><td className="py-1 text-right">{fmtMoney(Number(l.line_total || 0))}</td></tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function JournalDrawer({ schedule, onClose, onToast, onReload }: {
  schedule: RecurringJournal;
  onClose: () => void; onToast: (msg: string) => void; onReload: () => Promise<void>;
}) {
  const [active, setActive] = useState(schedule.active);
  const [nextRunDate, setNextRunDate] = useState(schedule.nextRunDate);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const post = async (url: string, body: Record<string, unknown>, method = 'POST') => {
    const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j?.error) throw new Error(j?.error?.message || `Request failed (${r.status})`);
    return j;
  };
  const template = Array.isArray(schedule.template) ? schedule.template as { account_id?: string; debit?: number; credit?: number; description?: string }[] : [];
  return (
    <div className="fixed inset-y-0 right-0 w-full max-w-lg overflow-y-auto bg-white p-6 shadow-xl">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{schedule.name}</h2>
        <button className="text-sm text-gray-500" onClick={onClose}>Close</button>
      </div>
      <p className="mt-1 text-sm text-gray-600">{schedule.book} · {schedule.frequency} · no runner exists for this template — nothing posts automatically.</p>
      {err && <div className="mt-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>}
      <h3 className="mt-5 font-medium">Template lines</h3>
      <table className="mt-2 w-full text-sm">
        <thead><tr className="text-left text-gray-500"><th className="py-1 pr-3">Account</th><th className="py-1 text-right">Debit</th><th className="py-1 text-right">Credit</th></tr></thead>
        <tbody>
          {template.map((l, i) => (
            <tr key={i} className="border-t"><td className="py-1 pr-3 font-mono text-xs">{l.account_id || '—'}</td><td className="py-1 text-right">{fmtMoney(Number(l.debit || 0))}</td><td className="py-1 text-right">{fmtMoney(Number(l.credit || 0))}</td></tr>
          ))}
        </tbody>
      </table>
      <div className="mt-5 flex flex-wrap items-end gap-2">
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Active</label>
        <Field label="Next run date"><input className={inputCls} type="date" value={nextRunDate} onChange={(e) => setNextRunDate(e.target.value)} /></Field>
        <button className="rounded bg-gray-900 px-3 py-1.5 text-sm text-white disabled:opacity-50" disabled={busy || (active === schedule.active && nextRunDate === schedule.nextRunDate)} onClick={async () => {
          setBusy(true); setErr(null);
          try {
            await post(`/api/recurring-journals/${schedule.id}`, { active, nextRunDate }, 'PATCH');
            onToast('Template updated');
            await onReload();
          } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
          finally { setBusy(false); }
        }}>Save</button>
        <button className="rounded px-3 py-1.5 text-sm text-red-600 disabled:opacity-50" disabled={busy} onClick={async () => {
          setBusy(true); setErr(null);
          try {
            const r = await fetch(`/api/recurring-journals/${schedule.id}`, { method: 'DELETE' });
            const j = await r.json().catch(() => ({}));
            if (!r.ok || j?.error) throw new Error(j?.error?.message || 'Delete failed');
            onToast('Template deleted');
            onClose();
            await onReload();
          } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
          finally { setBusy(false); }
        }}>Delete</button>
      </div>
    </div>
  );
}
