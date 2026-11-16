'use client';
import { useEffect, useRef, useState } from 'react';
import type { AccountingScreenProps } from './types';
import { useChartOfAccounts, coaMutations, fetchAccountRegister } from '@/hooks/useAccountingApi';
import type { CoaAccount } from '@/lib/acctTypes';
import './chart-of-accounts.css';

/* ═══════════ Detail types per account type (cascading) — verbatim from the mockup ═══════════ */
type AccountType = 'Asset' | 'Liability' | 'Equity' | 'Income' | 'Expense';

const DETAIL_TYPES: Record<AccountType, string[]> = {
  Asset: ['Cash and cash equivalents', 'Checking', 'Savings', 'Accounts receivable', 'Inventory', 'Fixed assets', 'Other current assets', 'Other assets'],
  Liability: ['Accounts payable', 'Credit card', 'Sales tax payable', 'Payroll liabilities', 'Loan', 'Other current liabilities', 'Other long-term liabilities'],
  Equity: ["Owner's equity", 'Retained earnings', 'Partner contributions', 'Partner distributions', 'Opening balance equity'],
  Income: ['Sales of product income', 'Sales of services', 'Discounts', 'Shipping income', 'Interest income', 'Other income'],
  Expense: ['Cost of goods sold', 'Advertising', 'Bank charges & fees', 'Dues and subscriptions', 'Insurance', 'Legal & professional', 'Meals & entertainment', 'Office/General Administrative', 'Rent or lease', 'Shipping & delivery', 'Software', 'Travel', 'Utilities', 'Other expenses'],
};

const TYPE_DOT: Record<AccountType, string> = { Asset: 'asset', Liability: 'liability', Equity: 'equity', Income: 'income', Expense: 'expense' };

/* Tax options of the inline edit-mode tax cell — verbatim */
const INLINE_TAX_OPTIONS = ['—', 'Sales', 'COGS', 'Office', 'Software', 'Travel', 'Meals', 'Advertising'];

/* "$#,###.##" — the mockup's thousands-separator regex */
const withCommas = (n: number) => n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

interface AccountRow {
  id: string;
  type: AccountType;
  name: string;
  number: string;
  /** data-detail attribute value — drives the edit-drawer prefill */
  detail: string;
  /** Visible "Detail type" cell text */
  detailText: string;
  /** '—' when not mapped to a tax line */
  tax: string;
  balance: string;
  bankbal: string;
  inactive: boolean;
  parentId: string | null;
  desc: string;
}

const fmtMoney = (n: number) => `${n < 0 ? '-' : ''}$${withCommas(Math.abs(n))}`;

/* acct_chart_of_accounts DTO → the table's row shape. Balances are
   computed by the API from acct_journal_lines (posted, non-reversal)
   plus opening balances; bank balances come from the linked bank
   feed. */
function toAccountRow(a: CoaAccount): AccountRow {
  return {
    id: a.id,
    type: a.type,
    name: a.name,
    number: a.code,
    detail: a.detail,
    detailText: a.detailText,
    tax: a.tax,
    balance: fmtMoney(a.balance),
    bankbal: a.bankBalance != null ? fmtMoney(a.bankBalance) : '—',
    inactive: !a.isActive,
    parentId: a.parentAccountId,
    desc: a.description || '',
  };
}

const fmtRegDate = (iso: string) => {
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
};

interface RegRowData {
  date: string;
  desc: string;
  kind: 'deposits' | 'payments';
  amtText: string;
  balText: string;
}

/* Register drawer contents, snapshotted at open time (like the mockup's innerHTML build) */
interface RegSnapshot {
  title: string;
  sub: string;
  opening: string;
  activity: string;
  closing: string;
  rows: RegRowData[];
  empty: boolean;
}

interface TbMenuState { kind: 'cleanup' | 'new-acct'; top: number; left: number }
interface RowMenuState { rowId: string; top: number; left: number }
type RegTab = 'all' | 'deposits' | 'payments';

export default function ChartOfAccounts(props: AccountingScreenProps) {
  /* ── Table state — live from acct_chart_of_accounts via the API ── */
  const { accounts, refresh: refreshAccounts } = useChartOfAccounts();
  const [rows, setRows] = useState<AccountRow[]>([]);
  useEffect(() => {
    setRows(accounts.map(toAccountRow));
  }, [accounts]);
  const [filterText, setFilterText] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [checkAll, setCheckAll] = useState(false);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());

  /* ── Edit mode ── */
  const [editMode, setEditMode] = useState(false);
  /* Edit-mode detail-cell display: starts at the cell text; the mockup rebuilds the detail
     select's options when the inline Type select changes (selection resets to the first option) */
  const [inlineDetailDisplay, setInlineDetailDisplay] = useState<Record<string, string>>({});

  /* ── Menus ── */
  const [tbMenu, setTbMenu] = useState<TbMenuState | null>(null);
  const [rowMenu, setRowMenu] = useState<RowMenuState | null>(null);

  /* ── Account drawer ── */
  const [acctOpen, setAcctOpen] = useState(false);
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [acctParent, setAcctParent] = useState('');
  const [acctAsOf, setAcctAsOf] = useState('2026-11-01');
  const [acctActive, setAcctActive] = useState(true);
  const [acctTitle, setAcctTitle] = useState('New account');
  const [acctType, setAcctType] = useState<'' | AccountType>('');
  const [acctDetail, setAcctDetail] = useState('');
  const [acctName, setAcctName] = useState('');
  const [acctNumber, setAcctNumber] = useState('');
  const [acctDesc, setAcctDesc] = useState('');
  const [acctTax, setAcctTax] = useState('');
  const [acctOpening, setAcctOpening] = useState('');
  const [acctBalVisible, setAcctBalVisible] = useState(false);
  const [acctBalance, setAcctBalance] = useState('$0.00');

  /* ── Register drawer ── */
  const [regOpen, setRegOpen] = useState(false);
  const [regData, setRegData] = useState<RegSnapshot | null>(null);
  const [regTab, setRegTab] = useState<RegTab>('all');

  /* ── Toast ── */
  const [toastMsg, setToastMsg] = useState('');
  const toastTimer = useRef<number | null>(null);

  const toast = (m: string) => {
    setToastMsg(m);
    if (toastTimer.current !== null) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToastMsg(''), 1800);
  };
  useEffect(
    () => () => {
      if (toastTimer.current !== null) window.clearTimeout(toastTimer.current);
    },
    []
  );

  /* ═══════════ Account drawer ═══════════ */
  const openAccountDrawer = (row: AccountRow | null) => {
    if (row) {
      setEditingRowId(row.id);
      setAcctTitle('Edit account');
      setAcctType(row.type);
      /* populateDetail(row.dataset.type, row.dataset.detail) — unmatched detail falls back to the placeholder */
      setAcctDetail(DETAIL_TYPES[row.type].includes(row.detail) ? row.detail : '');
      setAcctName(row.name);
      setAcctNumber(row.number);
      setAcctTax(row.tax !== '—' ? row.tax || '' : '');
      setAcctOpening('');
      setAcctBalVisible(true);
      setAcctBalance(row.balance || '$0.00');
      setAcctParent(row.parentId || '');
      setAcctDesc(row.desc);
      setAcctActive(!row.inactive);
    } else {
      setEditingRowId(null);
      setAcctTitle('New account');
      setAcctType('');
      setAcctDetail('');
      setAcctName('');
      setAcctNumber('');
      setAcctDesc('');
      setAcctTax('');
      setAcctOpening('');
      setAcctBalVisible(false);
      setAcctParent('');
      setAcctActive(true);
    }
    setAcctOpen(true);
  };
  const closeAccountDrawer = () => setAcctOpen(false);

  const saveAccount = async (andClose: boolean) => {
    const type = acctType;
    const detail = acctDetail;
    const name = acctName.trim();
    const number = acctNumber.trim();
    const tax = acctTax;
    if (!type) { toast('Select an account type'); return; }
    if (!name) { toast('Account name required'); return; }
    if (!number) { toast('Account number required'); return; }

    const opening = parseFloat(acctOpening.replace(/[$,]/g, ''));
    if (editingRowId !== null) {
      const res = await coaMutations.update(editingRowId, {
        name,
        code: number,
        type,
        detail,
        description: acctDesc,
        parentAccountId: acctParent || null,
        taxLine: tax,
        isActive: acctActive,
        ...(acctOpening.trim() && !Number.isNaN(opening) ? { openingBalance: opening } : {}),
      });
      if (!res.ok) { toast(res.error || 'Update failed'); return; }
      await refreshAccounts();
      toast('Account updated');
    } else {
      const res = await coaMutations.create({
        name,
        code: number,
        type,
        detail,
        description: acctDesc,
        parentAccountId: acctParent || null,
        taxLine: tax,
        isActive: acctActive,
        openingBalance: Number.isNaN(opening) ? 0 : opening,
        openingDate: acctAsOf,
      });
      if (!res.ok) { toast(res.error || 'Create failed'); return; }
      await refreshAccounts();
      toast(`Account "${name}" created`);
    }
    if (andClose) {
      closeAccountDrawer();
    } else {
      /* Drawer stays open, blank "New account" form */
      openAccountDrawer(null);
    }
  };

  /* ═══════════ Toolbar menu positioning (Clean up / New account ▾) ═══════════ */
  const openTbMenu = (anchor: Element, kind: 'cleanup' | 'new-acct') => {
    const r = anchor.getBoundingClientRect();
    setTbMenu({ kind, top: r.bottom + 4, left: Math.min(r.left, window.innerWidth - 240) });
  };
  const handleCleanupBtn = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    openTbMenu(e.currentTarget, 'cleanup');
  };
  const handleNewAcctSplit = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    openTbMenu(e.currentTarget, 'new-acct');
  };
  const handleClean = (act: string) => {
    setTbMenu(null);
    if (act === 'start') {
      const inactive = rows.filter(r => r.inactive).length;
      const names = rows.map(r => r.name.toLowerCase());
      const dupes = names.filter((n, i) => names.indexOf(n) !== i).length;
      toast(`Cleanup check — ${inactive} inactive accounts, ${dupes} duplicate names across ${rows.length} accounts`);
    }
    if (act === 'edit') toggleEditMode(true);
    if (act === 'history') {
      const inactive = rows.filter(r => r.inactive).length;
      toast(`${rows.length} accounts on the chart — ${inactive} inactive`);
    }
  };
  const handleNewKind = (kind: AccountType) => {
    setTbMenu(null);
    openAccountDrawer(null);
    setAcctType(kind); /* populateDetail(kind, "") — detail stays on the placeholder */
  };

  /* ═══════════ Edit mode ═══════════ */
  const toggleEditMode = (on?: boolean) => {
    const next = on !== undefined ? on : !editMode;
    setEditMode(next);
    setInlineDetailDisplay({});
    if (!next) {
      /* makeCellsReadonly — cells are restored from the row dataset */
      setRows(rs => rs.map(r => ({ ...r, detailText: r.detail })));
    }
  };
  const patchRow = (id: string, patch: Partial<AccountRow>) => {
    setRows(rs => rs.map(r => (r.id === id ? { ...r, ...patch } : r)));
  };
  /* Inline edits persist to acct_chart_of_accounts immediately; a
     failed write reverts the cell from the server on refresh. */
  const persistInline = (id: string, patch: Parameters<typeof coaMutations.update>[1]) => {
    void coaMutations.update(id, patch).then((res) => {
      if (!res.ok) {
        toast(res.error || 'Inline change failed');
        void refreshAccounts();
      }
    });
  };
  /* Inline Type select change: dataset.type updates and the detail select's options are rebuilt
     for the new type with no selection (first option shows) */
  const handleInlineTypeChange = (id: string, t: AccountType) => {
    patchRow(id, { type: t });
    setInlineDetailDisplay(prev => ({ ...prev, [id]: DETAIL_TYPES[t][0] }));
    persistInline(id, { type: t });
  };
  const handleInlineDetailChange = (id: string, v: string) => {
    patchRow(id, { detail: v });
    setInlineDetailDisplay(prev => ({ ...prev, [id]: v }));
    persistInline(id, { detail: v });
  };

  /* ═══════════ Register drawer — real journal lines via the API ═══════════ */
  const openRegister = async (row: AccountRow) => {
    const res = await fetchAccountRegister(row.id);
    if (!res.ok || !res.data) {
      toast(res.error || 'Could not load the register');
      return;
    }
    const { openingBalance, activity, closingBalance, lines } = res.data;
    let running = openingBalance;
    const regRows: RegRowData[] = lines.map(l => {
      running += l.amount;
      const isDep = l.amount >= 0;
      return {
        date: fmtRegDate(l.date),
        desc: l.description,
        kind: isDep ? 'deposits' : 'payments',
        amtText: `${isDep ? '+' : '−'}$${withCommas(Math.abs(l.amount))}`,
        balText: fmtMoney(running),
      };
    });
    setRegData({
      title: row.name,
      sub: `Account ${row.number} · ${row.type}`,
      opening: fmtMoney(openingBalance),
      activity: fmtMoney(activity),
      closing: fmtMoney(closingBalance),
      rows: regRows,
      empty: regRows.length === 0,
    });
    setRegOpen(true);
  };
  const closeRegister = () => setRegOpen(false);

  /* ═══════════ Row click + ⋯ menu ═══════════ */
  const handleRowClick = (e: React.MouseEvent<HTMLTableRowElement>, row: AccountRow) => {
    if ((e.target as Element).closest('input,button,[data-field] input,[data-field] select')) return;
    openRegister(row);
  };
  const handleRowMenuBtn = (e: React.MouseEvent<HTMLButtonElement>, row: AccountRow) => {
    e.stopPropagation();
    const r = e.currentTarget.getBoundingClientRect();
    setRowMenu({ rowId: row.id, top: r.bottom + 4, left: Math.min(r.right - 240, window.innerWidth - 260) });
  };
  const handleRowAction = (act: string, tr: AccountRow) => {
    setRowMenu(null);
    switch (act) {
      case 'view-register': void openRegister(tr); break;
      case 'edit': openAccountDrawer(tr); break;
      case 'run-report': props.onNavigate('finance', 'reports'); break;
      case 'make-sub': openAccountDrawer(tr); break;
      case 'merge': toast('The platform has no account-merge function — make the account inactive instead'); break;
      case 'deactivate':
        void coaMutations.update(tr.id, { isActive: false }).then((res) => {
          if (res.ok) {
            patchRow(tr.id, { inactive: true });
            toast(`${tr.name} made inactive`);
          } else toast(res.error || 'Could not deactivate');
        });
        break;
      case 'activate':
        void coaMutations.update(tr.id, { isActive: true }).then((res) => {
          if (res.ok) {
            patchRow(tr.id, { inactive: false });
            toast(`${tr.name} reactivated`);
          } else toast(res.error || 'Could not reactivate');
        });
        break;
      case 'delete':
        void coaMutations.remove(tr.id).then((res) => {
          if (res.ok) {
            setRows(rs => rs.filter(r => r.id !== tr.id));
            setCheckedIds(prev => { const n = new Set(prev); n.delete(tr.id); return n; });
            toast(`${tr.name} deleted`);
          } else toast(res.error || 'Could not delete — accounts with journal history cannot be deleted');
        });
        break;
    }
  };

  /* ═══════════ Filters ═══════════ */
  const q = filterText.toLowerCase();
  const visibleRows = rows.filter(tr => {
    const matchQ = !q || tr.name.toLowerCase().includes(q) || tr.number.includes(q);
    const matchType = !typeFilter || tr.type === typeFilter;
    return matchQ && matchType;
  });

  /* ═══════════ Check-all ═══════════ */
  const toggleCheck = (id: string) => {
    setCheckedIds(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };
  const handleCheckAll = (checked: boolean) => {
    setCheckAll(checked);
    setCheckedIds(checked ? new Set(rows.map(r => r.id)) : new Set());
  };

  /* Global click outside closes menus (mockup document click listener, with its own selectors) */
  useEffect(() => {
    if (!tbMenu && !rowMenu) return;
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Element | null;
      if (!target) return;
      if (!target.closest('#cleanup-menu') && !target.closest('[data-cleanup]') && tbMenu?.kind === 'cleanup') setTbMenu(null);
      if (!target.closest('#new-acct-menu') && !target.closest('[data-new-account-split]') && tbMenu?.kind === 'new-acct') setTbMenu(null);
      if (!target.closest('#row-menu')) setRowMenu(null);
    };
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, [tbMenu, rowMenu]);

  const menuRow = rowMenu ? rows.find(r => r.id === rowMenu.rowId) || null : null;

  /* Edit-mode toggle button classes (mockup toggles !bg-qb-blue/!text-white/!border-qb-blue) */
  const editModeBtnClass = `h-7 px-2.5 border border-surface-dim rounded text-label-sm font-semibold hover:bg-surface-container-low flex items-center gap-1 bg-white${editMode ? ' !bg-qb-blue !text-white !border-qb-blue' : ''}`;

  /* Register tab classes: All starts active; Deposits/Payments keep text-on-surface-variant (mockup only toggles "active") */
  const regTabClass = (key: RegTab) =>
    `h-full px-3 text-label-md tab-underline${key === 'all' ? '' : ' text-on-surface-variant'}${regTab === key ? ' active' : ''}`;

  return (
    <div className="chart-of-accounts-page bg-background font-sans text-body-md text-on-surface antialiased">

      {/* Context header (the mockup's "Preview · standalone" label is intentionally not rendered) */}
      <div className="h-[52px] px-6 flex items-center justify-between bg-white border-b border-surface-dim">
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-[20px] text-on-surface-variant">account_balance</span>
          <span className="text-label-md font-semibold">Finance</span>
          <span className="text-outline">/</span>
          <span className="text-label-md">Accounting</span>
          <span className="text-outline">/</span>
          <span className="text-label-md text-primary font-semibold">Chart of accounts</span>
        </div>
      </div>

      <main className="px-6 pb-12">

        {/* Page header */}
        <div className="flex items-center justify-between gap-4 py-4">
          <div>
            <h1 className="text-headline-lg">Chart of accounts</h1>
            <p className="text-body-sm text-on-surface-variant mt-0.5">{rows.length} accounts · Numbered, typed, mapped to tax lines.</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex split-btn">
              <button className="h-8 px-3 bg-primary text-white text-body-md font-semibold hover:bg-primary-container flex items-center gap-1 split-btn-main" data-new-account onClick={() => openAccountDrawer(null)}>
                <span className="material-symbols-outlined text-[16px]">add</span>New account
              </button>
              <button className="h-8 px-1.5 bg-primary text-white hover:bg-primary-container split-btn-arrow" data-new-account-split aria-label="New account options" onClick={handleNewAcctSplit}>
                <span className="material-symbols-outlined text-[16px]">expand_more</span></button>
            </div>
            <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low flex items-center gap-1" data-run-report onClick={() => props.onNavigate('finance', 'reports')}>
              <span className="material-symbols-outlined text-[16px]">assessment</span>Run report</button>
          </div>
        </div>

        {/* Toolbar: filter + clean up + edit mode */}
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <div className="relative flex items-center flex-1 max-w-sm min-w-[180px]">
            <span className="material-symbols-outlined absolute left-2 text-[15px] text-outline">search</span>
            <input className="w-full h-7 pl-7 pr-2 bg-white border border-surface-dim rounded text-body-sm focus:outline-none focus:border-primary" placeholder="Filter by name or number…" data-account-filter value={filterText} onChange={e => setFilterText(e.target.value)} />
          </div>
          <label className="h-7 px-2 border border-surface-dim rounded text-label-sm hover:bg-surface-container-low flex items-center gap-1 bg-white">
            <span className="material-symbols-outlined text-[14px] text-on-surface-variant">category</span>
            <span className="text-on-surface-variant">Type:</span>
            <select className="bg-transparent border-none text-label-sm text-on-surface focus:outline-none" data-type-filter value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
              <option value="">All types</option>
              <option>Asset</option><option>Liability</option><option>Equity</option><option>Income</option><option>Expense</option>
            </select>
          </label>
          <button className="h-7 px-2 border border-surface-dim rounded text-label-sm hover:bg-surface-container-low flex items-center gap-1 bg-white" data-cleanup onClick={handleCleanupBtn}>
            <span className="material-symbols-outlined text-[14px]">cleaning_services</span>Clean up
            <span className="material-symbols-outlined text-[14px]">expand_more</span>
          </button>
          <div className="flex-1"></div>
          <button className={editModeBtnClass} data-toggle-edit-mode onClick={() => toggleEditMode()}>
            <span className="material-symbols-outlined text-[14px]">edit</span>Edit mode
          </button>
          <button className="h-7 px-2 border border-surface-dim rounded text-label-sm hover:bg-surface-container-low flex items-center gap-1 bg-white" data-customize onClick={() => toast('Customize panel — Data / Visual tabs')}>
            <span className="material-symbols-outlined text-[14px]">tune</span>Customize</button>
        </div>

        {/* Edit-mode banner (hidden until edit mode on) */}
        <div className={`mb-3 bg-qb-blue/5 border border-qb-blue/30 rounded-lg px-4 py-2 flex items-center gap-2 text-body-sm text-qb-blue${editMode ? '' : ' hidden-imp'}`} data-edit-banner>
          <span className="material-symbols-outlined text-[18px]">edit</span>
          <span className="flex-1">Edit mode on — click any cell to edit inline. Press <kbd className="bg-white border border-surface-dim rounded px-1 text-[10px]">Esc</kbd> to cancel a cell.</span>
          <button className="h-7 px-2 border border-qb-blue rounded text-label-sm font-semibold hover:bg-white" data-save-inline onClick={() => { void refreshAccounts(); toast('Inline changes saved'); toggleEditMode(false); }}>Save changes</button>
        </div>

        {/* Table card */}
        <div className="bg-white rounded-xl shadow-sm border border-surface-dim overflow-hidden">
          <table className="w-full text-left text-body-sm">
            <thead className="bg-surface-container-low text-label-sm text-on-surface-variant uppercase tracking-wider">
              <tr>
                <th className="w-8 px-3 py-2"><input type="checkbox" className="row-check" data-check-all checked={checkAll} onChange={e => handleCheckAll(e.target.checked)} /></th>
                <th className="px-3 py-2 w-16">Number</th>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Detail type</th>
                <th className="px-3 py-2 text-right">Total balance</th>
                <th className="px-3 py-2 text-right">Bank balance</th>
                <th className="px-3 py-2">Tax line</th>
                <th className="w-8"></th>
              </tr>
            </thead>
            <tbody className={`divide-y divide-surface-dim${editMode ? ' edit-mode' : ''}`} data-coa-tbody>
              {visibleRows.map(row => {
                const detailOpts = DETAIL_TYPES[row.type];
                const detailSrc = inlineDetailDisplay[row.id] ?? row.detailText;
                const detailSel = detailOpts.includes(detailSrc) ? detailSrc : detailOpts[0];
                return (
                  <tr key={row.id}
                    className={`hover:bg-surface-container-low cursor-pointer coa-row${row.inactive ? ' opacity-60' : ''}`}
                    data-type={row.type} data-name={row.name} data-number={row.number} data-detail={row.detail}
                    data-tax={row.tax} data-balance={row.balance} data-bankbal={row.bankbal}
                    data-inactive={row.inactive ? 'true' : 'false'}
                    onClick={e => handleRowClick(e, row)}>
                    <td className="px-3 py-2"><input type="checkbox" className="row-check coa-check" checked={checkedIds.has(row.id)} onChange={() => toggleCheck(row.id)} /></td>
                    <td className="px-3 py-2 font-mono text-on-surface-variant" data-field="number">
                      {editMode ? (
                        <input key={row.number} type="text" defaultValue={row.number}
                          onBlur={e => { patchRow(row.id, { number: e.currentTarget.value }); persistInline(row.id, { code: e.currentTarget.value }); }}
                          onKeyDown={e => { if (e.key === 'Escape') { e.currentTarget.value = row.number; e.currentTarget.blur(); } }} />
                      ) : row.number}
                    </td>
                    <td className="px-3 py-2 font-medium" data-field="name">
                      {editMode ? (
                        <input key={row.name} type="text" defaultValue={row.name}
                          onBlur={e => { patchRow(row.id, { name: e.currentTarget.value }); persistInline(row.id, { name: e.currentTarget.value }); }}
                          onKeyDown={e => { if (e.key === 'Escape') { e.currentTarget.value = row.name; e.currentTarget.blur(); } }} />
                      ) : row.name}
                    </td>
                    <td className="px-3 py-2" data-field="type">
                      {editMode ? (
                        <select value={row.type} onChange={e => handleInlineTypeChange(row.id, e.target.value as AccountType)}>
                          {(Object.keys(DETAIL_TYPES) as AccountType[]).map(o => <option key={o}>{o}</option>)}
                        </select>
                      ) : (<><span className={`type-dot ${TYPE_DOT[row.type]}`}></span>{row.type}</>)}
                    </td>
                    <td className="px-3 py-2 text-on-surface-variant" data-field="detail">
                      {editMode ? (
                        <select value={detailSel} onChange={e => handleInlineDetailChange(row.id, e.target.value)}>
                          {detailOpts.map(o => <option key={o}>{o}</option>)}
                        </select>
                      ) : row.detailText}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums" data-field="balance">{row.balance}</td>
                    <td className="px-3 py-2 text-right tabular-nums" data-field="bankbal">{row.bankbal}</td>
                    <td className="px-3 py-2 text-on-surface-variant" data-field="tax">
                      {editMode ? (
                        <select value={row.tax} onChange={e => { patchRow(row.id, { tax: e.target.value }); persistInline(row.id, { taxLine: e.target.value }); }}>
                          {INLINE_TAX_OPTIONS.map(o => <option key={o}>{o}</option>)}
                        </select>
                      ) : row.tax}
                    </td>
                    <td className="px-2 py-2 text-right"><button className="w-6 h-6 rounded hover:bg-surface-container flex items-center justify-center" data-row-menu aria-label="Account options" onClick={e => handleRowMenuBtn(e, row)}><span className="material-symbols-outlined text-[16px] text-on-surface-variant">more_horiz</span></button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

      </main>

      {/* ═══════════ ACCOUNT DRAWER ═══════════ */}
      <div className={acctOpen ? 'drawer-scrim open' : 'drawer-scrim'} id="acct-scrim" onClick={closeAccountDrawer}></div>
      <div className={acctOpen ? 'drawer open' : 'drawer'} id="acct-drawer">
        <div className="flex items-center justify-between px-5 h-14 border-b border-surface-dim shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="material-symbols-outlined text-[20px] text-primary">account_tree</span>
            <div className="min-w-0">
              <div className="text-headline-sm truncate" data-acct-title>{acctTitle}</div>
              <div className="text-[11px] text-on-surface-variant">Chart of accounts</div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button className="w-8 h-8 rounded hover:bg-surface-container flex items-center justify-center" title="Maximize">
              <span className="material-symbols-outlined text-[18px]">open_in_full</span></button>
            <button className="w-8 h-8 rounded hover:bg-surface-container flex items-center justify-center" data-close-acct aria-label="Close" onClick={closeAccountDrawer}>
              <span className="material-symbols-outlined text-[18px]">close</span></button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="field-label">Type</label>
              <select className="field-input" data-acct-type value={acctType} onChange={e => { setAcctType(e.target.value as '' | AccountType); setAcctDetail(''); }}>
                <option value="">— Select type —</option>
                <option>Asset</option><option>Liability</option><option>Equity</option><option>Income</option><option>Expense</option>
              </select>
            </div>
            <div>
              <label className="field-label">Detail type</label>
              <select className="field-input" data-acct-detail value={acctDetail} onChange={e => setAcctDetail(e.target.value)}>
                {acctType === '' ? (
                  <option value="">— Select type first —</option>
                ) : (
                  <>
                    <option value="">— Select detail type —</option>
                    {DETAIL_TYPES[acctType].map(o => <option key={o}>{o}</option>)}
                  </>
                )}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="field-label">Name</label>
              <input className="field-input" data-acct-name placeholder="e.g. Business checking" value={acctName} onChange={e => setAcctName(e.target.value)} />
            </div>
            <div>
              <label className="field-label">Number</label>
              <input className="field-input" data-acct-number placeholder="e.g. 1000" type="text" value={acctNumber} onChange={e => setAcctNumber(e.target.value)} />
            </div>
          </div>

          <div>
            <label className="field-label">Sub-account of</label>
            <select className="field-input" data-acct-parent value={acctParent} onChange={e => setAcctParent(e.target.value)}>
              <option value="">— None (top-level account) —</option>
              {rows.filter(r => r.id !== editingRowId).map(r => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="field-label">Description</label>
            <textarea className="field-input" style={{ height: '60px', padding: '8px 10px', fontFamily: 'inherit' }} data-acct-desc placeholder="Optional description visible to staff" value={acctDesc} onChange={e => setAcctDesc(e.target.value)}></textarea>
          </div>

          <div className="grid grid-cols-2 gap-3 border-t border-surface-dim pt-4">
            <div>
              <label className="field-label">Opening balance</label>
              <input className="field-input" data-acct-opening placeholder="0.00" type="text" style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }} value={acctOpening} onChange={e => setAcctOpening(e.target.value)} />
            </div>
            <div>
              <label className="field-label">As of</label>
              <input className="field-input" data-acct-asof type="date" value={acctAsOf} onChange={e => setAcctAsOf(e.target.value)} />
            </div>
          </div>

          <div className="border-t border-surface-dim pt-4">
            <label className="field-label">Tax line</label>
            <select className="field-input" data-acct-tax value={acctTax} onChange={e => setAcctTax(e.target.value)}>
              <option value="">— Not mapped —</option>
              <option>Sales</option><option>COGS</option><option>Office</option><option>Software</option>
              <option>Travel</option><option>Meals</option><option>Advertising</option>
            </select>
          </div>

          <div className="border-t border-surface-dim pt-4">
            <label className="flex items-center gap-2 text-body-sm">
              <input type="checkbox" className="row-check" checked={acctActive} onChange={e => setAcctActive(e.target.checked)} data-acct-active />
              Active account
            </label>
            <p className="text-[11px] text-on-surface-variant mt-1">Inactive accounts are hidden from pickers but remain in reports.</p>
          </div>

          {/* Current balance display for existing accounts */}
          <div className={`bg-surface-container-low rounded-lg p-3${acctBalVisible ? '' : ' hidden-imp'}`} data-acct-balance-block>
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-on-surface-variant uppercase font-bold">Current balance</span>
              <span className="text-headline-sm tabular-nums" data-acct-balance>{acctBalance}</span>
            </div>
          </div>
        </div>

        <div className="h-14 border-t border-surface-dim px-4 flex items-center justify-between shrink-0">
          <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low" data-close-acct onClick={closeAccountDrawer}>Cancel</button>
          <div className="flex items-center gap-2">
            <div className="flex split-btn">
              <button className="h-8 px-3 bg-white border border-surface-dim text-body-md font-semibold hover:bg-surface-container-low split-btn-main" data-save-new onClick={() => saveAccount(false)}>Save and new</button>
              <button className="h-8 px-1.5 bg-white border border-surface-dim hover:bg-surface-container-low split-btn-arrow">
                <span className="material-symbols-outlined text-[16px]">expand_more</span></button>
            </div>
            <div className="flex split-btn">
              <button className="h-8 px-3 bg-primary text-white text-body-md font-semibold hover:bg-primary-container split-btn-main" data-save-acct onClick={() => saveAccount(true)}>Save account</button>
              <button className="h-8 px-1.5 bg-primary text-white hover:bg-primary-container split-btn-arrow">
                <span className="material-symbols-outlined text-[16px]">expand_more</span></button>
            </div>
          </div>
        </div>
      </div>

      {/* ═══════════ REGISTER DRAWER ═══════════ */}
      <div className={regOpen ? 'drawer-scrim open' : 'drawer-scrim'} id="reg-scrim" onClick={closeRegister}></div>
      <div className={regOpen ? 'drawer register-drawer open' : 'drawer register-drawer'} id="reg-drawer">
        <div className="flex items-center justify-between px-5 h-14 border-b border-surface-dim shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <span className="material-symbols-outlined text-[20px] text-primary">receipt_long</span>
            <div className="min-w-0">
              <div className="text-headline-sm truncate" data-reg-title>{regData ? regData.title : 'Register'}</div>
              <div className="text-[11px] text-on-surface-variant" data-reg-sub>{regData ? regData.sub : '—'}</div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button className="h-7 px-2.5 border border-surface-dim rounded text-label-sm font-semibold hover:bg-surface-container-low flex items-center gap-1" data-reg-filter>
              <span className="material-symbols-outlined text-[14px]">calendar_today</span>Nov 2026</button>
            <button className="h-7 px-2.5 border border-surface-dim rounded text-label-sm font-semibold hover:bg-surface-container-low flex items-center gap-1" data-reg-export>
              <span className="material-symbols-outlined text-[14px]">download</span>Export</button>
            <button className="w-8 h-8 rounded hover:bg-surface-container flex items-center justify-center" data-close-reg aria-label="Close" onClick={closeRegister}>
              <span className="material-symbols-outlined text-[18px]">close</span></button>
          </div>
        </div>
        <div className="bg-surface-container-low border-b border-surface-dim px-5 py-3 grid grid-cols-3 gap-4">
          <div>
            <div className="text-[10px] text-on-surface-variant uppercase font-bold">Opening balance</div>
            <div className="text-headline-sm tabular-nums" data-reg-opening>{regData ? regData.opening : '—'}</div>
          </div>
          <div>
            <div className="text-[10px] text-on-surface-variant uppercase font-bold">Period activity</div>
            <div className="text-headline-sm tabular-nums" data-reg-activity>{regData ? regData.activity : '—'}</div>
          </div>
          <div>
            <div className="text-[10px] text-on-surface-variant uppercase font-bold">Closing balance</div>
            <div className="text-headline-sm tabular-nums" data-reg-closing>{regData ? regData.closing : '—'}</div>
          </div>
        </div>
        <div className="flex items-center gap-1 px-4 h-11 border-b border-surface-dim shrink-0">
          <button className={regTabClass('all')} data-regtab="all" onClick={() => setRegTab('all')}>All</button>
          <button className={regTabClass('deposits')} data-regtab="deposits" onClick={() => setRegTab('deposits')}>Deposits</button>
          <button className={regTabClass('payments')} data-regtab="payments" onClick={() => setRegTab('payments')}>Payments</button>
        </div>
        <div className="flex-1 overflow-y-auto" data-reg-list>
          {regData && regData.empty ? (
            <div className="p-8 text-center text-body-sm text-on-surface-variant">No transactions in this account for the selected period.</div>
          ) : (
            (regData ? regData.rows : []).filter(r => regTab === 'all' || r.kind === regTab).map((r, i) => (
              <div className="reg-row" key={i} data-reg-kind={r.kind}>
                <span className="reg-date">{r.date}</span>
                <span className="reg-desc">{r.desc}</span>
                <span className={`reg-amt ${r.kind === 'deposits' ? 'text-secondary' : 'text-error'}`}>{r.amtText}</span>
                <span className="reg-bal">{r.balText}</span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* ═══════════ CLEAN UP ▾ MENU ═══════════ */}
      {tbMenu && tbMenu.kind === 'cleanup' && (
        <div className="tb-menu open" id="cleanup-menu" style={{ top: tbMenu.top, left: tbMenu.left }}>
          <div className="menu-header">Clean up</div>
          <button data-clean="start" onClick={() => handleClean('start')}><span className="material-symbols-outlined">cleaning_services</span>Start cleanup session</button>
          <button data-clean="edit" onClick={() => handleClean('edit')}><span className="material-symbols-outlined">edit</span>Open in edit mode</button>
          <div className="sep"></div>
          <button data-clean="history" onClick={() => handleClean('history')}><span className="material-symbols-outlined">history</span>View cleanup history</button>
        </div>
      )}

      {/* ═══════════ NEW ACCOUNT ▾ MENU ═══════════ */}
      {tbMenu && tbMenu.kind === 'new-acct' && (
        <div className="tb-menu open" id="new-acct-menu" style={{ top: tbMenu.top, left: tbMenu.left }}>
          <div className="menu-header">Quick create</div>
          <button data-newkind="Asset" onClick={() => handleNewKind('Asset')}><span className="material-symbols-outlined">account_balance</span>Asset account</button>
          <button data-newkind="Liability" onClick={() => handleNewKind('Liability')}><span className="material-symbols-outlined">credit_card</span>Liability account</button>
          <button data-newkind="Equity" onClick={() => handleNewKind('Equity')}><span className="material-symbols-outlined">savings</span>Equity account</button>
          <button data-newkind="Income" onClick={() => handleNewKind('Income')}><span className="material-symbols-outlined">trending_up</span>Income account</button>
          <button data-newkind="Expense" onClick={() => handleNewKind('Expense')}><span className="material-symbols-outlined">receipt_long</span>Expense account</button>
        </div>
      )}

      {/* ═══════════ ROW ⋯ MENU ═══════════ */}
      {rowMenu && menuRow && (
        <div className="row-menu open" id="row-menu" style={{ top: rowMenu.top, left: rowMenu.left }}>
          <div className="menu-header">This account</div>
          <button data-action="view-register" onClick={() => handleRowAction('view-register', menuRow)}><span className="material-symbols-outlined">receipt_long</span>View register</button>
          <button data-action="edit" onClick={() => handleRowAction('edit', menuRow)}><span className="material-symbols-outlined">edit</span>Edit account</button>
          <button data-action="run-report" onClick={() => handleRowAction('run-report', menuRow)}><span className="material-symbols-outlined">assessment</span>Run report for this account</button>
          <div className="sep"></div>
          <div className="menu-header">Structure</div>
          <button data-action="make-sub" onClick={() => handleRowAction('make-sub', menuRow)}><span className="material-symbols-outlined">subdirectory_arrow_right</span>Make sub-account of…</button>
          <button data-action="merge" onClick={() => handleRowAction('merge', menuRow)}><span className="material-symbols-outlined">merge</span>Merge into another account…</button>
          <div className="sep"></div>
          <div className="menu-header">State</div>
          {!menuRow.inactive && <button data-action="deactivate" onClick={() => handleRowAction('deactivate', menuRow)}><span className="material-symbols-outlined">visibility_off</span>Make inactive</button>}
          {menuRow.inactive && <button data-action="activate" data-hide="true" onClick={() => handleRowAction('activate', menuRow)}><span className="material-symbols-outlined">visibility</span>Reactivate account</button>}
          <button className="danger" data-action="delete" onClick={() => handleRowAction('delete', menuRow)}><span className="material-symbols-outlined">delete</span>Delete account</button>
        </div>
      )}

      <div className={toastMsg ? 'toast show' : 'toast'}>{toastMsg}</div>
    </div>
  );
}
