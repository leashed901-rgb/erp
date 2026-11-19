'use client';
import './receipts.css';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AccountingScreenProps } from './types';
import { useReceipts, useBankAccounts, useChartOfAccounts, receiptMutations, fetchReceiptMatchCandidates } from '@/hooks/useAccountingApi';
import type { ReceiptDto, ReceiptMatchCandidate } from '@/lib/acctTypes';

/* ────────── types ────────── */

type ViewTab = 'review' | 'reviewed' | 'all';
type RowStatus = 'review' | 'reviewed';
type RowAction = 'review' | 'reviewed' | 'expense-created' | 'matched';
type BulkAction = 'categorize' | 'attach' | 'create' | 'delete' | 'close';
type RowMenuAction =
  | 'view'
  | 'edit'
  | 'download'
  | 'create-expense'
  | 'create-bill'
  | 'attach'
  | 'match'
  | 'mark-reviewed'
  | 'unmark-reviewed'
  | 'delete';

interface ReceiptRow {
  receiptId: string;
  status: RowStatus;
  vendor: string;
  amount: string;
  tax: string;
  date: string;
  account: string;
  category: string;
  chipCls: string;
  chipIcon: string | null;
  chipLabel: string;
  action: RowAction;
  processing: boolean;
  fileName: string;
  checked: boolean;
  hidden: boolean;
  /** row added by intake this session — the mockup never adds the hover/bg class to it */
  dropped: boolean;
  dto: ReceiptDto | null;
}

const fmtMoneyStr = (n: number | null) => (n == null ? '' : `$${n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`);
const fmtUsDate = (iso: string) => {
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
};

/* acct_document_inbox + extraction DTO → the table's row shape */
function toReceiptRow(r: ReceiptDto, checked: boolean): ReceiptRow {
  const reviewed = r.status === 'reviewed';
  const action: RowAction = r.createdSpendId
    ? 'expense-created'
    : r.matchedBankTransactionId
      ? 'matched'
      : reviewed
        ? 'reviewed'
        : 'review';
  const chip = r.categoryLabel
    ? reviewed
      ? { chipCls: 'cat-chip done', chipIcon: 'check_circle', chipLabel: r.categoryLabel }
      : { chipCls: 'cat-chip', chipIcon: null, chipLabel: r.categoryLabel }
    : r.amount != null
      ? { chipCls: 'cat-chip uncat', chipIcon: 'error', chipLabel: 'Needs category' }
      : { chipCls: 'cat-chip uncat', chipIcon: 'error', chipLabel: 'Awaiting extraction' };
  return {
    receiptId: r.id,
    status: r.status,
    vendor: r.vendorName || '',
    amount: fmtMoneyStr(r.amount),
    tax: fmtMoneyStr(r.taxAmount),
    date: fmtUsDate(r.date),
    account: r.paymentAccountLabel || '—',
    category: r.categoryLabel || '',
    ...chip,
    action,
    processing: false,
    fileName: r.fileName || '',
    checked,
    hidden: false,
    dropped: false,
    dto: r,
  };
}

async function sha256OfFile(file: File): Promise<string> {
  try {
    const buf = await file.arrayBuffer();
    const digest = await crypto.subtle.digest('SHA-256', buf);
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return `local-${file.name}-${file.size}-${file.lastModified}`;
  }
}

interface MenuState {
  open: boolean;
  top: number;
  left: number;
}

interface DrawerSnapshot {
  title: string;
  sub: string;
  vendor: string;
  date: string;
  amt: string;
  tax: string;
}

interface DrawerForm {
  vendor: string;
  date: string;
  amount: string;
  tax: string;
  account: string;
  category: string;
  notes: string;
}

/* ────────── constants ────────── */

const FWD_ADDRESS = 'receipts@unsaid.app';

function toISO(usDate: string): string {
  const m = (usDate || '').match(/(\d+)\/(\d+)\/(\d+)/);
  return m ? `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}` : '';
}

/* ═══════════════ component ═══════════════ */

export default function Receipts(_props: AccountingScreenProps) {
  const { receipts, refresh: refreshReceipts } = useReceipts();
  const { bankAccounts } = useBankAccounts();
  const { accounts: coaAccounts } = useChartOfAccounts();
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [intakeRows, setIntakeRows] = useState<ReceiptRow[]>([]);
  const rows = useMemo(
    () => [...intakeRows, ...receipts.map((r) => toReceiptRow(r, checkedIds.has(r.id)))],
    [receipts, checkedIds, intakeRows],
  );
  const [matchCandidates, setMatchCandidates] = useState<ReceiptMatchCandidate[]>([]);
  const [viewTab, setViewTab] = useState<ViewTab>('review');
  const [filterText, setFilterText] = useState('');
  const [checkAll, setCheckAll] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [copyConfirm, setCopyConfirm] = useState(false);
  const [catSearch, setCatSearch] = useState('');
  const [toastMsg, setToastMsg] = useState('');

  /* positioned dropdowns */
  const [catPicker, setCatPicker] = useState<MenuState>({ open: false, top: 0, left: 0 });
  const [rowMenu, setRowMenu] = useState<MenuState>({ open: false, top: 0, left: 0 });
  const [matchMenu, setMatchMenu] = useState<MenuState>({ open: false, top: 0, left: 0 });
  const [pickerReceiptId, setPickerReceiptId] = useState<string | null>(null);
  const [menuReceiptId, setMenuReceiptId] = useState<string | null>(null);

  /* receipt preview drawer */
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerReceiptId, setDrawerReceiptId] = useState<string | null>(null);
  const [drawerSnap, setDrawerSnap] = useState<DrawerSnapshot | null>(null);
  const [drawerForm, setDrawerForm] = useState<DrawerForm>({ vendor: '', date: '', amount: '', tax: '', account: '', category: '', notes: '' });

  const toastTimer = useRef<number | null>(null);
  const copyTimer = useRef<number | null>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const snapInputRef = useRef<HTMLInputElement>(null);
  const timeouts = useRef<Set<number>>(new Set());

  /* ────────── utils ────────── */
  const toast = useCallback((m: string) => {
    setToastMsg(m);
    if (toastTimer.current !== null) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToastMsg(''), 1800);
  }, []);

  const closeAllMenus = useCallback(() => {
    setCatPicker((m) => ({ ...m, open: false }));
    setRowMenu((m) => ({ ...m, open: false }));
    setMatchMenu((m) => ({ ...m, open: false }));
  }, []);

  /* clear pending timers on unmount */
  useEffect(() => () => {
    if (toastTimer.current !== null) window.clearTimeout(toastTimer.current);
    if (copyTimer.current !== null) window.clearTimeout(copyTimer.current);
    timeouts.current.forEach((id) => window.clearTimeout(id));
    timeouts.current.clear();
  }, []);

  /* global close on outside click — only armed while a menu is open */
  useEffect(() => {
    if (!catPicker.open && !rowMenu.open && !matchMenu.open) return;
    const onDocClick = (e: MouseEvent) => {
      const t = e.target as Element | null;
      if (!t) return;
      if (!t.closest('#cat-picker')) setCatPicker((m) => ({ ...m, open: false }));
      if (!t.closest('#row-menu')) setRowMenu((m) => ({ ...m, open: false }));
      if (!t.closest('#match-menu')) setMatchMenu((m) => ({ ...m, open: false }));
    };
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, [catPicker.open, rowMenu.open, matchMenu.open]);

  /* derived counts + tab/search filtering over the live rows */
  const reviewCount = rows.filter((r) => r.status === 'review').length;
  const visibleRows = rows.filter((r) => {
    const tabOk = viewTab === 'all' || r.status === viewTab;
    const q = filterText.trim().toLowerCase();
    const qOk = !q || r.vendor.toLowerCase().includes(q) || r.amount.replace(/[^0-9.]/g, '').includes(q.replace(/[^0-9.]/g, '')) || r.fileName.toLowerCase().includes(q);
    return tabOk && qOk;
  });
  const countText = `${visibleRows.length} of ${rows.length}`;
  const checkedCount = rows.filter((r) => r.checked).length;
  /* Category picker = the real chart of accounts; expense accounts lead */
  const catQuery = catSearch.trim().toLowerCase();
  const suggestedCats = useMemo(
    () => coaAccounts.filter((a) => a.type === 'Expense' && (!catQuery || a.name.toLowerCase().includes(catQuery))).slice(0, 4),
    [coaAccounts, catQuery],
  );
  const otherCats = useMemo(
    () => coaAccounts.filter((a) => !suggestedCats.includes(a) && (!catQuery || a.name.toLowerCase().includes(catQuery))),
    [coaAccounts, suggestedCats, catQuery],
  );
  const CAT_DOTS = ['#0077c5', '#1e5a38', '#6b1e28', '#0e5e6f'];
  const menuRow = menuReceiptId !== null ? rows.find((r) => r.receiptId === menuReceiptId) ?? null : null;
  const menuReviewed = menuRow !== null && menuRow.status === 'reviewed';

  /* ────────── Receipt drawer ────────── */
  const openReceiptRow = (row: ReceiptRow) => {
    const vendor = row.vendor || 'Unknown';
    const status = row.status === 'review' ? 'For review' : 'Reviewed';
    setDrawerReceiptId(row.receiptId);
    setMenuReceiptId(row.receiptId);
    setDrawerSnap({
      title: `Receipt — ${vendor}`,
      sub: `${row.dto?.ref || row.receiptId} · ${status}`,
      vendor,
      date: row.date || '',
      amt: (row.amount || '').replace('$', ''),
      tax: (row.tax || '').replace('$', ''),
    });
    setDrawerForm((f) => ({
      ...f,
      vendor: row.vendor || '',
      date: toISO(row.date),
      amount: row.amount || '',
      tax: row.tax || '',
      account: row.dto?.paymentAccountId || bankAccounts[0]?.id || '',
      category: row.dto?.categoryAccountId || '',
    }));
    setDrawerOpen(true);
  };

  const closeReceipt = useCallback(() => setDrawerOpen(false), []);

  /* Field edits in the drawer persist to the extraction row on blur */
  const persistDrawerFields = async () => {
    if (!drawerReceiptId) return;
    const total = parseFloat(drawerForm.amount.replace(/[$,]/g, ''));
    const tax = parseFloat(drawerForm.tax.replace(/[$,]/g, ''));
    const res = await receiptMutations.update(drawerReceiptId, {
      vendorName: drawerForm.vendor,
      receiptDate: drawerForm.date,
      ...(Number.isNaN(total) ? {} : { total }),
      ...(Number.isNaN(tax) ? {} : { taxAmount: tax }),
      categoryAccountId: drawerForm.category || null,
    });
    if (res.ok) void refreshReceipts();
    else toast(res.error || 'Fields could not be saved');
  };

  const handleCreateExpense = async () => {
    if (!drawerReceiptId) return;
    const total = parseFloat(drawerForm.amount.replace(/[$,]/g, ''));
    const tax = parseFloat(drawerForm.tax.replace(/[$,]/g, ''));
    if (!drawerForm.category) {
      toast('Pick a category first');
      return;
    }
    if (!drawerForm.account) {
      toast('Pick a payment account first');
      return;
    }
    if (Number.isNaN(total) || total <= 0) {
      toast('Enter the receipt total first');
      return;
    }
    const res = await receiptMutations.createExpense(drawerReceiptId, {
      categoryAccountId: drawerForm.category,
      bankAccountId: drawerForm.account,
      vendorName: drawerForm.vendor,
      date: drawerForm.date,
      total,
      taxAmount: Number.isNaN(tax) ? 0 : tax,
    });
    if (res.ok) {
      toast('Expense created from receipt');
      await refreshReceipts();
      closeReceipt();
    } else {
      toast(res.error || 'Expense could not be created');
    }
  };

  const openMatchMenu = async (receiptId: string, anchor: DOMRect) => {
    setMenuReceiptId(receiptId);
    setMatchCandidates([]);
    setMatchMenu({ open: true, top: anchor.bottom + 4, left: Math.min(anchor.left, window.innerWidth - 360) });
    const res = await fetchReceiptMatchCandidates(receiptId);
    if (res.ok && res.data) setMatchCandidates(res.data);
  };

  const handleMatchBtn = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    setCatPicker((m) => ({ ...m, open: false }));
    setRowMenu((m) => ({ ...m, open: false }));
    if (drawerReceiptId) void openMatchMenu(drawerReceiptId, e.currentTarget.getBoundingClientRect());
  };

  /* ────────── Intake: dropped/picked files become real
       acct_document_inbox rows (status 'uploaded'). Extraction is
       the platform's job — the row shows 'Awaiting extraction'
       until acct_receipt_extractions lands; nothing is invented. ── */
  const addIntakeRow = async (file: File, source: 'upload' | 'photo') => {
    const tempId = `intake-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const processingRow: ReceiptRow = {
      receiptId: tempId,
      status: 'review',
      vendor: '',
      amount: '',
      tax: '',
      date: new Date().toLocaleDateString('en-US'),
      account: '',
      category: '',
      chipCls: 'cat-chip uncat',
      chipIcon: 'error',
      chipLabel: 'Awaiting extraction',
      action: 'review',
      processing: true,
      fileName: file.name,
      checked: false,
      hidden: false,
      dropped: true,
      dto: null,
    };
    setIntakeRows((rs) => [processingRow, ...rs]);
    const sha256 = await sha256OfFile(file);
    const res = await receiptMutations.intake({ fileName: file.name, sha256, source });
    setIntakeRows((rs) => rs.filter((r) => r.receiptId !== tempId));
    if (res.ok) {
      toast(`Receipt received — ${file.name} is awaiting extraction`);
      await refreshReceipts();
    } else {
      toast(res.error || `Could not receive ${file.name}`);
    }
  };

  const handleFiles = (fileList: FileList | null, source: 'upload' | 'photo' = 'upload') => {
    const files = Array.from(fileList || []);
    files.forEach((file) => void addIntakeRow(file, source));
  };

  const triggerUpload = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (uploadInputRef.current) uploadInputRef.current.click();
  };

  const triggerSnap = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (snapInputRef.current) snapInputRef.current.click();
  };

  /* ────────── Forwarding copy ────────── */
  const handleCopyFwd = async () => {
    const val = FWD_ADDRESS;
    try {
      await navigator.clipboard.writeText(val);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = val;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    if (copyTimer.current !== null) window.clearTimeout(copyTimer.current);
    setCopyConfirm(true);
    copyTimer.current = window.setTimeout(() => setCopyConfirm(false), 1800);
  };

  /* ────────── View tabs (derived filtering in visibleRows) ────────── */
  const handleViewTab = (st: ViewTab) => setViewTab(st);

  /* ────────── Row interactions ────────── */
  const handleRowClick = (e: React.MouseEvent<HTMLTableRowElement>, row: ReceiptRow) => {
    if ((e.target as HTMLElement).closest('input,button,[data-cat-picker],[data-row-menu]')) return;
    openReceiptRow(row);
  };

  const toggleRowCheck = (receiptId: string) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(receiptId)) next.delete(receiptId);
      else next.add(receiptId);
      return next;
    });
  };

  const handleCheckAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCheckAll(e.target.checked);
    setCheckedIds(e.target.checked ? new Set(rows.filter((r) => !r.processing).map((r) => r.receiptId)) : new Set());
  };

  /* ────────── Bulk bar — every action runs against the API per row ────────── */
  const handleBulk = async (act: BulkAction) => {
    if (act === 'close') {
      setCheckedIds(new Set());
      setCheckAll(false);
      return;
    }
    const checked = rows.filter((r) => r.checked && r.dto);
    if (act === 'categorize') {
      toast('Categories are set per receipt — use the category chip on a row');
      return;
    }
    if (act === 'attach') {
      toast('Attach each receipt from its Match menu');
      return;
    }
    if (act === 'create') {
      let created = 0;
      let skipped = 0;
      for (const r of checked) {
        const dto = r.dto!;
        const bankAccountId = dto.paymentAccountId || bankAccounts[0]?.id;
        if (!dto.categoryAccountId || dto.amount == null || !bankAccountId) {
          skipped += 1;
          continue;
        }
        const res = await receiptMutations.createExpense(r.receiptId, {
          categoryAccountId: dto.categoryAccountId,
          bankAccountId,
          vendorName: dto.vendorName || undefined,
          date: dto.date,
          total: dto.amount,
          taxAmount: dto.taxAmount || 0,
        });
        if (res.ok) created += 1;
        else skipped += 1;
      }
      setCheckedIds(new Set());
      setCheckAll(false);
      await refreshReceipts();
      toast(`Created ${created} expense${created === 1 ? '' : 's'}${skipped ? ` · ${skipped} skipped (needs category/total)` : ''}`);
      return;
    }
    if (act === 'delete') {
      let deleted = 0;
      for (const r of checked) {
        const res = await receiptMutations.remove(r.receiptId);
        if (res.ok) deleted += 1;
      }
      setCheckedIds(new Set());
      setCheckAll(false);
      await refreshReceipts();
      toast(`Deleted ${deleted} receipt${deleted === 1 ? '' : 's'}`);
    }
  };

  /* ────────── Category picker ────────── */
  const handleChipClick = (e: React.MouseEvent<HTMLButtonElement>, receiptId: string) => {
    e.stopPropagation();
    closeAllMenus();
    setPickerReceiptId(receiptId);
    const r = e.currentTarget.getBoundingClientRect();
    setCatPicker({ open: true, top: r.bottom + 4, left: Math.min(r.left, window.innerWidth - 300) });
  };

  const pickCategory = async (accountId: string) => {
    setCatPicker((m) => ({ ...m, open: false }));
    if (pickerReceiptId === null) return;
    const res = await receiptMutations.update(pickerReceiptId, { categoryAccountId: accountId });
    if (res.ok) {
      toast('Category saved');
      await refreshReceipts();
    } else toast(res.error || 'Category could not be saved');
  };

  /* ────────── Row ⋯ menu ────────── */
  const handleRowMenuBtn = (e: React.MouseEvent<HTMLButtonElement>, receiptId: string) => {
    e.stopPropagation();
    closeAllMenus();
    setMenuReceiptId(receiptId);
    const r = e.currentTarget.getBoundingClientRect();
    setRowMenu({ open: true, top: r.bottom + 4, left: Math.min(r.right - 250, window.innerWidth - 270) });
  };

  const handleRowMenuAction = async (e: React.MouseEvent<HTMLButtonElement>, action: RowMenuAction) => {
    e.stopPropagation();
    const id = menuReceiptId;
    setRowMenu((m) => ({ ...m, open: false }));
    if (id === null) return;
    const row = rows.find((r) => r.receiptId === id);
    const dto = row?.dto;
    switch (action) {
      case 'view':
      case 'edit': {
        if (row) openReceiptRow(row);
        break;
      }
      case 'download':
        toast(dto?.hasAttachment ? 'Original files are served by the platform file service, not this build' : 'No stored original for this intake');
        break;
      case 'create-expense': {
        if (!dto) break;
        const bankAccountId = dto.paymentAccountId || bankAccounts[0]?.id;
        if (!dto.categoryAccountId || dto.amount == null) {
          if (row) openReceiptRow(row);
          toast('Pick a category and total in the drawer first');
          break;
        }
        if (!bankAccountId) {
          toast('No bank account exists to pay from');
          break;
        }
        const res = await receiptMutations.createExpense(id, {
          categoryAccountId: dto.categoryAccountId,
          bankAccountId,
          vendorName: dto.vendorName || undefined,
          date: dto.date,
          total: dto.amount,
          taxAmount: dto.taxAmount || 0,
        });
        if (res.ok) {
          toast('Expense created from receipt');
          await refreshReceipts();
        } else toast(res.error || 'Expense could not be created');
        break;
      }
      case 'create-bill': {
        if (!dto) break;
        if (!dto.vendorName || dto.amount == null) {
          if (row) openReceiptRow(row);
          toast('Set the vendor and total in the drawer first');
          break;
        }
        const res = await receiptMutations.createBill(id, {
          vendorName: dto.vendorName,
          date: dto.date,
          total: dto.amount,
          taxAmount: dto.taxAmount || 0,
        });
        if (res.ok) {
          toast('Bill created from receipt');
          await refreshReceipts();
        } else toast(res.error || 'Bill could not be created');
        break;
      }
      case 'attach':
        toast('Use the Match button to attach this receipt to a bank transaction');
        break;
      case 'match': {
        const r = e.currentTarget.getBoundingClientRect();
        void openMatchMenu(id, new DOMRect(r.left - 100, r.bottom, r.width, r.height));
        break;
      }
      case 'mark-reviewed': {
        const res = await receiptMutations.update(id, { status: 'reviewed' });
        if (res.ok) {
          toast('Marked as reviewed');
          await refreshReceipts();
        } else toast(res.error || 'Could not mark reviewed');
        break;
      }
      case 'unmark-reviewed': {
        const res = await receiptMutations.update(id, { status: 'review' });
        if (res.ok) {
          toast('Moved back to review');
          await refreshReceipts();
        } else toast(res.error || 'Could not return to review');
        break;
      }
      case 'delete': {
        const res = await receiptMutations.remove(id);
        if (res.ok) {
          toast('Receipt deleted');
          await refreshReceipts();
        } else toast(res.error || 'Receipt could not be deleted');
        break;
      }
    }
  };

  /* ────────── Match menu selection ────────── */
  const handleMatchSelect = async (candidate: ReceiptMatchCandidate) => {
    setMatchMenu((m) => ({ ...m, open: false }));
    if (menuReceiptId === null) return;
    const res = await receiptMutations.match(menuReceiptId, candidate.bankTransactionId);
    if (res.ok) {
      toast(`Receipt matched to "${candidate.description || 'bank transaction'}"`);
      await refreshReceipts();
      closeReceipt();
    } else toast(res.error || 'Match failed');
  };

  /* ═══════════════ render ═══════════════ */

  return (
    <div className="receipts-page bg-background font-sans text-body-md text-on-surface antialiased">

      {/* Context header */}
      <div className="h-[52px] px-6 flex items-center justify-between bg-white border-b border-surface-dim">
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-[20px] text-on-surface-variant">account_balance</span>
          <span className="text-label-md font-semibold">Finance</span>
          <span className="text-outline">/</span>
          <span className="text-label-md">Accounting</span>
          <span className="text-outline">/</span>
          <span className="text-label-md text-primary font-semibold">Receipts</span>
        </div>
      </div>

      <main className="px-6 pb-12">

        {/* Page header */}
        <div className="flex items-center justify-between gap-4 py-4">
          <div>
            <h1 className="text-headline-lg">Receipts</h1>
            <p className="text-body-sm text-on-surface-variant mt-0.5">Intake inbox — forward, drop, snap. Extracted fields auto-fill.</p>
          </div>
          <div className="flex items-center gap-2">
            <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low flex items-center gap-1" data-trigger-upload onClick={triggerUpload}>
              <span className="material-symbols-outlined text-[16px]">upload</span>Upload</button>
            <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low flex items-center gap-1" data-trigger-snap onClick={triggerSnap}>
              <span className="material-symbols-outlined text-[16px]">photo_camera</span>Snap photo</button>
          </div>
        </div>

        {/* Forwarding address + drop zone */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mb-5">
          <div className="xl:col-span-2">
            <div
              className={`drop-zone${dragOver ? ' dragover' : ''}`}
              id="drop-zone"
              data-drop-zone
              onDragEnter={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={(e) => { e.preventDefault(); setDragOver(false); }}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
              onClick={() => { if (uploadInputRef.current) uploadInputRef.current.click(); }}
            >
              <span className="material-symbols-outlined text-[40px] text-primary">cloud_upload</span>
              <div className="text-body-md font-semibold mt-2">Drop receipts here</div>
              <div className="text-[11px] text-on-surface-variant mt-1">PDF, JPG, PNG · up to 20 MB each · multiple files supported</div>
              <div className="flex items-center justify-center gap-2 mt-3">
                <button className="h-8 px-3 bg-primary text-white rounded text-label-sm font-semibold hover:bg-primary-container flex items-center gap-1" data-trigger-upload onClick={triggerUpload}>
                  <span className="material-symbols-outlined text-[14px]">upload_file</span>Choose files</button>
                <button className="h-8 px-3 border border-surface-dim rounded text-label-sm hover:bg-white flex items-center gap-1" data-trigger-snap onClick={triggerSnap}>
                  <span className="material-symbols-outlined text-[14px]">photo_camera</span>Snap</button>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-surface-dim p-4 flex flex-col">
            <div className="flex items-center gap-2 mb-2">
              <span className="material-symbols-outlined text-[18px] text-qb-blue">mail</span>
              <span className="text-label-sm text-on-surface-variant uppercase tracking-wider font-bold">Forward by email</span>
            </div>
            <p className="text-[11px] text-on-surface-variant mb-3">Send receipts to this address — they'll appear here for review.</p>
            <div className="flex items-center gap-1">
              <input id="fwd-address" readOnly className="flex-1 h-8 px-2.5 border border-surface-dim rounded text-body-sm font-mono bg-surface-container-low" value={FWD_ADDRESS} />
              <button id="copy-fwd" className="h-8 px-2.5 border border-surface-dim rounded text-label-sm font-semibold hover:bg-surface-container-low flex items-center gap-1" data-copy-fwd onClick={handleCopyFwd}>
                <span className="material-symbols-outlined text-[14px]">content_copy</span>Copy</button>
            </div>
            <div className={`mt-2 text-[11px] text-secondary flex items-center gap-1${copyConfirm ? '' : ' hidden-imp'}`} data-copy-confirm>
              <span className="material-symbols-outlined text-[14px]">check_circle</span>Copied to clipboard
            </div>
          </div>
        </div>

        {/* Table card */}
        <div className="bg-white rounded-xl shadow-sm border border-surface-dim overflow-hidden">

          {/* Tabs */}
          <div className="flex items-center gap-1 px-4 h-11 border-b border-surface-dim overflow-x-auto">
            <button className={`h-full px-3 text-label-md tab-underline${viewTab === 'review' ? ' active' : ''}`} data-viewtab="review" onClick={() => handleViewTab('review')}>
              For review <span className="ml-1 px-1.5 py-0.5 rounded-full bg-qb-blue text-white text-[10px] font-bold" data-tab-review>{reviewCount}</span></button>
            <button className={`h-full px-3 text-label-md tab-underline text-on-surface-variant${viewTab === 'reviewed' ? ' active' : ''}`} data-viewtab="reviewed" onClick={() => handleViewTab('reviewed')}>Reviewed</button>
            <button className={`h-full px-3 text-label-md tab-underline text-on-surface-variant${viewTab === 'all' ? ' active' : ''}`} data-viewtab="all" onClick={() => handleViewTab('all')}>All</button>
          </div>

          {/* Filter bar */}
          <div className="px-4 py-2 flex items-center gap-2 border-b border-surface-dim flex-wrap">
            <div className="relative flex items-center flex-1 max-w-sm min-w-[180px]">
              <span className="material-symbols-outlined absolute left-2 text-[15px] text-outline">search</span>
              <input className="w-full h-7 pl-7 pr-2 bg-surface-container-low border border-surface-dim rounded text-body-sm focus:outline-none focus:border-primary" placeholder="Filter by vendor, amount…" value={filterText} onChange={(e) => setFilterText(e.target.value)} />
            </div>
            <button className="h-7 px-2 border border-surface-dim rounded text-label-sm hover:bg-surface-container-low flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px]">calendar_today</span>Date range</button>
            <button className="h-7 px-2 border border-surface-dim rounded text-label-sm hover:bg-surface-container-low flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px]">bookmark</span>Saved views</button>
            <span className="ml-auto text-[11px] text-on-surface-variant" data-rc-count>{countText}</span>
          </div>

          {/* Bulk bar */}
          <div className={`bulk-bar${checkedCount > 0 ? ' show' : ''}`} data-bulk-bar>
            <span className="text-[12px] font-semibold" data-bulk-count>{checkedCount} selected</span>
            <span className="w-px h-4 bg-white/30"></span>
            <button data-bulk="categorize" onClick={() => handleBulk('categorize')}><span className="material-symbols-outlined text-[14px] align-middle mr-1">category</span>Categorize</button>
            <button data-bulk="attach" onClick={() => handleBulk('attach')}><span className="material-symbols-outlined text-[14px] align-middle mr-1">attach_file</span>Attach to bill</button>
            <button data-bulk="create" onClick={() => handleBulk('create')}><span className="material-symbols-outlined text-[14px] align-middle mr-1">receipt_long</span>Create expenses</button>
            <span className="w-px h-4 bg-white/30"></span>
            <button data-bulk="delete" onClick={() => handleBulk('delete')}><span className="material-symbols-outlined text-[14px] align-middle mr-1">delete</span>Delete</button>
            <button className="ml-auto" data-bulk="close" aria-label="Close" onClick={() => handleBulk('close')}><span className="material-symbols-outlined text-[16px]">close</span></button>
          </div>

          <table className="w-full text-left text-body-sm">
            <thead className="bg-surface-container-low text-label-sm text-on-surface-variant uppercase tracking-wider">
              <tr>
                <th className="w-8 px-3 py-2"><input type="checkbox" className="row-check" data-check-all checked={checkAll} onChange={handleCheckAll} /></th>
                <th className="px-3 py-2 w-12">Receipt</th>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Vendor</th>
                <th className="px-3 py-2">Payment account</th>
                <th className="px-3 py-2 text-right">Amount / Tax</th>
                <th className="px-3 py-2">Category</th>
                <th className="px-3 py-2">Action</th>
                <th className="w-8"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-dim" data-rc-tbody>
              {visibleRows.map((row) => {
                const rowCls = row.processing
                  ? 'rc-row processing-row cursor-pointer'
                  : row.dropped
                    ? 'rc-row cursor-pointer'
                    : 'hover:bg-surface-container-low cursor-pointer rc-row';
                return (
                  <tr
                    key={row.receiptId}
                    className={rowCls}
                    data-status={row.status}
                    data-vendor={row.vendor}
                    data-amount={row.amount}
                    data-tax={row.tax}
                    data-date={row.date}
                    data-account={row.account}
                    data-category={row.category}
                    data-receipt-id={row.receiptId}
                    onClick={row.processing ? undefined : (e) => handleRowClick(e, row)}
                  >
                    <td className="px-3 py-2"><input type="checkbox" className="row-check rc-check" disabled={row.processing} checked={row.checked} onChange={() => toggleRowCheck(row.receiptId)} /></td>
                    <td className="px-3 py-2"><div className="receipt-thumb">{row.processing ? <div className="spinner"></div> : null}</div></td>
                    <td className="px-3 py-2">{row.date}</td>
                    <td className={row.processing ? 'px-3 py-2 font-medium italic text-on-surface-variant' : 'px-3 py-2 font-medium'}>{row.processing ? 'Receiving…' : row.vendor}</td>
                    <td className="px-3 py-2 text-on-surface-variant">{row.processing ? row.fileName : row.account}</td>
                    <td className={row.processing ? 'px-3 py-2 text-right tabular-nums text-on-surface-variant' : 'px-3 py-2 text-right tabular-nums'}>
                      {row.processing ? '…' : (
                        <>
                          <div>{row.amount}</div>
                          <div className="text-[10px] text-on-surface-variant">Tax {row.tax}</div>
                        </>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {row.processing ? (
                        <span className="text-[11px] text-on-surface-variant flex items-center gap-1"><div className="spinner" style={{ width: '12px', height: '12px' }}></div>Processing</span>
                      ) : (
                        <button className={row.chipCls} data-cat-picker onClick={(e) => handleChipClick(e, row.receiptId)}>
                          {row.chipIcon ? <span className="material-symbols-outlined text-[12px]">{row.chipIcon}</span> : null}{row.chipLabel}
                        </button>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {row.processing ? (
                        <span className="text-[11px] text-on-surface-variant">—</span>
                      ) : row.action === 'review' ? (
                        <button className="h-6 px-2 text-[11px] font-semibold text-primary border border-surface-dim rounded hover:bg-surface-container-low" data-action="review" onClick={(e) => { e.stopPropagation(); openReceiptRow(row); }}>Review</button>
                      ) : (
                        <span className="text-[11px] text-secondary flex items-center gap-1"><span className="material-symbols-outlined text-[14px]">check</span>{row.action === 'expense-created' ? 'Expense created' : row.action === 'matched' ? 'Matched' : 'Reviewed'}</span>
                      )}
                    </td>
                    <td className="px-2 py-2 text-right">
                      <button
                        className="w-6 h-6 rounded hover:bg-surface-container flex items-center justify-center"
                        data-row-menu
                        aria-label="Receipt actions"
                        disabled={row.processing}
                        onClick={row.processing ? undefined : (e) => handleRowMenuBtn(e, row.receiptId)}
                      >
                        <span className="material-symbols-outlined text-[16px] text-on-surface-variant">more_horiz</span>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

      </main>

      {/* Hidden inputs (real file pickers) */}
      <input type="file" id="file-input-upload" accept="image/*,application/pdf" multiple className="hidden-imp" ref={uploadInputRef} onChange={(e) => handleFiles(e.target.files)} />
      <input type="file" id="file-input-snap" accept="image/*" capture="environment" className="hidden-imp" ref={snapInputRef} onChange={(e) => handleFiles(e.target.files, 'photo')} />

      {/* ═══════════ RECEIPT PREVIEW DRAWER ═══════════ */}
      <div className={`drawer-scrim${drawerOpen ? ' open' : ''}`} id="receipt-scrim" onClick={closeReceipt}></div>
      <div className={`drawer${drawerOpen ? ' open' : ''}`} id="receipt-drawer">
        <div className="flex items-center justify-between px-5 h-14 border-b border-surface-dim shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="material-symbols-outlined text-[20px] text-primary">receipt_long</span>
            <div className="min-w-0">
              <div className="text-headline-sm truncate" data-receipt-title>{drawerSnap ? drawerSnap.title : 'Receipt — Vendor'}</div>
              <div className="text-[11px] text-on-surface-variant" data-receipt-sub>{drawerSnap ? drawerSnap.sub : 'R-0000 · For review'}</div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button className="w-8 h-8 rounded hover:bg-surface-container flex items-center justify-center" title="Download original" data-dl-orig aria-label="Download original" onClick={() => toast('Original files are served by the platform file service, not this build')}>
              <span className="material-symbols-outlined text-[18px]">download</span></button>
            <button className="w-8 h-8 rounded hover:bg-surface-container flex items-center justify-center" data-close-receipt aria-label="Close" onClick={closeReceipt}>
              <span className="material-symbols-outlined text-[18px]">close</span></button>
          </div>
        </div>

        <div className="drawer-split">
          {/* Left: image viewer */}
          <div className="drawer-image">
            <div className="drawer-image-viewer" data-receipt-image>
              {/* Intake summary — real fields only. The original file is
                  held by the platform file service; line-item detail
                  appears when extraction lands in acct_receipt_extractions. */}
              {drawerSnap && (() => {
                const dto = rows.find((r) => r.receiptId === drawerReceiptId)?.dto ?? null;
                const subtotal = (Number(drawerSnap.amt.replace(/[$,]/g, '')) || 0) - (Number(drawerSnap.tax.replace(/[$,]/g, '')) || 0);
                return (
                  <div className="fake-receipt">
                    <div style={{ textAlign: 'center', fontWeight: 700, fontSize: '13px', marginBottom: '6px' }}>{drawerSnap.vendor.toUpperCase()}</div>
                    <div style={{ textAlign: 'center', fontSize: '10px', color: '#5a6355' }}>{dto?.fileName || 'Intake'}</div>
                    <div style={{ height: '1px', background: '#1a1c1e', margin: '8px 0' }}></div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Date</span><span>{drawerSnap.date}</span></div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Source</span><span>{dto?.source || 'upload'}</span></div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Status</span><span>{dto?.rawStatus || '—'}</span></div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Extraction</span><span>{dto?.extractionStatus || 'awaiting'}</span></div>
                    <div style={{ height: '1px', background: '#dad9dd', margin: '8px 0' }}></div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Subtotal</span><span>${subtotal.toFixed(2)}</span></div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Tax</span><span>${drawerSnap.tax || '0.00'}</span></div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, borderTop: '1px solid #1a1c1e', paddingTop: '4px', marginTop: '4px' }}><span>TOTAL</span><span>${drawerSnap.amt}</span></div>
                  </div>
                );
              })()}
            </div>
            <div className="border-t border-surface-dim p-2 flex items-center justify-center gap-2 bg-white">
              <button className="h-7 px-2 border border-surface-dim rounded text-label-sm hover:bg-surface-container-low flex items-center gap-1" aria-label="Zoom in">
                <span className="material-symbols-outlined text-[14px]">zoom_in</span></button>
              <button className="h-7 px-2 border border-surface-dim rounded text-label-sm hover:bg-surface-container-low flex items-center gap-1" aria-label="Zoom out">
                <span className="material-symbols-outlined text-[14px]">zoom_out</span></button>
              <button className="h-7 px-2 border border-surface-dim rounded text-label-sm hover:bg-surface-container-low flex items-center gap-1" aria-label="Rotate">
                <span className="material-symbols-outlined text-[14px]">rotate_right</span></button>
              <button className="h-7 px-2 border border-surface-dim rounded text-label-sm hover:bg-surface-container-low flex items-center gap-1">
                <span className="material-symbols-outlined text-[14px]">open_in_new</span>Open</button>
            </div>
          </div>
          {/* Right: extracted fields */}
          <div className="drawer-fields">
            <div className="drawer-fields-body">
              <div className="text-label-sm text-on-surface-variant uppercase tracking-wider font-bold mb-3">Extracted fields</div>
              <div className="field-row">
                <div className="field-label">Vendor</div>
                <div className="field-value"><input data-field="vendor" value={drawerForm.vendor} onChange={(e) => setDrawerForm((f) => ({ ...f, vendor: e.target.value }))} onBlur={() => void persistDrawerFields()} /></div>
              </div>
              <div className="field-row">
                <div className="field-label">Date</div>
                <div className="field-value"><input data-field="date" type="date" value={drawerForm.date} onChange={(e) => setDrawerForm((f) => ({ ...f, date: e.target.value }))} onBlur={() => void persistDrawerFields()} /></div>
              </div>
              <div className="field-row">
                <div className="field-label">Amount</div>
                <div className="field-value"><input data-field="amount" value={drawerForm.amount} onChange={(e) => setDrawerForm((f) => ({ ...f, amount: e.target.value }))} onBlur={() => void persistDrawerFields()} /></div>
              </div>
              <div className="field-row">
                <div className="field-label">Tax</div>
                <div className="field-value"><input data-field="tax" value={drawerForm.tax} onChange={(e) => setDrawerForm((f) => ({ ...f, tax: e.target.value }))} onBlur={() => void persistDrawerFields()} /></div>
              </div>
              <div className="field-row">
                <div className="field-label">Payment account</div>
                <div className="field-value">
                  <select data-field="account" value={drawerForm.account} onChange={(e) => setDrawerForm((f) => ({ ...f, account: e.target.value }))}>
                    <option value="">— Select account —</option>
                    {bankAccounts.map((a) => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="field-row">
                <div className="field-label">Category</div>
                <div className="field-value">
                  <select data-field="category" value={drawerForm.category} onChange={(e) => setDrawerForm((f) => ({ ...f, category: e.target.value }))} onBlur={() => void persistDrawerFields()}>
                    <option value="">— Select category —</option>
                    {coaAccounts.map((a) => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="field-row">
                <div className="field-label">Notes</div>
                <div className="field-value"><input data-field="notes" placeholder="Add a note…" value={drawerForm.notes} onChange={(e) => setDrawerForm((f) => ({ ...f, notes: e.target.value }))} /></div>
              </div>
            </div>
            <div className="border-t border-surface-dim p-3 flex items-center justify-between shrink-0">
              <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low" data-close-receipt onClick={closeReceipt}>Cancel</button>
              <div className="flex items-center gap-2">
                <button className="h-8 px-3 border border-surface-dim rounded text-body-md font-semibold hover:bg-surface-container-low flex items-center gap-1" data-match-receipt onClick={handleMatchBtn}>
                  <span className="material-symbols-outlined text-[16px]">link</span>Match to transaction</button>
                <div className="flex split-btn">
                  <button className="h-8 px-3 bg-primary text-white text-body-md font-semibold hover:bg-primary-container split-btn-main" data-create-expense onClick={handleCreateExpense}>
                    Create expense</button>
                  <button className="h-8 px-1.5 bg-primary text-white hover:bg-primary-container split-btn-arrow" aria-label="More create options">
                    <span className="material-symbols-outlined text-[16px]">expand_more</span></button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ═══════════ CATEGORY PICKER — real chart of accounts ═══════════ */}
      <div id="cat-picker" className={`cat-picker${catPicker.open ? ' open' : ''}`} style={{ top: catPicker.top, left: catPicker.left }}>
        <input placeholder="Search categories…" value={catSearch} onChange={(e) => setCatSearch(e.target.value)} />
        <div className="recent">Suggested</div>
        {suggestedCats.map((a, i) => (
          <div key={a.id} className="cat-opt" data-pick={a.id} onClick={() => void pickCategory(a.id)}><span className="dot" style={{ background: CAT_DOTS[i % CAT_DOTS.length] }}></span>{a.name}</div>
        ))}
        <div className="cat-sep"></div>
        <div className="recent">All categories</div>
        {otherCats.map((a) => (
          <div key={a.id} className="cat-opt" data-pick={a.id} onClick={() => void pickCategory(a.id)}><span className="dot" style={{ background: '#dad9dd' }}></span>{a.name}</div>
        ))}
        {suggestedCats.length === 0 && otherCats.length === 0 && (
          <div className="cat-opt" style={{ cursor: 'default' }}>No categories match</div>
        )}
      </div>

      {/* ═══════════ ROW ⋯ MENU — fully defined ═══════════ */}
      <div id="row-menu" className={`row-menu${rowMenu.open ? ' open' : ''}`} style={{ top: rowMenu.top, left: rowMenu.left }}>
        <div className="menu-header">This receipt</div>
        <button data-action="view" onClick={(e) => handleRowMenuAction(e, 'view')}><span className="material-symbols-outlined">open_in_new</span>View receipt</button>
        <button data-action="edit" onClick={(e) => handleRowMenuAction(e, 'edit')}><span className="material-symbols-outlined">edit</span>Edit extracted fields</button>
        <button data-action="download" onClick={(e) => handleRowMenuAction(e, 'download')}><span className="material-symbols-outlined">download</span>Download original</button>
        <div className="sep"></div>
        <div className="menu-header">Create from receipt</div>
        <button data-action="create-expense" onClick={(e) => handleRowMenuAction(e, 'create-expense')}><span className="material-symbols-outlined">credit_card</span>Create expense</button>
        <button data-action="create-bill" onClick={(e) => handleRowMenuAction(e, 'create-bill')}><span className="material-symbols-outlined">description</span>Create bill</button>
        <button data-action="attach" onClick={(e) => handleRowMenuAction(e, 'attach')}><span className="material-symbols-outlined">attach_file</span>Attach to existing…</button>
        <div className="sep"></div>
        <div className="menu-header">Match</div>
        <button data-action="match" onClick={(e) => handleRowMenuAction(e, 'match')}><span className="material-symbols-outlined">link</span>Match to transaction…</button>
        <div className="sep"></div>
        <div className="menu-header">State</div>
        <button data-action="mark-reviewed" style={{ display: menuReviewed ? 'none' : undefined }} onClick={(e) => handleRowMenuAction(e, 'mark-reviewed')}><span className="material-symbols-outlined">check_circle</span>Mark as reviewed</button>
        <button data-action="unmark-reviewed" data-hide="true" style={{ display: menuReviewed ? undefined : 'none' }} onClick={(e) => handleRowMenuAction(e, 'unmark-reviewed')}><span className="material-symbols-outlined">restart_alt</span>Move back to review</button>
        <button className="danger" data-action="delete" onClick={(e) => handleRowMenuAction(e, 'delete')}><span className="material-symbols-outlined">delete</span>Delete receipt</button>
      </div>

      {/* ═══════════ MATCH MENU — real candidates from acct_match_receipts ═══════════ */}
      <div id="match-menu" className={`match-menu${matchMenu.open ? ' open' : ''}`} style={{ top: matchMenu.top, left: matchMenu.left }}>
        <div className="mm-h">Unmatched bank transactions</div>
        {matchCandidates.map((c) => (
          <div key={c.bankTransactionId} className="mm-item" data-match-kind="bank" data-match-name={c.description} onClick={() => void handleMatchSelect(c)}>
            <span className="material-symbols-outlined text-[16px] text-error mt-0.5">account_balance</span>
            <div className="min-w-0 flex-1">
              <div className="text-body-sm font-medium truncate">{c.description || 'Bank transaction'}</div>
              <div className="mm-date">{fmtUsDate(c.date)}{c.bankAccountName ? ` · ${c.bankAccountName}` : ''}</div>
            </div>
            <span className="mm-amt text-error">{c.amount < 0 ? '−' : ''}${Math.abs(c.amount).toFixed(2)}</span>
          </div>
        ))}
        {matchCandidates.length === 0 && (
          <div className="mm-item" style={{ cursor: 'default' }}>
            <div className="min-w-0 flex-1">
              <div className="text-body-sm text-on-surface-variant">No matching bank transactions found</div>
              <div className="mm-date">Candidates match on amount within ±10 days</div>
            </div>
          </div>
        )}
      </div>

      <div id="toast" className={toastMsg ? 'toast show' : 'toast'}>{toastMsg}</div>
    </div>
  );
}
