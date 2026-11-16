'use client';
import './bank-transactions.css';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AccountingScreenProps } from './types';
import { ACCT_NAV } from './types';
import RowMenu from '@/components/ListPrimitives';
import { useBankAccounts, useBankTransactions, useBankRules, useChartOfAccounts, bankTxnMutations, bankRuleMutations, fetchMatchCandidates } from '@/hooks/useAccountingApi';
import type { BankTxnDto, MatchCandidate } from '@/lib/acctTypes';
import { exportToCsv } from '@/lib/csvExport';

type ViewTab = 'review' | 'categorized' | 'excluded' | 'all';
type TxStatus = 'review' | 'categorized' | 'excluded';
type TxType = 'expense' | 'income';
type BulkAction = 'match' | 'exclude' | 'receipt' | 'delete' | 'close';

interface CatChip {
  cls: string;
  icon?: string;
  label: string;
  /** chip carries data-cat-picker → opens the category picker */
  picker: boolean;
}

interface TxRow {
  id: string;
  status: TxStatus;
  type: TxType;
  date: string;
  desc: string;
  payee: string;
  amount: string;
  amountCls: string;
  chip: CatChip;
  matchBadge: string | null;
  rowExcluded: boolean;
  checked: boolean;
  dto: BankTxnDto;
}

const fmtAmt = (n: number) => `${n >= 0 ? '+' : '−'}$${Math.abs(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
const fmtDate = (iso: string) => {
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
};

/* acct_bank_transactions DTO → the table's row shape. The chip is the
   category account's name, the platform's suggested account (with the
   sparkle), or the picker's Select category prompt. */
function toTxRow(t: BankTxnDto, checked: boolean): TxRow {
  const excluded = t.status === 'excluded';
  const chip: CatChip = excluded
    ? { cls: 'cat-chip excluded', label: 'Excluded', picker: false }
    : t.categoryLabel
      ? { cls: 'cat-chip', label: t.categoryLabel, picker: true }
      : t.suggestedLabel
        ? { cls: 'cat-chip suggested', icon: 'auto_awesome', label: t.suggestedLabel, picker: true }
        : { cls: 'cat-chip', icon: 'expand_more', label: 'Select category', picker: true };
  return {
    id: t.id,
    status: t.status,
    type: t.type,
    date: fmtDate(t.date),
    desc: t.description,
    payee: t.payee || '—',
    amount: fmtAmt(t.amount),
    amountCls: t.amount >= 0 ? 'text-secondary' : 'text-error',
    chip,
    matchBadge: t.matchedLabel,
    rowExcluded: excluded,
    checked,
    dto: t,
  };
}

export default function BankTransactions({ onNavigate, onToast }: AccountingScreenProps) {
  const { bankAccounts } = useBankAccounts();
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const accountId = selectedAccountId || bankAccounts[0]?.id || null;
  const { transactions, refresh: refreshTxns } = useBankTransactions(accountId);
  const { accounts: coaAccounts } = useChartOfAccounts();
  const { rules, refresh: refreshRules } = useBankRules();

  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const rows = useMemo(
    () => transactions.map((t) => toTxRow(t, checkedIds.has(t.id))),
    [transactions, checkedIds],
  );
  const [checkAll, setCheckAll] = useState(false);
  const [bulkCat, setBulkCat] = useState('');
  const [viewTab, setViewTab] = useState<ViewTab>('review');
  const [filterText, setFilterText] = useState('');
  const [ruleDismissed, setRuleDismissed] = useState(false);
  const [catPickerOpen, setCatPickerOpen] = useState(false);
  const [catPickerPos, setCatPickerPos] = useState({ top: 0, left: 0 });
  const [pickerRowId, setPickerRowId] = useState<string | null>(null);
  const [pickerMode, setPickerMode] = useState<'cats' | 'matches'>('cats');
  const [candidates, setCandidates] = useState<MatchCandidate[]>([]);
  const [catSearch, setCatSearch] = useState('');
  const [toastMsg, setToastMsg] = useState('');

  const toastTimer = useRef<number | null>(null);
  const pickerRef = useRef<HTMLDivElement>(null);

  const toast = useCallback((m: string) => {
    setToastMsg(m);
    if (toastTimer.current !== null) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToastMsg(''), 1800);
  }, []);

  useEffect(() => () => {
    if (toastTimer.current !== null) window.clearTimeout(toastTimer.current);
  }, []);

  // document click closes the category picker when clicking outside it
  useEffect(() => {
    if (!catPickerOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setCatPickerOpen(false);
      }
    };
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, [catPickerOpen]);

  const selectedAccount = bankAccounts.find((a) => a.id === accountId) || null;
  const pickerRow = rows.find((r) => r.id === pickerRowId) || null;

  const visibleRows = rows.filter((r) => {
    const tabOk = viewTab === 'all' || r.status === viewTab;
    const q = filterText.trim().toLowerCase();
    const qOk = !q || r.desc.toLowerCase().includes(q) || r.payee.toLowerCase().includes(q) || r.amount.replace(/[^0-9.]/g, '').includes(q.replace(/[^0-9.]/g, ''));
    return tabOk && qOk;
  });
  const checkedCount = rows.filter((r) => r.checked).length;
  const reviewCount = rows.filter((r) => r.status === 'review').length;
  const txCountText = `${visibleRows.length} of ${rows.length}`;

  /* Rule suggestion, computed from real data: a payee categorized at
     least twice that no active bank rule covers yet. */
  const ruleSuggestion = useMemo(() => {
    const byPayee = new Map<string, BankTxnDto[]>();
    for (const t of transactions) {
      if (!t.categoryAccountId || !t.payee) continue;
      const arr = byPayee.get(t.payee) || [];
      arr.push(t);
      byPayee.set(t.payee, arr);
    }
    for (const [payee, arr] of byPayee) {
      if (arr.length < 2) continue;
      const covered = rules.some(
        (rule) =>
          rule.isActive &&
          rule.conditions.some(
            (c) => c.value && (c.value.toLowerCase().includes(payee.toLowerCase()) || payee.toLowerCase().includes(c.value.toLowerCase())),
          ),
      );
      if (covered) continue;
      return { payee, count: arr.length, categoryAccountId: arr[0].categoryAccountId as string, categoryLabel: arr[0].categoryLabel || '', type: arr[0].type };
    }
    return null;
  }, [transactions, rules]);

  const createRuleFromSuggestion = async () => {
    if (!ruleSuggestion) return;
    const res = await bankRuleMutations.create({
      name: `${ruleSuggestion.payee} → ${ruleSuggestion.categoryLabel}`,
      appliesTo: ruleSuggestion.type === 'income' ? 'money_in' : 'money_out',
      txnType: ruleSuggestion.type === 'income' ? 'deposit' : 'expense',
      conditions: [{ field: 'payee', operator: 'contains', value: ruleSuggestion.payee }],
      categoryAccountId: ruleSuggestion.categoryAccountId,
    });
    if (res.ok) {
      toast(`Rule created: ${ruleSuggestion.payee} → ${ruleSuggestion.categoryLabel}`);
      setRuleDismissed(true);
      void refreshRules();
    } else {
      toast(res.error || 'Rule could not be created');
    }
  };

  /* View tabs */
  const handleViewTab = (st: ViewTab) => setViewTab(st);

  /* Row interactions */
  const handleRowClick = (e: React.MouseEvent<HTMLTableRowElement>, row: TxRow) => {
    if ((e.target as HTMLElement).closest('input,button,.cat-chip')) return;
    toast(`${row.desc} · ${row.date} · ${row.amount} · ${row.dto.rawStatus.replace(/_/g, ' ')}`);
  };

  const toggleRowCheck = (id: string) => {
    setCheckedIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const handleCheckAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCheckAll(e.target.checked);
    setCheckedIds(e.target.checked ? new Set(rows.map((r) => r.id)) : new Set());
  };

  /* Bulk bar — every action runs against the API for each checked row
     and reports the real tally. */
  const handleBulk = async (act: BulkAction) => {
    if (act === 'close') {
      setCheckedIds(new Set());
      setCheckAll(false);
      return;
    }
    if (act === 'receipt') {
      onNavigate(...ACCT_NAV.receipts());
      return;
    }
    const checked = rows.filter((r) => r.checked);
    if (!checked.length) return;
    let ok = 0;
    let failed = 0;
    if (act === 'exclude') {
      for (const r of checked) {
        const res = await bankTxnMutations.exclude(r.id);
        if (res.ok) ok += 1;
        else failed += 1;
      }
      toast(`Excluded ${ok} transaction${ok !== 1 ? 's' : ''}${failed ? ` — ${failed} could not be excluded` : ''}`);
    } else if (act === 'delete') {
      for (const r of checked) {
        const res = await bankTxnMutations.remove(r.id);
        if (res.ok) ok += 1;
        else failed += 1;
      }
      toast(`Deleted ${ok} transaction${ok !== 1 ? 's' : ''}${failed ? ` — ${failed} failed` : ''}`);
    } else if (act === 'match') {
      for (const r of checked) {
        const cands = await fetchMatchCandidates(r.id);
        if (cands.ok && cands.data && cands.data.length === 1) {
          const res = await bankTxnMutations.match(r.id, cands.data[0].journalLineId);
          if (res.ok) ok += 1;
          else failed += 1;
        } else failed += 1;
      }
      toast(`Matched ${ok} of ${checked.length}${failed ? ` — ${failed} had no unique candidate` : ''}`);
    }
    setCheckedIds(new Set());
    setCheckAll(false);
    await refreshTxns();
  };

  const applyBulkCategory = async (categoryAccountId: string) => {
    setBulkCat('');
    if (!categoryAccountId) return;
    const checked = rows.filter((r) => r.checked);
    if (!checked.length) return;
    let ok = 0;
    let failed = 0;
    for (const r of checked) {
      const res = await bankTxnMutations.categorize(r.id, categoryAccountId);
      if (res.ok) ok += 1;
      else failed += 1;
    }
    const name = coaAccounts.find((a) => a.id === categoryAccountId)?.name || 'category';
    toast(`Categorized ${ok} as ${name}${failed ? ` — ${failed} could not be categorized` : ''}`);
    setCheckedIds(new Set());
    setCheckAll(false);
    await refreshTxns();
  };

  /* Category picker */
  const openPickerAt = (rowId: string, rect: DOMRect) => {
    setPickerRowId(rowId);
    setPickerMode('cats');
    setCandidates([]);
    setCatPickerPos({ top: rect.bottom + 4, left: Math.min(rect.left, window.innerWidth - 300) });
    setCatPickerOpen(true);
    setCatSearch('');
  };
  const openCatPicker = (e: React.MouseEvent<HTMLButtonElement>, rowId: string) => {
    e.stopPropagation();
    openPickerAt(rowId, e.currentTarget.getBoundingClientRect());
  };
  const openPickerForRow = (row: TxRow) => {
    const el = document.querySelector(`tr[data-row-id="${row.id}"]`);
    openPickerAt(row.id, el ? el.getBoundingClientRect() : new DOMRect(120, 120, 0, 0));
  };

  const pickCategory = async (accountId: string) => {
    if (!pickerRowId) return;
    const name = coaAccounts.find((a) => a.id === accountId)?.name || 'category';
    const res = await bankTxnMutations.categorize(pickerRowId, accountId);
    if (res.ok) {
      toast(`Categorized as ${name}`);
      await refreshTxns();
    } else {
      toast(res.error || 'Could not categorize');
    }
    setCatPickerOpen(false);
  };

  const pickMatch = async () => {
    if (!pickerRowId) return;
    const res = await fetchMatchCandidates(pickerRowId);
    if (!res.ok) {
      toast(res.error || 'Could not load match candidates');
      setCatPickerOpen(false);
      return;
    }
    if (!res.data || !res.data.length) {
      toast('No matching journal lines within 10 days');
      setCatPickerOpen(false);
      return;
    }
    setCandidates(res.data);
    setPickerMode('matches');
  };

  const pickCandidate = async (c: MatchCandidate) => {
    if (!pickerRowId) return;
    const res = await bankTxnMutations.match(pickerRowId, c.journalLineId);
    if (res.ok) {
      toast(`Matched to journal entry${c.entryNo ? ` #${c.entryNo}` : ''}`);
      await refreshTxns();
    } else {
      toast(res.error || 'Could not match');
    }
    setCatPickerOpen(false);
  };

  const pickExclude = async () => {
    if (!pickerRowId) return;
    const res = await bankTxnMutations.exclude(pickerRowId);
    if (res.ok) {
      toast('Transaction excluded');
      await refreshTxns();
    } else {
      toast(res.error || 'Could not exclude');
    }
    setCatPickerOpen(false);
  };

  /* Picker option lists — the tenant's real chart of accounts. The
     platform's suggested account (when the feed carries one) leads,
     then same-type accounts, then everything else. */
  const pickerCats = useMemo(() => {
    const active = coaAccounts.filter((a) => a.isActive);
    if (!pickerRow) return { suggested: active.slice(0, 4), all: active.slice(4) };
    const wantType = pickerRow.type === 'expense' ? 'Expense' : 'Income';
    const suggested: typeof active = [];
    if (pickerRow.dto.suggestedAccountId) {
      const s = active.find((a) => a.id === pickerRow.dto.suggestedAccountId);
      if (s) suggested.push(s);
    }
    for (const a of active.filter((x) => x.type === wantType)) {
      if (suggested.length >= 4) break;
      if (!suggested.find((x) => x.id === a.id)) suggested.push(a);
    }
    const all = active.filter((a) => !suggested.find((x) => x.id === a.id));
    return { suggested, all };
  }, [pickerRow, coaAccounts]);
  const catFilter = (name: string) => !catSearch || name.toLowerCase().includes(catSearch.toLowerCase());

  return (
    <div className="bank-transactions-page bg-background font-sans text-body-md text-on-surface antialiased">

      {/* Context header */}
      <div className="h-[52px] px-6 flex items-center justify-between bg-white border-b border-surface-dim">
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-[20px] text-on-surface-variant">account_balance</span>
          <span className="text-label-md font-semibold">Finance</span>
          <span className="text-outline">/</span>
          <span className="text-label-md">Accounting</span>
          <span className="text-outline">/</span>
          <span className="text-label-md text-primary font-semibold">Bank transactions</span>
        </div>
      </div>

      <main className="px-6 pb-12">

        {/* Page header */}
        <div className="flex items-center justify-between gap-4 py-4">
          <div>
            <h1 className="text-headline-lg">Bank transactions</h1>
            <p className="text-body-sm text-on-surface-variant mt-0.5">For review feed + bank rules{selectedAccount ? ` · ${selectedAccount.name}${selectedAccount.maskedNumber ? ` •${selectedAccount.maskedNumber.slice(-4)}` : ''} · ${selectedAccount.lastSyncAt ? `synced ${new Date(selectedAccount.lastSyncAt).toLocaleString()}` : 'not synced'}` : ''}</p>
          </div>
          <div className="flex items-center gap-2">
            <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low flex items-center gap-1">
              <span className="material-symbols-outlined text-[16px]">sync</span>Sync bank</button>
            <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low flex items-center gap-1" data-goto="rules" onClick={() => onNavigate(...ACCT_NAV.rules())}>
              <span className="material-symbols-outlined text-[16px]">tune</span>Rules</button>
            <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low flex items-center gap-1" data-export onClick={() => exportToCsv(visibleRows.map((r) => ({ date: r.date, description: r.desc, payee: r.payee, amount: r.dto.amount, category: r.dto.categoryLabel || '', status: r.dto.rawStatus })), [{ key: 'date', label: 'Date' }, { key: 'description', label: 'Description' }, { key: 'payee', label: 'Payee' }, { key: 'amount', label: 'Amount' }, { key: 'category', label: 'Category' }, { key: 'status', label: 'Status' }], 'bank-transactions')}>
              <span className="material-symbols-outlined text-[16px]">download</span>Export</button>
          </div>
        </div>

        {/* Account tabs — the tenant's real bank accounts */}
        <div className="flex items-center gap-1 mb-3">
          {bankAccounts.map((a) => {
            const isSel = a.id === accountId;
            const icon = a.accountKind === 'credit_card' || a.accountType === 'credit_card' ? 'credit_card' : a.accountKind === 'checking' || a.accountType === 'checking' ? 'account_balance' : 'account_balance_wallet';
            return (
              <button key={a.id} className={`h-8 px-3 rounded-lg bg-white text-label-sm flex items-center gap-1.5 ${isSel ? 'border border-primary text-primary font-semibold' : 'border border-surface-dim hover:bg-surface-container-low text-on-surface'}`} onClick={() => { setSelectedAccountId(a.id); setCheckedIds(new Set()); }}>
                <span className="material-symbols-outlined text-[14px]">{icon}</span>{a.name}{a.maskedNumber ? ` •${a.maskedNumber.slice(-4)}` : ''}</button>
            );
          })}
          <button className="h-8 px-3 rounded-lg bg-white border border-surface-dim hover:bg-surface-container-low text-on-surface-variant text-label-sm flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[14px]">add</span>Connect account</button>
        </div>

        {/* Rule suggestion banner — shown only when the real feed
            supports it: a payee categorized 2+ times, no rule yet */}
        {ruleSuggestion && !ruleDismissed && (
        <div className="rule-banner">
          <span className="material-symbols-outlined text-[20px] text-qb-blue">auto_awesome</span>
          <div className="flex-1">
            <div className="text-body-sm font-semibold">Rule suggestion</div>
            <div className="text-[11px] text-on-surface-variant">You've categorized {ruleSuggestion.count} {ruleSuggestion.payee} transactions as <strong>{ruleSuggestion.categoryLabel}</strong>. Create a rule to auto-categorize future ones?</div>
          </div>
          <button className="h-7 px-2.5 border border-surface-dim rounded text-label-sm font-semibold hover:bg-white" data-create-rule onClick={() => void createRuleFromSuggestion()}>Create rule</button>
          <button className="h-7 w-7 rounded hover:bg-white flex items-center justify-center" data-dismiss-rule aria-label="Dismiss rule suggestion" onClick={() => setRuleDismissed(true)}>
            <span className="material-symbols-outlined text-[16px]">close</span></button>
        </div>
        )}

        {/* Table card */}
        <div className="bg-white rounded-xl shadow-sm border border-surface-dim overflow-hidden">

          {/* Tabs */}
          <div className="flex items-center gap-1 px-4 h-11 border-b border-surface-dim overflow-x-auto">
            <button className={`h-full px-3 text-label-md tab-underline${viewTab === 'review' ? ' active' : ''}`} data-viewtab="review" onClick={() => handleViewTab('review')}>
              For review <span className="ml-1 px-1.5 py-0.5 rounded-full bg-qb-blue text-white text-[10px] font-bold" data-tab-count>{reviewCount}</span></button>
            <button className={`h-full px-3 text-label-md tab-underline text-on-surface-variant${viewTab === 'categorized' ? ' active' : ''}`} data-viewtab="categorized" onClick={() => handleViewTab('categorized')}>Categorized</button>
            <button className={`h-full px-3 text-label-md tab-underline text-on-surface-variant${viewTab === 'excluded' ? ' active' : ''}`} data-viewtab="excluded" onClick={() => handleViewTab('excluded')}>Excluded</button>
            <button className={`h-full px-3 text-label-md tab-underline text-on-surface-variant${viewTab === 'all' ? ' active' : ''}`} data-viewtab="all" onClick={() => handleViewTab('all')}>All</button>
          </div>

          {/* Filter bar */}
          <div className="px-4 py-2 flex items-center gap-2 border-b border-surface-dim flex-wrap">
            <div className="relative flex items-center flex-1 max-w-sm min-w-[180px]">
              <span className="material-symbols-outlined absolute left-2 text-[15px] text-outline">search</span>
              <input className="w-full h-7 pl-7 pr-2 bg-surface-container-low border border-surface-dim rounded text-body-sm focus:outline-none focus:border-primary" placeholder="Filter by description, amount…" value={filterText} onChange={(e) => setFilterText(e.target.value)} />
            </div>
            <button className="h-7 px-2 border border-surface-dim rounded text-label-sm hover:bg-surface-container-low flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px]">calendar_today</span>Date range</button>
            <button className="h-7 px-2 border border-surface-dim rounded text-label-sm hover:bg-surface-container-low flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px]">bookmark</span>Saved views</button>
            <span className="ml-auto text-[11px] text-on-surface-variant" data-tx-count>{txCountText}</span>
          </div>

          {/* Bulk bar */}
          <div className={`bulk-bar${checkedCount > 0 ? ' show' : ''}`} data-bulk-bar>
            <span className="text-[12px] font-semibold" data-bulk-count>{checkedCount} selected</span>
            <span className="w-px h-4 bg-white/30"></span>
            <select data-bulk-cat value={bulkCat} onChange={(e) => { setBulkCat(e.target.value); void applyBulkCategory(e.target.value); }}>
              <option value="">Categorize as…</option>
              {coaAccounts.filter((a) => a.isActive).map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
            <button data-bulk="match" onClick={() => void handleBulk('match')}><span className="material-symbols-outlined text-[14px] align-middle mr-1">link</span>Match</button>
            <button data-bulk="exclude" onClick={() => void handleBulk('exclude')}><span className="material-symbols-outlined text-[14px] align-middle mr-1">block</span>Exclude</button>
            <button data-bulk="receipt" onClick={() => void handleBulk('receipt')}><span className="material-symbols-outlined text-[14px] align-middle mr-1">receipt</span>Attach receipt</button>
            <span className="w-px h-4 bg-white/30"></span>
            <button data-bulk="delete" onClick={() => void handleBulk('delete')}><span className="material-symbols-outlined text-[14px] align-middle mr-1">delete</span>Delete</button>
            <button className="ml-auto" data-bulk="close" aria-label="Close" onClick={() => void handleBulk('close')}><span className="material-symbols-outlined text-[16px]">close</span></button>
          </div>

          {/* Table */}
          <table className="w-full text-left text-body-sm">
            <thead className="bg-surface-container-low text-label-sm text-on-surface-variant uppercase tracking-wider">
              <tr>
                <th className="w-8 px-3 py-2"><input type="checkbox" className="row-check" data-check-all checked={checkAll} onChange={handleCheckAll} /></th>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Description</th>
                <th className="px-3 py-2">Payee</th>
                <th className="px-3 py-2 text-right">Amount</th>
                <th className="px-3 py-2">Category</th>
                <th className="px-3 py-2">Match</th>
                <th className="w-8"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-dim" data-tx-tbody>
              {visibleRows.map((row) => {
                return (
                  <tr
                    key={row.id}
                    data-row-id={row.id}
                    data-status={row.status}
                    data-type={row.type}
                    className={`hover:bg-surface-container-low cursor-pointer tx-row${row.rowExcluded ? ' row-excluded' : ''}`}
                    onClick={(e) => handleRowClick(e, row)}
                  >
                    <td className="px-3 py-2"><input type="checkbox" className="row-check tx-check" checked={row.checked} onChange={() => toggleRowCheck(row.id)} /></td>
                    <td className="px-3 py-2">{row.date}</td>
                    <td className="px-3 py-2 font-medium">{row.desc}</td>
                    <td className="px-3 py-2 text-on-surface-variant">{row.payee}</td>
                    <td className={`px-3 py-2 text-right tabular-nums ${row.amountCls}`}>{row.amount}</td>
                    <td className="px-3 py-2">
                      {row.chip.picker ? (
                        <button className={row.chip.cls} data-cat-picker onClick={(e) => openCatPicker(e, row.id)}>
                          {row.chip.icon ? <span className="material-symbols-outlined text-[12px]">{row.chip.icon}</span> : null}{row.chip.label}
                        </button>
                      ) : (
                        <button className={row.chip.cls}>{row.chip.label}</button>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {row.matchBadge ? (
                        <span className="match-badge"><span className="material-symbols-outlined text-[11px]">link</span>{row.matchBadge}</span>
                      ) : (
                        <span className="text-[11px] text-on-surface-variant">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <RowMenu items={[
                        { label: 'View', icon: 'open_in_new', onClick: () => toast(`${row.desc} · ${row.date} · ${row.amount} · ${row.dto.rawStatus.replace(/_/g, ' ')}`) },
                        { label: 'Edit', icon: 'edit', onClick: () => openPickerForRow(row) },
                        { label: 'Categorize', icon: 'category', onClick: () => openPickerForRow(row) },
                        { label: 'Match', icon: 'compare_arrows', onClick: () => { setPickerRowId(row.id); void (async () => { const res = await fetchMatchCandidates(row.id); if (res.ok && res.data && res.data.length) { setCandidates(res.data); setPickerMode('matches'); const el = document.querySelector(`tr[data-row-id="${row.id}"]`); const rect = el ? el.getBoundingClientRect() : new DOMRect(120, 120, 0, 0); setCatPickerPos({ top: rect.bottom + 4, left: Math.min(rect.left, window.innerWidth - 300) }); setCatPickerOpen(true); } else toast('No matching journal lines within 10 days'); })(); } },
                        { label: 'Attach receipt', icon: 'attach_file', onClick: () => onNavigate(...ACCT_NAV.receipts()) },
                        { label: 'Exclude', icon: 'block', dividerBefore: true, onClick: () => void (async () => { const res = row.dto.status === 'excluded' ? await bankTxnMutations.restore(row.id) : await bankTxnMutations.exclude(row.id); toast(res.ok ? (row.dto.status === 'excluded' ? `Restored: ${row.desc}` : `Excluded: ${row.desc}`) : (res.error || 'Action failed')); if (res.ok) await refreshTxns(); })() },
                        { label: 'Delete', icon: 'delete', danger: true, onClick: () => void (async () => { const res = await bankTxnMutations.remove(row.id); toast(res.ok ? `Deleted: ${row.desc}` : (res.error || 'Delete failed')); if (res.ok) await refreshTxns(); })() },
                      ]} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

      </main>

      {/* Category picker (positioned dropdown) — the real chart of
          accounts, or match candidates in matches mode */}
      <div ref={pickerRef} id="cat-picker" className={catPickerOpen ? 'cat-picker open' : 'cat-picker'} style={{ top: catPickerPos.top, left: catPickerPos.left }}>
        {pickerMode === 'matches' ? (
          <>
            <div className="recent">Match to a journal line</div>
            {candidates.map((c) => (
              <div key={c.journalLineId} className="cat-opt" data-pick={c.journalLineId} onClick={() => void pickCandidate(c)}>
                <span className="material-symbols-outlined text-[16px] text-qb-blue">link</span>
                {c.description}{c.entryNo ? ` · #${c.entryNo}` : ''} · {fmtAmt(c.amount)}
              </div>
            ))}
            <div className="cat-sep"></div>
            <div className="cat-opt" data-pick="__back__" onClick={() => setPickerMode('cats')}><span className="material-symbols-outlined text-[16px] text-on-surface-variant">arrow_back</span>Back to categories</div>
          </>
        ) : (
          <>
            <input placeholder="Search categories…" data-cat-search value={catSearch} onChange={(e) => setCatSearch(e.target.value)} />
            <div className="recent">Suggested</div>
            {pickerCats.suggested.filter((a) => catFilter(a.name)).map((a) => (
              <div key={a.id} className="cat-opt" data-pick={a.id} onClick={() => void pickCategory(a.id)}><span className="dot" style={{ background: '#0077c5' }} />{a.name}{pickerRow?.dto.suggestedAccountId === a.id ? ' · suggested' : ''}</div>
            ))}
            <div className="cat-sep"></div>
            <div className="recent">All categories</div>
            {pickerCats.all.filter((a) => catFilter(a.name)).map((a) => (
              <div key={a.id} className="cat-opt" data-pick={a.id} onClick={() => void pickCategory(a.id)}><span className="dot" style={{ background: '#dad9dd' }} />{a.name}</div>
            ))}
            <div className="cat-sep"></div>
            <div className="cat-opt" data-pick="__match__" onClick={() => void pickMatch()}><span className="material-symbols-outlined text-[16px] text-qb-blue">link</span>Match to existing…</div>
            <div className="cat-opt" data-pick="__exclude__" onClick={() => void pickExclude()}><span className="material-symbols-outlined text-[16px] text-on-surface-variant">block</span>Exclude this transaction</div>
          </>
        )}
      </div>

      <div id="toast" className={toastMsg ? 'toast show' : 'toast'}>{toastMsg}</div>
    </div>
  );
}
