'use client';
import { useState, useEffect, useCallback } from 'react';
import type { Employee, PayPeriod, PayRun, Deduction, Timesheet } from '@/lib/payrollTypes';

/**
 * Payroll screen (doc 28 Batch C) — the /api/payroll/* routes agent-a
 * built (doc 12) had no screen: the payroll nav id rendered a generic
 * ListView of acct_payroll_runs. This is the dedicated screen: runs with
 * a real drawer (items, approve, post-to-GL), employees, deductions,
 * periods, and timesheets (new route — both acct_timesheets and
 * payroll_timesheets are retired; payroll time lives in acct_time_entries
 * as billable=false rows).
 * acct_payroll_employees is NOT the employee table: it has 0 rows and no
 * references anywhere; the live employees live in acct_employees.
 */

const money0 = (n: number) =>
  '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

interface PayrollScreenProps {
  onToast: (msg: string) => void;
}

export default function PayrollScreen({ onToast }: PayrollScreenProps) {
  type Tab = 'runs' | 'employees' | 'deductions' | 'periods' | 'timesheets';
  const [tab, setTab] = useState<Tab>('runs');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [runs, setRuns] = useState<PayRun[] | null>(null);
  const [employees, setEmployees] = useState<Employee[] | null>(null);
  const [deductions, setDeductions] = useState<Deduction[] | null>(null);
  const [periods, setPeriods] = useState<PayPeriod[] | null>(null);
  const [timesheets, setTimesheets] = useState<Timesheet[] | null>(null);
  const [selectedRun, setSelectedRun] = useState<PayRun | null>(null);
  const [runLoading, setRunLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);

  const loadTab = useCallback(async (t: Tab, force = false) => {
    setError(null);
    setLoading(true);
    try {
      if (t === 'runs' && (force || !runs)) {
        const j = await fetch('/api/payroll/runs').then((r) => r.json()).catch(() => null);
        if (j?.error) throw new Error(j.error.message || 'Runs load failed');
        setRuns((j?.data || []) as PayRun[]);
        if (!employees) {
          const ej = await fetch('/api/payroll/employees').then((r) => r.json()).catch(() => null);
          setEmployees((ej?.data || []) as Employee[]);
        }
        if (!periods) {
          const pj = await fetch('/api/payroll/periods').then((r) => r.json()).catch(() => null);
          setPeriods((pj?.data || []) as PayPeriod[]);
        }
      } else if (t === 'employees' && (force || !employees)) {
        const j = await fetch('/api/payroll/employees').then((r) => r.json()).catch(() => null);
        if (j?.error) throw new Error(j.error.message || 'Employees load failed');
        setEmployees((j?.data || []) as Employee[]);
      } else if (t === 'deductions' && (force || !deductions)) {
        const j = await fetch('/api/payroll/deductions').then((r) => r.json()).catch(() => null);
        if (j?.error) throw new Error(j.error.message || 'Deductions load failed');
        setDeductions((j?.data || []) as Deduction[]);
        if (!employees) {
          const ej = await fetch('/api/payroll/employees').then((r) => r.json()).catch(() => null);
          setEmployees((ej?.data || []) as Employee[]);
        }
      } else if (t === 'periods' && (force || !periods)) {
        const j = await fetch('/api/payroll/periods').then((r) => r.json()).catch(() => null);
        if (j?.error) throw new Error(j.error.message || 'Periods load failed');
        setPeriods((j?.data || []) as PayPeriod[]);
      } else if (t === 'timesheets' && (force || !timesheets)) {
        const j = await fetch('/api/payroll/timesheets').then((r) => r.json()).catch(() => null);
        if (j?.error) throw new Error(j.error.message || 'Timesheets load failed');
        setTimesheets((j?.data || []) as Timesheet[]);
        if (!employees) {
          const ej = await fetch('/api/payroll/employees').then((r) => r.json()).catch(() => null);
          setEmployees((ej?.data || []) as Employee[]);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Load failed');
    } finally {
      setLoading(false);
    }
  }, [runs, employees, deductions, periods, timesheets]);

  useEffect(() => {
    void loadTab(tab);
  }, [tab, loadTab]);

  const postTo = useCallback(async (path: string, body: Record<string, unknown>, t: Tab, okMsg: string) => {
    setCreateError(null);
    const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await res.json().catch(() => null);
    if (!res.ok || j?.error) {
      setCreateError(j?.error?.message || `Save failed (${res.status})`);
      return false;
    }
    setShowCreate(false);
    await loadTab(t, true);
    onToast(okMsg);
    return true;
  }, [loadTab, onToast]);

  const openRun = useCallback(async (id: string) => {
    setRunLoading(true);
    const j = await fetch(`/api/payroll/runs/${id}`).then((r) => r.json()).catch(() => null);
    setRunLoading(false);
    if (j?.error) {
      onToast(j.error.message || 'Could not open run');
      return;
    }
    setSelectedRun(j.data as PayRun);
  }, [onToast]);

  const setRunStatus = useCallback(async (id: string, status: 'approved' | 'draft') => {
    const res = await fetch(`/api/payroll/runs/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
    const j = await res.json().catch(() => null);
    if (!res.ok || j?.error) {
      onToast(j?.error?.message || 'Status change failed');
      return;
    }
    await openRun(id);
    await loadTab('runs', true);
    onToast(status === 'approved' ? 'Run approved' : 'Run reopened as draft');
  }, [openRun, loadTab, onToast]);

  const postRun = useCallback(async (id: string) => {
    setPosting(true);
    const res = await fetch(`/api/payroll/runs/${id}/post`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    const j = await res.json().catch(() => null);
    setPosting(false);
    if (!res.ok || j?.error) {
      onToast(j?.error?.message || 'Post failed');
      return;
    }
    await openRun(id);
    await loadTab('runs', true);
    onToast('Run posted to the general ledger');
  }, [openRun, loadTab, onToast]);

  const setTimesheetStatus = useCallback(async (id: string, status: 'approved' | 'void') => {
    const res = await fetch(`/api/payroll/timesheets/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
    if (!res.ok) {
      onToast('Timesheet update failed');
      return;
    }
    await loadTab('timesheets', true);
    onToast(status === 'approved' ? 'Timesheet approved' : 'Timesheet voided');
  }, [loadTab, onToast]);

  const deleteTimesheet = useCallback(async (id: string) => {
    const res = await fetch(`/api/payroll/timesheets/${id}`, { method: 'DELETE' });
    const j = await res.json().catch(() => null);
    if (!res.ok || j?.error) {
      onToast(j?.error?.message || 'Delete failed');
      return;
    }
    await loadTab('timesheets', true);
    onToast('Timesheet deleted');
  }, [loadTab, onToast]);

  const tabs: [Tab, string][] = [
    ['runs', 'Pay runs'],
    ['employees', 'Employees'],
    ['deductions', 'Deductions'],
    ['periods', 'Pay periods'],
    ['timesheets', 'Timesheets'],
  ];

  return (
    <div className="p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-headline-md">Payroll</h1>
          <p className="text-[12px] text-on-surface-variant mt-0.5">Runs, employees, deductions, pay periods, and timesheets — live from the payroll ledger.</p>
        </div>
        {tab !== 'periods' && (
          <button
            className="h-9 px-3 bg-primary text-white rounded text-label-sm font-semibold hover:bg-primary-container"
            onClick={() => { setCreateError(null); setShowCreate(!showCreate); }}
          >
            {showCreate ? 'Cancel' : tab === 'runs' ? '+ New pay run' : tab === 'employees' ? '+ Add employee' : tab === 'deductions' ? '+ Add deduction' : '+ Add timesheet'}
          </button>
        )}
        {tab === 'periods' && (
          <button
            className="h-9 px-3 bg-primary text-white rounded text-label-sm font-semibold hover:bg-primary-container"
            onClick={() => { setCreateError(null); setShowCreate(!showCreate); }}
          >
            {showCreate ? 'Cancel' : '+ New pay period'}
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-1 mb-4">
        {tabs.map(([id, label]) => (
          <button
            key={id}
            className={`h-8 px-3 rounded-full text-label-sm font-medium ${tab === id ? 'bg-primary text-white' : 'border border-surface-dim hover:bg-surface-container-low'}`}
            onClick={() => { setShowCreate(false); setTab(id); }}
          >
            {label}
          </button>
        ))}
      </div>

      {loading && <p className="text-body-sm text-on-surface-variant">Loading…</p>}
      {error && <p className="text-body-sm text-error">Couldn’t load this tab: {error}</p>}
      {createError && <p className="text-body-sm text-error mb-2">{createError}</p>}

      {/* ── Runs ── */}
      {tab === 'runs' && !loading && (
        <>
          {showCreate && (
            <form
              className="mb-4 p-3 border border-surface-dim rounded-lg bg-white space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                const periodId = String(fd.get('payPeriodId') || '');
                const items = (employees || [])
                  .map((emp) => ({
                    employeeId: emp.id,
                    regularHours: Number(fd.get(`rh-${emp.id}`) || 0),
                    regularPay: Number(fd.get(`rp-${emp.id}`) || 0),
                    grossPay: Number(fd.get(`gp-${emp.id}`) || 0),
                    netPay: Number(fd.get(`np-${emp.id}`) || 0),
                  }))
                  .filter((i) => i.grossPay > 0 || i.regularHours > 0);
                if (!periodId) { setCreateError('Choose a pay period'); return; }
                if (!items.length) { setCreateError('Enter hours or pay for at least one employee'); return; }
                void postTo('/api/payroll/runs', { payPeriodId: periodId, items }, 'runs', 'Pay run created as draft');
              }}
            >
              <select name="payPeriodId" required className="h-9 border border-surface-dim rounded px-2 text-body-sm w-full max-w-sm">
                <option value="">— Pay period —</option>
                {(periods || []).map((p) => (<option key={p.id} value={p.id}>{p.periodStart} → {p.periodEnd} · pay {p.payDate}</option>))}
              </select>
              <div className="space-y-2">
                {(employees || []).map((emp) => (
                  <div key={emp.id} className="grid grid-cols-5 gap-2 items-center text-body-sm">
                    <span className="font-medium">{emp.firstName} {emp.lastName}</span>
                    <input name={`rh-${emp.id}`} type="number" step="0.5" min="0" placeholder="Reg hours" className="h-9 border border-surface-dim rounded px-2" />
                    <input name={`rp-${emp.id}`} type="number" step="0.01" min="0" placeholder="Reg pay $" className="h-9 border border-surface-dim rounded px-2" />
                    <input name={`gp-${emp.id}`} type="number" step="0.01" min="0" placeholder="Gross $" className="h-9 border border-surface-dim rounded px-2" />
                    <input name={`np-${emp.id}`} type="number" step="0.01" min="0" placeholder="Net $" className="h-9 border border-surface-dim rounded px-2" />
                  </div>
                ))}
                {(employees || []).length === 0 && <p className="text-body-sm text-on-surface-variant">No employees yet — add one on the Employees tab first.</p>}
              </div>
              <button className="h-9 px-4 bg-primary text-white rounded text-label-sm font-semibold" type="submit">Create draft run</button>
            </form>
          )}
          {(runs?.length || 0) === 0 ? (
            <p className="text-body-sm text-on-surface-variant">No pay runs yet.</p>
          ) : (
            <div className="bg-white rounded-xl border border-surface-dim divide-y divide-surface-dim">
              {runs!.map((r) => (
                <button key={r.id} className="w-full text-left px-4 py-3 hover:bg-surface-container-low flex items-center justify-between gap-3" onClick={() => void openRun(r.id)}>
                  <div className="min-w-0">
                    <div className="font-medium text-body-sm">{r.runNumber || 'Pay run'} <span className="text-on-surface-variant font-normal">· {r.periodStart} → {r.periodEnd}</span></div>
                    <div className="text-[11px] text-on-surface-variant">Pay {r.payDate} · {r.employeeCount} employee{r.employeeCount === 1 ? '' : 's'}{r.glJournalEntryId ? ' · journal posted' : ''}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-body-sm tabular-nums">{money0(r.grossTotal)} <span className="text-on-surface-variant">gross · {money0(r.netTotal)} net</span></div>
                    <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold ${r.status === 'processed' ? 'bg-secondary-container text-on-secondary-container' : r.status === 'approved' ? 'bg-secondary-container text-on-secondary-container' : 'bg-surface-container text-on-surface-variant'}`}>{r.status}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── Employees ── */}
      {tab === 'employees' && !loading && (
        <>
          {showCreate && (
            <form
              className="grid grid-cols-2 gap-2 mb-4 p-3 border border-surface-dim rounded-lg bg-white"
              onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                void postTo('/api/payroll/employees', {
                  firstName: String(fd.get('firstName') || ''),
                  lastName: String(fd.get('lastName') || ''),
                  payType: String(fd.get('payType') || 'hourly'),
                  payRate: fd.get('payRate') === '' ? undefined : Number(fd.get('payRate')),
                  hireDate: String(fd.get('hireDate') || '') || undefined,
                  email: String(fd.get('email') || '') || undefined,
                }, 'employees', 'Employee added');
              }}
            >
              <input name="firstName" required placeholder="First name" className="h-9 border border-surface-dim rounded px-2 text-body-sm" />
              <input name="lastName" required placeholder="Last name" className="h-9 border border-surface-dim rounded px-2 text-body-sm" />
              <select name="payType" className="h-9 border border-surface-dim rounded px-2 text-body-sm" defaultValue="hourly">
                <option value="hourly">Hourly</option>
                <option value="salary">Salary</option>
              </select>
              <input name="payRate" type="number" step="0.01" min="0" placeholder="Pay rate $" className="h-9 border border-surface-dim rounded px-2 text-body-sm" />
              <input name="hireDate" type="date" className="h-9 border border-surface-dim rounded px-2 text-body-sm" />
              <input name="email" type="email" placeholder="Email (optional)" className="h-9 border border-surface-dim rounded px-2 text-body-sm" />
              <button className="col-span-2 h-9 bg-primary text-white rounded text-label-sm font-semibold" type="submit">Add employee</button>
            </form>
          )}
          {(employees?.length || 0) === 0 ? (
            <p className="text-body-sm text-on-surface-variant">No employees on file.</p>
          ) : (
            <div className="bg-white rounded-xl border border-surface-dim divide-y divide-surface-dim">
              {employees!.map((emp) => (
                <div key={emp.id} className="px-4 py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium text-body-sm">{emp.firstName} {emp.lastName} <span className="text-on-surface-variant font-normal">· {emp.employeeNumber || '—'}</span></div>
                    <div className="text-[11px] text-on-surface-variant">{emp.employmentType || '—'} · {emp.payType || '—'}{emp.payRate != null ? ` · ${money0(emp.payRate)}/hr` : ''}{emp.hireDate ? ` · hired ${emp.hireDate}` : ''}</div>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${emp.status === 'active' ? 'bg-secondary-container text-on-secondary-container' : 'bg-surface-container text-on-surface-variant'}`}>{emp.status}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── Deductions ── */}
      {tab === 'deductions' && !loading && (
        <>
          {showCreate && (
            <form
              className="grid grid-cols-2 gap-2 mb-4 p-3 border border-surface-dim rounded-lg bg-white"
              onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                const method = String(fd.get('calcMethod') || 'fixed');
                void postTo('/api/payroll/deductions', {
                  employeeId: String(fd.get('employeeId') || ''),
                  deductionCode: String(fd.get('deductionCode') || ''),
                  label: String(fd.get('label') || ''),
                  deductionType: String(fd.get('deductionType') || 'other'),
                  isPretax: fd.get('isPretax') === 'on',
                  calcMethod: method,
                  amount: method === 'fixed' ? Number(fd.get('amount') || 0) : undefined,
                  percent: method === 'percent' ? Number(fd.get('percent') || 0) : undefined,
                }, 'deductions', 'Deduction added');
              }}
            >
              <select name="employeeId" required className="h-9 border border-surface-dim rounded px-2 text-body-sm">
                <option value="">— Employee —</option>
                {(employees || []).map((emp) => (<option key={emp.id} value={emp.id}>{emp.firstName} {emp.lastName}</option>))}
              </select>
              <input name="deductionCode" required placeholder="Code (e.g. 401K)" className="h-9 border border-surface-dim rounded px-2 text-body-sm" />
              <input name="label" required placeholder="Label (e.g. 401(k) contribution)" className="h-9 border border-surface-dim rounded px-2 text-body-sm" />
              <select name="deductionType" className="h-9 border border-surface-dim rounded px-2 text-body-sm" defaultValue="other">
                <option value="retirement_401k">Retirement 401(k)</option>
                <option value="health">Health</option>
                <option value="dental">Dental</option>
                <option value="vision">Vision</option>
                <option value="other">Other</option>
              </select>
              <select name="calcMethod" className="h-9 border border-surface-dim rounded px-2 text-body-sm" defaultValue="percent">
                <option value="percent">Percent of gross</option>
                <option value="fixed">Fixed amount</option>
              </select>
              <input name="percent" type="number" step="0.01" min="0" placeholder="Percent (e.g. 5)" className="h-9 border border-surface-dim rounded px-2 text-body-sm" />
              <input name="amount" type="number" step="0.01" min="0" placeholder="Fixed amount $" className="h-9 border border-surface-dim rounded px-2 text-body-sm" />
              <label className="col-span-2 flex items-center gap-2 text-body-sm"><input type="checkbox" name="isPretax" defaultChecked /> Pre-tax</label>
              <button className="col-span-2 h-9 bg-primary text-white rounded text-label-sm font-semibold" type="submit">Add deduction</button>
            </form>
          )}
          {(deductions?.length || 0) === 0 ? (
            <p className="text-body-sm text-on-surface-variant">No deduction elections.</p>
          ) : (
            <div className="bg-white rounded-xl border border-surface-dim divide-y divide-surface-dim">
              {deductions!.map((d) => (
                <div key={d.id} className="px-4 py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium text-body-sm">{d.label} <span className="text-on-surface-variant font-normal">· {d.deductionCode} · {d.employeeName || '—'}</span></div>
                    <div className="text-[11px] text-on-surface-variant">{d.deductionType || '—'} · {d.calcMethod || '—'} · {d.percent != null ? `${d.percent}%` : money0(d.amount ?? 0)}{d.isPretax ? ' · pre-tax' : ' · post-tax'}</div>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${d.isActive ? 'bg-secondary-container text-on-secondary-container' : 'bg-surface-container text-on-surface-variant'}`}>{d.isActive ? 'Active' : 'Inactive'}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── Periods ── */}
      {tab === 'periods' && !loading && (
        <>
          {showCreate && (
            <form
              className="grid grid-cols-2 gap-2 mb-4 p-3 border border-surface-dim rounded-lg bg-white"
              onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                void postTo('/api/payroll/periods', {
                  periodStart: String(fd.get('periodStart') || ''),
                  periodEnd: String(fd.get('periodEnd') || ''),
                  payDate: String(fd.get('payDate') || ''),
                  frequency: String(fd.get('frequency') || 'biweekly'),
                }, 'periods', 'Pay period created');
              }}
            >
              <input name="periodStart" type="date" required className="h-9 border border-surface-dim rounded px-2 text-body-sm" />
              <input name="periodEnd" type="date" required className="h-9 border border-surface-dim rounded px-2 text-body-sm" />
              <input name="payDate" type="date" required className="h-9 border border-surface-dim rounded px-2 text-body-sm" />
              <select name="frequency" className="h-9 border border-surface-dim rounded px-2 text-body-sm" defaultValue="biweekly">
                <option value="weekly">Weekly</option>
                <option value="biweekly">Biweekly</option>
                <option value="semimonthly">Semimonthly</option>
                <option value="monthly">Monthly</option>
              </select>
              <button className="col-span-2 h-9 bg-primary text-white rounded text-label-sm font-semibold" type="submit">Create period</button>
            </form>
          )}
          {(periods?.length || 0) === 0 ? (
            <p className="text-body-sm text-on-surface-variant">No pay periods yet.</p>
          ) : (
            <div className="bg-white rounded-xl border border-surface-dim divide-y divide-surface-dim">
              {periods!.map((p) => (
                <div key={p.id} className="px-4 py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium text-body-sm">{p.periodStart} → {p.periodEnd}</div>
                    <div className="text-[11px] text-on-surface-variant">Pay {p.payDate} · {p.frequency || '—'}</div>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${p.status === 'open' ? 'bg-secondary-container text-on-secondary-container' : 'bg-surface-container text-on-surface-variant'}`}>{p.status}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── Timesheets ── */}
      {tab === 'timesheets' && !loading && (
        <>
          {showCreate && (
            <form
              className="grid grid-cols-2 gap-2 mb-4 p-3 border border-surface-dim rounded-lg bg-white"
              onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                void postTo('/api/payroll/timesheets', {
                  employeeId: String(fd.get('employeeId') || ''),
                  workDate: String(fd.get('workDate') || ''),
                  hours: fd.get('hours') === '' ? undefined : Number(fd.get('hours')),
                  rate: fd.get('rate') === '' ? undefined : Number(fd.get('rate')),
                  description: String(fd.get('description') || '') || undefined,
                }, 'timesheets', 'Time entry added');
              }}
            >
              <select name="employeeId" required className="h-9 border border-surface-dim rounded px-2 text-body-sm">
                <option value="">— Employee —</option>
                {(employees || []).map((emp) => (<option key={emp.id} value={emp.id}>{emp.firstName} {emp.lastName}</option>))}
              </select>
              <input name="workDate" type="date" required className="h-9 border border-surface-dim rounded px-2 text-body-sm" />
              <input name="hours" type="number" step="0.25" min="0" required placeholder="Hours" className="h-9 border border-surface-dim rounded px-2 text-body-sm" />
              <input name="rate" type="number" step="0.01" min="0" placeholder="Rate $/hr (defaults to employee pay rate)" className="h-9 border border-surface-dim rounded px-2 text-body-sm" />
              <input name="description" placeholder="Description (optional)" className="h-9 border border-surface-dim rounded px-2 text-body-sm" />
              <button className="col-span-2 h-9 bg-primary text-white rounded text-label-sm font-semibold" type="submit">Add time entry</button>
            </form>
          )}
          {(timesheets?.length || 0) === 0 ? (
            <p className="text-body-sm text-on-surface-variant">No payroll time logged. Entries are per-day hours at the employee’s pay rate; billable project time lives elsewhere and never shows here.</p>
          ) : (
            <div className="bg-white rounded-xl border border-surface-dim divide-y divide-surface-dim">
              {timesheets!.map((t) => (
                <div key={t.id} className="px-4 py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium text-body-sm">{t.employeeName || '—'} <span className="text-on-surface-variant font-normal">· {t.workDate || '—'}</span></div>
                    <div className="text-[11px] text-on-surface-variant">
                      {t.hours != null ? `${t.hours}h` : '—'}{t.rate != null ? ` @ ${money0(t.rate)}/hr = ${money0((t.hours || 0) * t.rate)}` : ''}{t.description ? ` · ${t.description}` : ''}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${t.status === 'approved' ? 'bg-secondary-container text-on-secondary-container' : t.status === 'void' ? 'bg-error-container text-on-error-container' : 'bg-surface-container text-on-surface-variant'}`}>{t.status}</span>
                    {t.status === 'open' && (
                      <>
                        <button className="text-[11px] text-primary font-semibold hover:underline" onClick={() => void setTimesheetStatus(t.id, 'approved')}>Approve</button>
                        <button className="text-[11px] text-error font-semibold hover:underline" onClick={() => void setTimesheetStatus(t.id, 'void')}>Void</button>
                        <button className="text-[11px] text-error font-semibold hover:underline" onClick={() => void deleteTimesheet(t.id)}>Delete</button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── Run drawer ── */}
      {selectedRun && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/30" onClick={() => setSelectedRun(null)} />
          <div className="relative w-full max-w-xl bg-white h-full overflow-y-auto p-5 shadow-xl">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-headline-sm">{selectedRun.runNumber || 'Pay run'}</h2>
                <p className="text-[12px] text-on-surface-variant mt-0.5">
                  {selectedRun.periodStart} → {selectedRun.periodEnd} · pay {selectedRun.payDate} · {selectedRun.status}
                </p>
              </div>
              <button className="text-on-surface-variant hover:text-on-surface text-xl leading-none" onClick={() => setSelectedRun(null)}>×</button>
            </div>
            {runLoading ? (
              <p className="text-body-sm text-on-surface-variant">Loading…</p>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-2 mb-4 text-center">
                  <div className="border border-surface-dim rounded-lg p-3"><div className="text-[11px] text-on-surface-variant">Gross</div><div className="font-semibold tabular-nums">{money0(selectedRun.grossTotal)}</div></div>
                  <div className="border border-surface-dim rounded-lg p-3"><div className="text-[11px] text-on-surface-variant">Net</div><div className="font-semibold tabular-nums">{money0(selectedRun.netTotal)}</div></div>
                  <div className="border border-surface-dim rounded-lg p-3"><div className="text-[11px] text-on-surface-variant">Employer tax</div><div className="font-semibold tabular-nums">{money0(selectedRun.employerTaxTotal)}</div></div>
                  <div className="border border-surface-dim rounded-lg p-3"><div className="text-[11px] text-on-surface-variant">Employee tax</div><div className="font-semibold tabular-nums">{money0(selectedRun.employeeTaxTotal)}</div></div>
                  <div className="border border-surface-dim rounded-lg p-3"><div className="text-[11px] text-on-surface-variant">Deductions</div><div className="font-semibold tabular-nums">{money0(selectedRun.deductionTotal)}</div></div>
                  <div className="border border-surface-dim rounded-lg p-3"><div className="text-[11px] text-on-surface-variant">Employees</div><div className="font-semibold">{selectedRun.employeeCount}</div></div>
                </div>
                {(selectedRun.items?.length || 0) === 0 ? (
                  <p className="text-body-sm text-on-surface-variant mb-4">No items on this run.</p>
                ) : (
                  <div className="space-y-2 mb-4">
                    {selectedRun.items.map((it) => (
                      <div key={it.id} className="border border-surface-dim rounded-lg px-3 py-2 text-body-sm">
                        <div className="flex justify-between"><span className="font-medium">{it.employeeName || '—'}</span><span className="tabular-nums">{money0(it.grossPay)} gross · {money0(it.netPay)} net</span></div>
                        <div className="text-[11px] text-on-surface-variant">{it.regularHours}h regular{it.overtimeHours ? ` · ${it.overtimeHours}h OT` : ''} · fed {money0(it.federalIncomeTax)} · SS {money0(it.socialSecurityEe)} · Medicare {money0(it.medicareEe)} · pretax {money0(it.pretaxDeductions)} · {it.paymentStatus || 'pending'}</div>
                      </div>
                    ))}
                  </div>
                )}
                {selectedRun.glJournalEntryId && (
                  <p className="text-[12px] text-on-surface-variant mb-4">GL journal: <span className="font-mono">{selectedRun.glJournalEntryId}</span></p>
                )}
                <div className="flex gap-2">
                  {selectedRun.status === 'draft' && (
                    <button className="h-9 px-4 bg-primary text-white rounded text-label-sm font-semibold" onClick={() => void setRunStatus(selectedRun.id, 'approved')}>Approve run</button>
                  )}
                  {selectedRun.status === 'approved' && (
                    <>
                      {!selectedRun.glJournalEntryId ? (
                        <button className="h-9 px-4 bg-primary text-white rounded text-label-sm font-semibold disabled:opacity-40" disabled={posting} onClick={() => void postRun(selectedRun.id)}>
                          {posting ? 'Posting…' : 'Post to general ledger'}
                        </button>
                      ) : (
                        <p className="text-body-sm text-on-surface-variant self-center">Posted — the journal is in the books. The posting RPC refuses a second post for this run.</p>
                      )}
                      <button className="h-9 px-4 border border-surface-dim rounded text-label-sm" onClick={() => void setRunStatus(selectedRun.id, 'draft')}>Reopen as draft</button>
                    </>
                  )}
                  {selectedRun.status === 'processed' && (
                    <p className="text-body-sm text-on-surface-variant">Posted{selectedRun.processedAt ? ` ${selectedRun.processedAt}` : ''} — the journal is in the books.</p>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
