'use client';

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { DomainKey } from '@/data/shellData';
import { exportToCsv } from '@/lib/csvExport';
import { useAccountingOverview, bankTxnMutations, receiptMutations } from '@/hooks/useAccountingApi';
import styles from './AccountingOverviewScreen.module.css';

const fmtDate = (iso: string) => {
  if (!iso) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[2]}/${m[3]}/${m[1]}` : iso;
};
const fmtShort = (iso: string) => {
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};
const money = (n: number) =>
  `${n < 0 ? '−' : ''}$${Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

async function fileFingerprint(file: File): Promise<string> {
  try {
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      const buf = await file.arrayBuffer();
      const digest = await crypto.subtle.digest('SHA-256', buf);
      return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
    }
  } catch { /* fall through */ }
  return `local-${file.name}-${file.size}-${file.lastModified}`;
}

interface ChecklistItem {
  id: string;
  title: string;
  desc: string;
  done: boolean;
  targetScreen?: string;
  targetDomain?: DomainKey;
}

interface ReceiptItem {
  id: string;
  payee: string;
  category: string;
  date: string;
  amount: string;
  account: string;
  isNew: boolean;
}

interface BankTransactionItem {
  id: string;
  date: string;
  desc: string;
  amount: number;
  suggested: string;
  suggestedAccountId: string | null;
  reviewed: boolean;
}

interface ActivityItem {
  id: string;
  icon: string;
  iconClass: string;
  title: string;
  meta: string;
}





export interface AccountingOverviewScreenProps {
  onNavigate: (domain: DomainKey, screenId: string) => void;
  onCreate: (label: string) => void;
  onOpenCreateFlyout: () => void;
  onOpenPeek?: (title: string, details: Record<string, string | number>) => void;
  onToast?: (message: string) => void;
}

export default function AccountingOverviewScreen({
  onNavigate,
  onCreate,
  onOpenCreateFlyout,
  onOpenPeek,
  onToast,
}: AccountingOverviewScreenProps) {
  // Time period
  const [selectedPeriod, setSelectedPeriod] = useState('This month');
  const [isPeriodMenuOpen, setIsPeriodMenuOpen] = useState(false);

  // Live data — every number on this screen comes from
  // /api/accounting/overview (real acct_* aggregates)
  const { overview, refresh: refreshOverview } = useAccountingOverview();

  const checklist: ChecklistItem[] = useMemo(() => {
    if (!overview) return [];
    return [
      {
        id: 'c1',
        title: 'Connect bank account',
        desc: overview.bankAccountCount > 0 ? `${overview.bankAccountNames.join(', ')} linked` : 'No bank account linked yet',
        done: overview.bankAccountCount > 0,
      },
      {
        id: 'c2',
        title: 'Chart of accounts',
        desc: `${overview.coaCount} active accounts`,
        done: overview.coaCount > 0,
      },
      {
        id: 'c3',
        title: 'First reconciliation',
        desc: overview.lastReconciledDate ? `Last reconciled ${fmtDate(overview.lastReconciledDate)}` : 'No reconciliations yet',
        done: !!overview.lastReconciledDate,
        targetScreen: 'reconcile',
        targetDomain: 'finance',
      },
      {
        id: 'c4',
        title: 'Import receipts',
        desc: overview.receiptsForReview > 0 ? `${overview.receiptsForReview} awaiting review` : 'Inbox clear',
        done: overview.receiptsForReview === 0,
        targetScreen: 'receipts',
        targetDomain: 'finance',
      },
      {
        id: 'c5',
        title: 'Set up bank rules',
        desc: overview.activeRuleCount > 0 ? `${overview.activeRuleCount} active rules` : 'Auto-categorize repeating transactions',
        done: overview.activeRuleCount > 0,
        targetScreen: 'rules',
        targetDomain: 'finance',
      },
      {
        id: 'c6',
        title: 'Sales tax',
        desc: overview.taxCodeCount > 0 ? `${overview.taxCodeCount} tax code${overview.taxCodeCount === 1 ? '' : 's'} configured` : 'Configure tax rates',
        done: overview.taxCodeCount > 0,
        targetScreen: 'tax-summary',
        targetDomain: 'finance',
      },
    ];
  }, [overview]);

  const receipts: ReceiptItem[] = useMemo(
    () =>
      (overview?.receiptsPreview || []).map((r) => ({
        id: r.id,
        payee: r.vendorName,
        category: '',
        date: fmtDate(r.date),
        amount: r.amount != null ? `$${r.amount.toFixed(2)}` : '—',
        account: r.paymentAccountLabel || '',
        isNew: r.isNew,
      })),
    [overview],
  );

  const bankTxns: BankTransactionItem[] = useMemo(
    () =>
      (overview?.reviewFeed || []).map((t) => ({
        id: t.id,
        date: fmtShort(t.date),
        desc: t.description,
        amount: t.amount,
        suggested: t.suggestedLabel || '—',
        suggestedAccountId: t.suggestedAccountId,
        reviewed: false,
      })),
    [overview],
  );

  const activities: ActivityItem[] = useMemo(() => {
    const icons: Record<string, { icon: string; cls: string }> = {
      journal: { icon: 'menu_book', cls: styles.activityIconSecondary },
      receipt: { icon: 'receipt_long', cls: styles.activityIconQbBlue },
      bank: { icon: 'account_balance', cls: styles.activityIconQbMaroon },
    };
    return (overview?.activity || []).map((a) => {
      const meta = icons[a.kind] || { icon: 'history', cls: styles.activityIconMuted };
      return {
        id: a.id,
        icon: meta.icon,
        iconClass: meta.cls,
        title: a.title,
        meta: `${a.detail} · ${new Date(a.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
      };
    });
  }, [overview]);

  // Modals
  const [isAuditModalOpen, setIsAuditModalOpen] = useState(false);
  const [selectedReviewTxn, setSelectedReviewTxn] = useState<BankTransactionItem | null>(null);

  // File input ref for receipt upload
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Toast
  const [localToast, setLocalToast] = useState<string | null>(null);
  const toastTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const showToast = (msg: string) => {
    if (onToast) onToast(msg);
    setLocalToast(msg);
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = setTimeout(() => {
      setLocalToast(null);
    }, 2200);
  };

  useEffect(() => {
    return () => {
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    };
  }, []);

  // Close period menu on outside click
  useEffect(() => {
    const handleDocClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest(`.${styles.headerActions}`)) {
        setIsPeriodMenuOpen(false);
      }
    };
    document.addEventListener('click', handleDocClick);
    return () => document.removeEventListener('click', handleDocClick);
  }, []);

  // Checklist calculations
  const completedCount = checklist.filter((i) => i.done).length;
  const totalCount = checklist.length;
  const progressPercent = Math.round((completedCount / totalCount) * 100);

  // Checklist state is computed from the books — the badge navigates
  // to the screen where the remaining work happens
  const handleToggleChecklist = (id: string) => {
    const item = checklist.find((i) => i.id === id);
    if (item?.done) {
      showToast(`${item.title} — done`);
      return;
    }
    if (item?.targetScreen) onNavigate(item.targetDomain || 'finance', item.targetScreen);
  };

  // Copy forwarding mail
  const handleCopyEmail = () => {
    const email = 'receipts@unsaid.app';
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(email);
    }
    showToast('Forwarding address copied to clipboard');
  };

  // Upload receipt
  const handleTriggerUpload = () => {
    fileInputRef.current?.click();
  };

  const handleFileUploaded = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    e.target.value = '';
    if (!files || files.length === 0) return;
    const file = files[0];
    void (async () => {
      const sha256 = await fileFingerprint(file);
      const res = await receiptMutations.intake({ fileName: file.name, sha256, source: 'upload' });
      if (res.ok) {
        showToast(`Receipt "${file.name}" received — awaiting extraction`);
        await refreshOverview();
      } else showToast(res.error || 'Upload failed');
    })();
  };

  // Review bank transaction — Accept applies the suggested category
  // through the bank-transactions API
  const handleAcceptReview = async (txn: BankTransactionItem) => {
    setSelectedReviewTxn(null);
    if (!txn.suggestedAccountId) {
      showToast('No category suggestion — categorize it in the bank feed');
      onNavigate('finance', 'bank');
      return;
    }
    const res = await bankTxnMutations.categorize(txn.id, txn.suggestedAccountId);
    if (res.ok) {
      showToast(`Categorized ${txn.desc} as ${txn.suggested}`);
      await refreshOverview();
    } else showToast(res.error || 'Categorize failed');
  };

  return (
    <div className={styles.container}>
      {/* Hidden file input for receipts */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.png,.jpg,.jpeg"
        style={{ display: 'none' }}
        onChange={handleFileUploaded}
      />

      {/* ═══════════ CONTEXT HEADER ═══════════ */}
      <div className={styles.contextHeader}>
        <div className={styles.breadcrumbsGroup}>
          <span className={`material-symbols-outlined ${styles.breadcrumbDomainIcon}`}>
            account_balance
          </span>
          <span className={styles.breadcrumbDomain}>Finance</span>
          <span className={styles.breadcrumbSep}>/</span>
          <span className={styles.breadcrumbSection}>Accounting</span>
          <span className={styles.breadcrumbSep}>/</span>
          <span className={styles.breadcrumbActive}>Overview</span>
        </div>
      </div>

      <main className={styles.main}>
        {/* ═══════════ PAGE HEADER ═══════════ */}
        <div className={styles.pageHeader}>
          <div>
            <h1 className={styles.pageTitle}>Accounting — Overview</h1>
            <p className={styles.pageSubtitle}>
              Bank feed, receipts, reconcile, books. {overview?.entityName || 'Unsaid'} · {new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
            </p>
          </div>
          <div className={styles.headerActions}>
            <button
              type="button"
              className={styles.headerBtn}
              onClick={(e) => {
                e.stopPropagation();
                setIsPeriodMenuOpen((prev) => !prev);
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                calendar_today
              </span>
              {selectedPeriod} ▾
            </button>

            {isPeriodMenuOpen && (
              <div className={styles.dropdownPopover}>
                {['This month', 'Last month', 'This quarter', 'Year to date'].map((period) => (
                  <button
                    key={period}
                    type="button"
                    className={`${styles.dropdownItem} ${
                      selectedPeriod === period ? styles.dropdownItemActive : ''
                    }`}
                    onClick={() => {
                      setSelectedPeriod(period);
                      setIsPeriodMenuOpen(false);
                      showToast('Overview totals are all-time — period filtering is not applied');
                    }}
                  >
                    <span>{period}</span>
                    {selectedPeriod === period && (
                      <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
                        check
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}

            <button
              type="button"
              className={styles.headerBtn}
              onClick={() => {
                const cols = [
                  { key: 'date', label: 'Date' },
                  { key: 'desc', label: 'Description' },
                  { key: 'amount', label: 'Amount' },
                  { key: 'suggested', label: 'Suggested match' },
                  { key: 'reviewed', label: 'Reviewed' },
                ];
                exportToCsv(bankTxns as unknown as Record<string, unknown>[], cols, 'accounting-overview');
                showToast(`Exported ${bankTxns.length} records to CSV`);
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                download
              </span>
              Export
            </button>
          </div>
        </div>

        {/* ═══════════ KPI STRIP ═══════════ */}
        <div className={styles.kpiStrip}>
          {/* Card 1 */}
          <div
            className={styles.kpiCard}
            style={{ cursor: 'pointer' }}
            onClick={() => onNavigate('finance', 'bank')}
          >
            <span className={styles.kpiLabel}>For review</span>
            <div className={styles.kpiValue}>{overview?.reviewCount ?? '—'}</div>
            <div className={styles.kpiDeltaTertiary}>
              <span className="material-symbols-outlined" style={{ fontSize: 13 }}>
                schedule
              </span>
              {overview?.reviewOldestDate
                ? `Oldest ${Math.max(0, Math.round((Date.now() - new Date(overview.reviewOldestDate).getTime()) / 86400000))} days ago`
                : 'Queue clear'}
            </div>
          </div>

          {/* Card 2 */}
          <div
            className={styles.kpiCard}
            style={{ cursor: 'pointer' }}
            onClick={() => onNavigate('finance', 'bank')}
          >
            <span className={styles.kpiLabel}>Uncategorized</span>
            <div className={styles.kpiValue}>{overview ? money(overview.uncategorizedTotal) : '—'}</div>
            <div className={styles.kpiDeltaMuted}>{overview?.uncategorizedCount ?? 0} transactions</div>
          </div>

          {/* Card 3 */}
          <div
            className={styles.kpiCard}
            style={{ cursor: 'pointer' }}
            onClick={() => onNavigate('finance', 'bank')}
          >
            <span className={styles.kpiLabel}>Bank balance</span>
            <div className={styles.kpiValue}>{overview ? money(overview.bankBalance) : '—'}</div>
            <div className={styles.kpiDeltaSecondary}>
              <span className="material-symbols-outlined" style={{ fontSize: 13 }}>
                sync
              </span>
              {overview?.bankAccountNames.join(' · ') || 'No accounts'}
            </div>
          </div>

          {/* Card 4 */}
          <div
            className={styles.kpiCard}
            style={{ cursor: 'pointer' }}
            onClick={() => onNavigate('finance', 'reconcile')}
          >
            <span className={styles.kpiLabel}>Reconciled</span>
            <div className={styles.kpiValue}>{overview?.lastReconciledDate ? fmtShort(overview.lastReconciledDate) : '—'}</div>
            <div className={styles.kpiDeltaSecondary}>
              <span className="material-symbols-outlined" style={{ fontSize: 13 }}>
                check_circle
              </span>
              {overview?.lastReconciledDate ? (overview.lastReconciledStatus || 'Reconciled') : 'No reconciliations yet'}
            </div>
          </div>

          {/* Card 5 — Revenue MTD (ledger, ties to /api/reports) */}
          <div
            className={styles.kpiCard}
            style={{ cursor: 'pointer' }}
            onClick={() => onNavigate('finance', 'quick-view')}
          >
            <span className={styles.kpiLabel}>Revenue MTD</span>
            <div className={styles.kpiValue}>{overview?.kpis ? money(overview.kpis.revenueMtd) : '—'}</div>
            <div className={styles.kpiDeltaSecondary}>Posted lines · this month</div>
          </div>

          {/* Card 6 — Expenses MTD (all expense accounts incl. COGS) */}
          <div
            className={styles.kpiCard}
            style={{ cursor: 'pointer' }}
            onClick={() => onNavigate('finance', 'quick-view')}
          >
            <span className={styles.kpiLabel}>Expenses MTD</span>
            <div className={styles.kpiValue}>{overview?.kpis ? money(overview.kpis.expensesMtd) : '—'}</div>
            <div className={styles.kpiDeltaSecondary}>Posted lines · this month</div>
          </div>

          {/* Card 7 — Net income YTD */}
          <div
            className={styles.kpiCard}
            style={{ cursor: 'pointer' }}
            onClick={() => onNavigate('finance', 'quick-view')}
          >
            <span className={styles.kpiLabel}>Net income YTD</span>
            <div className={styles.kpiValue}>{overview?.kpis ? money(overview.kpis.netIncomeYtd) : '—'}</div>
            <div className={styles.kpiDeltaSecondary}>Revenue − expenses · calendar YTD</div>
          </div>

          {/* Card 8 — Unposted drafts */}
          <div
            className={styles.kpiCard}
            style={{ cursor: 'pointer' }}
            onClick={() => onNavigate('finance', 'finance-accounting--journal-entries')}
          >
            <span className={styles.kpiLabel}>Unposted drafts</span>
            <div className={styles.kpiValue}>{overview?.kpis ? String(overview.kpis.unpostedDrafts) : '—'}</div>
            <div className={styles.kpiDeltaTertiary}>Journal entries awaiting posting</div>
          </div>

          {/* Card 9 — Close progress (latest month-end close) */}
          <div
            className={styles.kpiCard}
            style={{ cursor: 'pointer' }}
            onClick={() => onNavigate('finance', 'close')}
          >
            <span className={styles.kpiLabel}>Close progress</span>
            <div className={styles.kpiValue}>
              {overview?.kpis?.closeProgress ? `${overview.kpis.closeProgress.done}/${overview.kpis.closeProgress.total}` : '—'}
            </div>
            <div className={styles.kpiDeltaSecondary}>
              {overview?.kpis?.closeProgress
                ? `${Math.round((overview.kpis.closeProgress.done / Math.max(1, overview.kpis.closeProgress.total)) * 100)}% of tasks done`
                : 'No close started'}
            </div>
          </div>

          {/* Card 10 — Trial balance (must show balanced) */}
          <div
            className={styles.kpiCard}
            style={{ cursor: 'pointer' }}
            onClick={() => onNavigate('finance', 'quick-view')}
          >
            <span className={styles.kpiLabel}>Trial balance</span>
            <div className={styles.kpiValue}>
              {overview?.kpis ? (overview.kpis.trialBalance.balanced ? 'Balanced' : 'OUT OF BALANCE') : '—'}
            </div>
            <div className={styles.kpiDeltaSecondary}>
              {overview?.kpis ? `Dr ${money(overview.kpis.trialBalance.debits)} = Cr ${money(overview.kpis.trialBalance.credits)}` : ''}
            </div>
          </div>
        </div>

        {/* ═══════════ CREATE ACTIONS ROW ═══════════ */}
        <div className={styles.createActionsRow}>
          <span className={styles.createActionsLabel}>Create actions:</span>
          <button
            type="button"
            className={styles.createActionBtn}
            onClick={() => onCreate('Expense')}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
              credit_card
            </span>
            Expense
          </button>
          <button
            type="button"
            className={styles.createActionBtn}
            onClick={() => onCreate('Bank deposit')}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
              account_balance_wallet
            </span>
            Bank deposit
          </button>
          <button
            type="button"
            className={styles.createActionBtn}
            onClick={() => onCreate('Transfer')}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
              swap_horiz
            </span>
            Transfer
          </button>
          <button
            type="button"
            className={styles.createActionBtn}
            onClick={() => onCreate('Journal entry')}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
              menu_book
            </span>
            Journal entry
          </button>
          <button
            type="button"
            className={styles.createActionBtn}
            onClick={() => onNavigate('finance', 'reconcile')}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
              fact_check
            </span>
            Reconcile
          </button>
          <button
            type="button"
            className={styles.showAllBtn}
            onClick={onOpenCreateFlyout}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
              apps
            </span>
            Show all
          </button>
        </div>

        {/* ═══════════ TWO-COLUMN SECTION 1 ═══════════ */}
        <div className={styles.twoColGrid}>
          {/* Setup checklist */}
          <div className={styles.checklistCard}>
            <div className={styles.cardHeaderRow}>
              <div>
                <h2 className={styles.cardTitle}>Set up your books</h2>
                <p className={styles.cardSubtitle}>
                  {completedCount} of {totalCount} complete
                </p>
              </div>
              <span className={styles.percentagePill}>{progressPercent}%</span>
            </div>

            <div className={styles.progressBar}>
              <div
                className={styles.progressFill}
                style={{ width: `${progressPercent}%` }}
              />
            </div>

            <div>
              {checklist.map((item) => (
                <div key={item.id} className={styles.checkRow}>
                  <button
                    type="button"
                    className={item.done ? styles.checkBadgeDone : styles.checkBadgeTodo}
                    style={{ border: 'none', cursor: 'pointer' }}
                    onClick={() => handleToggleChecklist(item.id)}
                    title={item.done ? 'Mark as incomplete' : 'Mark as complete'}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
                      {item.done ? 'check' : 'chevron_right'}
                    </span>
                  </button>

                  <div className={styles.checkContent}>
                    <div className={styles.checkTitle}>{item.title}</div>
                    <div className={styles.checkDesc}>{item.desc}</div>
                  </div>

                  {!item.done && item.targetScreen && (
                    <button
                      type="button"
                      className={styles.checkActionBtn}
                      onClick={() => {
                        onNavigate(item.targetDomain || 'finance', item.targetScreen || 'overview');
                      }}
                    >
                      Open
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Receipts inbox preview */}
          <div className={styles.inboxCard}>
            <div className={styles.inboxHeader}>
              <div>
                <h2 className={styles.cardTitle}>Receipts inbox</h2>
                <p className={styles.cardSubtitle}>{overview?.receiptsForReview ?? 0} for review</p>
              </div>
              <button
                type="button"
                className={styles.viewAllLink}
                onClick={() => onNavigate('finance', 'receipts')}
              >
                View all
              </button>
            </div>

            <div className={styles.inboxActionsBar}>
              <div className={styles.emailChip}>
                <span className="material-symbols-outlined" style={{ fontSize: 13 }}>
                  mail
                </span>
                <span>receipts@unsaid.app</span>
                <button
                  type="button"
                  className={styles.copyEmailBtn}
                  onClick={handleCopyEmail}
                >
                  Copy
                </button>
              </div>
              <button
                type="button"
                className={styles.uploadReceiptBtn}
                onClick={handleTriggerUpload}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
                  upload
                </span>
                Upload
              </button>
            </div>

            <div className={styles.inboxList}>
              {receipts.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  className={styles.inboxRow}
                  onClick={() => {
                    if (onOpenPeek) {
                      onOpenPeek(`Receipt — ${r.payee}`, {
                        Payee: r.payee,
                        Category: r.category,
                        Date: r.date,
                        Amount: r.amount,
                        Account: r.account,
                        Status: r.isNew ? 'New' : 'Reviewed',
                      });
                    } else {
                      showToast(`Reviewing receipt: ${r.payee} (${r.amount})`);
                    }
                  }}
                >
                  <div className={styles.receiptThumb}>
                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                      receipt_long
                    </span>
                  </div>
                  <div className={styles.inboxRowContent}>
                    <div className={styles.inboxRowTitle}>
                      {r.payee}{r.category ? ` · ${r.category}` : ''}
                    </div>
                    <div className={styles.inboxRowMeta}>
                      {r.date} · {r.amount}{r.account ? ` · ${r.account}` : ''}
                    </div>
                  </div>
                  {r.isNew && <span className={styles.newBadge}>New</span>}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ═══════════ TWO-COLUMN SECTION 2 ═══════════ */}
        <div className={styles.bankActivityGrid}>
          {/* For review feed (Bank transactions) */}
          <div className={styles.bankCard}>
            <div className={styles.inboxHeader}>
              <div>
                <h2 className={styles.cardTitle}>For review</h2>
                <p className={styles.cardSubtitle}>
                  {overview?.reviewCount ?? 0} bank transactions
                </p>
              </div>
              <button
                type="button"
                className={styles.viewAllLink}
                onClick={() => onNavigate('finance', 'bank')}
              >
                Open bank feed
              </button>
            </div>

            <table className={styles.bankTable}>
              <thead className={styles.bankThead}>
                <tr>
                  <th>Date</th>
                  <th>Description</th>
                  <th style={{ textAlign: 'right' }}>Amount</th>
                  <th>Suggested</th>
                  <th style={{ textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {bankTxns.map((txn) => {
                  const isDebit = txn.amount < 0;
                  const formattedAmount = `${isDebit ? '−' : '+'}$${Math.abs(txn.amount).toLocaleString(
                    undefined,
                    { minimumFractionDigits: 2, maximumFractionDigits: 2 }
                  )}`;

                  return (
                    <tr key={txn.id} className={styles.bankRow}>
                      <td className={styles.bankCell} style={{ width: 64 }}>
                        {txn.date}
                      </td>
                      <td
                        className={styles.bankCell}
                        style={{
                          fontWeight: 500,
                          maxWidth: 220,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {txn.desc}
                      </td>
                      <td
                        className={`${styles.bankCell} ${
                          isDebit ? styles.amountDebit : styles.amountCredit
                        }`}
                      >
                        {formattedAmount}
                      </td>
                      <td className={styles.bankCell}>
                        <span className={styles.suggestedTag}>{txn.suggested}</span>
                      </td>
                      <td className={styles.bankCell} style={{ textAlign: 'right' }}>
                        {txn.reviewed ? (
                          <span
                            style={{
                              fontSize: 11,
                              color: '#006c47',
                              fontWeight: 600,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 2,
                            }}
                          >
                            <span className="material-symbols-outlined" style={{ fontSize: 13 }}>
                              check
                            </span>
                            Matched
                          </span>
                        ) : (
                          <button
                            type="button"
                            className={styles.reviewBtn}
                            onClick={() => setSelectedReviewTxn(txn)}
                          >
                            Review
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Recent activity */}
          <div className={styles.activityCard}>
            <h2 className={styles.cardTitle} style={{ marginBottom: 16 }}>
              Recent activity
            </h2>
            <div className={styles.activityList}>
              {activities.length === 0 && (
                <div style={{ fontSize: 12, color: '#5a6355', padding: '8px 0' }}>No accounting activity yet.</div>
              )}
              {activities.map((act) => (
                <div key={act.id} className={styles.activityItem}>
                  <span
                    className={`material-symbols-outlined ${styles.activityIcon} ${act.iconClass}`}
                  >
                    {act.icon}
                  </span>
                  <div className={styles.activityContent}>
                    <div className={styles.activityTitle}>{act.title}</div>
                    <div className={styles.activityTime}>{act.meta}</div>
                  </div>
                </div>
              ))}
            </div>

            <button
              type="button"
              className={styles.auditLogBtn}
              onClick={() => setIsAuditModalOpen(true)}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
                history
              </span>
              Audit log
            </button>
          </div>
        </div>
      </main>

      {/* ═══════════ MODALS ═══════════ */}

      {/* Bank Transaction Review Modal */}
      {selectedReviewTxn && (
        <div className={styles.modalBackdrop} onClick={() => setSelectedReviewTxn(null)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>Review Transaction</h3>
              <button
                type="button"
                className={styles.modalCloseBtn}
                onClick={() => setSelectedReviewTxn(null)}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                  close
                </span>
              </button>
            </div>

            <div className={styles.modalBody}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '12px 16px',
                  borderRadius: 6,
                  backgroundColor: '#f4f3f7',
                }}
              >
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{selectedReviewTxn.desc}</div>
                  <div style={{ fontSize: 12, color: '#5a6355' }}>Date: {selectedReviewTxn.date}</div>
                </div>
                <div
                  style={{
                    fontSize: 18,
                    fontWeight: 700,
                    color: selectedReviewTxn.amount < 0 ? '#ba1a1a' : '#006c47',
                  }}
                >
                  {selectedReviewTxn.amount < 0 ? '−' : '+'}$
                  {Math.abs(selectedReviewTxn.amount).toFixed(2)}
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#5a6355', marginBottom: 4 }}>
                  Suggested Match / Category
                </label>
                <div style={{ fontSize: 13, fontWeight: 500, color: '#0a6400' }}>
                  {selectedReviewTxn.suggested}
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#5a6355', marginBottom: 4 }}>
                  Rule or Match Logic
                </label>
                <div style={{ fontSize: 12, color: '#5a6355' }}>
                  Suggested by the platform from bank rules and prior categorizations. Accepting applies this category to the transaction.
                </div>
              </div>
            </div>

            <div className={styles.modalFooter}>
              <button
                type="button"
                className={styles.btnSecondary}
                onClick={() => {
                  setSelectedReviewTxn(null);
                  showToast('Opened advanced editor in Bank feed');
                  onNavigate('finance', 'bank');
                }}
              >
                Edit details
              </button>
              <button
                type="button"
                className={styles.btnPrimary}
                onClick={() => void handleAcceptReview(selectedReviewTxn)}
              >
                Accept &amp; Match
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Audit Log Modal */}
      {isAuditModalOpen && (
        <div className={styles.modalBackdrop} onClick={() => setIsAuditModalOpen(false)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>Accounting Audit Log</h3>
              <button
                type="button"
                className={styles.modalCloseBtn}
                onClick={() => setIsAuditModalOpen(false)}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                  close
                </span>
              </button>
            </div>

            <div className={styles.modalBody}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontSize: 12 }}>
                {(overview?.activity || []).map((a) => (
                  <div key={a.id} style={{ paddingBottom: 8, borderBottom: '1px solid #eeedf1' }}>
                    <div style={{ fontWeight: 600, color: '#1a1c1e' }}>{a.title}</div>
                    <div style={{ color: '#5a6355' }}>{a.detail} · {new Date(a.at).toLocaleString('en-US')}</div>
                  </div>
                ))}
                {(overview?.activity || []).length === 0 && (
                  <div style={{ color: '#5a6355' }}>No accounting activity recorded yet.</div>
                )}
              </div>
            </div>

            <div className={styles.modalFooter}>
              <button
                type="button"
                className={styles.btnPrimary}
                onClick={() => setIsAuditModalOpen(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Local Toast */}
      {localToast && (
        <div className={styles.toast}>
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
            check_circle
          </span>
          {localToast}
        </div>
      )}
    </div>
  );
}
