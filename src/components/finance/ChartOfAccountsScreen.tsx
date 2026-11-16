'use client';

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { DomainKey } from '@/data/shellData';
import { exportToCsv } from '@/lib/csvExport';
import { useChartOfAccounts, coaMutations, fetchAccountRegister, type AccountRegister } from '@/hooks/useAccountingApi';
import styles from './ChartOfAccountsScreen.module.css';

export type AccountType = 'Asset' | 'Liability' | 'Equity' | 'Income' | 'Expense';

export interface AccountItem {
  id: string;
  number: string;
  name: string;
  type: AccountType;
  detail: string;
  balance: number;
  bankBalance?: number;
  taxLine: string;
  active: boolean;
  desc?: string;
}

const DETAIL_TYPES: Record<AccountType, string[]> = {
  Asset: [
    'Cash and cash equivalents',
    'Checking',
    'Savings',
    'Accounts receivable',
    'Inventory',
    'Fixed assets',
    'Other current assets',
  ],
  Liability: [
    'Accounts payable',
    'Credit card',
    'Sales tax payable',
    'Payroll liabilities',
    'Loan',
    'Other current liabilities',
  ],
  Equity: [
    "Owner's equity",
    'Retained earnings',
    'Partner contributions',
    'Partner distributions',
  ],
  Income: [
    'Sales of product income',
    'Sales of services',
    'Discounts',
    'Shipping income',
    'Interest income',
  ],
  Expense: [
    'Cost of goods sold',
    'Advertising',
    'Bank charges & fees',
    'Dues and subscriptions',
    'Insurance',
    'Legal & professional',
    'Meals & entertainment',
    'Office/General Administrative',
    'Rent or lease',
    'Shipping & delivery',
    'Software',
    'Travel',
    'Utilities',
  ],
};

/* Accounts come from GET /api/accounting/chart-of-accounts — real
   acct_chart_of_accounts rows with GL balances computed server-side. */

export interface ChartOfAccountsScreenProps {
  onNavigate: (domain: DomainKey, screenId: string) => void;
  onToast?: (msg: string) => void;
}

export default function ChartOfAccountsScreen({
  onNavigate,
  onToast,
}: ChartOfAccountsScreenProps) {
  const { accounts: coaAccounts, refresh: refreshAccounts } = useChartOfAccounts();

  /* Local copy so inline edits type freely; persisted on blur, and a
     failed save refreshes back to the server's values. */
  const [accounts, setAccounts] = useState<AccountItem[]>([]);
  useEffect(() => {
    setAccounts(
      coaAccounts.map((a) => ({
        id: a.id,
        number: a.code,
        name: a.name,
        type: a.type,
        detail: a.detail,
        balance: a.balance,
        bankBalance: a.bankBalance ?? undefined,
        taxLine: a.tax,
        active: a.isActive,
        desc: a.description || undefined,
      })),
    );
  }, [coaAccounts]);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [editMode, setEditMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Dropdown menus
  const [newMenuOpen, setNewMenuOpen] = useState(false);
  const [cleanMenuOpen, setCleanMenuOpen] = useState(false);
  const [rowMenuTxId, setRowMenuTxId] = useState<string | null>(null);
  const [rowMenuPos, setRowMenuPos] = useState({ top: 0, left: 0 });

  // Account Drawer (New / Edit)
  const [isAccountDrawerOpen, setIsAccountDrawerOpen] = useState(false);
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [formType, setFormType] = useState<AccountType>('Asset');
  const [formDetail, setFormDetail] = useState('');
  const [formName, setFormName] = useState('');
  const [formNumber, setFormNumber] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formTax, setFormTax] = useState('');
  const [formActive, setFormActive] = useState(true);
  const [formParentId, setFormParentId] = useState<string | null>(null);

  // Register Drawer
  const [isRegisterDrawerOpen, setIsRegisterDrawerOpen] = useState(false);
  const [registerAccount, setRegisterAccount] = useState<AccountItem | null>(null);
  const [registerData, setRegisterData] = useState<AccountRegister | null>(null);
  const [regTab, setRegTab] = useState<'all' | 'deposits' | 'payments'>('all');

  // Toast
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const showToast = (msg: string) => {
    if (onToast) onToast(msg);
    setToastMsg(msg);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setToastMsg(null), 2000);
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  // Close menus on outside click
  useEffect(() => {
    const handleOutside = () => {
      setNewMenuOpen(false);
      setCleanMenuOpen(false);
      setRowMenuTxId(null);
    };
    document.addEventListener('click', handleOutside);
    return () => document.removeEventListener('click', handleOutside);
  }, []);

  // Filtered accounts
  const filteredAccounts = useMemo(() => {
    return accounts.filter((a) => {
      if (typeFilter && a.type !== typeFilter) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const match =
          a.name.toLowerCase().includes(q) ||
          a.number.includes(q) ||
          (a.desc && a.desc.toLowerCase().includes(q)) ||
          a.detail.toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [accounts, typeFilter, searchQuery]);

  // Bulk selection
  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedIds(new Set(filteredAccounts.map((a) => a.id)));
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

  // Open Drawer for Create (suggested number = highest code + 100)
  const handleOpenCreateDrawer = (typePreset?: AccountType, parentId: string | null = null) => {
    setEditingAccountId(null);
    const chosenType = typePreset || 'Asset';
    setFormType(chosenType);
    setFormDetail(DETAIL_TYPES[chosenType][0] || '');
    setFormName('');
    const maxCode = accounts.reduce((m, a) => {
      const n = parseInt(a.number, 10);
      return Number.isNaN(n) ? m : Math.max(m, n);
    }, 0);
    setFormNumber(maxCode ? String(maxCode + 100) : '1000');
    setFormDesc('');
    setFormTax('');
    setFormActive(true);
    setFormParentId(parentId);
    setIsAccountDrawerOpen(true);
  };

  // Open Drawer for Edit
  const handleOpenEditDrawer = (acc: AccountItem) => {
    setEditingAccountId(acc.id);
    setFormType(acc.type);
    setFormDetail(acc.detail);
    setFormName(acc.name);
    setFormNumber(acc.number);
    setFormDesc(acc.desc || '');
    setFormTax(acc.taxLine !== '—' ? acc.taxLine : '');
    setFormActive(acc.active);
    setIsAccountDrawerOpen(true);
  };

  // Save Account — persists through the API
  const handleSaveAccount = async (andClose: boolean) => {
    if (!formName.trim()) {
      showToast('Account name is required');
      return;
    }
    if (!formNumber.trim()) {
      showToast('Account number is required');
      return;
    }

    if (editingAccountId) {
      const res = await coaMutations.update(editingAccountId, {
        name: formName.trim(),
        code: formNumber.trim(),
        type: formType,
        detail: formDetail,
        description: formDesc,
        taxLine: formTax || undefined,
        isActive: formActive,
      });
      if (!res.ok) {
        showToast(res.error || 'Account could not be updated');
        return;
      }
      showToast(`Account "${formName}" updated`);
    } else {
      const res = await coaMutations.create({
        name: formName.trim(),
        code: formNumber.trim(),
        type: formType,
        detail: formDetail,
        description: formDesc,
        taxLine: formTax || undefined,
        isActive: formActive,
        parentAccountId: formParentId,
      });
      if (!res.ok) {
        showToast(res.error || 'Account could not be created');
        return;
      }
      showToast(`Account "${formName}" created`);
    }
    await refreshAccounts();

    if (andClose) {
      setIsAccountDrawerOpen(false);
    } else {
      handleOpenCreateDrawer(formType);
    }
  };

  // Open Register — fetches the account's real journal lines
  const handleOpenRegister = async (acc: AccountItem) => {
    setRegisterAccount(acc);
    setRegTab('all');
    setRegisterData(null);
    setIsRegisterDrawerOpen(true);
    const res = await fetchAccountRegister(acc.id);
    if (res.ok && res.data) setRegisterData(res.data);
    else showToast(res.error || 'Register failed to load');
  };

  /* Inline edits persist on blur; failures revert via refresh */
  const persistInline = async (id: string, patch: { number?: string; name?: string }) => {
    const res = await coaMutations.update(id, {
      ...(patch.number !== undefined ? { code: patch.number } : {}),
      ...(patch.name !== undefined ? { name: patch.name } : {}),
    });
    if (!res.ok) {
      showToast(res.error || 'Edit could not be saved');
      await refreshAccounts();
    }
  };

  const getDotClass = (type: AccountType) => {
    switch (type) {
      case 'Asset':
        return styles.dotAsset;
      case 'Liability':
        return styles.dotLiability;
      case 'Equity':
        return styles.dotEquity;
      case 'Income':
        return styles.dotIncome;
      case 'Expense':
        return styles.dotExpense;
    }
  };

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
          <span className={styles.breadcrumbActive}>Chart of accounts</span>
        </div>
      </div>

      <main className={styles.main}>
        {/* Page Header */}
        <div className={styles.pageHeader}>
          <div>
            <h1 className={styles.pageTitle}>Chart of accounts</h1>
            <p className={styles.pageSubtitle}>
              {accounts.length} accounts · Numbered, typed, mapped to tax lines.
            </p>
          </div>
          <div className={styles.headerActions}>
            <div className={styles.splitBtn}>
              <button
                type="button"
                className={styles.splitBtnMain}
                onClick={() => handleOpenCreateDrawer()}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                  add
                </span>
                New account
              </button>
              <button
                type="button"
                className={styles.splitBtnArrow}
                onClick={(e) => {
                  e.stopPropagation();
                  setNewMenuOpen((prev) => !prev);
                  setCleanMenuOpen(false);
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                  expand_more
                </span>
              </button>

              {newMenuOpen && (
                <div className={styles.menu} style={{ top: 38, right: 0 }}>
                  <div className={styles.menuHeader}>Quick create</div>
                  {(['Asset', 'Liability', 'Equity', 'Income', 'Expense'] as AccountType[]).map(
                    (k) => (
                      <button
                        key={k}
                        type="button"
                        className={styles.menuItem}
                        onClick={() => {
                          setNewMenuOpen(false);
                          handleOpenCreateDrawer(k);
                        }}
                      >
                        <span className={`material-symbols-outlined`}>
                          {k === 'Asset'
                            ? 'account_balance'
                            : k === 'Liability'
                            ? 'credit_card'
                            : k === 'Equity'
                            ? 'savings'
                            : k === 'Income'
                            ? 'trending_up'
                            : 'receipt_long'}
                        </span>
                        {k} account
                      </button>
                    )
                  )}
                </div>
              )}
            </div>

            <button
              type="button"
              className={styles.headerBtn}
              onClick={() => onNavigate('finance', 'quick-view')}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                assessment
              </span>
              Run report
            </button>
          </div>
        </div>

        {/* Toolbar */}
        <div className={styles.toolbar}>
          <div className={styles.searchInputWrap}>
            <span className={`material-symbols-outlined ${styles.searchIcon}`}>
              search
            </span>
            <input
              className={styles.searchInput}
              placeholder="Filter by name or number…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <label className={styles.typeFilterLabel}>
            <span
              className="material-symbols-outlined"
              style={{ fontSize: 14, color: '#5a6355' }}
            >
              category
            </span>
            <span style={{ color: '#5a6355' }}>Type:</span>
            <select
              className={styles.typeFilterSelect}
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
            >
              <option value="">All types</option>
              <option value="Asset">Asset</option>
              <option value="Liability">Liability</option>
              <option value="Equity">Equity</option>
              <option value="Income">Income</option>
              <option value="Expense">Expense</option>
            </select>
          </label>

          <div style={{ position: 'relative' }}>
            <button
              type="button"
              className={styles.toolbarBtn}
              onClick={(e) => {
                e.stopPropagation();
                setCleanMenuOpen((prev) => !prev);
                setNewMenuOpen(false);
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
                cleaning_services
              </span>
              Clean up
              <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
                expand_more
              </span>
            </button>

            {cleanMenuOpen && (
              <div className={styles.menu} style={{ top: 36, left: 0 }}>
                <div className={styles.menuHeader}>Clean up</div>
                <button
                  type="button"
                  className={styles.menuItem}
                  onClick={() => {
                    setCleanMenuOpen(false);
                    showToast('Cleanup session started — inactive accounts and duplicates flagged');
                  }}
                >
                  <span className="material-symbols-outlined">cleaning_services</span>
                  Start cleanup session
                </button>
                <button
                  type="button"
                  className={styles.menuItem}
                  onClick={() => {
                    setCleanMenuOpen(false);
                    setEditMode(true);
                  }}
                >
                  <span className="material-symbols-outlined">edit</span>
                  Open in edit mode
                </button>
                <div className={styles.menuSep} />
                <button
                  type="button"
                  className={styles.menuItem}
                  onClick={() => {
                    setCleanMenuOpen(false);
                    showToast('Cleanup history: 3 accounts merged, 1 archived');
                  }}
                >
                  <span className="material-symbols-outlined">history</span>
                  View cleanup history
                </button>
              </div>
            )}
          </div>

          <div style={{ flex: 1 }} />

          <button
            type="button"
            className={`${styles.toolbarBtn} ${editMode ? styles.toolbarBtnActive : ''}`}
            onClick={() => setEditMode((prev) => !prev)}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
              edit
            </span>
            Edit mode
          </button>

          <button
            type="button"
            className={styles.toolbarBtn}
            onClick={() => showToast('Customize columns panel')}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
              tune
            </span>
            Customize
          </button>
        </div>

        {/* Edit-mode banner */}
        {editMode && (
          <div className={styles.editBanner}>
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
              edit
            </span>
            <span style={{ flex: 1 }}>
              Edit mode on — click any cell to edit inline. Press Esc to cancel a cell.
            </span>
            <button
              type="button"
              className={styles.editBannerBtn}
              onClick={() => {
                setEditMode(false);
                showToast('Inline changes saved');
              }}
            >
              Save changes
            </button>
          </div>
        )}

        {/* Table Card */}
        <div className={styles.tableCard}>
          <table className={styles.table}>
            <thead className={styles.thead}>
              <tr>
                <th style={{ width: 36, paddingLeft: 12 }}>
                  <input
                    type="checkbox"
                    checked={
                      filteredAccounts.length > 0 &&
                      selectedIds.size === filteredAccounts.length
                    }
                    onChange={handleSelectAll}
                    style={{ accentColor: '#0077c5' }}
                  />
                </th>
                <th style={{ width: 80 }}>Number</th>
                <th>Name</th>
                <th>Type</th>
                <th>Detail type</th>
                <th style={{ textAlign: 'right' }}>Total balance</th>
                <th style={{ textAlign: 'right' }}>Bank balance</th>
                <th>Tax line</th>
                <th style={{ width: 36 }} />
              </tr>
            </thead>
            <tbody>
              {filteredAccounts.map((acc) => {
                const isSelected = selectedIds.has(acc.id);

                return (
                  <tr
                    key={acc.id}
                    className={`${styles.row} ${!acc.active ? styles.rowInactive : ''}`}
                    onClick={() => {
                      if (!editMode) handleOpenRegister(acc);
                    }}
                  >
                    <td
                      className={styles.td}
                      style={{ width: 36, paddingLeft: 12 }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleToggleRow(acc.id)}
                        style={{ accentColor: '#0077c5' }}
                      />
                    </td>

                    {/* Number */}
                    <td className={styles.td} style={{ fontFamily: 'monospace' }}>
                      {editMode ? (
                        <input
                          className={styles.inlineInput}
                          value={acc.number}
                          onChange={(e) =>
                            setAccounts((prev) => prev.map((a) => (a.id === acc.id ? { ...a, number: e.target.value } : a)))
                          }
                          onBlur={() => void persistInline(acc.id, { number: acc.number })}
                          onClick={(e) => e.stopPropagation()}
                        />
                      ) : (
                        acc.number
                      )}
                    </td>

                    {/* Name */}
                    <td className={styles.td} style={{ fontWeight: 500 }}>
                      {editMode ? (
                        <input
                          className={styles.inlineInput}
                          value={acc.name}
                          onChange={(e) =>
                            setAccounts((prev) => prev.map((a) => (a.id === acc.id ? { ...a, name: e.target.value } : a)))
                          }
                          onBlur={() => void persistInline(acc.id, { name: acc.name })}
                          onClick={(e) => e.stopPropagation()}
                        />
                      ) : (
                        <div>
                          <div style={{ color: '#1c1d1f' }}>{acc.name}</div>
                          {acc.desc && (
                            <div style={{ fontSize: 11, color: '#72796e', fontWeight: 400, marginTop: 2 }}>
                              {acc.desc}
                            </div>
                          )}
                        </div>
                      )}
                    </td>

                    {/* Type */}
                    <td className={styles.td}>
                      <span className={`${styles.typeDot} ${getDotClass(acc.type)}`} />
                      {acc.type}
                    </td>

                    {/* Detail Type */}
                    <td className={styles.td} style={{ color: '#5a6355' }}>
                      {acc.detail}
                    </td>

                    {/* Total balance */}
                    <td
                      className={styles.td}
                      style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}
                    >
                      ${acc.balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>

                    {/* Bank balance */}
                    <td
                      className={styles.td}
                      style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#5a6355' }}
                    >
                      {acc.bankBalance !== undefined
                        ? `$${acc.bankBalance.toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                          })}`
                        : '—'}
                    </td>

                    {/* Tax line */}
                    <td className={styles.td} style={{ color: '#5a6355' }}>
                      {acc.taxLine}
                    </td>

                    {/* Action */}
                    <td
                      className={styles.td}
                      style={{ textAlign: 'right' }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        className={styles.toolbarBtn}
                        style={{ width: 28, height: 28, padding: 0, justifyContent: 'center' }}
                        onClick={(e) => {
                          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                          setRowMenuPos({
                            top: rect.bottom + 4,
                            left: Math.min(rect.right - 240, window.innerWidth - 260),
                          });
                          setRowMenuTxId(rowMenuTxId === acc.id ? null : acc.id);
                        }}
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

      {/* Row Action Menu */}
      {rowMenuTxId && (
        <div
          className={styles.menu}
          style={{ top: rowMenuPos.top, left: rowMenuPos.left }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className={styles.menuHeader}>This account</div>
          <button
            type="button"
            className={styles.menuItem}
            onClick={() => {
              const acc = accounts.find((a) => a.id === rowMenuTxId);
              if (acc) handleOpenRegister(acc);
              setRowMenuTxId(null);
            }}
          >
            <span className="material-symbols-outlined">receipt_long</span>
            View register
          </button>
          <button
            type="button"
            className={styles.menuItem}
            onClick={() => {
              const acc = accounts.find((a) => a.id === rowMenuTxId);
              if (acc) handleOpenEditDrawer(acc);
              setRowMenuTxId(null);
            }}
          >
            <span className="material-symbols-outlined">edit</span>
            Edit account
          </button>
          <button
            type="button"
            className={styles.menuItem}
            onClick={() => {
              setRowMenuTxId(null);
              onNavigate('finance', 'reports');
            }}
          >
            <span className="material-symbols-outlined">assessment</span>
            Run report for this account
          </button>
          <div className={styles.menuSep} />
          <div className={styles.menuHeader}>Structure</div>
          <button
            type="button"
            className={styles.menuItem}
            onClick={() => {
              const parent = accounts.find((a) => a.id === rowMenuTxId);
              setRowMenuTxId(null);
              handleOpenCreateDrawer(parent?.type || 'Asset', parent?.id || null);
              if (parent) showToast(`New account will sit under "${parent.name}"`);
            }}
          >
            <span className="material-symbols-outlined">subdirectory_arrow_right</span>
            Make sub-account of…
          </button>
          <button
            type="button"
            className={styles.menuItem}
            onClick={() => {
              showToast('Account merge is not available in the platform');
              setRowMenuTxId(null);
            }}
          >
            <span className="material-symbols-outlined">merge</span>
            Merge into another account…
          </button>
          <div className={styles.menuSep} />
          <div className={styles.menuHeader}>State</div>
          <button
            type="button"
            className={styles.menuItem}
            onClick={() => {
              const id = rowMenuTxId;
              const current = accounts.find((a) => a.id === id);
              setRowMenuTxId(null);
              if (!id || !current) return;
              void (async () => {
                const res = await coaMutations.update(id, { isActive: !current.active });
                if (res.ok) {
                  showToast('Account status updated');
                  await refreshAccounts();
                } else showToast(res.error || 'Status could not be updated');
              })();
            }}
          >
            <span className="material-symbols-outlined">visibility_off</span>
            Toggle active/inactive
          </button>
          <button
            type="button"
            className={`${styles.menuItem} ${styles.menuItemDanger}`}
            onClick={() => {
              const id = rowMenuTxId;
              setRowMenuTxId(null);
              if (!id) return;
              void (async () => {
                const res = await coaMutations.remove(id);
                if (res.ok) {
                  showToast('Account deleted');
                  await refreshAccounts();
                } else showToast(res.error || 'Account could not be deleted');
              })();
            }}
          >
            <span className="material-symbols-outlined">delete</span>
            Delete account
          </button>
        </div>
      )}

      {/* ═══════════ ACCOUNT DRAWER ═══════════ */}
      <div
        className={`${styles.drawerScrim} ${isAccountDrawerOpen ? styles.drawerScrimOpen : ''}`}
        onClick={() => setIsAccountDrawerOpen(false)}
      />
      <aside
        className={`${styles.drawer} ${styles.accountDrawer} ${
          isAccountDrawerOpen ? styles.drawerOpen : ''
        }`}
      >
        <div className={styles.drawerHeader}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="material-symbols-outlined" style={{ color: '#0a6400', fontSize: 20 }}>
              account_tree
            </span>
            <div>
              <h2 className={styles.drawerTitle}>
                {editingAccountId ? 'Edit account' : 'New account'}
              </h2>
              <div style={{ fontSize: 11, color: '#5a6355' }}>Chart of accounts</div>
            </div>
          </div>
          <button
            type="button"
            className={styles.toolbarBtn}
            style={{ width: 32, height: 32, padding: 0, justifyContent: 'center' }}
            onClick={() => setIsAccountDrawerOpen(false)}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
              close
            </span>
          </button>
        </div>

        <div className={styles.drawerBody}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label className={styles.fieldLabel}>Type</label>
              <select
                className={styles.fieldInput}
                value={formType}
                onChange={(e) => {
                  const t = e.target.value as AccountType;
                  setFormType(t);
                  setFormDetail(DETAIL_TYPES[t][0] || '');
                }}
              >
                <option value="Asset">Asset</option>
                <option value="Liability">Liability</option>
                <option value="Equity">Equity</option>
                <option value="Income">Income</option>
                <option value="Expense">Expense</option>
              </select>
            </div>
            <div>
              <label className={styles.fieldLabel}>Detail type</label>
              <select
                className={styles.fieldInput}
                value={formDetail}
                onChange={(e) => setFormDetail(e.target.value)}
              >
                {DETAIL_TYPES[formType].map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label className={styles.fieldLabel}>Name</label>
              <input
                className={styles.fieldInput}
                placeholder="e.g. Business checking"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
              />
            </div>
            <div>
              <label className={styles.fieldLabel}>Number</label>
              <input
                className={styles.fieldInput}
                placeholder="e.g. 1000"
                value={formNumber}
                onChange={(e) => setFormNumber(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className={styles.fieldLabel}>Sub-account of</label>
            <select className={styles.fieldInput} defaultValue="">
              <option value="">— None (top-level account) —</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.name}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={styles.fieldLabel}>Description</label>
            <textarea
              className={styles.fieldInput}
              style={{ height: 60, padding: '8px 10px', resize: 'vertical' }}
              placeholder="Optional description visible to staff"
              value={formDesc}
              onChange={(e) => setFormDesc(e.target.value)}
            />
          </div>

          <div style={{ borderTop: '1px solid #eeedf1', paddingTop: 16 }}>
            <label className={styles.fieldLabel}>Tax line</label>
            <select
              className={styles.fieldInput}
              value={formTax}
              onChange={(e) => setFormTax(e.target.value)}
            >
              <option value="">— Not mapped —</option>
              <option value="Sales">Sales</option>
              <option value="COGS">COGS</option>
              <option value="Office">Office</option>
              <option value="Software">Software</option>
              <option value="Travel">Travel</option>
              <option value="Meals">Meals</option>
              <option value="Advertising">Advertising</option>
            </select>
          </div>

          <div style={{ borderTop: '1px solid #eeedf1', paddingTop: 16 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={formActive}
                onChange={(e) => setFormActive(e.target.checked)}
                style={{ accentColor: '#0077c5' }}
              />
              Active account
            </label>
            <p style={{ fontSize: 11, color: '#5a6355', margin: '4px 0 0 0' }}>
              Inactive accounts are hidden from pickers but remain in reports.
            </p>
          </div>
        </div>

        <div className={styles.drawerFooter}>
          <button
            type="button"
            className={styles.toolbarBtn}
            onClick={() => setIsAccountDrawerOpen(false)}
          >
            Cancel
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              className={styles.toolbarBtn}
              onClick={() => handleSaveAccount(false)}
            >
              Save and new
            </button>
            <button
              type="button"
              className={styles.splitBtnMain}
              onClick={() => handleSaveAccount(true)}
            >
              Save account
            </button>
          </div>
        </div>
      </aside>

      {/* ═══════════ REGISTER DRAWER ═══════════ */}
      <div
        className={`${styles.drawerScrim} ${isRegisterDrawerOpen ? styles.drawerScrimOpen : ''}`}
        onClick={() => setIsRegisterDrawerOpen(false)}
      />
      <aside
        className={`${styles.drawer} ${styles.registerDrawer} ${
          isRegisterDrawerOpen ? styles.drawerOpen : ''
        }`}
      >
        <div className={styles.drawerHeader}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="material-symbols-outlined" style={{ color: '#0a6400', fontSize: 20 }}>
              receipt_long
            </span>
            <div>
              <h2 className={styles.drawerTitle}>{registerAccount?.name || 'Register'}</h2>
              <div style={{ fontSize: 11, color: '#5a6355' }}>
                Account {registerAccount?.number} · {registerAccount?.type}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              type="button"
              className={styles.toolbarBtn}
              onClick={() => showToast('Date range filter')}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
                calendar_today
              </span>
              Nov 2026
            </button>
            <button
              type="button"
              className={styles.toolbarBtn}
              onClick={() => {
                const cols = [
                  { key: 'number', label: 'Account #' },
                  { key: 'name', label: 'Account name' },
                  { key: 'type', label: 'Type' },
                  { key: 'detail', label: 'Detail type' },
                  { key: 'balance', label: 'Balance' },
                  { key: 'taxLine', label: 'Tax line' },
                  { key: 'active', label: 'Active' },
                ];
                exportToCsv(filteredAccounts as unknown as Record<string, unknown>[], cols, 'chart-of-accounts');
                showToast(`Exported ${filteredAccounts.length} records to CSV`);
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
                download
              </span>
              Export
            </button>
            <button
              type="button"
              className={styles.toolbarBtn}
              style={{ width: 32, height: 32, padding: 0, justifyContent: 'center' }}
              onClick={() => setIsRegisterDrawerOpen(false)}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                close
              </span>
            </button>
          </div>
        </div>

        {/* Register Summary Strip */}
        <div className={styles.registerSummaryStrip}>
          <div>
            <div className={styles.regStripLabel}>Opening balance</div>
            <div className={styles.regStripVal}>
              ${Math.max(0, (registerAccount?.balance || 0) - 3000).toLocaleString(undefined, {
                minimumFractionDigits: 2,
              })}
            </div>
          </div>
          <div>
            <div className={styles.regStripLabel}>Period activity</div>
            <div className={styles.regStripVal}>
              ${(registerAccount?.balance || 0).toLocaleString(undefined, {
                minimumFractionDigits: 2,
              })}
            </div>
          </div>
          <div>
            <div className={styles.regStripLabel}>Closing balance</div>
            <div className={styles.regStripVal}>
              ${(registerAccount?.balance || 0).toLocaleString(undefined, {
                minimumFractionDigits: 2,
              })}
            </div>
          </div>
        </div>

        {/* Register Tabs */}
        <div
          style={{
            display: 'flex',
            gap: 8,
            padding: '0 20px',
            borderBottom: '1px solid #dad9dd',
            height: 40,
            alignItems: 'center',
          }}
        >
          {(['all', 'deposits', 'payments'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              className={`${styles.toolbarBtn} ${regTab === tab ? styles.toolbarBtnActive : ''}`}
              style={{ border: 'none', background: 'transparent' }}
              onClick={() => setRegTab(tab)}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {/* Register List */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {(() => {
            if (!registerData) {
              return (
                <div style={{ padding: 40, textAlign: 'center', color: '#5a6355', fontSize: 13 }}>
                  Loading register…
                </div>
              );
            }
            /* Running balance accumulates over the full register;
               the tab only filters which rows are visible. */
            let running = registerData.openingBalance;
            const withBal = registerData.lines.map((l) => {
              running = Math.round((running + l.amount) * 100) / 100;
              return { ...l, balanceAfter: running };
            });
            const filtered = withBal.filter((t) => {
              if (regTab === 'deposits') return t.amount >= 0;
              if (regTab === 'payments') return t.amount < 0;
              return true;
            });

            if (filtered.length === 0) {
              return (
                <div style={{ padding: 40, textAlign: 'center', color: '#5a6355', fontSize: 13 }}>
                  No transactions in this account for the selected period.
                </div>
              );
            }

            return filtered.map((t, idx) => {
              const isDep = t.amount >= 0;
              const d = new Date(`${t.date}T00:00:00`);
              const dateLabel = Number.isNaN(d.getTime())
                ? t.date
                : d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
              return (
                <div key={idx} className={styles.regRow}>
                  <span className={styles.regDate}>{dateLabel}</span>
                  <span className={styles.regDesc}>{t.description}</span>
                  <span
                    className={styles.regAmt}
                    style={{ color: isDep ? '#006c47' : '#ba1a1a' }}
                  >
                    {isDep ? '+' : '−'}$
                    {Math.abs(t.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </span>
                  <span className={styles.regBal}>
                    ${t.balanceAfter.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </span>
                </div>
              );
            });
          })()}
        </div>
      </aside>

      {/* Toast */}
      {toastMsg && (
        <div className={styles.toast}>
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
            check_circle
          </span>
          {toastMsg}
        </div>
      )}
    </div>
  );
}
