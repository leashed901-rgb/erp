'use client';

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { DomainKey } from '@/data/shellData';
import { exportToCsv } from '@/lib/csvExport';
import {
  useBankAccounts,
  useBankTransactions,
  useChartOfAccounts,
  useBankRules,
  bankTxnMutations,
  bankRuleMutations,
  fetchMatchCandidates,
} from '@/hooks/useAccountingApi';
import type { BankTxnDto, MatchCandidate } from '@/lib/acctTypes';
import type { BankDeposit, BankDepositLine, BankTransfer } from '@/lib/bankDetailTypes';
import styles from './BankTransactionsScreen.module.css';

export interface BankTxn {
  id: string;
  date: string;
  desc: string;
  payee: string;
  amount: number;
  category: string;
  isSuggested: boolean;
  matchText?: string;
  status: 'review' | 'categorized' | 'excluded';
  dto: BankTxnDto;
}

const fmtUsDate = (iso: string) => {
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
};

/* acct_bank_transactions DTO → the table's row shape */
function toBankTxn(t: BankTxnDto): BankTxn {
  return {
    id: t.id,
    date: fmtUsDate(t.date),
    desc: t.description,
    payee: t.payee || '—',
    amount: t.amount,
    category: t.categoryLabel || t.suggestedLabel || 'Select category',
    isSuggested: !t.categoryLabel && !!t.suggestedLabel,
    matchText: t.matchedLabel || undefined,
    status: t.status,
    dto: t,
  };
}

export interface BankTransactionsScreenProps {
  onNavigate: (domain: DomainKey, screenId: string) => void;
  onOpenPeek?: (title: string, details: Record<string, string | number>) => void;
  onToast?: (msg: string) => void;
}

export default function BankTransactionsScreen({
  onNavigate,
  onOpenPeek,
  onToast,
}: BankTransactionsScreenProps) {
  const { bankAccounts, refresh: refreshBankAccounts } = useBankAccounts();
  const [activeAccountId, setActiveAccountId] = useState<string | null>(null);
  useEffect(() => {
    if (!activeAccountId && bankAccounts.length) setActiveAccountId(bankAccounts[0].id);
  }, [bankAccounts, activeAccountId]);
  const activeAccount = bankAccounts.find((a) => a.id === activeAccountId) || null;
  const { transactions, refresh: refreshTxns } = useBankTransactions(activeAccountId);
  const { accounts: coaAccounts } = useChartOfAccounts();
  const { rules, refresh: refreshRules } = useBankRules();
  const txns = useMemo(() => transactions.map(toBankTxn), [transactions]);
  const refreshAll = async () => {
    await refreshTxns();
    await refreshBankAccounts();
  };

  const [activeTab, setActiveTab] = useState<'review' | 'categorized' | 'excluded' | 'all'>('review');

  // ── Batch D: deposits + transfers live here too — the feed screen is
  //    where money moves, and neither list had a home anywhere. ──
  const [view, setView] = useState<'feed' | 'deposits' | 'transfers'>('feed');
  const [deposits, setDeposits] = useState<BankDeposit[] | null>(null);
  const [transfers, setTransfers] = useState<BankTransfer[] | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [selectedDeposit, setSelectedDeposit] = useState<BankDeposit | null>(null);
  const [depositLines, setDepositLines] = useState<BankDepositLine[]>([]);
  const [showDepositForm, setShowDepositForm] = useState(false);
  const [showTransferForm, setShowTransferForm] = useState(false);

  const loadDeposits = async () => {
    setDetailError(null);
    const j = await fetch('/api/bank-deposits').then((r) => r.json()).catch(() => null);
    if (j?.error) { setDetailError(j.error.message || 'Deposits load failed'); return; }
    setDeposits((j?.data || []) as BankDeposit[]);
  };

  const loadTransfers = async () => {
    setDetailError(null);
    const j = await fetch('/api/bank-transfers').then((r) => r.json()).catch(() => null);
    if (j?.error) { setDetailError(j.error.message || 'Transfers load failed'); return; }
    setTransfers((j?.data || []) as BankTransfer[]);
  };

  useEffect(() => {
    if (view === 'deposits' && deposits === null) void loadDeposits();
    if (view === 'transfers' && transfers === null) void loadTransfers();
  }, [view, deposits, transfers]);

  const openDeposit = async (d: BankDeposit) => {
    setSelectedDeposit(d);
    setDetailLoading(true);
    const j = await fetch(`/api/bank-deposits/${d.id}`).then((r) => r.json()).catch(() => null);
    setDetailLoading(false);
    if (j?.error) { setDetailError(j.error.message || 'Deposit detail failed'); return; }
    setDepositLines((j?.lines || []) as BankDepositLine[]);
  };

  const voidTransfer = async (id: string) => {
    const res = await fetch(`/api/bank-transfers/${id}/void`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason: 'Voided from the transfers list' }) });
    const j = await res.json().catch(() => null);
    if (!res.ok || j?.error) { showToast(j?.error?.message || 'Void failed'); return; }
    await loadTransfers();
    showToast('Transfer voided — reversing journal posted');
  };
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');

  // Category picker state ('matches' mode lists real match candidates)
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerMode, setPickerMode] = useState<'cats' | 'matches'>('cats');
  const [matchCandidates, setMatchCandidates] = useState<MatchCandidate[]>([]);
  const [pickerTargetTxId, setPickerTargetTxId] = useState<string | null>(null);
  const [pickerPos, setPickerPos] = useState({ top: 0, left: 0 });
  const [catSearch, setCatSearch] = useState('');

  /* Rule suggestion computed from the real feed: the same payee
     categorized to the same account at least twice, with no active
     rule already covering that text. */
  const ruleSuggestion = useMemo(() => {
    const groups = new Map<string, { count: number; categoryAccountId: string; categoryLabel: string; keyword: string }>();
    for (const t of transactions) {
      if (!t.categoryAccountId || !t.categoryLabel) continue;
      const keyword = (t.payee || t.description || '').trim();
      if (!keyword) continue;
      const key = `${keyword.toLowerCase()}|${t.categoryAccountId}`;
      const g = groups.get(key) || { count: 0, categoryAccountId: t.categoryAccountId, categoryLabel: t.categoryLabel, keyword };
      g.count += 1;
      groups.set(key, g);
    }
    for (const g of groups.values()) {
      if (g.count < 2) continue;
      const covered = rules.some(
        (r) => r.isActive && r.conditions.some((c) => c.field === 'description' && c.value.toLowerCase() === g.keyword.toLowerCase()),
      );
      if (!covered) return g;
    }
    return null;
  }, [transactions, rules]);
  const showRuleBanner = !bannerDismissed && !!ruleSuggestion;

  // Toast
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimerRef = useRef<NodeJS.Timeout | null>(null);

  const showToast = (msg: string) => {
    if (onToast) onToast(msg);
    setToastMessage(msg);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToastMessage(null), 2000);
  };

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  // Filtered transactions
  const filteredTxns = useMemo(() => {
    return txns.filter((t) => {
      if (activeTab !== 'all' && t.status !== activeTab) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const match =
          t.desc.toLowerCase().includes(q) ||
          t.payee.toLowerCase().includes(q) ||
          t.category.toLowerCase().includes(q) ||
          t.amount.toString().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [txns, activeTab, searchQuery]);

  // Bulk selection
  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedIds(new Set(filteredTxns.map((t) => t.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const handleToggleRow = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const isAllSelected = filteredTxns.length > 0 && selectedIds.size === filteredTxns.length;

  // Category picker open
  const openCategoryPicker = (e: React.MouseEvent, txId: string) => {
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setPickerPos({
      top: rect.bottom + 4,
      left: Math.min(rect.left, window.innerWidth - 300),
    });
    setPickerTargetTxId(txId);
    setPickerMode('cats');
    setCatSearch('');
    setPickerOpen(true);
  };

  // Close popovers on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest(`.${styles.catPicker}`) && !target.closest(`.${styles.catChip}`)) {
        setPickerOpen(false);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  const handlePickCategory = async (val: string) => {
    if (!pickerTargetTxId) return;
    const id = pickerTargetTxId;
    if (val === '__match__') {
      setMatchCandidates([]);
      setPickerMode('matches');
      const res = await fetchMatchCandidates(id);
      if (res.ok && res.data) setMatchCandidates(res.data);
      else showToast(res.error || 'No match candidates found');
      return;
    }
    setPickerOpen(false);
    if (val === '__exclude__') {
      const target = txns.find((t) => t.id === id);
      const res = target?.status === 'excluded' ? await bankTxnMutations.restore(id) : await bankTxnMutations.exclude(id);
      if (res.ok) {
        showToast(target?.status === 'excluded' ? 'Transaction restored' : 'Transaction excluded');
        await refreshAll();
      } else showToast(res.error || 'Action failed');
      return;
    }
    const account = coaAccounts.find((a) => a.id === val);
    const res = await bankTxnMutations.categorize(id, val);
    if (res.ok) {
      showToast(`Categorized as ${account?.name || 'category'}`);
      await refreshAll();
    } else showToast(res.error || 'Categorize failed');
  };

  const handlePickMatch = async (candidate: MatchCandidate) => {
    if (!pickerTargetTxId) return;
    setPickerOpen(false);
    const res = await bankTxnMutations.match(pickerTargetTxId, candidate.journalLineId);
    if (res.ok) {
      showToast('Transaction matched');
      await refreshAll();
    } else showToast(res.error || 'Match failed');
  };

  const handleCreateSuggestedRule = async () => {
    if (!ruleSuggestion) return;
    const res = await bankRuleMutations.create({
      name: `${ruleSuggestion.keyword} → ${ruleSuggestion.categoryLabel}`,
      appliesTo: 'both',
      matchMode: 'all',
      txnType: 'expense',
      conditions: [{ field: 'description', operator: 'contains', value: ruleSuggestion.keyword }],
      categoryAccountId: ruleSuggestion.categoryAccountId,
    });
    if (res.ok) {
      showToast(`Rule created: ${ruleSuggestion.keyword} → ${ruleSuggestion.categoryLabel}`);
      setBannerDismissed(true);
      await refreshRules();
    } else showToast(res.error || 'Rule could not be created');
  };

  // Bulk actions — each row runs its real mutation; toast the tally
  const handleBulkCategorize = async (accountId: string) => {
    if (!accountId) return;
    const ids = [...selectedIds];
    let ok = 0;
    for (const id of ids) {
      const res = await bankTxnMutations.categorize(id, accountId);
      if (res.ok) ok += 1;
    }
    const account = coaAccounts.find((a) => a.id === accountId);
    showToast(`Categorized ${ok} of ${ids.length} transactions as ${account?.name || 'category'}`);
    setSelectedIds(new Set());
    await refreshAll();
  };

  const handleBulkExclude = async () => {
    const ids = [...selectedIds];
    let ok = 0;
    for (const id of ids) {
      const res = await bankTxnMutations.exclude(id);
      if (res.ok) ok += 1;
    }
    showToast(`Excluded ${ok} of ${ids.length} transactions`);
    setSelectedIds(new Set());
    await refreshAll();
  };

  const handleBulkMatch = async () => {
    const ids = [...selectedIds];
    let matched = 0;
    let skipped = 0;
    for (const id of ids) {
      const res = await fetchMatchCandidates(id);
      const candidates = res.ok && res.data ? res.data : [];
      if (candidates.length === 1) {
        const m = await bankTxnMutations.match(id, candidates[0].journalLineId);
        if (m.ok) matched += 1;
        else skipped += 1;
      } else skipped += 1;
    }
    showToast(`Matched ${matched} transaction${matched === 1 ? '' : 's'}${skipped ? ` · ${skipped} skipped (no single candidate)` : ''}`);
    setSelectedIds(new Set());
    await refreshAll();
  };

  const handleBulkDelete = async () => {
    const ids = [...selectedIds];
    let ok = 0;
    for (const id of ids) {
      const res = await bankTxnMutations.remove(id);
      if (res.ok) ok += 1;
    }
    showToast(`Deleted ${ok} of ${ids.length} transactions`);
    setSelectedIds(new Set());
    await refreshAll();
  };

  const reviewCount = txns.filter((t) => t.status === 'review').length;

  return (
    <div className={styles.container}>
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
          <span className={styles.breadcrumbActive}>Bank transactions</span>
        </div>
      </div>

      <main className={styles.main}>
        {/* Page Header */}
        <div className={styles.pageHeader}>
          <div>
            <h1 className={styles.pageTitle}>Bank transactions</h1>
            <p className={styles.pageSubtitle}>
              For review feed + bank rules{activeAccount ? ` · ${activeAccount.name}${activeAccount.maskedNumber ? ` •${activeAccount.maskedNumber}` : ''}` : ''}
              {activeAccount?.lastSyncAt ? ` · synced ${new Date(activeAccount.lastSyncAt).toLocaleDateString('en-US')}` : ''}
            </p>
          </div>
          <div className={styles.headerActions}>
            <button
              type="button"
              className={styles.headerBtn}
              onClick={() => {
                void refreshAll();
                showToast('Bank feed refreshed');
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                sync
              </span>
              Sync bank
            </button>
            <button
              type="button"
              className={styles.headerBtn}
              onClick={() => onNavigate('finance', 'rules')}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                tune
              </span>
              Rules
            </button>
            <button
              type="button"
              className={styles.headerBtn}
              onClick={() => {
                const cols = [
                  { key: 'date', label: 'Date' },
                  { key: 'desc', label: 'Description' },
                  { key: 'payee', label: 'Payee' },
                  { key: 'amount', label: 'Amount' },
                  { key: 'category', label: 'Category' },
                  { key: 'status', label: 'Status' },
                ];
                exportToCsv(filteredTxns as unknown as Record<string, unknown>[], cols, 'bank-transactions');
                showToast(`Exported ${filteredTxns.length} records to CSV`);
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                download
              </span>
              Export
            </button>
          </div>
        </div>

        {/* Account Tabs — the tenant's real bank accounts */}
        <div className={styles.accountTabs}>
          {bankAccounts.map((a) => (
            <button
              key={a.id}
              type="button"
              className={`${styles.accountTab} ${
                activeAccountId === a.id ? styles.accountTabActive : ''
              }`}
              onClick={() => {
                setActiveAccountId(a.id);
                setSelectedIds(new Set());
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
                {a.accountKind.toLowerCase().includes('card') || a.accountType.toLowerCase().includes('card') ? 'credit_card' : 'account_balance'}
              </span>
              {a.name}
              {a.maskedNumber ? ` •${a.maskedNumber}` : ''}
            </button>
          ))}
          <button
            type="button"
            className={styles.accountTab}
            onClick={() => showToast('Bank connections are managed by the platform')}
            style={{ color: '#5a6355' }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
              add
            </span>
            Connect account
          </button>
        </div>

        {/* Rule Suggestion Banner — computed from the live feed */}
        {showRuleBanner && ruleSuggestion && (
          <div className={styles.ruleBanner}>
            <span className={`material-symbols-outlined ${styles.ruleBannerIcon}`}>
              auto_awesome
            </span>
            <div className={styles.ruleBannerText}>
              <div style={{ fontWeight: 600 }}>Rule suggestion</div>
              <div className={styles.ruleBannerDesc}>
                You&apos;ve categorized {ruleSuggestion.count} {ruleSuggestion.keyword} transactions as <strong>{ruleSuggestion.categoryLabel}</strong>. Create a rule to auto-categorize future ones?
              </div>
            </div>
            <button
              type="button"
              className={styles.ruleBannerBtn}
              onClick={() => void handleCreateSuggestedRule()}
            >
              Create rule
            </button>
            <button
              type="button"
              className={styles.ruleBannerDismiss}
              onClick={() => setBannerDismissed(true)}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                close
              </span>
            </button>
          </div>
        )}

        {/* View switcher — the feed is the default; deposits and
            transfers are the money that already moved. */}
        <div className={styles.tabsBar} style={{ marginBottom: 12 }}>
          {(['feed', 'deposits', 'transfers'] as const).map((v) => (
            <button
              key={v}
              type="button"
              className={`${styles.tabBtn} ${view === v ? styles.tabBtnActive : ''}`}
              onClick={() => setView(v)}
            >
              {v === 'feed' ? 'Bank feed' : v === 'deposits' ? 'Deposits' : 'Transfers'}
              {v === 'deposits' && deposits !== null && <span className={styles.countPill}>{deposits.length}</span>}
              {v === 'transfers' && transfers !== null && <span className={styles.countPill}>{transfers.length}</span>}
            </button>
          ))}
        </div>

        {/* Table Card */}
        <div className={styles.tableCard} style={view === 'feed' ? undefined : { display: 'none' }}>
          {/* Tabs */}
          <div className={styles.tabsBar}>
            <button
              type="button"
              className={`${styles.tabBtn} ${
                activeTab === 'review' ? styles.tabBtnActive : ''
              }`}
              onClick={() => {
                setActiveTab('review');
                setSelectedIds(new Set());
              }}
            >
              For review
              <span className={styles.countPill}>{reviewCount}</span>
            </button>
            <button
              type="button"
              className={`${styles.tabBtn} ${
                activeTab === 'categorized' ? styles.tabBtnActive : ''
              }`}
              onClick={() => {
                setActiveTab('categorized');
                setSelectedIds(new Set());
              }}
            >
              Categorized
            </button>
            <button
              type="button"
              className={`${styles.tabBtn} ${
                activeTab === 'excluded' ? styles.tabBtnActive : ''
              }`}
              onClick={() => {
                setActiveTab('excluded');
                setSelectedIds(new Set());
              }}
            >
              Excluded
            </button>
            <button
              type="button"
              className={`${styles.tabBtn} ${
                activeTab === 'all' ? styles.tabBtnActive : ''
              }`}
              onClick={() => {
                setActiveTab('all');
                setSelectedIds(new Set());
              }}
            >
              All
            </button>
          </div>

          {/* Filter Bar */}
          <div className={styles.filterBar}>
            <div className={styles.searchInputWrap}>
              <span className={`material-symbols-outlined ${styles.searchIcon}`}>
                search
              </span>
              <input
                className={styles.searchInput}
                placeholder="Filter by description, amount…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <button
              type="button"
              className={styles.filterBtn}
              onClick={() => showToast('Date range filter')}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
                calendar_today
              </span>
              Date range
            </button>
            <button
              type="button"
              className={styles.filterBtn}
              onClick={() => showToast('Saved views panel')}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
                bookmark
              </span>
              Saved views
            </button>
            <span className={styles.itemCountText}>
              {filteredTxns.length} of {txns.length}
            </span>
          </div>

          {/* Bulk Action Bar */}
          {selectedIds.size > 0 && (
            <div className={styles.bulkBar}>
              <span className={styles.bulkBarText}>
                {selectedIds.size} selected
              </span>
              <span className={styles.bulkBarSep} />
              <select
                className={styles.bulkSelect}
                defaultValue=""
                onChange={(e) => {
                  void handleBulkCategorize(e.target.value);
                  e.target.value = '';
                }}
              >
                <option value="" disabled>
                  Categorize as…
                </option>
                {coaAccounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
              <button
                type="button"
                className={styles.bulkActionBtn}
                onClick={() => void handleBulkMatch()}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
                  link
                </span>
                Match
              </button>
              <button
                type="button"
                className={styles.bulkActionBtn}
                onClick={() => void handleBulkExclude()}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
                  block
                </span>
                Exclude
              </button>
              <button
                type="button"
                className={styles.bulkActionBtn}
                onClick={() => onNavigate('finance', 'receipts')}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
                  receipt
                </span>
                Attach receipt
              </button>
              <span className={styles.bulkBarSep} />
              <button
                type="button"
                className={styles.bulkActionBtn}
                onClick={() => void handleBulkDelete()}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
                  delete
                </span>
                Delete
              </button>
              <button
                type="button"
                className={styles.bulkCloseBtn}
                onClick={() => setSelectedIds(new Set())}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                  close
                </span>
              </button>
            </div>
          )}

          {/* Table */}
          <table className={styles.table}>
            <thead className={styles.thead}>
              <tr>
                <th style={{ width: 36, paddingLeft: 12 }}>
                  <input
                    type="checkbox"
                    className={styles.rowCheck}
                    checked={isAllSelected}
                    onChange={handleSelectAll}
                  />
                </th>
                <th>Date</th>
                <th>Description</th>
                <th>Payee</th>
                <th style={{ textAlign: 'right' }}>Amount</th>
                <th>Category</th>
                <th>Match</th>
                <th style={{ width: 36 }} />
              </tr>
            </thead>
            <tbody>
              {filteredTxns.map((t) => {
                const isSelected = selectedIds.has(t.id);
                const isDebit = t.amount < 0;
                const formattedAmount = `${isDebit ? '−' : '+'}$${Math.abs(t.amount).toFixed(2)}`;

                return (
                  <tr
                    key={t.id}
                    className={`${styles.row} ${t.status === 'excluded' ? styles.rowExcluded : ''}`}
                    onClick={() => {
                      if (onOpenPeek) {
                        onOpenPeek(`Bank Transaction — ${t.desc}`, {
                          Date: t.date,
                          Description: t.desc,
                          Payee: t.payee,
                          Amount: formattedAmount,
                          Category: t.category,
                          Status: t.status,
                          Account: activeAccount ? activeAccount.name : '',
                        });
                      } else {
                        showToast(`Opened transaction: ${t.desc}`);
                      }
                    }}
                  >
                    <td
                      className={styles.td}
                      style={{ width: 36, paddingLeft: 12 }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        className={styles.rowCheck}
                        checked={isSelected}
                        onChange={() => handleToggleRow(t.id)}
                      />
                    </td>
                    <td className={styles.td}>{t.date}</td>
                    <td className={styles.td} style={{ fontWeight: 500 }}>
                      {t.desc}
                    </td>
                    <td className={styles.td} style={{ color: '#5a6355' }}>
                      {t.payee}
                    </td>
                    <td
                      className={styles.td}
                      style={{
                        textAlign: 'right',
                        fontVariantNumeric: 'tabular-nums',
                        fontWeight: 600,
                        color: isDebit ? '#ba1a1a' : '#006c47',
                      }}
                    >
                      {formattedAmount}
                    </td>
                    <td className={styles.td} onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        className={`${styles.catChip} ${
                          t.isSuggested
                            ? styles.catChipSuggested
                            : t.status === 'excluded'
                            ? styles.catChipExcluded
                            : ''
                        }`}
                        onClick={(e) => openCategoryPicker(e, t.id)}
                      >
                        {t.isSuggested && (
                          <span className="material-symbols-outlined" style={{ fontSize: 12 }}>
                            auto_awesome
                          </span>
                        )}
                        {!t.isSuggested && t.category === 'Select category' && (
                          <span className="material-symbols-outlined" style={{ fontSize: 12 }}>
                            expand_more
                          </span>
                        )}
                        {t.category}
                      </button>
                    </td>
                    <td className={styles.td}>
                      {t.matchText ? (
                        <span className={styles.matchBadge}>
                          <span className="material-symbols-outlined" style={{ fontSize: 11 }}>
                            link
                          </span>
                          {t.matchText}
                        </span>
                      ) : (
                        <span style={{ fontSize: 11, color: '#5a6355' }}>—</span>
                      )}
                    </td>
                    <td className={styles.td} style={{ textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        className={styles.filterBtn}
                        style={{ width: 28, height: 28, padding: 0, justifyContent: 'center' }}
                        onClick={(e) => openCategoryPicker(e, t.id)}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                          more_horiz
                        </span>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* ── Deposits view ── */}
        {view === 'deposits' && (
          <div className={styles.tableCard}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px' }}>
              <div>
                <div style={{ fontWeight: 600 }}>Deposits</div>
                <div style={{ fontSize: 12, color: '#5a6355' }}>Money grouped into the bank via acct_make_deposit — receipts and other lines, with the journal behind each one.</div>
              </div>
              <button type="button" className={styles.headerBtn} onClick={() => { setDetailError(null); setShowDepositForm(!showDepositForm); }}>
                {showDepositForm ? 'Cancel' : '+ Record deposit'}
              </button>
            </div>
            {detailError && <div style={{ padding: '0 16px 12px', color: '#b3261e', fontSize: 13 }}>{detailError}</div>}
            {showDepositForm && (
              <form
                style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, padding: '0 16px 16px' }}
                onSubmit={async (e) => {
                  e.preventDefault();
                  const fd = new FormData(e.currentTarget);
                  const res = await fetch('/api/bank-deposits', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      bankAccountId: String(fd.get('bankAccountId') || ''),
                      date: String(fd.get('date') || ''),
                      memo: String(fd.get('memo') || '') || undefined,
                      otherLines: [{
                        accountId: String(fd.get('accountId') || ''),
                        amount: Number(fd.get('amount') || 0),
                        description: String(fd.get('description') || '') || undefined,
                      }],
                    }),
                  });
                  const j = await res.json().catch(() => null);
                  if (!res.ok || j?.error) { setDetailError(j?.error?.message || 'Deposit failed'); return; }
                  setShowDepositForm(false);
                  await loadDeposits();
                  showToast(`Deposit ${j.data.depositNumber} recorded — $${Number(j.data.total).toFixed(2)}`);
                }}
              >
                <select name="bankAccountId" required style={{ height: 36, border: '1px solid #dad9dd', borderRadius: 6, padding: '0 8px', fontSize: 13 }}>
                  <option value="">— Bank account —</option>
                  {bankAccounts.map((a) => (<option key={a.id} value={a.id}>{a.name}</option>))}
                </select>
                <input name="date" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} style={{ height: 36, border: '1px solid #dad9dd', borderRadius: 6, padding: '0 8px', fontSize: 13 }} />
                <select name="accountId" required style={{ height: 36, border: '1px solid #dad9dd', borderRadius: 6, padding: '0 8px', fontSize: 13 }}>
                  <option value="">— Deposit to account —</option>
                  {coaAccounts.filter((a) => a.type === 'Income' || a.type === 'Asset').map((a) => (<option key={a.id} value={a.id}>{a.name}</option>))}
                </select>
                <input name="amount" type="number" step="0.01" min="0.01" required placeholder="Amount $" style={{ height: 36, border: '1px solid #dad9dd', borderRadius: 6, padding: '0 8px', fontSize: 13 }} />
                <input name="description" placeholder="Description (optional)" style={{ height: 36, border: '1px solid #dad9dd', borderRadius: 6, padding: '0 8px', fontSize: 13 }} />
                <input name="memo" placeholder="Memo (optional)" style={{ height: 36, border: '1px solid #dad9dd', borderRadius: 6, padding: '0 8px', fontSize: 13 }} />
                <button type="submit" className={styles.headerBtn} style={{ gridColumn: '1 / -1', justifyContent: 'center', background: '#0077c5', color: '#fff' }}>Record deposit</button>
              </form>
            )}
            {deposits === null ? (
              <div style={{ padding: 16, fontSize: 13, color: '#5a6355' }}>Loading…</div>
            ) : deposits.length === 0 ? (
              <div style={{ padding: 16, fontSize: 13, color: '#5a6355' }}>No deposits recorded yet.</div>
            ) : (
              <div>
                {deposits.map((d) => (
                  <button key={d.id} type="button" onClick={() => void openDeposit(d)} style={{ display: 'flex', width: '100%', textAlign: 'left', justifyContent: 'space-between', gap: 12, padding: '12px 16px', borderTop: '1px solid #ececec', background: 'none', cursor: 'pointer' }}>
                    <span>
                      <span style={{ fontWeight: 600, fontSize: 13 }}>{d.depositNumber} · {d.bankAccountName || '—'}</span>
                      <span style={{ display: 'block', fontSize: 11, color: '#5a6355' }}>{d.depositDate} · {d.lineCount} line{d.lineCount === 1 ? '' : 's'}{d.memo ? ` · ${d.memo}` : ''}</span>
                    </span>
                    <span style={{ textAlign: 'right', flexShrink: 0 }}>
                      <span style={{ fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>${d.total.toFixed(2)}</span>
                      <span style={{ display: 'block', fontSize: 11, color: '#5a6355' }}>{d.status}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}
            {selectedDeposit && (
              <div style={{ borderTop: '1px solid #dad9dd', padding: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontWeight: 600 }}>{selectedDeposit.depositNumber} — ${selectedDeposit.total.toFixed(2)}</div>
                  <button type="button" className={styles.filterBtn} onClick={() => setSelectedDeposit(null)}>Close</button>
                </div>
                {detailLoading ? (
                  <div style={{ fontSize: 13, color: '#5a6355', marginTop: 8 }}>Loading lines…</div>
                ) : (
                  <div style={{ marginTop: 8 }}>
                    {depositLines.length === 0 && <div style={{ fontSize: 13, color: '#5a6355' }}>No lines on this deposit.</div>}
                    {depositLines.map((l) => (
                      <div key={l.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '6px 0', borderTop: '1px solid #f2f2f2' }}>
                        <span>{l.accountName || l.receivedFrom || l.description || 'Line'}</span>
                        <span style={{ fontVariantNumeric: 'tabular-nums' }}>${l.amount.toFixed(2)}</span>
                      </div>
                    ))}
                    {selectedDeposit.postedJournalId && (
                      <div style={{ fontSize: 11, color: '#5a6355', marginTop: 8 }}>GL journal: <span style={{ fontFamily: 'monospace' }}>{selectedDeposit.postedJournalId}</span></div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Transfers view ── */}
        {view === 'transfers' && (
          <div className={styles.tableCard}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px' }}>
              <div>
                <div style={{ fontWeight: 600 }}>Transfers</div>
                <div style={{ fontSize: 12, color: '#5a6355' }}>Money moved between bank accounts via acct_transfer_funds — both sides posted, voidable with a reversing journal.</div>
              </div>
              <button type="button" className={styles.headerBtn} onClick={() => { setDetailError(null); setShowTransferForm(!showTransferForm); }}>
                {showTransferForm ? 'Cancel' : '+ New transfer'}
              </button>
            </div>
            {detailError && <div style={{ padding: '0 16px 12px', color: '#b3261e', fontSize: 13 }}>{detailError}</div>}
            {showTransferForm && (
              <form
                style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, padding: '0 16px 16px' }}
                onSubmit={async (e) => {
                  e.preventDefault();
                  const fd = new FormData(e.currentTarget);
                  const res = await fetch('/api/bank-transfers', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      fromAccountId: String(fd.get('fromAccountId') || ''),
                      toAccountId: String(fd.get('toAccountId') || ''),
                      date: String(fd.get('date') || ''),
                      amount: Number(fd.get('amount') || 0),
                      memo: String(fd.get('memo') || '') || undefined,
                    }),
                  });
                  const j = await res.json().catch(() => null);
                  if (!res.ok || j?.error) { setDetailError(j?.error?.message || 'Transfer failed'); return; }
                  setShowTransferForm(false);
                  await loadTransfers();
                  await refreshBankAccounts();
                  showToast(`Transfer recorded — $${Number(j.data.amount).toFixed(2)}`);
                }}
              >
                <select name="fromAccountId" required style={{ height: 36, border: '1px solid #dad9dd', borderRadius: 6, padding: '0 8px', fontSize: 13 }}>
                  <option value="">— From account —</option>
                  {bankAccounts.map((a) => (<option key={a.id} value={a.id}>{a.name}</option>))}
                </select>
                <select name="toAccountId" required style={{ height: 36, border: '1px solid #dad9dd', borderRadius: 6, padding: '0 8px', fontSize: 13 }}>
                  <option value="">— To account —</option>
                  {bankAccounts.map((a) => (<option key={a.id} value={a.id}>{a.name}</option>))}
                </select>
                <input name="date" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} style={{ height: 36, border: '1px solid #dad9dd', borderRadius: 6, padding: '0 8px', fontSize: 13 }} />
                <input name="amount" type="number" step="0.01" min="0.01" required placeholder="Amount $" style={{ height: 36, border: '1px solid #dad9dd', borderRadius: 6, padding: '0 8px', fontSize: 13 }} />
                <input name="memo" placeholder="Memo (optional)" style={{ gridColumn: '1 / -1', height: 36, border: '1px solid #dad9dd', borderRadius: 6, padding: '0 8px', fontSize: 13 }} />
                <button type="submit" className={styles.headerBtn} style={{ gridColumn: '1 / -1', justifyContent: 'center', background: '#0077c5', color: '#fff' }}>Record transfer</button>
              </form>
            )}
            {transfers === null ? (
              <div style={{ padding: 16, fontSize: 13, color: '#5a6355' }}>Loading…</div>
            ) : transfers.length === 0 ? (
              <div style={{ padding: 16, fontSize: 13, color: '#5a6355' }}>No transfers recorded yet.</div>
            ) : (
              <div>
                {transfers.map((t) => (
                  <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '12px 16px', borderTop: '1px solid #ececec' }}>
                    <span>
                      <span style={{ fontWeight: 600, fontSize: 13 }}>{t.fromAccountName || '—'} → {t.toAccountName || '—'}</span>
                      <span style={{ display: 'block', fontSize: 11, color: '#5a6355' }}>{t.transferDate}{t.memo ? ` · ${t.memo}` : ''}</span>
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
                      <span style={{ textAlign: 'right' }}>
                        <span style={{ fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>${t.amount.toFixed(2)}</span>
                        <span style={{ display: 'block', fontSize: 11, color: '#5a6355' }}>{t.status}</span>
                      </span>
                      {t.status !== 'void' && (
                        <button type="button" className={styles.filterBtn} onClick={() => void voidTransfer(t.id)}>Void</button>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Category Picker Popover — real chart of accounts, or the
          transaction's real match candidates in 'matches' mode */}
      {pickerOpen && (
        <div
          className={styles.catPicker}
          style={{ top: pickerPos.top, left: pickerPos.left }}
          onClick={(e) => e.stopPropagation()}
        >
          {pickerMode === 'matches' ? (
            <>
              <div className={styles.catSectionHeader}>Match candidates</div>
              {matchCandidates.map((c) => (
                <button
                  key={c.journalLineId}
                  type="button"
                  className={styles.catOpt}
                  onClick={() => void handlePickMatch(c)}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#0077c5' }}>
                    link
                  </span>
                  {c.description || 'Journal line'} · {fmtUsDate(c.date)} · ${Math.abs(c.amount).toFixed(2)}
                </button>
              ))}
              {matchCandidates.length === 0 && (
                <div className={styles.catOpt} style={{ cursor: 'default' }}>No candidates found</div>
              )}
              <div className={styles.catSep} />
              <button
                type="button"
                className={styles.catOpt}
                onClick={() => setPickerMode('cats')}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#5a6355' }}>
                  arrow_back
                </span>
                Back to categories
              </button>
            </>
          ) : (
            <>
              <input
                className={styles.catSearchInput}
                placeholder="Search categories…"
                value={catSearch}
                onChange={(e) => setCatSearch(e.target.value)}
                autoFocus
              />
              <div className={styles.catSectionHeader}>Suggested</div>
              {(() => {
                const target = txns.find((t) => t.id === pickerTargetTxId);
                const suggestedFirst = target?.dto.suggestedAccountId
                  ? coaAccounts.filter((a) => a.id === target.dto.suggestedAccountId)
                  : [];
                const expense = coaAccounts.filter((a) => a.type === 'Expense' && !suggestedFirst.includes(a)).slice(0, 4);
                return [...suggestedFirst, ...expense]
                  .filter((a) => a.name.toLowerCase().includes(catSearch.toLowerCase()))
                  .map((a, i) => (
                    <button
                      key={a.id}
                      type="button"
                      className={styles.catOpt}
                      onClick={() => void handlePickCategory(a.id)}
                    >
                      <span className={styles.catDot} style={{ backgroundColor: ['#0077c5', '#1e5a38', '#6b1e28', '#0e5e6f'][i % 4] }} />
                      {a.name}
                      {suggestedFirst.includes(a) ? ' · suggested' : ''}
                    </button>
                  ));
              })()}

              <div className={styles.catSep} />
              <div className={styles.catSectionHeader}>All categories</div>
              {coaAccounts
                .filter((a) => a.name.toLowerCase().includes(catSearch.toLowerCase()))
                .map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    className={styles.catOpt}
                    onClick={() => void handlePickCategory(a.id)}
                  >
                    <span className={styles.catDot} style={{ backgroundColor: '#dad9dd' }} />
                    {a.name}
                  </button>
                ))}

              <div className={styles.catSep} />
              <button
                type="button"
                className={styles.catOpt}
                onClick={() => void handlePickCategory('__match__')}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#0077c5' }}>
                  link
                </span>
                Match to existing…
              </button>
              <button
                type="button"
                className={styles.catOpt}
                onClick={() => void handlePickCategory('__exclude__')}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#5a6355' }}>
                  block
                </span>
                {txns.find((t) => t.id === pickerTargetTxId)?.status === 'excluded' ? 'Restore this transaction' : 'Exclude this transaction'}
              </button>
            </>
          )}
        </div>
      )}

      {/* Toast */}
      {toastMessage && (
        <div className={styles.toast}>
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
            check_circle
          </span>
          {toastMessage}
        </div>
      )}
    </div>
  );
}
