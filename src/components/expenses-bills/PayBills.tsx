'use client';

import './expenses-bills.css';
import React, {
  useState,
  useMemo,
  useCallback,
  useEffect,
  useLayoutEffect,
} from 'react';
import type { ExpensesBillsScreenProps } from './types';
import { EBL_NAV } from './types';
import { fetchJson } from '@/hooks/useCrmApi';
import { useBankAccounts } from '@/hooks/useAccountingApi';

/* ════════════════════════════════════════════════════════════════
   Pay bills screen — 1:1 conversion of upload/Pay bills.html
   ════════════════════════════════════════════════════════════════ */

interface PayBillRow {
  id: string;
  vendor: string;
  billno: string;
  due: string;          // ISO date 'YYYY-MM-DD'
  dueDisplay: string;   // 'MM/DD/YYYY'
  balance: number;
  overdue: boolean;
  checked: boolean;
  amount: string;       // formatted with commas (e.g. "2,880.00")
}

interface ConfirmSummaryItem {
  vendor: string;
  billno: string;
  amount: string;       // already formatted via money()
}

type DueFilter = 'all' | '7' | '30' | 'overdue';



const money = (n: number) =>
  '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function PayBills({
  onNavigate,
  onToast,
  onCreate,
  onOpenCreateFlyout,
}: ExpensesBillsScreenProps) {
  // Reference unused prop signatures so the destructure is intentional.
  void onCreate;
  void onOpenCreateFlyout;

  /* ── Toast (local + mirrored to shell) ── */
  const [toastMsg, setToastMsg] = useState('');
  const showToast = useCallback((msg: string) => setToastMsg(msg), []);
  useEffect(() => {
    if (!toastMsg) return;
    const t = window.setTimeout(() => setToastMsg(''), 1800);
    return () => window.clearTimeout(t);
  }, [toastMsg]);
  useEffect(() => {
    if (toastMsg) onToast(toastMsg);
  }, [toastMsg, onToast]);

  /* ── Row state: open bills from GET /api/accounting/bills ── */
  const [rows, setRows] = useState<PayBillRow[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const { bankAccounts } = useBankAccounts();

  useEffect(() => {
    let cancelled = false;
    fetchJson<{ data: Record<string, unknown>[] }>('/api/accounting/bills')
      .then(res => {
        if (cancelled || !res.ok) return;
        const today = new Date().toISOString().slice(0, 10);
        setRows(prev => (res.data.data || [])
          .filter(d => String(d.status) !== 'void')
          .map(d => {
            const open = Math.max(0, Number(d.total || 0) - Number(d.amountPaid || 0));
            const dueISO = String(d.dueDate || '');
            const keep = prev.find(x => x.id === String(d.id));
            return {
              id: String(d.id),
              vendor: String(d.vendorName || 'Vendor'),
              billno: String(d.billNumber || ''),
              due: dueISO,
              dueDisplay: dueISO ? `${dueISO.slice(5, 7)}/${dueISO.slice(8, 10)}/${dueISO.slice(0, 4)}` : '—',
              balance: open,
              overdue: open > 0 && !!dueISO && dueISO < today && String(d.status) !== 'paid',
              checked: keep?.checked ?? false,
              amount: keep?.amount ?? open.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ','),
            };
          })
          .filter(r => r.balance > 0));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [refreshKey]);

  /* ── Filter state ── */
  const [search, setSearch] = useState('');
  const [dueFilter, setDueFilter] = useState<DueFilter>('all');

  /* ── Payment account state (real bank accounts) ── */
  const [payAccount, setPayAccount] = useState('');
  const selectedAccount = bankAccounts.find(a => a.id === payAccount) || bankAccounts[0];
  const balanceNote = selectedAccount ? `Available: ${money(selectedAccount.balance)}` : '';
  useEffect(() => {
    if (!payAccount && bankAccounts.length) setPayAccount(bankAccounts[0].id);
  }, [payAccount, bankAccounts]);

  /* ── Payment date state ── */
  const [payDate, setPayDate] = useState(new Date().toISOString().slice(0, 10));

  /* ── Print later state ── */
  const [printLater, setPrintLater] = useState(false);

  /* ── Confirm modal state ── */
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmSummary, setConfirmSummary] = useState<ConfirmSummaryItem[]>([]);
  const [confirmTotal, setConfirmTotal] = useState('$0.00');
  const [confirmAccount, setConfirmAccount] = useState('Chase •9910');
  const [confirmDate, setConfirmDate] = useState('11/08/2026');

  /* ── Success modal state ── */
  const [successOpen, setSuccessOpen] = useState(false);
  const [successData, setSuccessData] = useState({
    count: 0,
    total: '$0.00',
    date: '11/08/2026',
    printNote: '',
  });

  /* ═══════════════════════════════════════════════════════════════
     Derived visibility — applies source's applyFilters logic exactly
     ═══════════════════════════════════════════════════════════════ */
  const visibleRows = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const q = search.trim().toLowerCase();
    return rows.map((r) => {
      const qOk =
        !q ||
        r.vendor.toLowerCase().includes(q) ||
        r.billno.toLowerCase().includes(q);
      let dueOk = true;
      if (dueFilter !== 'all') {
        const dueDate = new Date(r.due + 'T00:00:00');
        const days = Math.round((dueDate.getTime() - today.getTime()) / 86400000);
        if (dueFilter === '7') dueOk = days >= 0 && days <= 7;
        else if (dueFilter === '30') dueOk = days >= 0 && days <= 30;
        else if (dueFilter === 'overdue') dueOk = days < 0 || r.overdue;
      }
      return { ...r, visible: qOk && dueOk };
    });
  }, [rows, search, dueFilter]);

  const visibleIds = useMemo(
    () => new Set(visibleRows.filter((v) => v.visible).map((v) => v.id)),
    [visibleRows],
  );

  /* Uncheck hidden rows — mirrors source's applyFilters unchecking side effect.
     useLayoutEffect so it runs before paint (no flash of stale totals). */
  useLayoutEffect(() => {
    setRows((prev) => {
      let changed = false;
      const next = prev.map((r) => {
        if (r.checked && !visibleIds.has(r.id)) {
          changed = true;
          return { ...r, checked: false };
        }
        return r;
      });
      return changed ? next : prev;
    });
  }, [visibleIds]);

  /* ═══════════════════════════════════════════════════════════════
     Totals — derived from rows (mirrors source's updateTotals)
     ═══════════════════════════════════════════════════════════════ */
  const totals = useMemo(() => {
    let selectedCount = 0;
    let totalAmount = 0;
    rows.forEach((r) => {
      if (r.checked && visibleIds.has(r.id)) {
        selectedCount++;
        const amt = parseFloat((r.amount || '0').replace(/,/g, '')) || 0;
        totalAmount += amt;
      }
    });
    return {
      selectedCount,
      totalAmount,
      totalDisplay: money(totalAmount),
      submitDisabled: selectedCount === 0,
      selectionSummary: `${selectedCount} bill${selectedCount !== 1 ? 's' : ''} selected`,
      payCountText: `${selectedCount} of ${rows.length} selected`,
      footerNote:
        selectedCount > 0
          ? `${selectedCount} bills selected · ${money(totalAmount)} total`
          : 'Select bills to pay. Payments will be sent on the date above.',
    };
  }, [rows, visibleIds]);

  /* ── Check-all derived state (all visible rows checked) ── */
  const allVisibleChecked =
    visibleIds.size > 0 &&
    [...visibleIds].every((id) => {
      const r = rows.find((rr) => rr.id === id);
      return r ? r.checked : false;
    });

  /* ═══════════════════════════════════════════════════════════════
     Action handlers
     ═══════════════════════════════════════════════════════════════ */

  /* Row checkbox change → toggle that row's checked */
  const handleRowCheck = (id: string, checked: boolean) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, checked } : r)));
  };

  /* Check-all → set all visible rows' checked to match */
  const handleCheckAll = (checked: boolean) => {
    setRows((prev) =>
      prev.map((r) => (visibleIds.has(r.id) ? { ...r, checked } : r)),
    );
  };

  /* Select all → set all visible rows' checked to true */
  const handleSelectAll = () => {
    setRows((prev) =>
      prev.map((r) => (visibleIds.has(r.id) ? { ...r, checked: true } : r)),
    );
  };

  /* Clear all → uncheck every row */
  const handleClearAll = () => {
    setRows((prev) => prev.map((r) => ({ ...r, checked: false })));
  };

  /* amt-input → reformat with commas (preserve decimal) + update row.amount */
  const handleAmountInput = (id: string, value: string) => {
    const raw = value.replace(/[^\d.]/g, '');
    const [int, dec] = raw.split('.');
    const formatted =
      int.replace(/\B(?=(\d{3})+(?!\d))/g, ',') +
      (dec !== undefined ? '.' + dec : '');
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, amount: formatted } : r)));
  };

  /* Search input → re-filter */
  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
  };

  /* Due filter → re-filter */
  const handleDueFilter = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setDueFilter(e.target.value as DueFilter);
  };

  /* Payment account select → update payAccount + balanceNote */
  const handlePayAccount = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setPayAccount(e.target.value);
  };

  /* Payment date input */
  const handlePayDate = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPayDate(e.target.value);
  };

  /* Print later toggle */
  const handlePrintLater = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPrintLater(e.target.checked);
  };

  /* Submit → populate confirm modal with selected rows + total + account + date */
  const handleSubmit = () => {
    if (totals.selectedCount === 0) return;
    const selected = rows.filter((r) => r.checked && visibleIds.has(r.id));
    let total = 0;
    const summary: ConfirmSummaryItem[] = selected.map((r) => {
      const amt = parseFloat((r.amount || '0').replace(/,/g, '')) || 0;
      total += amt;
      return { vendor: r.vendor, billno: r.billno, amount: money(amt) };
    });
    setConfirmSummary(summary);
    setConfirmTotal(money(total));
    setConfirmAccount(selectedAccount?.name || 'Bank account');
    const [y, m, dd] = payDate.split('-');
    setConfirmDate(`${m}/${dd}/${y}`);
    setConfirmOpen(true);
  };

  /* Confirm modal Back → close */
  const handleCancelConfirm = () => setConfirmOpen(false);

  /* Confirm modal Pay now → real payments via the pay endpoint.
     The success modal reports only what the API actually paid. */
  const handleConfirmPay = async () => {
    setConfirmOpen(false);
    const selected = rows.filter((r) => r.checked && visibleIds.has(r.id));
    let paidCount = 0;
    let paidTotal = 0;
    let failed = 0;
    for (const r of selected) {
      const amt = parseFloat((r.amount || '0').replace(/,/g, '')) || 0;
      if (!amt) { failed++; continue; }
      const res = await fetchJson(`/api/v1/documents/${r.id}/pay?type=Bill`, {
        method: 'POST',
        body: JSON.stringify({ amount: amt }),
      });
      if (res.ok) { paidCount++; paidTotal += amt; }
      else failed++;
    }
    const [y, m, dd] = payDate.split('-');
    setSuccessData({
      count: paidCount,
      total: money(paidTotal),
      date: `${m}/${dd}/${y}`,
      printNote: failed
        ? `${failed} payment${failed === 1 ? '' : 's'} failed — those bills remain open.`
        : printLater
          ? 'Print later is on — the payments are recorded on the bills; check printing is not connected.'
          : 'All selected bills were paid.',
    });
    setSuccessOpen(true);
    setRefreshKey(k => k + 1);
  };

  /* Success modal Done → close + toast (rows already refreshed) */
  const handleDone = () => {
    setSuccessOpen(false);
    showToast('Payments recorded');
  };

  /* Success modal View payments → navigate to Bills (closest existing screen to
     a payments history view). TODO: when a dedicated `payment-history` screen
     exists in shellData, route to EBL_NAV.paymentHistory() instead. */
  const handleViewPayments = () => {
    setSuccessOpen(false);
    const [d, s] = EBL_NAV.bills();
    onNavigate(d, s);
    showToast('Opening payments history');
  };

  /* Cancel button (footer) → toast + navigate to Bills */
  const handleCancel = () => {
    const [d, s] = EBL_NAV.bills();
    onNavigate(d, s);
    showToast('Returning to Bills');
  };

  /* Back arrow (header) → toast + navigate to Bills */
  const handleBack = () => {
    const [d, s] = EBL_NAV.bills();
    onNavigate(d, s);
    showToast('Returning to Bills');
  };

  /* Print checks button → toast. TODO: when a dedicated `print-checks` screen
     exists in shellData, route to EBL_NAV.printChecks() instead. For now there
     is no Print Checks workspace view built, so we surface a clear toast. */
  const handlePrintChecks = () => showToast('Print checks workspace (not yet built)');

  /* Escape key → close any open modal */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (successOpen) setSuccessOpen(false);
        else if (confirmOpen) setConfirmOpen(false);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [successOpen, confirmOpen]);

  /* ═══════════════════════════════════════════════════════════════
     Render
     ═══════════════════════════════════════════════════════════════ */
  return (
    <div className="pay-bills-page">
      {/* ═══════════ Context header ═══════════ */}
      <div className="h-[52px] px-6 flex items-center justify-between bg-white border-b border-surface-dim">
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-[20px] text-on-surface-variant">account_balance</span>
          <span className="text-label-md font-semibold">Finance</span>
          <span className="text-outline">/</span>
          <span className="text-label-md">Expenses &amp; Bills</span>
          <span className="text-outline">/</span>
          <span className="text-label-md text-primary font-semibold">Bill payments</span>
        </div>
      </div>

      {/* ═══════════ PAY BILLS WORKSPACE ═══════════ */}
      <main>
        {/* Sticky total header */}
        <div className="pay-header">
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="w-8 h-8 rounded hover:bg-surface-container flex items-center justify-center"
              onClick={handleBack}
            >
              <span className="material-symbols-outlined text-[18px]">arrow_back</span>
            </button>
            <div>
              <h1 className="text-headline-md">Pay bills</h1>
              <p className="text-[11px] text-on-surface-variant">{totals.selectionSummary}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low flex items-center gap-1"
              onClick={handlePrintChecks}
            >
              <span className="material-symbols-outlined text-[16px]">print</span>
              Print checks
            </button>
            <div className="total-block">
              <div className="label">Total payment amount</div>
              <div className="val">{totals.totalDisplay}</div>
            </div>
          </div>
        </div>

        {/* Payment controls */}
        <div className="pay-controls">
          <div>
            <label className="field-label">Payment account</label>
            <select className="field-input" value={payAccount} onChange={handlePayAccount}>
              {bankAccounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name} · {money(a.balance)}</option>
              ))}
            </select>
            <div className="text-[11px] text-on-surface-variant mt-1">{balanceNote}</div>
          </div>
          <div>
            <label className="field-label">Payment date</label>
            <input
              className="field-input"
              type="date"
              value={payDate}
              onChange={handlePayDate}
            />
          </div>
          <div>
            <label className="field-label">Starting check no.</label>
            <input className="field-input" placeholder="1042" />
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 text-body-sm cursor-pointer pb-2">
              <input
                type="checkbox"
                className="row-check"
                checked={printLater}
                onChange={handlePrintLater}
              />
              <span>Print later</span>
            </label>
          </div>
        </div>

        {/* Filter bar */}
        <div className="pay-filters">
          <div className="relative flex items-center flex-1 max-w-sm min-w-[180px]">
            <span className="material-symbols-outlined absolute left-2 text-[15px] text-outline">search</span>
            <input
              className="w-full h-8 pl-7 pr-2 bg-white border border-surface-dim rounded text-body-sm focus:outline-none focus:border-primary"
              placeholder="Filter by vendor, bill no.…"
              value={search}
              onChange={handleSearch}
            />
          </div>
          <label className="h-8 px-2 border border-surface-dim rounded text-label-sm hover:bg-white flex items-center gap-1 bg-white">
            <span className="material-symbols-outlined text-[14px] text-on-surface-variant">calendar_today</span>
            <span className="text-on-surface-variant">Due:</span>
            <select
              className="bg-transparent border-none text-label-sm text-on-surface focus:outline-none"
              value={dueFilter}
              onChange={handleDueFilter}
            >
              <option value="all">All due dates</option>
              <option value="7">Due within 7 days</option>
              <option value="30">Due within 30 days</option>
              <option value="overdue">Overdue only</option>
            </select>
          </label>
          <span className="w-px h-5 bg-surface-dim"></span>
          <button
            type="button"
            className="h-8 px-2 text-label-sm font-semibold text-primary hover:bg-white rounded"
            onClick={handleSelectAll}
          >
            Select all
          </button>
          <button
            type="button"
            className="h-8 px-2 text-label-sm font-semibold text-on-surface-variant hover:bg-white rounded"
            onClick={handleClearAll}
          >
            Clear
          </button>
          <span className="ml-auto text-[11px] text-on-surface-variant">{totals.payCountText}</span>
        </div>

        {/* Bills table */}
        <div className="bg-white border-b border-surface-dim">
          <table className="pay-table">
            <thead>
              <tr>
                <th style={{ width: 32 }}>
                  <input
                    type="checkbox"
                    className="row-check"
                    checked={allVisibleChecked}
                    onChange={(e) => handleCheckAll(e.target.checked)}
                  />
                </th>
                <th>Vendor</th>
                <th>Bill no.</th>
                <th>Due</th>
                <th className="right">Bill amount</th>
                <th className="right">Balance due</th>
                <th className="right">Payment</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((r) => (
                <tr
                  key={r.id}
                  className={`pay-row${r.checked ? ' checked' : ''}`}
                  style={r.visible ? undefined : { display: 'none' }}
                >
                  <td>
                    <input
                      type="checkbox"
                      className="row-check pay-check"
                      checked={r.checked}
                      onChange={(e) => handleRowCheck(r.id, e.target.checked)}
                    />
                  </td>
                  <td className="font-medium">{r.vendor}</td>
                  <td className="text-on-surface-variant">{r.billno}</td>
                  <td className={r.overdue ? 'overdue' : ''}>{r.dueDisplay}</td>
                  <td className="right">{money(r.balance)}</td>
                  <td className="right">{money(r.balance)}</td>
                  <td className="right">
                    <input
                      className="amt-input"
                      value={r.amount}
                      onChange={(e) => handleAmountInput(r.id, e.target.value)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="pay-footer">
          <div className="flex items-center gap-3 text-[11px] text-on-surface-variant">
            <span className="material-symbols-outlined text-[16px]">info</span>
            <span>{totals.footerNote}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="h-9 px-4 border border-surface-dim rounded text-body-md hover:bg-surface-container-low"
              onClick={handleCancel}
            >
              Cancel
            </button>
            <button
              type="button"
              className="h-9 px-4 bg-primary text-white rounded text-body-md font-semibold hover:bg-primary-container disabled:opacity-40 disabled:cursor-not-allowed"
              onClick={handleSubmit}
              disabled={totals.submitDisabled}
            >
              <span className="material-symbols-outlined text-[16px] align-middle mr-1">payments</span>
              Pay <span>{totals.selectedCount}</span> bills
            </button>
          </div>
        </div>
      </main>

      {/* ═══════════ CONFIRMATION MODAL ═══════════ */}
      <div className={`modal-scrim${confirmOpen ? ' open' : ''}`} id="confirm-modal">
        <div className="w-full max-w-md bg-white rounded-xl shadow-2xl overflow-hidden">
          <div className="p-6 text-center">
            <div className="w-14 h-14 mx-auto rounded-full bg-secondary-container flex items-center justify-center mb-3">
              <span className="material-symbols-outlined text-[28px] text-on-secondary-container">payments</span>
            </div>
            <h2 className="text-headline-sm mb-1">Confirm payment</h2>
            <p className="text-body-sm text-on-surface-variant mb-4">
              You're about to pay <strong>{confirmSummary.length}</strong> bills totaling{' '}
              <strong>{confirmTotal}</strong>.
            </p>
            <div className="text-left bg-surface-container-low rounded-lg p-3 mb-4 space-y-1 text-body-sm">
              {confirmSummary.map((s, i) => (
                <div key={i} className="flex justify-between gap-2">
                  <span className="truncate">{s.vendor} · {s.billno}</span>
                  <span className="tabular-nums font-medium">{s.amount}</span>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between text-body-sm pt-3 border-t border-surface-dim mb-4">
              <span className="text-on-surface-variant">From</span>
              <span className="font-medium">{confirmAccount}</span>
            </div>
            <div className="flex items-center justify-between text-body-sm pb-3 border-b border-surface-dim mb-4">
              <span className="text-on-surface-variant">Payment date</span>
              <span className="font-medium">{confirmDate}</span>
            </div>
          </div>
          <div className="flex gap-2 px-4 pb-4">
            <button
              type="button"
              className="flex-1 h-9 border border-surface-dim rounded text-body-md hover:bg-surface-container-low"
              onClick={handleCancelConfirm}
            >
              Back
            </button>
            <button
              type="button"
              className="flex-1 h-9 bg-primary text-white rounded text-body-md font-semibold hover:bg-primary-container"
              onClick={handleConfirmPay}
            >
              <span className="material-symbols-outlined text-[16px] align-middle mr-1">check</span>
              Pay now
            </button>
          </div>
        </div>
      </div>

      {/* ═══════════ SUCCESS MODAL ═══════════ */}
      <div className={`modal-scrim${successOpen ? ' open' : ''}`} id="success-modal">
        <div className="w-full max-w-md bg-white rounded-xl shadow-2xl overflow-hidden">
          <div className="p-8 text-center">
            <div className="w-16 h-16 mx-auto rounded-full bg-secondary-container flex items-center justify-center mb-4">
              <span className="material-symbols-outlined text-[32px] text-on-secondary-container">check_circle</span>
            </div>
            <h2 className="text-headline-md mb-2">Payment scheduled</h2>
            <p className="text-body-sm text-on-surface-variant mb-5">
              <strong>{successData.count}</strong> bills totaling <strong>{successData.total}</strong>{' '}
              will be paid on <span>{successData.date}</span>.
            </p>
            <div className="bg-surface-container-low rounded-lg p-3 text-left text-[11px] text-on-surface-variant mb-5 space-y-1">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[14px] text-secondary">mail</span>
                Confirmation emailed to <strong>sarah@unsaid.io</strong>
              </div>
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[14px]">print</span>
                <span>{successData.printNote}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[14px]">schedule</span>
                ACH payments typically settle in 1–2 business days.
              </div>
            </div>
          </div>
          <div className="flex gap-2 px-4 pb-4">
            <button
              type="button"
              className="flex-1 h-9 border border-surface-dim rounded text-body-md hover:bg-surface-container-low"
              onClick={handleViewPayments}
            >
              View payments
            </button>
            <button
              type="button"
              className="flex-1 h-9 bg-primary text-white rounded text-body-md font-semibold hover:bg-primary-container"
              onClick={handleDone}
            >
              Done
            </button>
          </div>
        </div>
      </div>

      <div className={`toast${toastMsg ? ' show' : ''}`}>{toastMsg}</div>
    </div>
  );
}
