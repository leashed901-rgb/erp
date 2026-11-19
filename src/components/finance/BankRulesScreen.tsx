'use client';

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { DomainKey } from '@/data/shellData';
import { exportToCsv } from '@/lib/csvExport';
import {
  useBankRules,
  useChartOfAccounts,
  useBankAccounts,
  useBankTransactions,
  bankRuleMutations,
  fetchBankRuleStats,
  type BankRuleStats,
} from '@/hooks/useAccountingApi';
import type { BankRuleDto } from '@/lib/acctTypes';
import styles from './BankRulesScreen.module.css';

export interface BankRuleItem {
  id: string;
  name: string;
  conditionKeyword: string;
  category: string;
  categoryClass: string;
  matchedCount: number;
  active: boolean;
  dto: BankRuleDto;
}

const PILL_CLASSES = [styles.pillBlue, styles.pillMaroon, styles.pillGreen, styles.pillTeal];

/* acct_bank_rules DTO → the table's row shape. This screen's chrome is
   the single-keyword rule form: the keyword is the rule's first text
   condition (description/payee contains), the category its split. */
function toRuleItem(r: BankRuleDto, i: number): BankRuleItem {
  const textCond = r.conditions.find((c) => c.field === 'description' || c.field === 'payee') || r.conditions[0];
  return {
    id: r.id,
    name: r.name,
    conditionKeyword: textCond?.value || '—',
    category: r.categoryLabel || '—',
    categoryClass: PILL_CLASSES[i % PILL_CLASSES.length],
    matchedCount: r.timesApplied,
    active: r.isActive,
    dto: r,
  };
}

const fmtUsDate = (iso: string) => {
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
};

export interface BankRulesScreenProps {
  onNavigate: (domain: DomainKey, screenId: string) => void;
  onToast?: (msg: string) => void;
}

export default function BankRulesScreen({ onNavigate, onToast }: BankRulesScreenProps) {
  const { rules: ruleDtos, refresh: refreshRules } = useBankRules();
  const { accounts: coaAccounts } = useChartOfAccounts();
  const { bankAccounts } = useBankAccounts();
  const { transactions: feedTxns } = useBankTransactions(null);
  const rules = useMemo(() => ruleDtos.map(toRuleItem), [ruleDtos]);
  const [ruleStats, setRuleStats] = useState<BankRuleStats | null>(null);
  useEffect(() => {
    let alive = true;
    void fetchBankRuleStats().then((res) => {
      if (alive && res.ok && res.data) setRuleStats(res.data);
    });
    return () => {
      alive = false;
    };
  }, [ruleDtos]);

  const [activeTab, setActiveTab] = useState<'all' | 'active' | 'paused'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Rule Editor Drawer
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [formName, setFormName] = useState('');
  const [formKeyword, setFormKeyword] = useState('');
  const [formCategory, setFormCategory] = useState('');
  const [formActive, setFormActive] = useState(true);
  const [formField, setFormField] = useState('description');
  const [formOperator, setFormOperator] = useState('contains');
  const [formMatchMode, setFormMatchMode] = useState('all');
  const [formBankAccount, setFormBankAccount] = useState('');

  // Row Menu
  const [rowMenuRuleId, setRowMenuRuleId] = useState<string | null>(null);
  const [rowMenuPos, setRowMenuPos] = useState({ top: 0, left: 0 });

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

  // Close row menu on click outside
  useEffect(() => {
    const handleOutside = () => setRowMenuRuleId(null);
    document.addEventListener('click', handleOutside);
    return () => document.removeEventListener('click', handleOutside);
  }, []);

  // KPIs — counts from the rules themselves; 30d volume + match rate
  // from /api/accounting/bank-rules/stats
  const totalRules = rules.length;
  const activeRules = rules.filter((r) => r.active).length;
  const pausedRules = rules.filter((r) => !r.active).length;
  const autoCategorized30d = ruleStats?.autoCategorized30d ?? 0;

  // Filtered rules
  const filteredRules = useMemo(() => {
    return rules.filter((r) => {
      if (activeTab === 'active' && !r.active) return false;
      if (activeTab === 'paused' && r.active) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const match =
          r.name.toLowerCase().includes(q) ||
          r.conditionKeyword.toLowerCase().includes(q) ||
          r.category.toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [rules, activeTab, searchQuery]);

  // Bulk selection
  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedIds(new Set(filteredRules.map((r) => r.id)));
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

  // Toggle single rule active state — persists via PATCH
  const handleToggleRule = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const rule = rules.find((r) => r.id === id);
    if (!rule) return;
    const res = await bankRuleMutations.update(id, { isActive: !rule.active });
    if (res.ok) {
      showToast(!rule.active ? 'Rule activated' : 'Rule paused');
      await refreshRules();
    } else showToast(res.error || 'Status could not be updated');
  };

  // Open Drawer for Create
  const handleOpenCreateDrawer = () => {
    setEditingRuleId(null);
    setFormName('');
    setFormKeyword('');
    setFormCategory('');
    setFormActive(true);
    setFormField('description');
    setFormOperator('contains');
    setFormMatchMode('all');
    setFormBankAccount('');
    setIsDrawerOpen(true);
  };

  // Open Drawer for Edit
  const handleOpenEditDrawer = (rule: BankRuleItem) => {
    setEditingRuleId(rule.id);
    setFormName(rule.name);
    setFormKeyword(rule.dto.conditions[0]?.value || '');
    setFormCategory(rule.dto.categoryAccountId || '');
    setFormActive(rule.active);
    setFormField(rule.dto.conditions[0]?.field || 'description');
    setFormOperator(rule.dto.conditions[0]?.operator || 'contains');
    setFormMatchMode(rule.dto.matchMode || 'all');
    setFormBankAccount(rule.dto.bankAccountIds[0] || '');
    setIsDrawerOpen(true);
  };

  /* Live preview: this drawer's model is one condition over the real
     bank feed — evaluated client-side against actual transactions. */
  const previewMatches = useMemo(() => {
    const kw = formKeyword.trim().toLowerCase();
    if (!kw) return [];
    return feedTxns
      .filter((t) => {
        const text = formField === 'payee' ? (t.payee || '') : formField === 'reference' ? '' : t.description;
        const hay = text.toLowerCase();
        switch (formOperator) {
          case 'contains': return hay.includes(kw);
          case 'not_contains': return !hay.includes(kw);
          case 'equals': return hay === kw;
          case 'starts_with': return hay.startsWith(kw);
          case 'ends_with': return hay.endsWith(kw);
          default: return hay.includes(kw);
        }
      })
      .map((t) => ({ desc: t.description, date: fmtUsDate(t.date), amt: t.amount }));
  }, [formKeyword, formField, formOperator, feedTxns]);

  // Save Rule — persists through the API (conditions + split rows)
  const handleSaveRule = async (andClose: boolean) => {
    if (!formName.trim()) {
      showToast('Rule name is required');
      return;
    }
    if (!formKeyword.trim()) {
      showToast('Condition keyword is required');
      return;
    }
    if (!formCategory) {
      showToast('Select a category');
      return;
    }

    const payload = {
      name: formName.trim(),
      matchMode: formMatchMode,
      isActive: formActive,
      /* 'All accounts' must stay unset — an empty array is a whitelist
         that matches nothing (acct_bank_rule_matches) */
      bankAccountIds: formBankAccount ? [formBankAccount] : undefined,
      conditions: [{ field: formField, operator: formOperator, value: formKeyword.trim() }],
      categoryAccountId: formCategory,
    };

    if (editingRuleId) {
      const res = await bankRuleMutations.update(editingRuleId, payload);
      if (!res.ok) {
        showToast(res.error || 'Rule could not be updated');
        return;
      }
      showToast(`Rule "${formName}" updated`);
    } else {
      const res = await bankRuleMutations.create({ ...payload, appliesTo: 'both', txnType: 'expense' });
      if (!res.ok) {
        showToast(res.error || 'Rule could not be saved');
        return;
      }
      showToast(`Rule "${formName}" saved`);
    }
    await refreshRules();

    if (andClose) {
      setIsDrawerOpen(false);
    } else {
      handleOpenCreateDrawer();
    }
  };

  /* Bulk helpers — real mutations with tallies */
  const bulkSetActive = async (active: boolean) => {
    const ids = [...selectedIds];
    let ok = 0;
    for (const id of ids) {
      const res = await bankRuleMutations.update(id, { isActive: active });
      if (res.ok) ok += 1;
    }
    showToast(`${active ? 'Activated' : 'Paused'} ${ok} of ${ids.length} rules`);
    setSelectedIds(new Set());
    await refreshRules();
  };
  const bulkApply = async () => {
    const ids = [...selectedIds];
    let applied = 0;
    for (const id of ids) {
      const res = await bankRuleMutations.apply(id);
      if (res.ok && res.data) applied += res.data.appliedNow;
    }
    showToast(`Applied rules to ${applied} existing transactions`);
    setSelectedIds(new Set());
    await refreshRules();
  };
  const bulkDelete = async () => {
    const ids = [...selectedIds];
    let ok = 0;
    for (const id of ids) {
      const res = await bankRuleMutations.remove(id);
      if (res.ok) ok += 1;
    }
    showToast(`Deleted ${ok} of ${ids.length} rules`);
    setSelectedIds(new Set());
    await refreshRules();
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
          <span className={styles.breadcrumbActive}>Rules</span>
        </div>
      </div>

      <main className={styles.main}>
        {/* Page Header */}
        <div className={styles.pageHeader}>
          <div>
            <h1 className={styles.pageTitle}>Bank rules</h1>
            <p className={styles.pageSubtitle}>
              Auto-categorize repeating transactions — when the bank description matches, apply the
              category.
            </p>
          </div>
          <div className={styles.headerActions}>
            <button
              type="button"
              className={styles.headerBtn}
              onClick={() => {
                const cols = [
                  { key: 'name', label: 'Rule name' },
                  { key: 'conditionKeyword', label: 'Condition keyword' },
                  { key: 'category', label: 'Category' },
                  { key: 'matchedCount', label: 'Matched count' },
                  { key: 'active', label: 'Active' },
                ];
                exportToCsv(filteredRules as unknown as Record<string, unknown>[], cols, 'bank-rules');
                showToast(`Exported ${filteredRules.length} records to CSV`);
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                download
              </span>
              Export
            </button>
            <button
              type="button"
              className={`${styles.headerBtn} ${styles.headerBtnPrimary}`}
              onClick={handleOpenCreateDrawer}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                add
              </span>
              New rule
            </button>
          </div>
        </div>

        {/* KPI Strip */}
        <div className={styles.kpiStrip}>
          <div className={styles.kpiCard}>
            <span className={styles.kpiLabel}>Active rules</span>
            <div className={styles.kpiValue}>{activeRules}</div>
          </div>
          <div className={styles.kpiCard}>
            <span className={styles.kpiLabel}>Auto-categorized (30d)</span>
            <div className={styles.kpiValue}>{autoCategorized30d}</div>
          </div>
          <div className={styles.kpiCard}>
            <span className={styles.kpiLabel}>Paused</span>
            <div className={styles.kpiValue}>{pausedRules}</div>
          </div>
          <div className={styles.kpiCard}>
            <span className={styles.kpiLabel}>Match rate</span>
            <div className={styles.kpiValue}>{ruleStats ? `${Math.round(ruleStats.matchRate * 100)}%` : '—'}</div>
          </div>
        </div>

        {/* Table Card */}
        <div className={styles.tableCard}>
          {/* Tabs */}
          <div className={styles.tabsBar}>
            <button
              type="button"
              className={`${styles.tabBtn} ${activeTab === 'all' ? styles.tabBtnActive : ''}`}
              onClick={() => {
                setActiveTab('all');
                setSelectedIds(new Set());
              }}
            >
              All rules
            </button>
            <button
              type="button"
              className={`${styles.tabBtn} ${activeTab === 'active' ? styles.tabBtnActive : ''}`}
              onClick={() => {
                setActiveTab('active');
                setSelectedIds(new Set());
              }}
            >
              Active
            </button>
            <button
              type="button"
              className={`${styles.tabBtn} ${activeTab === 'paused' ? styles.tabBtnActive : ''}`}
              onClick={() => {
                setActiveTab('paused');
                setSelectedIds(new Set());
              }}
            >
              Paused
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
                placeholder="Filter rules…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <button
              type="button"
              className={styles.headerBtn}
              onClick={() => showToast('Saved views panel')}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
                bookmark
              </span>
              Saved views
            </button>
            <span style={{ marginLeft: 'auto', fontSize: 11, color: '#5a6355' }}>
              {filteredRules.length} of {totalRules}
            </span>
          </div>

          {/* Bulk Bar */}
          {selectedIds.size > 0 && (
            <div className={styles.bulkBar}>
              <span style={{ fontSize: 12, fontWeight: 600 }}>{selectedIds.size} selected</span>
              <button
                type="button"
                className={styles.bulkBtn}
                onClick={() => void bulkSetActive(true)}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
                  play_arrow
                </span>
                Activate
              </button>
              <button
                type="button"
                className={styles.bulkBtn}
                onClick={() => void bulkSetActive(false)}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
                  pause
                </span>
                Pause
              </button>
              <button
                type="button"
                className={styles.bulkBtn}
                onClick={() => void bulkApply()}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
                  play_circle
                </span>
                Apply to existing
              </button>
              <button
                type="button"
                className={styles.bulkBtn}
                onClick={() => void bulkDelete()}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
                  delete
                </span>
                Delete
              </button>
              <button
                type="button"
                style={{
                  marginLeft: 'auto',
                  color: '#ffffff',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                }}
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
                    checked={
                      filteredRules.length > 0 && selectedIds.size === filteredRules.length
                    }
                    onChange={handleSelectAll}
                    style={{ accentColor: '#0077c5' }}
                  />
                </th>
                <th>Rule name</th>
                <th>When (description)</th>
                <th>Then (category)</th>
                <th style={{ textAlign: 'right' }}>Times applied</th>
                <th>Active</th>
                <th style={{ width: 36 }} />
              </tr>
            </thead>
            <tbody>
              {filteredRules.map((rule) => {
                const isSelected = selectedIds.has(rule.id);

                return (
                  <tr
                    key={rule.id}
                    className={`${styles.row} ${!rule.active ? styles.rowPaused : ''}`}
                    onClick={() => handleOpenEditDrawer(rule)}
                  >
                    <td
                      className={styles.td}
                      style={{ width: 36, paddingLeft: 12 }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleToggleRow(rule.id)}
                        style={{ accentColor: '#0077c5' }}
                      />
                    </td>
                    <td className={styles.td} style={{ fontWeight: 500 }}>
                      {rule.name}
                    </td>
                    <td className={styles.td}>
                      <span className={styles.codeBadge}>
                        contains &quot;{rule.conditionKeyword}&quot;
                      </span>
                    </td>
                    <td className={styles.td}>
                      <span className={`${styles.categoryPill} ${rule.categoryClass}`}>
                        {rule.category}
                      </span>
                    </td>
                    <td className={styles.td} style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                      {rule.matchedCount}
                    </td>
                    <td className={styles.td} onClick={(e) => e.stopPropagation()}>
                      <div
                        className={`${styles.switch} ${rule.active ? styles.switchOn : ''}`}
                        onClick={(e) => void handleToggleRule(rule.id, e)}
                      />
                    </td>
                    <td
                      className={styles.td}
                      style={{ textAlign: 'right' }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        className={styles.headerBtn}
                        style={{ width: 28, height: 28, padding: 0, justifyContent: 'center' }}
                        onClick={(e) => {
                          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                          setRowMenuPos({
                            top: rect.bottom + 4,
                            left: Math.min(rect.right - 260, window.innerWidth - 280),
                          });
                          setRowMenuRuleId(rowMenuRuleId === rule.id ? null : rule.id);
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
      {rowMenuRuleId && (
        <div
          className={styles.menu}
          style={{ top: rowMenuPos.top, left: rowMenuPos.left }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className={styles.menuHeader}>This rule</div>
          <button
            type="button"
            className={styles.menuItem}
            onClick={() => {
              const rule = rules.find((r) => r.id === rowMenuRuleId);
              if (rule) handleOpenEditDrawer(rule);
              setRowMenuRuleId(null);
            }}
          >
            <span className="material-symbols-outlined">edit</span>
            Edit rule
          </button>
          <button
            type="button"
            className={styles.menuItem}
            onClick={() => {
              const rule = rules.find((r) => r.id === rowMenuRuleId);
              setRowMenuRuleId(null);
              if (!rule) return;
              void (async () => {
                const res = await bankRuleMutations.create({
                  name: `${rule.name} (Copy)`,
                  priority: rule.dto.priority,
                  appliesTo: rule.dto.appliesTo,
                  matchMode: rule.dto.matchMode,
                  txnType: rule.dto.txnType,
                  bankAccountIds: rule.dto.bankAccountIds.length ? rule.dto.bankAccountIds : undefined,
                  autoConfirm: rule.dto.autoConfirm,
                  isActive: rule.active,
                  conditions: rule.dto.conditions.map((c) => ({ field: c.field, operator: c.operator, value: c.value, value2: c.value2, caseSensitive: c.caseSensitive })),
                  categoryAccountId: rule.dto.categoryAccountId || undefined,
                  splits: rule.dto.splits.map((s) => ({ accountId: s.accountId, percent: s.percent })),
                });
                if (res.ok) {
                  showToast(`Duplicated ${rule.name}`);
                  await refreshRules();
                } else showToast(res.error || 'Duplicate failed');
              })();
            }}
          >
            <span className="material-symbols-outlined">content_copy</span>
            Duplicate
          </button>
          <div className={styles.menuSep} />
          <div className={styles.menuHeader}>Run</div>
          <button
            type="button"
            className={styles.menuItem}
            onClick={() => {
              const id = rowMenuRuleId;
              setRowMenuRuleId(null);
              if (!id) return;
              void (async () => {
                const res = await bankRuleMutations.apply(id);
                if (res.ok && res.data) {
                  showToast(`Applied to ${res.data.appliedNow} past transactions`);
                  await refreshRules();
                } else showToast(res.error || 'Apply failed');
              })();
            }}
          >
            <span className="material-symbols-outlined">play_circle</span>
            Apply to existing
          </button>
          <button
            type="button"
            className={styles.menuItem}
            onClick={() => {
              showToast('Viewing matched transactions in Bank feed');
              onNavigate('finance', 'bank');
              setRowMenuRuleId(null);
            }}
          >
            <span className="material-symbols-outlined">list</span>
            View matched transactions
          </button>
          <div className={styles.menuSep} />
          <div className={styles.menuHeader}>State</div>
          <button
            type="button"
            className={styles.menuItem}
            onClick={() => {
              const id = rowMenuRuleId;
              const rule = rules.find((r) => r.id === id);
              setRowMenuRuleId(null);
              if (!id || !rule) return;
              void (async () => {
                const res = await bankRuleMutations.update(id, { isActive: !rule.active });
                if (res.ok) {
                  showToast('Rule status updated');
                  await refreshRules();
                } else showToast(res.error || 'Status could not be updated');
              })();
            }}
          >
            <span className="material-symbols-outlined">pause</span>
            Toggle active / pause
          </button>
          <button
            type="button"
            className={`${styles.menuItem} ${styles.menuItemDanger}`}
            onClick={() => {
              const id = rowMenuRuleId;
              setRowMenuRuleId(null);
              if (!id) return;
              void (async () => {
                const res = await bankRuleMutations.remove(id);
                if (res.ok) {
                  showToast('Rule deleted');
                  await refreshRules();
                } else showToast(res.error || 'Rule could not be deleted');
              })();
            }}
          >
            <span className="material-symbols-outlined">delete</span>
            Delete rule
          </button>
        </div>
      )}

      {/* ═══════════ RULE EDITOR DRAWER ═══════════ */}
      <div
        className={`${styles.drawerScrim} ${isDrawerOpen ? styles.drawerScrimOpen : ''}`}
        onClick={() => setIsDrawerOpen(false)}
      />
      <aside className={`${styles.drawer} ${isDrawerOpen ? styles.drawerOpen : ''}`}>
        <div className={styles.drawerHeader}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="material-symbols-outlined" style={{ color: '#0a6400', fontSize: 20 }}>
              tune
            </span>
            <div>
              <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>
                {editingRuleId ? 'Edit rule' : 'New bank rule'}
              </h2>
              <div style={{ fontSize: 11, color: '#5a6355' }}>
                When the bank description matches, categorize
              </div>
            </div>
          </div>
          <button
            type="button"
            className={styles.headerBtn}
            style={{ width: 32, height: 32, padding: 0, justifyContent: 'center' }}
            onClick={() => setIsDrawerOpen(false)}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
              close
            </span>
          </button>
        </div>

        <div className={styles.drawerBody}>
          {/* Rule name */}
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#5a6355', marginBottom: 6 }}>
              Rule name
            </label>
            <input
              className={styles.condInput}
              style={{ width: '100%', height: 36 }}
              placeholder="e.g. Staples → Office supplies"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
            />
          </div>

          {/* WHEN */}
          <div style={{ borderTop: '1px solid #eeedf1', paddingTop: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#5a6355' }}>
                When (conditions)
              </div>
              <select
                className={styles.condSelect}
                style={{ fontSize: 11, height: 26 }}
                value={formMatchMode}
                onChange={(e) => setFormMatchMode(e.target.value)}
              >
                <option value="all">Match ALL conditions</option>
                <option value="any">Match ANY condition</option>
              </select>
            </div>

            <div className={styles.condRow}>
              <span className={styles.condPrefix}>When</span>
              <select
                className={styles.condSelect}
                value={formField}
                onChange={(e) => setFormField(e.target.value)}
              >
                <option value="description">Bank description</option>
                <option value="payee">Payee</option>
                <option value="reference">Reference</option>
                <option value="bank_text">Bank text</option>
              </select>
              <select
                className={styles.condSelect}
                value={formOperator}
                onChange={(e) => setFormOperator(e.target.value)}
              >
                <option value="contains">Contains</option>
                <option value="not_contains">Does not contain</option>
                <option value="equals">Equals</option>
                <option value="starts_with">Starts with</option>
                <option value="ends_with">Ends with</option>
              </select>
              <input
                className={styles.condInput}
                placeholder="e.g. STAPLES"
                value={formKeyword}
                onChange={(e) => setFormKeyword(e.target.value)}
              />
            </div>
          </div>

          {/* THEN */}
          <div style={{ borderTop: '1px solid #eeedf1', paddingTop: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#5a6355', marginBottom: 8 }}>
              Then (apply)
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#5a6355', marginBottom: 4 }}>
                  Category
                </label>
                <select
                  className={styles.condInput}
                  style={{ width: '100%', height: 36 }}
                  value={formCategory}
                  onChange={(e) => setFormCategory(e.target.value)}
                >
                  <option value="">— Select category —</option>
                  {coaAccounts.map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#5a6355', marginBottom: 4 }}>
                  Apply to bank account
                </label>
                <select
                  className={styles.condInput}
                  style={{ width: '100%', height: 36 }}
                  value={formBankAccount}
                  onChange={(e) => setFormBankAccount(e.target.value)}
                >
                  <option value="">All accounts</option>
                  {bankAccounts.map((a) => (
                    <option key={a.id} value={a.id}>{a.name}{a.maskedNumber ? ` •${a.maskedNumber}` : ''}</option>
                  ))}
                </select>
              </div>

              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={formActive}
                  onChange={(e) => setFormActive(e.target.checked)}
                  style={{ accentColor: '#0a6400' }}
                />
                Turn on rule immediately
              </label>
            </div>
          </div>

          {/* PREVIEW */}
          <div style={{ borderTop: '1px solid #eeedf1', paddingTop: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#5a6355' }}>
                Would have matched
              </div>
              <span style={{ fontSize: 11, color: '#5a6355' }}>
                {previewMatches.length} recent transactions
              </span>
            </div>

            <div
              style={{
                border: '1px solid #dad9dd',
                borderRadius: 8,
                overflow: 'hidden',
                backgroundColor: '#ffffff',
              }}
            >
              {previewMatches.length === 0 ? (
                <div style={{ padding: 16, textAlign: 'center', fontSize: 11, color: '#5a6355' }}>
                  {formKeyword.trim()
                    ? `No recent transactions match "${formKeyword.toUpperCase()}".`
                    : 'Enter a description keyword to preview matched transactions.'}
                </div>
              ) : (
                previewMatches.slice(0, 5).map((t, i) => (
                  <div key={i} className={styles.previewTxn}>
                    <span style={{ width: 80, color: '#5a6355' }}>{t.date}</span>
                    <span style={{ flex: 1, fontWeight: 500 }}>{t.desc}</span>
                    <span
                      style={{
                        fontWeight: 600,
                        fontVariantNumeric: 'tabular-nums',
                        color: t.amt < 0 ? '#ba1a1a' : '#006c47',
                      }}
                    >
                      {t.amt < 0 ? '−' : '+'}${Math.abs(t.amt).toFixed(2)}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div className={styles.drawerFooter}>
          <button
            type="button"
            className={styles.headerBtn}
            onClick={() => setIsDrawerOpen(false)}
          >
            Cancel
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              className={styles.headerBtn}
              onClick={() => void handleSaveRule(false)}
            >
              Save and new
            </button>
            <button
              type="button"
              className={`${styles.headerBtn} ${styles.headerBtnPrimary}`}
              onClick={() => void handleSaveRule(true)}
            >
              Save rule
            </button>
          </div>
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
