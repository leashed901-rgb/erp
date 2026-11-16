'use client';

import './statements.css';
import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { StatementsScreenProps } from './types';
import { STMT_NAV } from './types';
import { fetchJson } from '@/hooks/useCrmApi';
import { exportToCsv } from '@/lib/csvExport';
import { useCustomers } from '@/hooks/useAccountingApi';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

type StatementStatus = 'Draft' | 'Sent' | 'Paid' | 'Overdue' | 'Partial';

interface StatementLine {
  date: string;
  desc: string;
  amt: string;
  paid: string;
  bal: string;
}

interface StatementData {
  id: string;
  customer: string;
  email: string;
  period: string;
  date: string;
  due: string;
  invoiced: string;
  paid: string;
  dueAmt: string;
  status: StatementStatus;
  lines: StatementLine[];
}

interface StatementRow {
  id: string;          // acct_customer_statements uuid
  number: string;      // statement_number (ST-####)
  customerId: string;
  periodStart: string;
  periodEnd: string;
  rawStatus: string;
  customer: string;
  email: string;
  avatar: string;
  avatarColor: string;
  period: string;
  sentDate: string;
  dueDate: string;
  dueRed: boolean;
  balance: string;
  balanceRed: boolean;
  status: StatementStatus;
}

type ViewTab = 'All' | 'Draft' | 'Sent' | 'Awaiting' | 'Paid' | 'Overdue';

// ─────────────────────────────────────────────────────────────
// Data comes from /api/accounting/statements (acct_customer_statements,
// generated from the AR documents). Display status is derived from the
// stored status + balances, mirroring how the platform presents them.
// ─────────────────────────────────────────────────────────────

interface StatementDto {
  id: string;
  number: string;
  customerId: string;
  customerName: string;
  email: string | null;
  periodStart: string;
  periodEnd: string;
  opening: number;
  charges: number;
  payments: number;
  credits: number;
  closing: number;
  status: string;
  sentAt: string | null;
  reminderCount: number;
}

const AVATAR_COLORS = ['bg-qb-blue', 'bg-qb-teal', 'bg-qb-green', 'bg-qb-maroon', 'bg-qb-navy'];
const money = (n: number) => `$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const usDate = (iso: string | null) => {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${m}/${d}/${y}`;
};
const periodLabel = (iso: string) =>
  new Date(iso.slice(0, 10) + 'T12:00:00').toLocaleString('en-US', { month: 'short', year: 'numeric' });

function displayStatus(d: StatementDto): StatementStatus {
  const today = new Date().toISOString().slice(0, 10);
  if (d.closing <= 0) return d.charges > 0 || d.payments > 0 ? 'Paid' : 'Draft';
  if (d.payments > 0 || d.credits > 0) return 'Partial';
  if ((d.status === 'sent' || d.status === 'viewed') && d.periodEnd < today) return 'Overdue';
  if (d.status === 'sent' || d.status === 'viewed') return 'Sent';
  return 'Draft';
}

function dtoToRow(d: StatementDto, idx: number): StatementRow {
  const status = displayStatus(d);
  const today = new Date().toISOString().slice(0, 10);
  return {
    id: d.id,
    number: d.number,
    customerId: d.customerId,
    periodStart: d.periodStart,
    periodEnd: d.periodEnd,
    rawStatus: d.status,
    customer: d.customerName,
    email: d.email || '',
    avatar: (d.customerName[0] || '?').toUpperCase(),
    avatarColor: AVATAR_COLORS[idx % AVATAR_COLORS.length],
    period: periodLabel(d.periodEnd),
    sentDate: usDate(d.sentAt),
    dueDate: usDate(d.periodEnd),
    dueRed: d.closing > 0 && d.periodEnd < today,
    balance: money(d.closing),
    balanceRed: d.closing > 0 && d.periodEnd < today,
    status,
  };
}

/* Month options for generate/batch (value 'YYYY-MM', label 'Nov 2026') */
function monthOptions(count = 6): { value: string; label: string; start: string; end: string }[] {
  const out: { value: string; label: string; start: string; end: string }[] = [];
  const now = new Date();
  for (let i = 0; i < count; i++) {
    const first = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const last = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
    const value = `${first.getFullYear()}-${String(first.getMonth() + 1).padStart(2, '0')}`;
    out.push({
      value,
      label: first.toLocaleString('en-US', { month: 'short', year: 'numeric' }),
      start: `${value}-01`,
      end: `${value}-${String(last.getDate()).padStart(2, '0')}`,
    });
  }
  return out;
}

const STATUS_PILL_CLASS: Record<StatementStatus, string> = {
  Draft: 'st draft',
  Sent: 'st sent',
  Paid: 'st paid',
  Overdue: 'st overdue',
  Partial: 'st partial',
};

const TABS: { key: ViewTab; label: string }[] = [
  { key: 'All', label: 'All' },
  { key: 'Draft', label: 'Draft' },
  { key: 'Sent', label: 'Sent' },
  { key: 'Awaiting', label: 'Awaiting payment' },
  { key: 'Paid', label: 'Paid' },
  { key: 'Overdue', label: 'Overdue' },
];

function hasOpenBalance(status: StatementStatus): boolean {
  return status === 'Sent' || status === 'Overdue' || status === 'Partial';
}

function formatDueLabel(due: string): string {
  const parts = due.split('-');
  if (parts.length === 3) return `Due ${parts[1]}/${parts[2]}/${parts[0]}`;
  return 'Due —';
}

// ─────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────

export default function Statements({
  onNavigate,
  onToast,
  onCreate,
  onOpenCreateFlyout,
}: StatementsScreenProps) {
  // Table state — real statements
  const [rows, setRows] = useState<StatementRow[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const refresh = useCallback(() => setRefreshKey(k => k + 1), []);
  const { customers } = useCustomers();
  const months = useMemo(() => monthOptions(6), []);
  const [newCustomerId, setNewCustomerId] = useState('');
  const [newPeriod, setNewPeriod] = useState(months[0]?.value || '');
  const [batchPeriod, setBatchPeriod] = useState(months[0]?.value || '');
  const [openArByCustomer, setOpenArByCustomer] = useState<{ customers: number; overdue: number }>({ customers: 0, overdue: 0 });

  useEffect(() => {
    let cancelled = false;
    fetchJson<{ data: StatementDto[] }>('/api/accounting/statements')
      .then(res => {
        if (cancelled || !res.ok) return;
        setRows((res.data.data || []).map((d, i) => dtoToRow(d, i)));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [refreshKey]);

  /* Open-AR summary for the batch modal (from the invoice list) */
  useEffect(() => {
    let cancelled = false;
    fetchJson<{ data: Record<string, unknown>[] }>('/api/v1/documents?type=Invoice')
      .then(res => {
        if (cancelled || !res.ok) return;
        const today = new Date().toISOString().slice(0, 10);
        const open = new Map<string, { open: number; overdue: boolean }>();
        for (const r of res.data.data || []) {
          if (['void', 'written_off'].includes(String(r.status))) continue;
          const bal = Math.max(0, Number(r.total || 0) - Number(r.amount_paid || 0) - Number(r.amount_credited || 0));
          if (bal <= 0) continue;
          const cid = String(r.customer_id || '');
          const cur = open.get(cid) || { open: 0, overdue: false };
          cur.open += bal;
          if (String(r.due_date || '') < today) cur.overdue = true;
          open.set(cid, cur);
        }
        setOpenArByCustomer({
          customers: open.size,
          overdue: [...open.values()].filter(v => v.overdue).length,
        });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [refreshKey]);
  const [viewTab, setViewTab] = useState<ViewTab>('All');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Drawer state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerRowId, setDrawerRowId] = useState<string | null>(null);
  const [drawerData, setDrawerData] = useState<StatementData | null>(null);

  // Batch modal
  const [batchOpen, setBatchOpen] = useState(false);

  // New split menu
  const [newMenuOpen, setNewMenuOpen] = useState(false);
  const [newMenuPos, setNewMenuPos] = useState<{ top: number; left: number } | null>(null);
  const newSplitRef = useRef<HTMLButtonElement>(null);

  // Row ⋯ menu
  const [rowMenuOpen, setRowMenuOpen] = useState(false);
  const [rowMenuId, setRowMenuId] = useState<string | null>(null);
  const [rowMenuPos, setRowMenuPos] = useState<{ top: number; left: number } | null>(null);
  const rowMenuTriggerRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  // Toast
  const [toastMsg, setToastMsg] = useState('');
  const toastTimer = useRef<number | null>(null);

  // ── Derived state ──────────────────────────────────────────

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      let tabOk = true;
      if (viewTab === 'All') tabOk = true;
      else if (viewTab === 'Draft') tabOk = r.status === 'Draft';
      else if (viewTab === 'Sent') tabOk = r.status === 'Sent';
      else if (viewTab === 'Paid') tabOk = r.status === 'Paid';
      else if (viewTab === 'Overdue') tabOk = r.status === 'Overdue';
      else if (viewTab === 'Awaiting') tabOk = hasOpenBalance(r.status);
      const qOk =
        !q ||
        r.customer.toLowerCase().includes(q) ||
        r.email.toLowerCase().includes(q) ||
        r.period.toLowerCase().includes(q) ||
        r.id.toLowerCase().includes(q);
      return tabOk && qOk;
    });
  }, [rows, viewTab, search]);

  const shown = filteredRows.length;
  const total = rows.length;
  const countText = `${shown} of ${total}`;

  const allVisibleSelected =
    filteredRows.length > 0 && filteredRows.every((r) => selected.has(r.id));
  const bulkBarShown = selected.size > 0;

  const drawerDueLabel = drawerData ? formatDueLabel(drawerData.due) : 'Due —';

  const rowMenuRow = rowMenuId ? rows.find((r) => r.id === rowMenuId) ?? null : null;
  const showSend = rowMenuRow?.status === 'Draft';
  const showRemind = rowMenuRow ? hasOpenBalance(rowMenuRow.status) : false;
  const showMarkPaid = rowMenuRow ? hasOpenBalance(rowMenuRow.status) : false;
  const showReceivePayment = rowMenuRow ? hasOpenBalance(rowMenuRow.status) : false;

  // ── Toast helper ───────────────────────────────────────────

  const showToast = useCallback(
    (m: string) => {
      setToastMsg(m);
      onToast(m);
      if (toastTimer.current) window.clearTimeout(toastTimer.current);
      toastTimer.current = window.setTimeout(() => setToastMsg(''), 1800);
    },
    [onToast]
  );

  // ── Drawer open/close ──────────────────────────────────────

  const openStatement = useCallback((id: string | null) => {
    setDrawerRowId(id);
    if (!id) {
      const m = months.find(x => x.value === newPeriod) || months[0];
      setDrawerData({
        id: '', customer: '', email: '', period: m?.label || '',
        date: m?.end || '', due: m?.end || '',
        invoiced: '$0.00', paid: '$0.00', dueAmt: '$0.00', status: 'Draft', lines: [],
      });
      setDrawerOpen(true);
      return;
    }
    setDrawerData(null);
    setDrawerOpen(true);
    fetchJson<{ data: StatementDto & { lines: { date: string; description: string; amount: number; paid: number; balance: number }[] } }>(`/api/accounting/statements/${id}`)
      .then(res => {
        if (!res.ok) return;
        const d = res.data.data;
        setDrawerData({
          id: d.number,
          customer: d.customerName,
          email: d.email || '',
          period: periodLabel(d.periodEnd),
          date: d.periodEnd,
          due: d.periodEnd,
          invoiced: money(d.charges),
          paid: d.payments > 0 ? `−${money(d.payments)}` : '$0.00',
          dueAmt: money(d.closing),
          status: displayStatus(d),
          lines: (d.lines || []).map(l => ({
            date: l.date ? `${l.date.slice(5, 7)}/${l.date.slice(8, 10)}` : '',
            desc: l.description,
            amt: money(l.amount),
            paid: money(l.paid),
            bal: money(l.balance),
          })),
        });
      })
      .catch(() => {});
  }, [months, newPeriod]);

  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  const openBatchModal = useCallback(() => setBatchOpen(true), []);
  const closeBatchModal = useCallback(() => setBatchOpen(false), []);

  // ── New split menu ─────────────────────────────────────────

  const toggleNewMenu = useCallback(() => {
    if (!newSplitRef.current) return;
    const r = newSplitRef.current.getBoundingClientRect();
    const menuHeight = 250;
    const top = r.bottom + 4 + menuHeight > window.innerHeight
      ? Math.max(10, r.top - menuHeight - 4)
      : r.bottom + 4;
    setNewMenuPos({
      top,
      left: Math.min(r.right - 220, window.innerWidth - 240),
    });
    setNewMenuOpen((o) => !o);
  }, []);

  const handleNewKind = useCallback(
    (kind: string) => {
      setNewMenuOpen(false);
      if (kind === 'Batch send') return openBatchModal();
      if (kind === 'From invoices') { openStatement(null); return; }
      openStatement(null);
    },
    [openBatchModal, showToast, openStatement]
  );

  // ── Drawer save/send: generate (when new) then act ─────────

  const generateFromDrawer = useCallback(async (draft: boolean): Promise<string | null> => {
    if (drawerRowId) return drawerRowId;
    if (!newCustomerId) {
      showToast('Pick a customer first');
      return null;
    }
    const m = months.find(x => x.value === newPeriod);
    if (!m) return null;
    const res = await fetchJson<{ data: StatementDto }>('/api/accounting/statements', {
      method: 'POST',
      body: JSON.stringify({ customerId: newCustomerId, periodStart: m.start, periodEnd: m.end, draft }),
    });
    if (!res.ok) {
      showToast((res as { error?: string }).error || 'Statement could not be generated');
      return null;
    }
    setDrawerRowId(res.data.data.id);
    return res.data.data.id;
  }, [drawerRowId, newCustomerId, newPeriod, months, showToast]);

  const handleDrawerSaveDraft = useCallback(async () => {
    if (drawerRowId) {
      const row = rows.find(r => r.id === drawerRowId);
      if (row && row.rawStatus !== 'draft') {
        const res = await fetchJson(`/api/accounting/statements/${drawerRowId}`, {
          method: 'PATCH',
          body: JSON.stringify({ status: 'draft' }),
        });
        if (!res.ok) { showToast((res as { error?: string }).error || 'Save failed'); return; }
      }
      showToast('Statement saved as draft');
    } else {
      const id = await generateFromDrawer(true);
      if (!id) return;
      showToast('Statement saved as draft');
    }
    closeDrawer();
    refresh();
  }, [drawerRowId, rows, generateFromDrawer, showToast, closeDrawer, refresh]);

  const handleDrawerSend = useCallback(async () => {
    const id = drawerRowId || (await generateFromDrawer(false));
    if (!id) return;
    const res = await fetchJson(`/api/accounting/statements/${id}/send`, { method: 'POST', body: '{}' });
    if (!res.ok) { showToast((res as { error?: string }).error || 'Send failed'); return; }
    showToast('Statement queued for email to the customer');
    closeDrawer();
    refresh();
  }, [drawerRowId, generateFromDrawer, showToast, closeDrawer, refresh]);

  // ── Row menu ───────────────────────────────────────────────

  const openRowMenu = useCallback((id: string) => {
    const btn = rowMenuTriggerRefs.current[id];
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    const menuHeight = 300;
    const top = r.bottom + 4 + menuHeight > window.innerHeight
      ? Math.max(10, r.top - menuHeight - 4)
      : r.bottom + 4;
    setRowMenuId(id);
    setRowMenuPos({
      top,
      left: Math.min(r.right - 250, window.innerWidth - 270),
    });
    setRowMenuOpen(true);
  }, []);

  const closeRowMenu = useCallback(() => {
    setRowMenuOpen(false);
    setRowMenuId(null);
  }, []);

  const handleRowAction = useCallback(
    async (action: string, id: string) => {
      closeRowMenu();
      const row = rows.find(r => r.id === id);
      const label = row ? `${row.number}` : 'Statement';
      switch (action) {
        case 'view':
        case 'edit':
          openStatement(id);
          break;
        case 'duplicate': {
          if (!row) return;
          const res = await fetchJson<{ data: StatementDto }>('/api/accounting/statements', {
            method: 'POST',
            body: JSON.stringify({ customerId: row.customerId, periodStart: row.periodStart, periodEnd: row.periodEnd }),
          });
          if (!res.ok) { showToast((res as { error?: string }).error || 'Duplicate failed'); return; }
          showToast(`Duplicated as ${res.data.data.number}`);
          refresh();
          break;
        }
        case 'send': {
          const res = await fetchJson(`/api/accounting/statements/${id}/send`, { method: 'POST', body: '{}' });
          if (!res.ok) { showToast((res as { error?: string }).error || 'Send failed'); return; }
          showToast(`Statement ${label} queued for email`);
          refresh();
          break;
        }
        case 'remind': {
          const res = await fetchJson(`/api/accounting/statements/${id}/send`, { method: 'POST', body: JSON.stringify({ reminder: true }) });
          if (!res.ok) { showToast((res as { error?: string }).error || 'Reminder failed'); return; }
          showToast(`Reminder for ${label} queued for email`);
          refresh();
          break;
        }
        case 'print':
          window.print();
          break;
        case 'mark-paid': {
          const res = await fetchJson<{ data: { paidCount: number; paidTotal: number } }>(`/api/accounting/statements/${id}/mark-paid`, { method: 'POST', body: '{}' });
          if (!res.ok) { showToast((res as { error?: string }).error || 'Mark-paid failed'); return; }
          const d = res.data.data;
          showToast(d.paidCount ? `Paid ${d.paidCount} invoice${d.paidCount === 1 ? '' : 's'} totaling ${money(d.paidTotal)}` : 'No open invoices to pay');
          refresh();
          break;
        }
        case 'receive-payment':
          showToast('Record the payment from the customer profile');
          onNavigate('contacts', 'customers');
          break;
        case 'delete': {
          const res = await fetchJson(`/api/accounting/statements/${id}`, { method: 'DELETE' });
          if (!res.ok) { showToast((res as { error?: string }).error || 'Delete failed'); return; }
          setSelected(prev => {
            const next = new Set(prev);
            next.delete(id);
            return next;
          });
          showToast(`Statement ${label} voided`);
          refresh();
          break;
        }
      }
    },
    [closeRowMenu, openStatement, showToast, rows, refresh, onNavigate]
  );

  // ── Selection / bulk ───────────────────────────────────────

  const toggleRowCheck = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        filteredRows.forEach((r) => next.delete(r.id));
      } else {
        filteredRows.forEach((r) => next.add(r.id));
      }
      return next;
    });
  };

  const bulkAction = async (action: string) => {
    const ids = [...selected];
    if (action === 'close') {
      setSelected(new Set());
      return;
    }
    if (action === 'print') {
      window.print();
      setSelected(new Set());
      return;
    }
    let ok = 0;
    let failed = 0;
    for (const id of ids) {
      const res = action === 'delete'
        ? await fetchJson(`/api/accounting/statements/${id}`, { method: 'DELETE' })
        : await fetchJson(`/api/accounting/statements/${id}/send`, {
            method: 'POST',
            body: JSON.stringify(action === 'remind' ? { reminder: true } : {}),
          });
      if (res.ok) ok++;
      else failed++;
    }
    const label = action === 'delete' ? 'Voided' : action === 'remind' ? 'Reminders queued for' : 'Queued for email';
    showToast(failed ? `${label} ${ok} statement${ok === 1 ? '' : 's'} — ${failed} failed` : `${label} ${ok} statement${ok === 1 ? '' : 's'}`);
    setSelected(new Set());
    refresh();
  };

  // ── Outside click + Escape ─────────────────────────────────

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      // Close new menu (skip if clicking the trigger button)
      if (newMenuOpen && newSplitRef.current && !newSplitRef.current.contains(target)) {
        const newMenuEl = document.getElementById('new-menu');
        if (!newMenuEl || !newMenuEl.contains(target)) {
          setNewMenuOpen(false);
        }
      }
      // Close row menu
      if (rowMenuOpen) {
        const rowMenuEl = document.getElementById('row-menu');
        const trigger = rowMenuId ? rowMenuTriggerRefs.current[rowMenuId] : null;
        if (
          (!rowMenuEl || !rowMenuEl.contains(target)) &&
          (!trigger || !trigger.contains(target))
        ) {
          setRowMenuOpen(false);
        }
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (drawerOpen) setDrawerOpen(false);
        else if (batchOpen) setBatchOpen(false);
        else if (rowMenuOpen) setRowMenuOpen(false);
        else if (newMenuOpen) setNewMenuOpen(false);
      }
    };
    document.addEventListener('click', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('click', onDocClick);
      document.removeEventListener('keydown', onKey);
      if (toastTimer.current) window.clearTimeout(toastTimer.current);
    };
  }, [drawerOpen, batchOpen, newMenuOpen, rowMenuOpen, rowMenuId]);

  // ── Breadcrumb nav ─────────────────────────────────────────

  const handleContactsNav = () => {
    const [d, s] = STMT_NAV.customers();
    onNavigate(d, s);
  };

  // ─────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────

  return (
    <div className="statements-page">
      {/* Context header */}
      <div className="h-[52px] px-6 flex items-center justify-between bg-white border-b border-surface-dim">
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-[20px] text-on-surface-variant">
            account_balance
          </span>
          <span className="text-label-md font-semibold">Finance</span>
          <span className="text-outline">/</span>
          <button
            type="button"
            className="text-label-md hover:text-primary"
            onClick={handleContactsNav}
          >
            Contacts
          </button>
          <span className="text-outline">/</span>
          <span className="text-label-md text-primary font-semibold">Statements</span>
        </div>
      </div>

      <main className="px-6 pb-12">
        {/* Page header */}
        <div className="flex items-center justify-between gap-4 py-4 flex-wrap">
          <div>
            <h1 className="text-headline-lg">Statements</h1>
            <p className="text-body-sm text-on-surface-variant mt-0.5">
              Batch billing summary — send a customer their account activity for a period
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex split-btn">
              <button
                type="button"
                className="h-8 px-3 bg-primary text-white text-body-md font-semibold hover:bg-primary-container flex items-center gap-1 split-btn-main"
                onClick={() => openStatement(null)}
              >
                <span className="material-symbols-outlined text-[16px]">add</span>New statement
              </button>
              <button
                type="button"
                ref={newSplitRef}
                className="h-8 px-1.5 bg-primary text-white hover:bg-primary-container split-btn-arrow"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleNewMenu();
                }}
              >
                <span className="material-symbols-outlined text-[16px]">expand_more</span>
              </button>
            </div>
            <button
              type="button"
              className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low flex items-center gap-1"
              onClick={() => exportToCsv(rows.map(r => ({ number: r.number, customer: r.customer, period: r.period, balance: r.balance.replace(/[$,]/g, ''), status: r.status })), [{ key: 'number', label: 'Statement' }, { key: 'customer', label: 'Customer' }, { key: 'period', label: 'Period' }, { key: 'balance', label: 'Balance' }, { key: 'status', label: 'Status' }], 'statements.csv')}
            >
              <span className="material-symbols-outlined text-[16px]">download</span>Export
            </button>
            <button
              type="button"
              className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low flex items-center gap-1"
              onClick={() => showToast('Column settings are not available for this table')}
            >
              <span className="material-symbols-outlined text-[16px]">tune</span>Customize
            </button>
          </div>
        </div>

        {/* KPI strip */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-5">
          <div className="bg-white rounded-xl border border-surface-dim p-3">
            <div className="text-[10px] text-on-surface-variant uppercase tracking-wider font-bold">
              Sent this month
            </div>
            <div className="text-headline-sm mt-1 tabular-nums">4</div>
            <div className="text-[11px] text-on-surface-variant mt-0.5">
              October 2026 · $12,340 total
            </div>
          </div>
          <div className="bg-white rounded-xl border border-surface-dim p-3">
            <div className="text-[10px] text-on-surface-variant uppercase tracking-wider font-bold">
              Awaiting payment
            </div>
            <div className="text-headline-sm mt-1 tabular-nums">2</div>
            <div className="text-[11px] text-on-surface-variant mt-0.5">$3,940 outstanding</div>
          </div>
          <div className="bg-white rounded-xl border border-surface-dim p-3">
            <div className="text-[10px] text-on-surface-variant uppercase tracking-wider font-bold">
              Collected
            </div>
            <div className="text-headline-sm mt-1 tabular-nums text-secondary">$8,400</div>
            <div className="text-[11px] text-on-surface-variant mt-0.5">68% of sent statements</div>
          </div>
          <div className="bg-white rounded-xl border border-surface-dim p-3">
            <div className="text-[10px] text-on-surface-variant uppercase tracking-wider font-bold">
              Overdue
            </div>
            <div className="text-headline-sm mt-1 tabular-nums text-error">1</div>
            <div className="text-[11px] text-on-surface-variant mt-0.5">$2,100 · past 30 days</div>
          </div>
        </div>

        {/* Create actions row */}
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <span className="text-label-sm text-on-surface-variant uppercase tracking-wider font-bold mr-1">
            Create actions:
          </span>
          <button
            type="button"
            className="h-8 px-3 rounded-lg bg-white border border-surface-dim hover:bg-primary hover:text-white text-on-surface text-label-sm flex items-center gap-1.5"
            onClick={() => openStatement(null)}
          >
            <span className="material-symbols-outlined text-[16px]">summarize</span>Statement
          </button>
          <button
            type="button"
            className="h-8 px-3 rounded-lg bg-white border border-surface-dim hover:bg-primary hover:text-white text-on-surface text-label-sm flex items-center gap-1.5"
            onClick={openBatchModal}
          >
            <span className="material-symbols-outlined text-[16px]">campaign</span>Batch send
          </button>
          <button
            type="button"
            className="h-8 px-3 rounded-lg bg-white border border-surface-dim hover:bg-primary hover:text-white text-on-surface text-label-sm flex items-center gap-1.5"
            onClick={() => {
              onCreate('Customer');
              showToast('New customer — party drawer');
            }}
          >
            <span className="material-symbols-outlined text-[16px]">person_add</span>Customer
          </button>
          <button
            type="button"
            className="h-8 px-3 rounded-lg bg-white border border-surface-dim hover:bg-primary hover:text-white text-on-surface text-label-sm flex items-center gap-1.5"
            onClick={() => {
              onCreate('Invoice');
              showToast('New invoice');
            }}
          >
            <span className="material-symbols-outlined text-[16px]">receipt_long</span>Invoice
          </button>
          <button
            type="button"
            className="h-8 px-3 rounded-lg bg-surface-container hover:bg-surface-container-high text-label-sm flex items-center gap-1"
            onClick={() => onOpenCreateFlyout()}
          >
            <span className="material-symbols-outlined text-[16px]">apps</span>Show all
          </button>
        </div>

        {/* Table card */}
        <div className="bg-white rounded-xl shadow-sm border border-surface-dim overflow-hidden">
          {/* Tabs */}
          <div className="flex items-center gap-1 px-4 h-11 border-b border-surface-dim overflow-x-auto">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                className={`h-full px-3 text-label-md tab-underline ${
                  viewTab === t.key ? 'active' : 'text-on-surface-variant'
                }`}
                onClick={() => setViewTab(t.key)}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Filter bar */}
          <div className="px-4 py-2 flex items-center gap-2 border-b border-surface-dim flex-wrap">
            <div className="relative flex items-center flex-1 max-w-sm min-w-[180px]">
              <span className="material-symbols-outlined absolute left-2 text-[15px] text-outline">
                search
              </span>
              <input
                className="w-full h-7 pl-7 pr-2 bg-surface-container-low border border-surface-dim rounded text-body-sm focus:outline-none focus:border-primary"
                placeholder="Filter by customer, period…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <button
              type="button"
              className="h-7 px-2 border border-surface-dim rounded text-label-sm hover:bg-surface-container-low flex items-center gap-1"
              onClick={() => showToast('Statements are grouped by their period — use the tabs to filter')}
            >
              <span className="material-symbols-outlined text-[14px]">calendar_today</span>Date range
            </button>
            <button
              type="button"
              className="h-7 px-2 border border-surface-dim rounded text-label-sm hover:bg-surface-container-low flex items-center gap-1"
              onClick={() => showToast('Saved views are not available for statements yet')}
            >
              <span className="material-symbols-outlined text-[14px]">bookmark</span>Saved views
            </button>
            <span className="ml-auto text-[11px] text-on-surface-variant">{countText}</span>
          </div>

          {/* Bulk bar */}
          <div className={`bulk-bar${bulkBarShown ? ' show' : ''}`}>
            <span className="text-[12px] font-semibold">{selected.size} selected</span>
            <span className="w-px h-4 bg-white/30"></span>
            <button type="button" onClick={() => bulkAction('send')}>
              <span className="material-symbols-outlined text-[14px] align-middle mr-1">send</span>
              Send
            </button>
            <button type="button" onClick={() => bulkAction('print')}>
              <span className="material-symbols-outlined text-[14px] align-middle mr-1">print</span>
              Print
            </button>
            <button type="button" onClick={() => bulkAction('remind')}>
              <span className="material-symbols-outlined text-[14px] align-middle mr-1">
                notifications_active
              </span>
              Remind
            </button>
            <span className="w-px h-4 bg-white/30"></span>
            <button type="button" onClick={() => bulkAction('delete')}>
              <span className="material-symbols-outlined text-[14px] align-middle mr-1">delete</span>
              Delete
            </button>
            <button type="button" className="ml-auto" onClick={() => bulkAction('close')}>
              <span className="material-symbols-outlined text-[16px]">close</span>
            </button>
          </div>

          {/* Statements table */}
          <table className="w-full text-left text-body-sm">
            <thead className="bg-surface-container-low text-label-sm text-on-surface-variant uppercase tracking-wider">
              <tr>
                <th className="w-8 px-3 py-2">
                  <input
                    type="checkbox"
                    className="row-check"
                    checked={allVisibleSelected}
                    onChange={toggleAll}
                  />
                </th>
                <th className="px-3 py-2">Customer</th>
                <th className="px-3 py-2">Period</th>
                <th className="px-3 py-2">Sent</th>
                <th className="px-3 py-2">Due</th>
                <th className="px-3 py-2 text-right">Balance</th>
                <th className="px-3 py-2">Status</th>
                <th className="w-8"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-dim">
              {filteredRows.map((row) => (
                <tr
                  key={row.id}
                  className="hover:bg-surface-container-low cursor-pointer s-row"
                  onClick={(e) => {
                    if ((e.target as HTMLElement).closest('input,button,[data-row-menu]')) return;
                    openStatement(row.id);
                  }}
                >
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      className="row-check s-check"
                      checked={selected.has(row.id)}
                      onChange={() => toggleRowCheck(row.id)}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <div className={`st-avatar ${row.avatarColor}`}>{row.avatar}</div>
                      <div className="min-w-0">
                        <div className="font-medium truncate">{row.customer}</div>
                        <div className="text-[11px] text-on-surface-variant">{row.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-on-surface-variant">{row.period}</td>
                  <td className="px-3 py-2 text-on-surface-variant">{row.sentDate}</td>
                  <td className={`px-3 py-2 ${row.dueRed ? 'text-error' : 'text-on-surface-variant'}`}>
                    {row.dueDate}
                  </td>
                  <td
                    className={`px-3 py-2 text-right tabular-nums ${
                      row.balanceRed ? 'text-error' : ''
                    }`}
                  >
                    {row.balance}
                  </td>
                  <td className="px-3 py-2">
                    <span className={STATUS_PILL_CLASS[row.status]}>{row.status}</span>
                  </td>
                  <td className="px-2 py-2 text-right">
                    <button
                      type="button"
                      data-row-menu
                      ref={(el) => {
                        rowMenuTriggerRefs.current[row.id] = el;
                      }}
                      className="w-6 h-6 rounded hover:bg-surface-container flex items-center justify-center"
                      onClick={(e) => {
                        e.stopPropagation();
                        openRowMenu(row.id);
                      }}
                    >
                      <span className="material-symbols-outlined text-[16px] text-on-surface-variant">
                        more_horiz
                      </span>
                    </button>
                  </td>
                </tr>
              ))}
              {filteredRows.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-on-surface-variant">
                    No statements match the current filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </main>

      {/* New split menu */}
      <div
        id="new-menu"
        className={`row-menu${newMenuOpen ? ' open' : ''}`}
        style={newMenuPos ?? undefined}
      >
        <div className="menu-header">New statement</div>
        <button type="button" onClick={() => handleNewKind('Single customer')}>
          <span className="material-symbols-outlined">person</span>Single customer
        </button>
        <button type="button" onClick={() => handleNewKind('Batch send')}>
          <span className="material-symbols-outlined">campaign</span>Batch send to many…
        </button>
        <div className="sep"></div>
        <button type="button" onClick={() => handleNewKind('From invoices')}>
          <span className="material-symbols-outlined">receipt_long</span>Generate from invoices…
        </button>
      </div>

      {/* Row ⋯ menu */}
      <div
        id="row-menu"
        className={`row-menu${rowMenuOpen ? ' open' : ''}`}
        style={rowMenuPos ?? undefined}
      >
        <div className="menu-header">This statement</div>
        <button type="button" onClick={() => rowMenuId && handleRowAction('view', rowMenuId)}>
          <span className="material-symbols-outlined">open_in_new</span>Open statement
        </button>
        <button type="button" onClick={() => rowMenuId && handleRowAction('edit', rowMenuId)}>
          <span className="material-symbols-outlined">edit</span>Edit
        </button>
        <button
          type="button"
          onClick={() => rowMenuId && handleRowAction('duplicate', rowMenuId)}
        >
          <span className="material-symbols-outlined">content_copy</span>Duplicate for next period
        </button>
        <div className="sep"></div>
        <div className="menu-header">Send</div>
        <button
          type="button"
          className={showSend ? '' : 'hidden-imp'}
          onClick={() => rowMenuId && handleRowAction('send', rowMenuId)}
        >
          <span className="material-symbols-outlined">send</span>Send
        </button>
        <button
          type="button"
          className={showRemind ? '' : 'hidden-imp'}
          onClick={() => rowMenuId && handleRowAction('remind', rowMenuId)}
        >
          <span className="material-symbols-outlined">notifications_active</span>Send reminder
        </button>
        <button
          type="button"
          onClick={() => rowMenuId && handleRowAction('print', rowMenuId)}
        >
          <span className="material-symbols-outlined">print</span>Print / download PDF
        </button>
        <div className="sep"></div>
        <div className="menu-header">Payment</div>
        <button
          type="button"
          className={showMarkPaid ? '' : 'hidden-imp'}
          onClick={() => rowMenuId && handleRowAction('mark-paid', rowMenuId)}
        >
          <span className="material-symbols-outlined">check_circle</span>Mark as paid
        </button>
        <button
          type="button"
          className={showReceivePayment ? '' : 'hidden-imp'}
          onClick={() => rowMenuId && handleRowAction('receive-payment', rowMenuId)}
        >
          <span className="material-symbols-outlined">price_check</span>Receive payment…
        </button>
        <div className="sep"></div>
        <button
          type="button"
          className="danger"
          onClick={() => rowMenuId && handleRowAction('delete', rowMenuId)}
        >
          <span className="material-symbols-outlined">delete</span>Delete
        </button>
      </div>

      {/* Statement drawer scrim */}
      <div
        className={`drawer-scrim${drawerOpen ? ' open' : ''}`}
        onClick={closeDrawer}
      />

      {/* Statement drawer */}
      <div
        className={`drawer${drawerOpen ? ' open' : ''}`}
        style={{ width: 720 }}
      >
        {/* Drawer header */}
        <div className="flex items-center justify-between px-5 h-14 border-b border-surface-dim shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="material-symbols-outlined text-[20px] text-primary">summarize</span>
            <div className="min-w-0">
              <div className="text-headline-sm truncate">
                Statement {drawerData?.id ?? ''}
              </div>
              <div className="text-[11px] text-on-surface-variant">
                {drawerData
                  ? `${drawerData.customer || 'New statement'} · ${drawerData.period}`
                  : '—'}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="w-8 h-8 rounded hover:bg-surface-container flex items-center justify-center"
              title="Download"
              onClick={() => window.print()}
            >
              <span className="material-symbols-outlined text-[18px]">download</span>
            </button>
            <button
              type="button"
              className="w-8 h-8 rounded hover:bg-surface-container flex items-center justify-center"
              onClick={closeDrawer}
            >
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
          </div>
        </div>

        {/* Drawer body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Customer / period / date / due grid */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="field-label">Customer</label>
              {drawerRowId ? (
                <div className="relative flex items-center">
                  <input
                    className="field-input"
                    readOnly
                    value={drawerData?.customer ?? ''}
                  />
                  <span className="material-symbols-outlined absolute right-2 text-[16px] text-outline">
                    expand_more
                  </span>
                </div>
              ) : (
                <select className="field-input" value={newCustomerId} onChange={e => setNewCustomerId(e.target.value)}>
                  <option value="">Select a customer…</option>
                  {customers.map(c => (
                    <option key={c.id} value={c.id}>{c.displayName}</option>
                  ))}
                </select>
              )}
            </div>
            <div>
              <label className="field-label">Period</label>
              {drawerRowId ? (
                <select className="field-input" value={drawerData?.period ?? ''} disabled>
                  <option>{drawerData?.period ?? ''}</option>
                </select>
              ) : (
                <select className="field-input" value={newPeriod} onChange={e => setNewPeriod(e.target.value)}>
                  {months.map(m => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
              )}
            </div>
            <div>
              <label className="field-label">Statement date</label>
              <input
                className="field-input"
                type="date"
                value={drawerData?.date ?? ''}
                readOnly
              />
            </div>
            <div>
              <label className="field-label">Due date</label>
              <input
                className="field-input"
                type="date"
                value={drawerData?.due ?? ''}
                readOnly
              />
            </div>
          </div>

          {/* Statement preview */}
          <div>
            <div className="text-label-sm text-on-surface-variant uppercase tracking-wider font-bold mb-2">
              Statement preview
            </div>
            <div className="stmt-doc">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="font-bold text-body-md">Unsaid</div>
                  <div className="text-[11px] text-on-surface-variant">
                    Unsaid · Statement
                  </div>
                </div>
                <div className="text-right text-[11px] text-on-surface-variant">
                  <div>{drawerData?.period ?? ''}</div>
                  <div>{drawerDueLabel}</div>
                </div>
              </div>
              <div className="border-t border-surface-dim pt-3 mb-3">
                <div className="text-[11px] text-on-surface-variant uppercase font-bold mb-1">
                  Bill to
                </div>
                <div className="font-medium">{drawerData?.customer || '—'}</div>
              </div>
              <div className="stmt-line head">
                <span>Date</span>
                <span>Invoice / activity</span>
                <span className="text-right">Amount</span>
                <span className="text-right">Paid</span>
                <span className="text-right">Balance</span>
              </div>
              <div>
                {drawerData && drawerData.lines.length > 0 ? (
                  drawerData.lines.map((l, idx) => (
                    <div className="stmt-line" key={idx}>
                      <span className="text-on-surface-variant">{l.date}</span>
                      <span>{l.desc}</span>
                      <span className="text-right tabular-nums">{l.amt}</span>
                      <span className="text-right tabular-nums">{l.paid}</span>
                      <span className="text-right tabular-nums">{l.bal}</span>
                    </div>
                  ))
                ) : (
                  <div className="stmt-line">
                    <span className="text-on-surface-variant">—</span>
                    <span className="text-on-surface-variant">No activity for this period</span>
                    <span className="text-right tabular-nums">$0.00</span>
                    <span className="text-right tabular-nums">$0.00</span>
                    <span className="text-right tabular-nums">$0.00</span>
                  </div>
                )}
              </div>
              <div className="flex justify-end pt-3 mt-3 border-t border-surface-dim">
                <div className="w-56 space-y-1 text-[12px]">
                  <div className="flex justify-between">
                    <span className="text-on-surface-variant">Opening balance</span>
                    <span className="tabular-nums">$0.00</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-on-surface-variant">Invoiced</span>
                    <span className="tabular-nums">{drawerData?.invoiced ?? '$0.00'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-on-surface-variant">Paid</span>
                    <span className="tabular-nums">{drawerData?.paid ?? '$0.00'}</span>
                  </div>
                  <div className="flex justify-between pt-1 border-t border-surface-dim font-bold">
                    <span>Amount due</span>
                    <span className="tabular-nums">{drawerData?.dueAmt ?? '$0.00'}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Message */}
          <div>
            <label className="field-label">Message to customer</label>
            <textarea
              className="field-input"
              style={{ height: 56, padding: '8px 10px', fontFamily: 'inherit' }}
              placeholder="Optional note visible to the customer"
              defaultValue="Please review the attached statement at your convenience."
            />
          </div>

          {/* Delivery */}
          <div>
            <div className="text-label-sm text-on-surface-variant uppercase tracking-wider font-bold mb-2">
              Delivery
            </div>
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-body-sm">
                <input type="checkbox" className="row-check" defaultChecked /> Email to{' '}
                <strong className="ml-1">{drawerData?.email || '—'}</strong>
              </label>
              <label className="flex items-center gap-2 text-body-sm">
                <input type="checkbox" className="row-check" /> Include PDF attachment
              </label>
              <label className="flex items-center gap-2 text-body-sm">
                <input type="checkbox" className="row-check" /> Also print for mail
              </label>
            </div>
          </div>
        </div>

        {/* Drawer footer */}
        <div className="h-14 border-t border-surface-dim px-4 flex items-center justify-between shrink-0">
          <button
            type="button"
            className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low"
            onClick={closeDrawer}
          >
            Cancel
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="h-8 px-3 border border-surface-dim rounded text-body-md font-semibold hover:bg-surface-container-low"
              onClick={() => window.print()}
            >
              <span className="material-symbols-outlined text-[16px] align-middle mr-1">print</span>
              Print
            </button>
            <div className="split-btn flex">
              <button
                type="button"
                className="h-8 px-3 border border-surface-dim text-body-md font-semibold hover:bg-surface-container-low split-btn-main"
                onClick={handleDrawerSaveDraft}
              >
                Save draft
              </button>
              <button
                type="button"
                className="h-8 px-1.5 border border-surface-dim hover:bg-surface-container-low split-btn-arrow"
              >
                <span className="material-symbols-outlined text-[16px]">expand_more</span>
              </button>
            </div>
            <div className="split-btn flex">
              <button
                type="button"
                className="h-8 px-3 bg-primary text-white text-body-md font-semibold hover:bg-primary-container split-btn-main"
                onClick={handleDrawerSend}
              >
                Send to customer
              </button>
              <button
                type="button"
                className="h-8 px-1.5 bg-primary text-white hover:bg-primary-container split-btn-arrow"
              >
                <span className="material-symbols-outlined text-[16px]">expand_more</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Batch send modal */}
      <div className={`modal-scrim${batchOpen ? ' open' : ''}`} onClick={closeBatchModal}>
        <div
          className="w-full max-w-md bg-white rounded-xl shadow-2xl overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="p-6">
            <div className="flex items-center gap-2 mb-3">
              <span className="material-symbols-outlined text-[20px] text-primary">campaign</span>
              <h2 className="text-headline-sm">Batch send statements</h2>
            </div>
            <p className="text-body-sm text-on-surface-variant mb-4">
              Send statements to all customers with an open balance for the selected period.
            </p>
            <div className="space-y-3">
              <div>
                <label className="field-label">Period</label>
                <select className="field-input" value={batchPeriod} onChange={e => setBatchPeriod(e.target.value)}>
                  {months.map(m => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
              </div>
              <div className="bg-surface-container-low rounded-lg p-3 text-[11px] text-on-surface-variant">
                <div className="flex items-center gap-2 mb-1">
                  <span className="material-symbols-outlined text-[14px] text-secondary">check</span>
                  {openArByCustomer.customers} customers have open balances
                </div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="material-symbols-outlined text-[14px] text-secondary">check</span>
                  {openArByCustomer.overdue} have overdue balances
                </div>
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[14px] text-tertiary">info</span>
                  Statements are generated from open invoices and queued to the platform mail queue
                </div>
              </div>
            </div>
          </div>
          <div className="flex gap-2 px-4 pb-4">
            <button
              type="button"
              className="flex-1 h-9 border border-surface-dim rounded text-body-md hover:bg-surface-container-low"
              onClick={closeBatchModal}
            >
              Cancel
            </button>
            <button
              type="button"
              className="flex-1 h-9 bg-primary text-white rounded text-body-md font-semibold hover:bg-primary-container"
              onClick={async () => {
                const m = months.find(x => x.value === batchPeriod);
                if (!m) return;
                // Every customer with an open balance gets a statement
                // for the period (generated if needed), then a send.
                const invRes = await fetchJson<{ data: Record<string, unknown>[] }>('/api/v1/documents?type=Invoice');
                const openCustomers = new Set<string>();
                if (invRes.ok) {
                  for (const r of invRes.data.data || []) {
                    if (['void', 'written_off'].includes(String(r.status))) continue;
                    const bal = Math.max(0, Number(r.total || 0) - Number(r.amount_paid || 0) - Number(r.amount_credited || 0));
                    if (bal > 0 && r.customer_id) openCustomers.add(String(r.customer_id));
                  }
                }
                let queued = 0;
                let failed = 0;
                for (const cid of openCustomers) {
                  let stmtId = rows.find(r => r.customerId === cid && r.periodStart === m.start)?.id;
                  if (!stmtId) {
                    const gen = await fetchJson<{ data: StatementDto }>('/api/accounting/statements', {
                      method: 'POST',
                      body: JSON.stringify({ customerId: cid, periodStart: m.start, periodEnd: m.end }),
                    });
                    if (!gen.ok) { failed++; continue; }
                    stmtId = gen.data.data.id;
                  }
                  const sent = await fetchJson(`/api/accounting/statements/${stmtId}/send`, { method: 'POST', body: '{}' });
                  if (sent.ok) queued++;
                  else failed++;
                }
                closeBatchModal();
                showToast(failed ? `Statements queued for ${queued} customers — ${failed} failed` : `Statements queued for ${queued} customers`);
                refresh();
              }}
            >
              <span className="material-symbols-outlined text-[16px] align-middle mr-1">send</span>
              Send to {openArByCustomer.customers} customers
            </button>
          </div>
        </div>
      </div>

      {/* Toast */}
      <div className={`toast${toastMsg ? ' show' : ''}`}>{toastMsg}</div>
    </div>
  );
}
