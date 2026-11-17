'use client';
import { useState, useEffect, useCallback } from 'react';
import type { ExpenseReport, ExpenseLine } from '@/lib/batchITypes';
import { fmtMoney, fmtDate, cap } from '@/lib/batchITypes';

/**
 * Expense reports screen (doc 28 Batch I) — draft → submit →
 * approve → post. There is no engine RPC for this lifecycle, so the
 * route posts the journal itself: Dr each line's expense account,
 * Cr the accrued-liabilities role account (the reimbursement is
 * owed, not yet paid). Posted reports are terminal — voiding one
 * would need a journal reversal, which the route does not invent.
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

interface Employee {
  id: string;
  firstName: string;
  lastName: string;
}

export default function ExpenseReportsScreen({ onToast }: Props) {
  const [reports, setReports] = useState<ExpenseReport[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<ExpenseReport | null>(null);
  const [detail, setDetail] = useState<ExpenseLine[] | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const j = await fetch('/api/expense-reports').then((r) => r.json()).catch(() => null);
      if (j?.error) throw new Error(j.error.message || 'Expense reports load failed');
      setReports((j?.data || []) as ExpenseReport[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openReport = async (r: ExpenseReport) => {
    setSelected(r);
    const j = await fetch(`/api/expense-reports/${r.id}`).then((r) => r.json()).catch(() => null);
    setDetail(((j?.data?.lines || []) as ExpenseLine[]));
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
        <h1 className="text-xl font-semibold">Expense reports</h1>
        <button className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white" onClick={() => { setShowCreate(true); setFormError(null); }}>New report</button>
      </div>
      <p className="mt-1 text-sm text-gray-600">Draft → submit → approve → post. Posting books each line to its expense account and the total to accrued liabilities — the reimbursement is owed, not yet paid.</p>

      {error && <div className="mt-4 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {loading && <div className="mt-4 text-sm text-gray-500">Loading…</div>}

      {!loading && (
        <div className="mt-4 overflow-x-auto">
          {(reports?.length ?? 0) === 0 ? (
            <p className="text-sm text-gray-500">No expense reports yet. Create one, add lines, submit it for approval, then post it to the GL.</p>
          ) : (
            <table className="w-full text-sm">
              <thead><tr className="text-left text-gray-500"><th className="py-2 pr-3">Report</th><th className="py-2 pr-3">Employee</th><th className="py-2 pr-3">Date</th><th className="py-2 pr-3">Status</th><th className="py-2 pr-3 text-right">Lines</th><th className="py-2 text-right">Total</th></tr></thead>
              <tbody>
                {reports!.map((r) => (
                  <tr key={r.id} className="cursor-pointer border-t hover:bg-gray-50" onClick={() => openReport(r)}>
                    <td className="py-2 pr-3 font-mono text-xs">{r.reportNumber}</td>
                    <td className="py-2 pr-3">{r.employee}</td>
                    <td className="py-2 pr-3">{fmtDate(r.reportDate)}</td>
                    <td className="py-2 pr-3">{cap(r.status)}</td>
                    <td className="py-2 pr-3 text-right">{r.lineCount}</td>
                    <td className="py-2 text-right">{fmtMoney(r.totalAmount)} {r.currency}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {showCreate && (
        <ReportCreateForm
          error={formError}
          busy={busy}
          onCancel={() => setShowCreate(false)}
          onSubmit={async (body) => {
            setBusy(true); setFormError(null);
            try {
              await post('/api/expense-reports', body);
              setShowCreate(false);
              onToast('Expense report created');
              await load();
            } catch (e) { setFormError(e instanceof Error ? e.message : String(e)); }
            finally { setBusy(false); }
          }}
        />
      )}

      {selected && (
        <ReportDrawer
          report={selected}
          lines={detail}
          onClose={() => { setSelected(null); setDetail(null); }}
          onToast={onToast}
          onReload={async () => { await load(); if (selected) openReport(selected); }}
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

function ReportCreateForm({ error, busy, onCancel, onSubmit }: {
  error: string | null; busy: boolean;
  onCancel: () => void; onSubmit: (body: Record<string, unknown>) => Promise<void>;
}) {
  const [employeeId, setEmployeeId] = useState('');
  const [reportDate, setReportDate] = useState(new Date().toISOString().slice(0, 10));
  const [currency, setCurrency] = useState('USD');
  const [employees, setEmployees] = useState<Employee[] | null>(null);
  return (
    <div className="fixed inset-y-0 right-0 w-full max-w-md overflow-y-auto bg-white p-6 shadow-xl">
      <h2 className="text-lg font-semibold">New expense report</h2>
      {error && <div className="mt-2 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      <div className="mt-4 space-y-3">
        <Field label="Employee"><select className={inputCls} value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} onFocus={async () => { if (!employees) { const j = await fetch('/api/payroll/employees').then((r) => r.json()).catch(() => null); setEmployees((j?.data || []) as Employee[]); } }}><option value="">—</option>{(employees ?? []).map((e) => <option key={e.id} value={e.id}>{e.firstName} {e.lastName}</option>)}</select></Field>
        <Field label="Report date"><input className={inputCls} type="date" value={reportDate} onChange={(e) => setReportDate(e.target.value)} /></Field>
        <Field label="Currency"><input className={inputCls} value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} maxLength={3} /></Field>
      </div>
      <div className="mt-5 flex gap-2">
        <button className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white disabled:opacity-50" disabled={busy} onClick={() => onSubmit({ employeeId: employeeId || null, reportDate, currency })}>Create report</button>
        <button className="rounded px-3 py-1.5 text-sm text-gray-600" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

function ReportDrawer({ report, lines, onClose, onToast, onReload }: {
  report: ExpenseReport;
  lines: ExpenseLine[] | null;
  onClose: () => void; onToast: (msg: string) => void; onReload: () => Promise<void>;
}) {
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().slice(0, 10));
  const [merchant, setMerchant] = useState('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [taxAmount, setTaxAmount] = useState('0');
  const [expenseAccountId, setExpenseAccountId] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isDraft = report.status === 'draft';
  const isSubmitted = report.status === 'pending_approval';
  const isApproved = report.status === 'approved';

  const post = async (url: string, body: Record<string, unknown>, method = 'POST') => {
    const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j?.error) throw new Error(j?.error?.message || `Request failed (${r.status})`);
    return j;
  };

  const transition = async (action: string, toastMsg: string) => {
    setBusy(true); setErr(null);
    try {
      await post(`/api/expense-reports/${report.id}`, { action }, 'PATCH');
      onToast(toastMsg);
      await onReload();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-y-0 right-0 w-full max-w-2xl overflow-y-auto bg-white p-6 shadow-xl">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{report.reportNumber}</h2>
        <button className="text-sm text-gray-500" onClick={onClose}>Close</button>
      </div>
      <p className="mt-1 text-sm text-gray-600">{report.employee} · {fmtDate(report.reportDate)} · {cap(report.status)} · total {fmtMoney(report.totalAmount)} {report.currency}{report.postedJournalId ? ` · journal ${report.postedJournalId.slice(0, 8)}…` : ''}</p>
      {err && <div className="mt-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>}

      <div className="mt-4 flex flex-wrap gap-2">
        {isDraft && <button className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white disabled:opacity-50" disabled={busy} onClick={() => transition('submit', 'Report submitted for approval')}>Submit for approval</button>}
        {isSubmitted && <button className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white disabled:opacity-50" disabled={busy} onClick={() => transition('approve', 'Report approved')}>Approve</button>}
        {isSubmitted && <button className="rounded bg-red-600 px-3 py-1.5 text-sm text-white disabled:opacity-50" disabled={busy} onClick={() => transition('reject', 'Report rejected')}>Reject</button>}
        {isApproved && <button className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white disabled:opacity-50" disabled={busy} onClick={async () => {
          setBusy(true); setErr(null);
          try {
            const j = await post(`/api/expense-reports/${report.id}/post`, {});
            onToast(`Posted — journal ${String(j?.data?.postedJournalId || '').slice(0, 8)}…`);
            await onReload();
          } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
          finally { setBusy(false); }
        }}>Post to GL</button>}
        {(isDraft || isApproved) && <button className="rounded px-3 py-1.5 text-sm text-red-600 disabled:opacity-50" disabled={busy} onClick={() => transition('void', 'Report voided')}>Void</button>}
      </div>

      <h3 className="mt-6 font-medium">Lines</h3>
      {(lines?.length ?? 0) === 0 ? (
        <p className="mt-1 text-sm text-gray-500">No lines yet.</p>
      ) : (
        <table className="mt-2 w-full text-sm">
          <thead><tr className="text-left text-gray-500"><th className="py-1 pr-3">Date</th><th className="py-1 pr-3">Description</th><th className="py-1 pr-3">Merchant</th><th className="py-1 pr-3">Account</th><th className="py-1 text-right">Tax</th><th className="py-1 text-right">Amount</th><th className="py-1" /></tr></thead>
          <tbody>
            {lines!.map((l) => (
              <tr key={l.id} className="border-t">
                <td className="py-1 pr-3">{fmtDate(l.expenseDate)}</td>
                <td className="py-1 pr-3">{l.description}</td>
                <td className="py-1 pr-3">{l.merchant ?? '—'}</td>
                <td className="py-1 pr-3">{l.account}</td>
                <td className="py-1 text-right">{fmtMoney(l.taxAmount)}</td>
                <td className="py-1 text-right">{fmtMoney(l.amount)}</td>
                <td className="py-1">{isDraft && <button className="text-xs text-red-600" onClick={async () => {
                  setBusy(true); setErr(null);
                  try {
                    const r = await fetch(`/api/expense-reports/${report.id}/lines?lineId=${l.id}`, { method: 'DELETE' });
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

      {isDraft && (
        <div className="mt-4 rounded border p-3">
          <h3 className="font-medium">Add line</h3>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <Field label="Date"><input className={inputCls} type="date" value={expenseDate} onChange={(e) => setExpenseDate(e.target.value)} /></Field>
            <Field label="Merchant"><input className={inputCls} value={merchant} onChange={(e) => setMerchant(e.target.value)} /></Field>
            <Field label="Description"><input className={inputCls} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Client dinner" /></Field>
            <Field label="Expense account"><select className={inputCls} value={expenseAccountId} onChange={(e) => setExpenseAccountId(e.target.value)} onFocus={async () => { if (!accounts) { const j = await fetch('/api/accounts').then((r) => r.json()).catch(() => null); setAccounts(((j?.data || []) as Account[]).filter((a) => a.account_type === 'expense')); } }}><option value="">—</option>{(accounts ?? []).map((a) => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}</select></Field>
            <Field label="Amount"><input className={inputCls} type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
            <Field label="Tax amount"><input className={inputCls} type="number" step="0.01" min="0" value={taxAmount} onChange={(e) => setTaxAmount(e.target.value)} /></Field>
          </div>
          <button className="mt-3 rounded bg-blue-600 px-3 py-1.5 text-sm text-white disabled:opacity-50" disabled={busy || !description || !amount || !expenseAccountId} onClick={async () => {
            setBusy(true); setErr(null);
            try {
              await post(`/api/expense-reports/${report.id}/lines`, { expenseDate, merchant: merchant || null, description, amount: Number(amount), taxAmount: Number(taxAmount || 0), expenseAccountId });
              setMerchant(''); setDescription(''); setAmount(''); setTaxAmount('0'); setExpenseAccountId('');
              onToast('Line added');
              await onReload();
            } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
            finally { setBusy(false); }
          }}>Add line</button>
        </div>
      )}
    </div>
  );
}
