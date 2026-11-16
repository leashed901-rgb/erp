'use client';
import './accounting.css';
import { AccountingScreenProps, ACCT_NAV } from './types';
import { useAccountingOverview, useBankAccounts } from '@/hooks/useAccountingApi';
import { exportToCsv } from '@/lib/csvExport';

const fmtMoney = (n: number) =>
  `${n < 0 ? '−' : ''}$${Math.abs(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
const fmtShortDate = (iso: string | null) => {
  if (!iso) return '—';
  const d = new Date(`${iso.slice(0, 10)}T00:00:00`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};
const fmtFeedDate = (iso: string) => {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit' });
};
const ACTIVITY_ICONS: Record<string, string> = { journal: 'menu_book', receipt: 'receipt_long', bank: 'account_balance' };

export default function AccountingOverview({
  onNavigate,
  onToast,
  onCreate,
  onOpenCreateFlyout,
}: AccountingScreenProps) {
  const { overview: ov } = useAccountingOverview();
  const { bankAccounts } = useBankAccounts();
  const monthLabel = new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

  const setupItems = ov
    ? [
        { label: 'Connect bank account', done: ov.bankAccountCount > 0, sub: ov.bankAccountCount > 0 ? `${ov.bankAccountNames[0]} linked` : 'No bank accounts yet', go: null as null | (() => void) },
        { label: 'Chart of accounts', done: ov.coaCount > 0, sub: `${ov.coaCount} active accounts`, go: null },
        { label: 'First reconciliation', done: !!ov.lastReconciledDate, sub: ov.lastReconciledDate ? `Through ${fmtShortDate(ov.lastReconciledDate)}` : 'Not reconciled yet', go: null },
        { label: 'Import receipts', done: ov.receiptsForReview === 0, sub: ov.receiptsForReview > 0 ? `${ov.receiptsForReview} awaiting review` : 'Inbox clear', go: () => onNavigate(...ACCT_NAV.receipts()) },
        { label: 'Set up bank rules', done: ov.activeRuleCount > 0, sub: ov.activeRuleCount > 0 ? `${ov.activeRuleCount} active rule${ov.activeRuleCount === 1 ? '' : 's'}` : 'Auto-categorize repeating transactions', go: () => onNavigate(...ACCT_NAV.rules()) },
        { label: 'Sales tax', done: ov.taxCodeCount > 0, sub: ov.taxCodeCount > 0 ? `${ov.taxCodeCount} tax code${ov.taxCodeCount === 1 ? '' : 's'} configured` : 'Configure tax rates', go: () => onNavigate(...ACCT_NAV.taxOverview()) },
      ]
    : [];
  const setupDone = setupItems.filter((i) => i.done).length;
  const setupPct = setupItems.length ? Math.round((setupDone / setupItems.length) * 100) : 0;

  const handleExport = () => {
    if (!bankAccounts.length) {
      onToast('Nothing to export yet');
      return;
    }
    exportToCsv(
      bankAccounts.map((a) => ({ name: a.name, type: a.accountType, balance: a.balance })),
      [
        { key: 'name', label: 'Account' },
        { key: 'type', label: 'Type' },
        { key: 'balance', label: 'Balance' },
      ],
      'bank-balances.csv',
    );
    onToast('Bank balances exported');
  };

  const handleCopyFwd = async () => {
    try {
      await navigator.clipboard.writeText('receipts@unsaid.app');
    } catch {
      /* clipboard unavailable — the address is on screen */
    }
    onToast('Forwarding address copied');
  };
  return (
    <div className="bg-background font-sans text-body-md text-on-surface antialiased">
      {/* Context header */}
      <div className="h-[52px] px-6 flex items-center justify-between bg-white border-b border-surface-dim">
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-[20px] text-on-surface-variant">account_balance</span>
          <span className="text-label-md font-semibold">Finance</span>
          <span className="text-outline">/</span>
          <span className="text-label-md">Accounting</span>
          <span className="text-outline">/</span>
          <span className="text-label-md text-primary font-semibold">Overview</span>
        </div>
      </div>

      <main className="px-6 pb-12">

        {/* Page header */}
        <div className="flex items-center justify-between gap-4 py-4">
          <div>
            <h1 className="text-headline-lg">Accounting — Overview</h1>
            <p className="text-body-sm text-on-surface-variant mt-0.5">Bank feed, receipts, reconcile, books. {ov?.entityName || 'Unsaid'} · {monthLabel}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low flex items-center gap-1"
              onClick={() => onToast('Date range picker')}
            >
              <span className="material-symbols-outlined text-[16px]">calendar_today</span>This month ▾</button>
            <button
              className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low flex items-center gap-1"
              onClick={handleExport}
            >
              <span className="material-symbols-outlined text-[16px]">download</span>Export</button>
          </div>
        </div>

        {/* Section tiles */}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 mb-5">
          {[
            { label: 'Financial overview', icon: 'insights', go: () => onNavigate('finance', 'accounting') },
            { label: 'Receivables', icon: 'request_quote', go: () => onNavigate('finance', 'acct-receivables') },
            { label: 'Payables', icon: 'receipt_long', go: () => onNavigate('finance', 'acct-payables') },
            { label: 'Payments', icon: 'payments', go: () => onNavigate('finance', 'acct-payments') },
            { label: 'Refunds and deposits', icon: 'undo', go: () => onNavigate('finance', 'acct-refunds-deposits') },
            { label: 'Banking', icon: 'account_balance', go: () => onNavigate('finance', 'bank') },
            { label: 'Books', icon: 'menu_book', go: () => onNavigate('finance', 'coa') },
            { label: 'Reports and valuation', icon: 'assessment', go: () => onNavigate('finance', 'reports') },
            { label: 'Taxes and payroll', icon: 'percent', go: () => onNavigate('finance', 'acct-taxes-payroll') },
            { label: 'Gift cards and subscriptions', icon: 'card_giftcard', go: () => onNavigate('finance', 'acct-gift-cards') },
            { label: 'Financial configuration', icon: 'settings', go: () => onNavigate('finance', 'acct-config') },
          ].map((tile) => (
            <button
              key={tile.label}
              className="bg-white rounded-xl border border-surface-dim p-4 text-left hover:bg-surface-container-low hover:border-primary transition-colors flex items-start gap-3"
              onClick={tile.go}
            >
              <span className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
                <span className="material-symbols-outlined text-[20px]">{tile.icon}</span>
              </span>
              <span className="min-w-0">
                <span className="text-body-sm font-semibold text-on-surface block">{tile.label}</span>
                <span className="text-[11px] text-on-surface-variant">Open →</span>
              </span>
            </button>
          ))}
        </div>

        {/* KPI strip — live aggregates from /api/accounting/overview */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-5">
          <div className="bg-white rounded-xl border border-surface-dim p-4">
            <span className="text-label-sm text-on-surface-variant uppercase tracking-wider">For review</span>
            <div className="text-headline-lg mt-1 tabular-nums">{ov ? ov.reviewCount : '—'}</div>
            <div className="text-[11px] text-tertiary mt-1 flex items-center gap-1">
              <span className="material-symbols-outlined text-[13px]">schedule</span>{ov && ov.reviewOldestDate ? `Oldest ${fmtShortDate(ov.reviewOldestDate)}` : 'Queue clear'}</div>
          </div>
          <div className="bg-white rounded-xl border border-surface-dim p-4">
            <span className="text-label-sm text-on-surface-variant uppercase tracking-wider">Uncategorized</span>
            <div className="text-headline-lg mt-1 tabular-nums">{ov ? fmtMoney(ov.uncategorizedTotal) : '—'}</div>
            <div className="text-[11px] text-on-surface-variant mt-1">{ov ? `${ov.uncategorizedCount} transaction${ov.uncategorizedCount === 1 ? '' : 's'}` : ''}</div>
          </div>
          <div className="bg-white rounded-xl border border-surface-dim p-4">
            <span className="text-label-sm text-on-surface-variant uppercase tracking-wider">Bank balance</span>
            <div className="text-headline-lg mt-1 tabular-nums">{ov ? fmtMoney(ov.bankBalance) : '—'}</div>
            <div className="text-[11px] text-secondary mt-1 flex items-center gap-1">
              <span className="material-symbols-outlined text-[13px]">sync</span>{ov ? `${ov.bankAccountCount} account${ov.bankAccountCount === 1 ? '' : 's'} · ${ov.bankAccountNames.join(', ')}` : ''}</div>
          </div>
          <div className="bg-white rounded-xl border border-surface-dim p-4">
            <span className="text-label-sm text-on-surface-variant uppercase tracking-wider">Reconciled</span>
            <div className="text-headline-lg mt-1 tabular-nums">{ov ? fmtShortDate(ov.lastReconciledDate) : '—'}</div>
            <div className="text-[11px] text-secondary mt-1 flex items-center gap-1">
              <span className="material-symbols-outlined text-[13px]">check_circle</span>{ov?.lastReconciledDate ? `Status ${ov.lastReconciledStatus || ''}` : 'No reconciliations yet'}</div>
          </div>
        </div>

        {/* Create actions row */}
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <span className="text-label-sm text-on-surface-variant uppercase tracking-wider font-bold mr-1">Create actions:</span>
          <button
            className="h-8 px-3 rounded-lg bg-white border border-surface-dim hover:bg-primary hover:text-white text-on-surface text-label-sm flex items-center gap-1.5"
            onClick={() => onCreate('Expense')}
          >
            <span className="material-symbols-outlined text-[16px]">credit_card</span>Expense</button>
          <button
            className="h-8 px-3 rounded-lg bg-white border border-surface-dim hover:bg-primary hover:text-white text-on-surface text-label-sm flex items-center gap-1.5"
            onClick={() => onCreate('Bank deposit')}
          >
            <span className="material-symbols-outlined text-[16px]">account_balance_wallet</span>Bank deposit</button>
          <button
            className="h-8 px-3 rounded-lg bg-white border border-surface-dim hover:bg-primary hover:text-white text-on-surface text-label-sm flex items-center gap-1.5"
            onClick={() => onCreate('Transfer')}
          >
            <span className="material-symbols-outlined text-[16px]">swap_horiz</span>Transfer</button>
          <button
            className="h-8 px-3 rounded-lg bg-white border border-surface-dim hover:bg-primary hover:text-white text-on-surface text-label-sm flex items-center gap-1.5"
            onClick={() => onCreate('Journal entry')}
          >
            <span className="material-symbols-outlined text-[16px]">menu_book</span>Journal entry</button>
          <button
            className="h-8 px-3 rounded-lg bg-white border border-surface-dim hover:bg-primary hover:text-white text-on-surface text-label-sm flex items-center gap-1.5"
            onClick={() => onCreate('Reconcile')}
          >
            <span className="material-symbols-outlined text-[16px]">fact_check</span>Reconcile</button>
          <button
            className="h-8 px-3 rounded-lg bg-white border border-surface-dim hover:bg-primary hover:text-white text-on-surface text-label-sm flex items-center gap-1.5"
            onClick={() => onToast('POS — opening')}
          >
            <span className="material-symbols-outlined text-[16px]">point_of_sale</span>POS</button>
          <button
            className="h-8 px-3 rounded-lg bg-surface-container hover:bg-surface-container-high text-label-sm flex items-center gap-1"
            onClick={onOpenCreateFlyout}
          >
            <span className="material-symbols-outlined text-[16px]">apps</span>Show all</button>
        </div>

        {/* Two-column: Setup checklist + Receipts inbox preview */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-5">

          {/* Setup checklist — each state read from the live tables */}
          <div className="bg-white rounded-xl border border-surface-dim p-5">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="text-headline-sm">Set up your books</h2>
                <p className="text-[11px] text-on-surface-variant mt-0.5">{setupDone} of {setupItems.length} complete</p>
              </div>
              <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-primary/10 text-primary">{setupPct}%</span>
            </div>
            <div className="progress-bar mb-3"><div style={{ width: `${setupPct}%` }} /></div>
            <div>
              {setupItems.map((item) => (
                <div className="check-row" key={item.label}>
                  <div className={`check-badge ${item.done ? 'done' : 'todo'}`}><span className="material-symbols-outlined text-[14px]">{item.done ? 'check' : 'chevron_right'}</span></div>
                  <div className="min-w-0 flex-1">
                    <div className="text-body-sm font-medium">{item.label}</div>
                    <div className="text-[11px] text-on-surface-variant">{item.sub}</div>
                  </div>
                  {item.go && (
                    <button
                      className="h-7 px-2 text-[11px] font-semibold text-primary border border-surface-dim rounded hover:bg-surface-container-low"
                      onClick={item.go}
                    >Open</button>
                  )}
                </div>
              ))}
              {!ov && <div className="text-[11px] text-on-surface-variant">Loading setup state…</div>}
            </div>
          </div>

          {/* Receipts inbox preview — live acct_document_inbox rows */}
          <div className="bg-white rounded-xl border border-surface-dim overflow-hidden">
            <div className="flex items-center justify-between px-5 pt-5 pb-3">
              <div>
                <h2 className="text-headline-sm">Receipts inbox</h2>
                <p className="text-[11px] text-on-surface-variant mt-0.5">{ov ? `${ov.receiptsForReview} for review` : 'Loading…'}</p>
              </div>
              <button
                className="text-[11px] font-semibold text-primary hover:underline"
                onClick={() => onNavigate(...ACCT_NAV.receipts())}
              >View all</button>
            </div>
            <div className="px-5 pb-3 flex items-center gap-2">
              <div className="flex-1 h-7 px-2 rounded bg-surface-container-low border border-surface-dim text-[11px] text-on-surface-variant flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[13px]">mail</span>
                receipts@unsaid.app
                <button
                  className="ml-auto text-primary font-semibold"
                  onClick={handleCopyFwd}
                >Copy</button>
              </div>
              <button
                className="h-7 px-2 border border-dashed border-surface-dim rounded text-[11px] text-primary font-semibold hover:bg-surface-container-low flex items-center gap-1"
                onClick={() => onNavigate(...ACCT_NAV.receipts())}
              >
                <span className="material-symbols-outlined text-[14px]">upload</span>Upload</button>
            </div>
            <div className="border-t border-surface-dim">
              {(ov?.receiptsPreview || []).map((r) => (
                <div className="inbox-row" key={r.id} onClick={() => onNavigate(...ACCT_NAV.receipts())}>
                  <div className="receipt-thumb"><span className="material-symbols-outlined text-[16px] text-on-surface-variant">receipt_long</span></div>
                  <div className="min-w-0 flex-1">
                    <div className="text-body-sm font-medium truncate">{r.vendorName}</div>
                    <div className="text-[11px] text-on-surface-variant">{fmtFeedDate(r.date)}{r.amount != null ? ` · ${fmtMoney(r.amount)}` : ''}{r.paymentAccountLabel ? ` · ${r.paymentAccountLabel}` : ''}</div>
                  </div>
                  {r.isNew && <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-tertiary/15 text-tertiary">New</span>}
                </div>
              ))}
              {ov && ov.receiptsPreview.length === 0 && (
                <div className="px-5 py-4 text-[11px] text-on-surface-variant">No receipts in the inbox yet — forward or upload one to start.</div>
              )}
            </div>
          </div>
        </div>

        {/* Two-column: For review feed + Recent activity */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">

          {/* For review feed — live bank transactions awaiting review */}
          <div className="xl:col-span-2 bg-white rounded-xl border border-surface-dim overflow-hidden">
            <div className="flex items-center justify-between px-5 pt-5 pb-3">
              <div>
                <h2 className="text-headline-sm">For review</h2>
                <p className="text-[11px] text-on-surface-variant mt-0.5">{ov ? `${ov.reviewCount} bank transaction${ov.reviewCount === 1 ? '' : 's'}` : 'Loading…'}</p>
              </div>
              <button
                className="text-[11px] font-semibold text-primary hover:underline"
                onClick={() => onNavigate(...ACCT_NAV.bank())}
              >Open bank feed</button>
            </div>
            <table className="w-full text-left text-body-sm">
              <thead className="bg-surface-container-low text-label-sm text-on-surface-variant uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-2">Date</th>
                  <th className="px-4 py-2">Description</th>
                  <th className="px-4 py-2 text-right">Amount</th>
                  <th className="px-4 py-2">Suggested</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-dim">
                {(ov?.reviewFeed || []).map((t) => (
                  <tr className="hover:bg-surface-container-low" key={t.id}>
                    <td className="px-4 py-2">{fmtFeedDate(t.date)}</td>
                    <td className="px-4 py-2 truncate">{t.description}</td>
                    <td className={`px-4 py-2 text-right tabular-nums ${t.amount < 0 ? 'text-error' : 'text-secondary'}`}>{t.amount < 0 ? '−' : '+'}{fmtMoney(Math.abs(t.amount))}</td>
                    <td className="px-4 py-2">{t.suggestedLabel ? <span className="px-2 py-0.5 rounded bg-surface-container text-[11px]">{t.suggestedLabel}</span> : <span className="text-[11px] text-on-surface-variant">—</span>}</td>
                    <td className="px-4 py-2 text-right"><button className="h-6 px-2 text-[11px] font-semibold text-primary border border-surface-dim rounded hover:bg-surface-container-low" onClick={() => onNavigate(...ACCT_NAV.bank())}>Review</button></td>
                  </tr>
                ))}
                {ov && ov.reviewFeed.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-4 text-[11px] text-on-surface-variant">Nothing waiting for review — the bank feed is clear.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Recent activity — latest journals, receipts and bank rows */}
          <div className="bg-white rounded-xl border border-surface-dim p-5">
            <h2 className="text-headline-sm mb-3">Recent activity</h2>
            <div className="space-y-3 text-body-sm">
              {(ov?.activity || []).map((a) => (
                <div className="flex items-start gap-2" key={a.id}>
                  <span className="material-symbols-outlined text-[16px] text-qb-blue mt-0.5">{ACTIVITY_ICONS[a.kind] || 'history'}</span>
                  <div className="min-w-0">
                    <div className="font-medium truncate">{a.title}</div>
                    <div className="text-[11px] text-on-surface-variant">{a.detail} · {fmtShortDate(a.at)}</div>
                  </div>
                </div>
              ))}
              {ov && ov.activity.length === 0 && (
                <div className="text-[11px] text-on-surface-variant">No activity yet.</div>
              )}
            </div>
            <button
              className="w-full mt-4 h-8 border border-surface-dim rounded text-body-sm hover:bg-surface-container-low flex items-center justify-center gap-1"
              onClick={() => onNavigate('settings', 'audit')}
            >
              <span className="material-symbols-outlined text-[14px]">history</span>Audit log
            </button>
          </div>
        </div>

      </main>
    </div>
  );
}
