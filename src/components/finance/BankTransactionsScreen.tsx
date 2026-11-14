'use client';

import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { DomainKey } from '@/data/shellData';
import { exportToCsv } from '@/lib/csvExport';
import { useBankTransactions, useCrmMutations, type BankTransaction } from '@/hooks/useCrmApi';
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
  status: 'review' | 'matched' | 'categorized' | 'excluded';
}

const INITIAL_BANK_TXNS: BankTxn[] = [
  {
    id: 'tx-1',
    date: '10/30/2026',
    desc: 'STAPLES #0412',
    payee: 'Staples',
    amount: -142.5,
    category: 'Office supplies',
    isSuggested: true,
    status: 'review',
  },
  {
    id: 'tx-2',
    date: '10/29/2026',
    desc: 'FEDEX 001239847',
    payee: 'FedEx',
    amount: -84.2,
    category: 'Select category',
    isSuggested: false,
    matchText: 'Bill #PF-9211',
    status: 'review',
  },
  {
    id: 'tx-3',
    date: '10/28/2026',
    desc: 'STRIPE PAYOUT',
    payee: 'Staples',
    amount: 1842.6,
    category: 'Stripe clearing',
    isSuggested: true,
    status: 'review',
  },
  {
    id: 'tx-4',
    date: '10/27/2026',
    desc: 'AWS EMEA CHARGES',
    payee: 'Amazon Web Services',
    amount: -124.88,
    category: 'Software',
    isSuggested: true,
    status: 'review',
  },
  {
    id: 'tx-5',
    date: '10/27/2026',
    desc: 'ACME CORP — ACH',
    payee: 'Acme Corp',
    amount: 1240.0,
    category: 'Invoice 1002',
    isSuggested: true,
    matchText: 'Invoice 1002',
    status: 'review',
  },
  {
    id: 'tx-6',
    date: '10/26/2026',
    desc: 'ADOBE CREATIVE',
    payee: 'Adobe',
    amount: -59.99,
    category: 'Software',
    isSuggested: false,
    status: 'categorized',
  },
  {
    id: 'tx-7',
    date: '10/25/2026',
    desc: 'ATM WITHDRAWAL',
    payee: '—',
    amount: -200.0,
    category: 'Excluded',
    isSuggested: false,
    status: 'excluded',
  },
];

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
  const [activeAccount, setActiveAccount] = useState<'chase' | 'visa' | 'amex'>('chase');
  const [activeTab, setActiveTab] = useState<'review' | 'matched' | 'categorized' | 'excluded' | 'all'>('review');
  const [showRuleBanner, setShowRuleBanner] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');

  // REAL data from /api/bank-transactions (acct_bank_transactions).
  // Falls back to demo rows when the schema isn't applied (schema_pending).
  const { data: realTxns, loaded, error, refresh } = useBankTransactions({ status: activeTab });
  const { categorizeBankTxn, excludeBankTxn, matchBankTxn } = useCrmMutations(onToast);
  // schema_pending is returned as a flag on the API response — if the API errored
  // with "schema_pending" the hook surfaces it as `error`.
  const schemaPending = !!error && /schema_pending/i.test(error);

  // Map the API rows to the screen's BankTxn shape.
  const txns: BankTxn[] = useMemo(() => {
    if (schemaPending || realTxns.length === 0) return INITIAL_BANK_TXNS;
    return realTxns.map((t: BankTransaction) => {
      // The API returns the raw row + a normalized `status`. The DB uses:
      //   match_status: unmatched | pending | matched | reconciled
      //   review_status: for_review | categorized | excluded
      // Map to the screen's status set: review | matched | categorized | excluded.
      const raw = t as unknown as { match_status?: string; review_status?: string };
      let status: BankTxn['status'];
      if (raw.match_status === 'matched' || raw.match_status === 'reconciled') status = 'matched';
      else if (raw.review_status === 'categorized') status = 'categorized';
      else if (raw.review_status === 'excluded') status = 'excluded';
      else status = 'review';
      return {
        id: t.id,
        date: ((t as unknown as { transaction_date?: string; posted_date?: string }).transaction_date
          || (t as unknown as { posted_date?: string }).posted_date
          || t.posted_at || '').slice(0, 10),
        desc: t.description || '—',
        payee: t.payee || '—',
        amount: Number(t.amount) || 0,
        category: t.category || 'Select category',
        isSuggested: false,
        matchText: t.matched_document_id ? `Matched ${t.matched_document_type || 'document'}` : undefined,
        status,
      };
    });
  }, [realTxns, schemaPending]);

  const setTxns = useCallback((_updater: (prev: BankTxn[]) => BankTxn[]) => {
    // No-op stub — real state lives in the API. Actions call the API and refresh().
  }, []);

  // Category picker state
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerTargetTxId, setPickerTargetTxId] = useState<string | null>(null);
  const [pickerPos, setPickerPos] = useState({ top: 0, left: 0 });
  const [catSearch, setCatSearch] = useState('');

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
    const txId = pickerTargetTxId;
    if (val === '__match__') {
      // Match — prompt for a document ID. For now, use the invoice list's first.
      showToast('Opening match drawer for transaction');
      setPickerOpen(false);
      return;
    }
    if (val === '__exclude__') {
      setPickerOpen(false);
      const res = await excludeBankTxn(txId);
      if (res.ok) { refresh(); }
      return;
    }

    setPickerOpen(false);
    const res = await categorizeBankTxn(txId, val);
    if (res.ok) { refresh(); }
  };

  // Bulk actions
  const handleBulkCategorize = async (cat: string) => {
    if (!cat) return;
    const ids = [...selectedIds];
    for (const id of ids) {
      await categorizeBankTxn(id, cat);
    }
    showToast(`Categorized ${ids.length} transactions as ${cat}`);
    setSelectedIds(new Set());
    refresh();
  };

  const handleBulkExclude = async () => {
    const ids = [...selectedIds];
    for (const id of ids) {
      await excludeBankTxn(id);
    }
    showToast(`Excluded ${ids.length} transactions`);
    setSelectedIds(new Set());
    refresh();
  };

  const handleBulkDelete = async () => {
    // Delete isn't a real bank-txn action (you can't delete a bank feed entry —
    // only exclude it). Treat bulk-delete as bulk-exclude.
    await handleBulkExclude();
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
              For review feed + bank rules · Chase •9910 · synced 2m ago
            </p>
          </div>
          <div className={styles.headerActions}>
            <button
              type="button"
              className={styles.headerBtn}
              onClick={() => showToast('Syncing with Chase API...')}
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

        {/* Account Tabs */}
        <div className={styles.accountTabs}>
          <button
            type="button"
            className={`${styles.accountTab} ${
              activeAccount === 'chase' ? styles.accountTabActive : ''
            }`}
            onClick={() => setActiveAccount('chase')}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
              account_balance
            </span>
            Chase •9910
          </button>
          <button
            type="button"
            className={`${styles.accountTab} ${
              activeAccount === 'visa' ? styles.accountTabActive : ''
            }`}
            onClick={() => setActiveAccount('visa')}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
              credit_card
            </span>
            Visa •4421
          </button>
          <button
            type="button"
            className={`${styles.accountTab} ${
              activeAccount === 'amex' ? styles.accountTabActive : ''
            }`}
            onClick={() => setActiveAccount('amex')}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
              account_balance_wallet
            </span>
            Amex •2103
          </button>
          <button
            type="button"
            className={styles.accountTab}
            onClick={() => showToast('Open Plaid / Finicity bank connection')}
            style={{ color: '#5a6355' }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
              add
            </span>
            Connect account
          </button>
        </div>

        {/* Rule Suggestion Banner */}
        {showRuleBanner && (
          <div className={styles.ruleBanner}>
            <span className={`material-symbols-outlined ${styles.ruleBannerIcon}`}>
              auto_awesome
            </span>
            <div className={styles.ruleBannerText}>
              <div style={{ fontWeight: 600 }}>Rule suggestion</div>
              <div className={styles.ruleBannerDesc}>
                You&apos;ve categorized 3 STAPLES transactions as <strong>Office supplies</strong>. Create a rule to auto-categorize future ones?
              </div>
            </div>
            <button
              type="button"
              className={styles.ruleBannerBtn}
              onClick={() => {
                showToast('Rule created: STAPLES → Office supplies');
                setShowRuleBanner(false);
              }}
            >
              Create rule
            </button>
            <button
              type="button"
              className={styles.ruleBannerDismiss}
              onClick={() => setShowRuleBanner(false)}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                close
              </span>
            </button>
          </div>
        )}

        {/* Table Card */}
        <div className={styles.tableCard}>
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
              1–{filteredTxns.length} of {filteredTxns.length}
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
                  handleBulkCategorize(e.target.value);
                  e.target.value = '';
                }}
              >
                <option value="" disabled>
                  Categorize as…
                </option>
                <option value="Office supplies">Office supplies</option>
                <option value="Shipping">Shipping</option>
                <option value="Software">Software</option>
                <option value="Advertising">Advertising</option>
                <option value="Meals & entertainment">Meals &amp; entertainment</option>
                <option value="Travel">Travel</option>
                <option value="Stripe clearing">Stripe clearing</option>
                <option value="Ask My Accountant">Ask My Accountant</option>
              </select>
              <button
                type="button"
                className={styles.bulkActionBtn}
                onClick={() => showToast(`Match on ${selectedIds.size} transactions`)}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
                  link
                </span>
                Match
              </button>
              <button
                type="button"
                className={styles.bulkActionBtn}
                onClick={handleBulkExclude}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
                  block
                </span>
                Exclude
              </button>
              <button
                type="button"
                className={styles.bulkActionBtn}
                onClick={() => showToast(`Attach receipt to ${selectedIds.size} transactions`)}
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
                onClick={handleBulkDelete}
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
                          Account: 'Chase •9910',
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
                        onClick={() => showToast(`Actions for ${t.desc}`)}
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
      </main>

      {/* Category Picker Popover */}
      {pickerOpen && (
        <div
          className={styles.catPicker}
          style={{ top: pickerPos.top, left: pickerPos.left }}
          onClick={(e) => e.stopPropagation()}
        >
          <input
            className={styles.catSearchInput}
            placeholder="Search categories…"
            value={catSearch}
            onChange={(e) => setCatSearch(e.target.value)}
            autoFocus
          />
          <div className={styles.catSectionHeader}>Suggested</div>
          {[
            { label: 'Office supplies', color: '#0077c5' },
            { label: 'Shipping', color: '#1e5a38' },
            { label: 'Software', color: '#6b1e28' },
            { label: 'Advertising', color: '#0e5e6f' },
          ]
            .filter((o) => o.label.toLowerCase().includes(catSearch.toLowerCase()))
            .map((o) => (
              <button
                key={o.label}
                type="button"
                className={styles.catOpt}
                onClick={() => handlePickCategory(o.label)}
              >
                <span className={styles.catDot} style={{ backgroundColor: o.color }} />
                {o.label}
              </button>
            ))}

          <div className={styles.catSep} />
          <div className={styles.catSectionHeader}>All categories</div>
          {[
            { label: 'Meals & entertainment', color: '#dad9dd' },
            { label: 'Travel', color: '#dad9dd' },
            { label: 'Stripe clearing', color: '#0a6400' },
            { label: 'Ask My Accountant', color: '#ba1a1a' },
          ]
            .filter((o) => o.label.toLowerCase().includes(catSearch.toLowerCase()))
            .map((o) => (
              <button
                key={o.label}
                type="button"
                className={styles.catOpt}
                onClick={() => handlePickCategory(o.label)}
              >
                <span className={styles.catDot} style={{ backgroundColor: o.color }} />
                {o.label}
              </button>
            ))}

          <div className={styles.catSep} />
          <button
            type="button"
            className={styles.catOpt}
            onClick={() => handlePickCategory('__match__')}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#0077c5' }}>
              link
            </span>
            Match to existing…
          </button>
          <button
            type="button"
            className={styles.catOpt}
            onClick={() => handlePickCategory('__exclude__')}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#5a6355' }}>
              block
            </span>
            Exclude this transaction
          </button>
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
