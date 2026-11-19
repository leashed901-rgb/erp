'use client';

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { DomainKey } from '@/data/shellData';
import {
  useReceipts,
  useBankAccounts,
  useChartOfAccounts,
  receiptMutations,
  fetchReceiptMatchCandidates,
  fetchOpenBills,
  type OpenBillDto,
} from '@/hooks/useAccountingApi';
import type { ReceiptDto, ReceiptMatchCandidate } from '@/lib/acctTypes';
import styles from './ReceiptsScreen.module.css';

export interface ReceiptItem {
  id: string;
  no?: string;
  vendor: string;
  amount: string;
  tax: string;
  date: string;
  account: string;
  category: string;
  status: 'review' | 'reviewed';
  actionLabel?: string;
  isProcessing?: boolean;
  notes?: string;
  dto: ReceiptDto | null;
}

/* ── API ↔ screen adapters ──────────────────────────────────────────
   Receipts are acct_document_inbox rows (+ acct_receipt_extractions).
   Extraction runs on the platform — until it lands, a row honestly
   shows "Awaiting extraction" instead of an invented vendor. */

/* ISO (YYYY-MM-DD) → MM/DD/YYYY for display; blank → em dash */
const fmtDate = (iso: string) => {
  if (!iso) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[2]}/${m[3]}/${m[1]}` : iso;
};

const parseMoney = (val: string) => parseFloat(String(val).replace(/[$,\s]/g, '')) || 0;

const money = (n: number | null) => (n == null ? '—' : `$${n.toFixed(2)}`);

function toReceiptItem(dto: ReceiptDto): ReceiptItem {
  return {
    id: dto.id,
    no: dto.ref,
    vendor: dto.vendorName || 'Awaiting extraction',
    amount: money(dto.amount),
    tax: money(dto.taxAmount),
    date: fmtDate(dto.date),
    account: dto.paymentAccountLabel || dto.fileName || '',
    category: dto.categoryLabel || '',
    status: dto.status,
    actionLabel: dto.createdSpendId
      ? 'Expense created'
      : dto.createdBillId
        ? 'Bill created'
        : dto.matchedBankTransactionId
          ? 'Matched'
          : undefined,
    notes: dto.notes || undefined,
    dto,
  };
}

/* sha256 of the picked file, computed in the browser for the intake
   row; falls back to a local fingerprint where SubtleCrypto is absent */
async function fileFingerprint(file: File): Promise<string> {
  try {
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      const buf = await file.arrayBuffer();
      const digest = await crypto.subtle.digest('SHA-256', buf);
      return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
    }
  } catch {
    /* fall through */
  }
  return `local-${file.name}-${file.size}-${file.lastModified}`;
}

export interface ReceiptsScreenProps {
  onNavigate: (domain: DomainKey, screenId: string) => void;
  onCreateExpense?: () => void;
  onOpenPeek?: (title: string, details: Record<string, string | number>) => void;
  onToast?: (msg: string) => void;
}

export default function ReceiptsScreen({
  onToast,
}: ReceiptsScreenProps) {
  const { receipts: receiptDtos, refresh: refreshReceipts } = useReceipts();
  const { bankAccounts } = useBankAccounts();
  const { accounts: coaAccounts } = useChartOfAccounts();
  const [activeTab, setActiveTab] = useState<'review' | 'reviewed' | 'all'>('review');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isDragover, setIsDragover] = useState(false);
  const [copyConfirmed, setCopyConfirmed] = useState(false);

  // Ephemeral rows only while the intake POST itself is in flight
  const [processingRows, setProcessingRows] = useState<ReceiptItem[]>([]);

  // Drawer state (account/category hold real ids for the API)
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [activeReceipt, setActiveReceipt] = useState<ReceiptItem | null>(null);
  const [drawerForm, setDrawerForm] = useState({
    vendor: '',
    date: '',
    amount: '',
    tax: '',
    account: '',
    category: '',
    notes: '',
  });

  // Floating menus state
  const [catPickerOpen, setCatPickerOpen] = useState(false);
  const [catPickerPos, setCatPickerPos] = useState({ top: 0, left: 0 });
  const [catPickerTargetId, setCatPickerTargetId] = useState<string | null>(null);

  const [rowMenuOpen, setRowMenuOpen] = useState(false);
  const [rowMenuPos, setRowMenuPos] = useState({ top: 0, left: 0 });
  const [rowMenuTargetId, setRowMenuTargetId] = useState<string | null>(null);

  const [matchMenuOpen, setMatchMenuOpen] = useState(false);
  const [matchMenuPos, setMatchMenuPos] = useState({ top: 0, left: 0 });
  const [matchTargetId, setMatchTargetId] = useState<string | null>(null);
  const [matchCandidates, setMatchCandidates] = useState<ReceiptMatchCandidate[]>([]);
  const [openBillsList, setOpenBillsList] = useState<OpenBillDto[]>([]);
  const [catSearch, setCatSearch] = useState('');
  const [bulkCatMode, setBulkCatMode] = useState(false);

  // Toast
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const uploadInputRef = useRef<HTMLInputElement>(null);
  const snapInputRef = useRef<HTMLInputElement>(null);

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
      setCatPickerOpen(false);
      setRowMenuOpen(false);
      setMatchMenuOpen(false);
    };
    document.addEventListener('click', handleOutside);
    return () => document.removeEventListener('click', handleOutside);
  }, []);

  // Copy forwarding address
  const handleCopyForwarding = async () => {
    const val = 'receipts@unsaid.app';
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(val);
    }
    setCopyConfirmed(true);
    showToast('Forwarding address copied to clipboard');
    setTimeout(() => setCopyConfirmed(false), 2000);
  };

  // Open Receipt Drawer — form seeds from the receipt's real fields
  const handleOpenReceipt = (rec: ReceiptItem) => {
    setActiveReceipt(rec);
    setDrawerForm({
      vendor: rec.dto?.vendorName || '',
      date: rec.dto?.date || '',
      amount: rec.dto?.amount != null ? rec.dto.amount.toFixed(2) : '',
      tax: rec.dto?.taxAmount != null ? rec.dto.taxAmount.toFixed(2) : '',
      account: rec.dto?.paymentAccountId || bankAccounts[0]?.id || '',
      category: rec.dto?.categoryAccountId || '',
      notes: rec.dto?.notes || '',
    });
    setIsDrawerOpen(true);
  };

  const handleCloseReceipt = () => {
    setIsDrawerOpen(false);
    setActiveReceipt(null);
  };

  /* Drawer field edits persist on blur (extraction upsert server-side) */
  const persistDrawerFields = async () => {
    if (!activeReceipt) return;
    const patch: Parameters<typeof receiptMutations.update>[1] = {};
    const dto = activeReceipt.dto;
    if (drawerForm.vendor !== (dto?.vendorName || '')) patch.vendorName = drawerForm.vendor;
    if (drawerForm.date && drawerForm.date !== dto?.date) patch.receiptDate = drawerForm.date;
    const total = parseMoney(drawerForm.amount);
    if (drawerForm.amount && total !== dto?.amount) patch.total = total;
    const tax = parseMoney(drawerForm.tax);
    if (drawerForm.tax && tax !== dto?.taxAmount) patch.taxAmount = tax;
    if (drawerForm.category !== (dto?.categoryAccountId || '')) patch.categoryAccountId = drawerForm.category || null;
    if (drawerForm.notes !== (dto?.notes || '')) patch.notes = drawerForm.notes || null;
    if (Object.keys(patch).length === 0) return;
    const res = await receiptMutations.update(activeReceipt.id, patch);
    if (res.ok) await refreshReceipts();
    else showToast(res.error || 'Changes could not be saved');
  };

  /* Rows: in-flight intake rows first, then the real inbox */
  const receipts = useMemo(
    () => [...processingRows, ...receiptDtos.map(toReceiptItem)],
    [processingRows, receiptDtos],
  );

  // Filtered receipts
  const filteredReceipts = useMemo(() => {
    return receipts.filter((r) => {
      if (activeTab === 'review' && r.status !== 'review') return false;
      if (activeTab === 'reviewed' && r.status !== 'reviewed') return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const match =
          r.vendor.toLowerCase().includes(q) ||
          r.amount.toLowerCase().includes(q) ||
          r.account.toLowerCase().includes(q) ||
          r.category.toLowerCase().includes(q) ||
          (r.notes && r.notes.toLowerCase().includes(q));
        if (!match) return false;
      }
      return true;
    });
  }, [receipts, activeTab, searchQuery]);

  const reviewCount = useMemo(() => {
    return receipts.filter((r) => r.status === 'review').length;
  }, [receipts]);

  // Bulk selection
  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedIds(new Set(filteredReceipts.map((r) => r.id)));
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

  /* Open the match menu for a receipt: real bank candidates from
     acct_match_receipts + the tenant's open bills */
  const openMatchMenu = async (receiptId: string, pos: { top: number; left: number }) => {
    setMatchTargetId(receiptId);
    setMatchMenuPos(pos);
    setMatchCandidates([]);
    setOpenBillsList([]);
    setMatchMenuOpen(true);
    const [candRes, billsRes] = await Promise.all([fetchReceiptMatchCandidates(receiptId), fetchOpenBills()]);
    if (candRes.ok && candRes.data) setMatchCandidates(candRes.data);
    if (billsRes.ok && billsRes.data) setOpenBillsList(billsRes.data.filter((b) => !b.inboxId || b.inboxId === receiptId));
  };

  // Bulk actions — real mutations with tallies
  const handleBulkAction = async (act: string, anchor?: { top: number; left: number }) => {
    if (act === 'close') {
      setSelectedIds(new Set());
      return;
    }
    const ids = [...selectedIds];
    const count = ids.length;
    if (act === 'delete') {
      let ok = 0;
      for (const id of ids) {
        const res = await receiptMutations.remove(id);
        if (res.ok) ok += 1;
      }
      showToast(`Deleted ${ok} of ${count} receipt${count !== 1 ? 's' : ''}`);
      setSelectedIds(new Set());
      await refreshReceipts();
      return;
    }
    if (act === 'create') {
      let ok = 0;
      let skipped = 0;
      for (const id of ids) {
        const dto = receiptDtos.find((r) => r.id === id);
        if (!dto || dto.createdSpendId || !dto.categoryAccountId || dto.amount == null) {
          skipped += 1;
          continue;
        }
        const bankAccountId = dto.paymentAccountId || bankAccounts[0]?.id;
        if (!bankAccountId) {
          skipped += 1;
          continue;
        }
        const res = await receiptMutations.createExpense(id, {
          categoryAccountId: dto.categoryAccountId,
          bankAccountId,
          total: dto.amount,
          taxAmount: dto.taxAmount ?? undefined,
        });
        if (res.ok) ok += 1;
        else skipped += 1;
      }
      showToast(
        `Created expenses for ${ok} receipt${ok !== 1 ? 's' : ''}${skipped ? ` · ${skipped} skipped (need category + amount first)` : ''}`,
      );
      setSelectedIds(new Set());
      await refreshReceipts();
      return;
    }
    if (act === 'categorize') {
      if (anchor) setCatPickerPos(anchor);
      setBulkCatMode(true);
      setCatPickerTargetId(null);
      setCatSearch('');
      setCatPickerOpen(true);
      return;
    }
    if (act === 'attach') {
      const first = ids[0];
      if (first && anchor) {
        setSelectedIds(new Set());
        await openMatchMenu(first, anchor);
      }
      return;
    }
    showToast(`${act} on ${count} receipt${count !== 1 ? 's' : ''}`);
  };

  /* Intake: POST the file's fingerprint — the row lands in
     acct_document_inbox as 'uploaded'; the platform extracts fields
     from there. No vendor or amount is invented client-side. */
  const processFiles = (fileList: FileList | null, source: 'upload' | 'photo' = 'upload') => {
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList);
    files.forEach((file) => {
      const tempId = `intake-${file.name}-${file.size}`;
      const tempRow: ReceiptItem = {
        id: tempId,
        no: file.name,
        vendor: 'Receiving…',
        amount: '…',
        tax: '…',
        date: fmtDate(new Date().toISOString().slice(0, 10)),
        account: file.name,
        category: '',
        status: 'review',
        isProcessing: true,
        dto: null,
      };
      setProcessingRows((prev) => [tempRow, ...prev]);
      void (async () => {
        const sha256 = await fileFingerprint(file);
        const res = await receiptMutations.intake({ fileName: file.name, sha256, source });
        setProcessingRows((prev) => prev.filter((r) => r.id !== tempId));
        if (res.ok) {
          showToast(`Receipt "${file.name}" received — awaiting extraction`);
          await refreshReceipts();
        } else showToast(res.error || `Could not receive "${file.name}"`);
      })();
    });
  };

  // Category picker selection — persists the intended category
  const handlePickCategory = async (accountId: string) => {
    setCatPickerOpen(false);
    const account = coaAccounts.find((a) => a.id === accountId);
    if (bulkCatMode) {
      setBulkCatMode(false);
      const ids = [...selectedIds];
      let ok = 0;
      for (const id of ids) {
        const res = await receiptMutations.update(id, { categoryAccountId: accountId });
        if (res.ok) ok += 1;
      }
      showToast(`Categorized ${ok} of ${ids.length} receipts as "${account?.name || 'category'}"`);
      setSelectedIds(new Set());
      await refreshReceipts();
      return;
    }
    if (!catPickerTargetId) return;
    const res = await receiptMutations.update(catPickerTargetId, { categoryAccountId: accountId });
    if (res.ok) {
      showToast(`Category updated to "${account?.name || 'category'}"`);
      await refreshReceipts();
    } else showToast(res.error || 'Category could not be saved');
  };

  // Match menu selections — bank candidate or open bill
  const handleSelectBankMatch = async (candidate: ReceiptMatchCandidate) => {
    if (!matchTargetId) return;
    const res = await receiptMutations.match(matchTargetId, candidate.bankTransactionId);
    setMatchMenuOpen(false);
    setRowMenuOpen(false);
    if (res.ok) {
      showToast(`Receipt matched to "${candidate.description}"`);
      setIsDrawerOpen(false);
      await refreshReceipts();
    } else showToast(res.error || 'Match failed');
  };

  const handleSelectBillAttach = async (bill: OpenBillDto) => {
    if (!matchTargetId) return;
    const res = await receiptMutations.attachBill(matchTargetId, bill.id);
    setMatchMenuOpen(false);
    setRowMenuOpen(false);
    if (res.ok) {
      showToast(`Receipt attached to bill ${bill.billNumber}`);
      setIsDrawerOpen(false);
      await refreshReceipts();
    } else showToast(res.error || 'Attach failed');
  };

  // Row menu actions
  const handleRowMenuAction = async (action: string) => {
    const rec = receipts.find((r) => r.id === rowMenuTargetId);
    setRowMenuOpen(false);
    if (!rec || !rec.dto) return;
    const dto = rec.dto;

    switch (action) {
      case 'view':
      case 'edit':
        handleOpenReceipt(rec);
        break;
      case 'download':
        showToast('Original files are served by the platform file service');
        break;
      case 'create-expense': {
        if (dto.createdSpendId) {
          showToast('Expense already created from this receipt');
          break;
        }
        const categoryAccountId = dto.categoryAccountId;
        const bankAccountId = dto.paymentAccountId || bankAccounts[0]?.id;
        if (!categoryAccountId || dto.amount == null || !bankAccountId) {
          handleOpenReceipt(rec);
          showToast('Set the category, amount and payment account first');
          break;
        }
        const res = await receiptMutations.createExpense(rec.id, {
          categoryAccountId,
          bankAccountId,
          total: dto.amount,
          taxAmount: dto.taxAmount ?? undefined,
        });
        if (res.ok) {
          showToast('Expense created from receipt');
          await refreshReceipts();
        } else showToast(res.error || 'Expense could not be created');
        break;
      }
      case 'create-bill': {
        if (dto.createdBillId) {
          showToast('Bill already created from this receipt');
          break;
        }
        if (!dto.vendorName || dto.amount == null) {
          handleOpenReceipt(rec);
          showToast('Set the vendor and amount first');
          break;
        }
        const res = await receiptMutations.createBill(rec.id, {
          vendorName: dto.vendorName,
          total: dto.amount,
          taxAmount: dto.taxAmount ?? undefined,
        });
        if (res.ok) {
          showToast('Bill created from receipt');
          await refreshReceipts();
        } else showToast(res.error || 'Bill could not be created');
        break;
      }
      case 'attach':
      case 'match':
        await openMatchMenu(rec.id, { top: rowMenuPos.top, left: rowMenuPos.left });
        break;
      case 'mark-reviewed': {
        const res = await receiptMutations.update(rec.id, { status: 'reviewed' });
        if (res.ok) {
          showToast('Marked as reviewed');
          await refreshReceipts();
        } else showToast(res.error || 'Status could not be updated');
        break;
      }
      case 'unmark-reviewed': {
        const res = await receiptMutations.update(rec.id, { status: 'review' });
        if (res.ok) {
          showToast('Moved back to review');
          await refreshReceipts();
        } else showToast(res.error || 'Status could not be updated');
        break;
      }
      case 'delete': {
        const res = await receiptMutations.remove(rec.id);
        if (res.ok) {
          showToast('Receipt deleted');
          await refreshReceipts();
        } else showToast(res.error || 'Receipt could not be deleted');
        break;
      }
    }
  };

  // Drawer create expense — persist the form first, then create
  const handleDrawerCreateExpense = async () => {
    if (!activeReceipt) return;
    if (activeReceipt.dto?.createdSpendId) {
      showToast('Expense already created from this receipt');
      setIsDrawerOpen(false);
      return;
    }
    const total = parseMoney(drawerForm.amount);
    if (!drawerForm.category) {
      showToast('Pick a category first');
      return;
    }
    if (!drawerForm.account) {
      showToast('Pick a payment account first');
      return;
    }
    if (!total) {
      showToast('Enter the receipt amount first');
      return;
    }
    await persistDrawerFields();
    const res = await receiptMutations.createExpense(activeReceipt.id, {
      categoryAccountId: drawerForm.category,
      bankAccountId: drawerForm.account,
      vendorName: drawerForm.vendor || undefined,
      date: drawerForm.date || undefined,
      total,
      taxAmount: parseMoney(drawerForm.tax) || undefined,
    });
    if (res.ok) {
      showToast('Expense created from receipt');
      setIsDrawerOpen(false);
      await refreshReceipts();
    } else showToast(res.error || 'Expense could not be created');
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
          <span className={styles.breadcrumbActive}>Receipts</span>
        </div>
      </div>

      <main className={styles.main}>
        {/* Page Header */}
        <div className={styles.pageHeader}>
          <div>
            <h1 className={styles.pageTitle}>Receipts</h1>
            <p className={styles.pageSubtitle}>
              Intake inbox — forward, drop, snap. Extracted fields auto-fill.
            </p>
          </div>
          <div className={styles.headerActions}>
            <button
              type="button"
              className={styles.headerBtn}
              onClick={() => uploadInputRef.current?.click()}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                upload
              </span>
              Upload
            </button>
            <button
              type="button"
              className={styles.headerBtn}
              onClick={() => snapInputRef.current?.click()}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                photo_camera
              </span>
              Snap photo
            </button>
          </div>
        </div>

        {/* Forwarding address + drop zone */}
        <div className={styles.intakeGrid}>
          {/* Drop zone */}
          <div
            className={`${styles.dropZone} ${isDragover ? styles.dropZoneDragover : ''}`}
            onDragEnter={(e) => {
              e.preventDefault();
              setIsDragover(true);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragover(true);
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              setIsDragover(false);
            }}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragover(false);
              processFiles(e.dataTransfer.files);
            }}
            onClick={() => uploadInputRef.current?.click()}
          >
            <span className={`material-symbols-outlined ${styles.dropIcon}`}>
              cloud_upload
            </span>
            <div className={styles.dropTitle}>Drop receipts here</div>
            <div className={styles.dropSubtitle}>
              PDF, JPG, PNG · up to 20 MB each · multiple files supported
            </div>
            <div className={styles.dropBtns} onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                className={styles.btnPrimaryGreen}
                onClick={() => uploadInputRef.current?.click()}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
                  upload_file
                </span>
                Choose files
              </button>
              <button
                type="button"
                className={styles.btnSecondaryOutline}
                onClick={() => snapInputRef.current?.click()}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
                  photo_camera
                </span>
                Snap
              </button>
            </div>
          </div>

          {/* Forward by email card */}
          <div className={styles.fwdCard}>
            <div className={styles.fwdHeader}>
              <span className={`material-symbols-outlined ${styles.fwdHeaderIcon}`}>
                mail
              </span>
              <span className={styles.fwdHeaderTitle}>Forward by email</span>
            </div>
            <p className={styles.fwdDesc}>
              Send receipts to this address — they&apos;ll appear here for review.
            </p>
            <div className={styles.fwdInputRow}>
              <input
                readOnly
                className={styles.fwdInput}
                value="receipts@unsaid.app"
              />
              <button
                type="button"
                className={styles.fwdCopyBtn}
                onClick={handleCopyForwarding}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
                  content_copy
                </span>
                Copy
              </button>
            </div>
            {copyConfirmed && (
              <div className={styles.fwdCopiedBadge}>
                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
                  check_circle
                </span>
                Copied to clipboard
              </div>
            )}
          </div>
        </div>

        {/* Table card */}
        <div className={styles.tableCard}>
          {/* Tabs */}
          <div className={styles.tabsBar}>
            <button
              type="button"
              className={`${styles.tabBtn} ${activeTab === 'review' ? styles.tabBtnActive : ''}`}
              onClick={() => setActiveTab('review')}
            >
              For review
              <span className={styles.tabCountBadge}>{reviewCount}</span>
            </button>
            <button
              type="button"
              className={`${styles.tabBtn} ${activeTab === 'reviewed' ? styles.tabBtnActive : ''}`}
              onClick={() => setActiveTab('reviewed')}
            >
              Reviewed
            </button>
            <button
              type="button"
              className={`${styles.tabBtn} ${activeTab === 'all' ? styles.tabBtnActive : ''}`}
              onClick={() => setActiveTab('all')}
            >
              All
            </button>
          </div>

          {/* Filter bar */}
          <div className={styles.filterBar}>
            <div className={styles.searchWrap}>
              <span className={`material-symbols-outlined ${styles.searchIcon}`}>
                search
              </span>
              <input
                className={styles.searchInput}
                placeholder="Filter by vendor, amount…"
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
            <span className={styles.countText}>
              {filteredReceipts.length} of {receipts.length}
            </span>
          </div>

          {/* Bulk bar */}
          {selectedIds.size > 0 && (
            <div className={styles.bulkBar}>
              <span className={styles.bulkCount}>{selectedIds.size} selected</span>
              <span className={styles.bulkSep} />
              <button
                type="button"
                className={styles.bulkBtn}
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  void handleBulkAction('categorize', {
                    top: rect.bottom + 4,
                    left: Math.min(rect.left, window.innerWidth - 300),
                  });
                }}
              >
                <span
                  className="material-symbols-outlined"
                  style={{ fontSize: 14, marginRight: 4 }}
                >
                  category
                </span>
                Categorize
              </button>
              <button
                type="button"
                className={styles.bulkBtn}
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  void handleBulkAction('attach', {
                    top: rect.bottom + 4,
                    left: Math.min(rect.left, window.innerWidth - 360),
                  });
                }}
              >
                <span
                  className="material-symbols-outlined"
                  style={{ fontSize: 14, marginRight: 4 }}
                >
                  attach_file
                </span>
                Attach to bill
              </button>
              <button
                type="button"
                className={styles.bulkBtn}
                onClick={() => void handleBulkAction('create')}
              >
                <span
                  className="material-symbols-outlined"
                  style={{ fontSize: 14, marginRight: 4 }}
                >
                  receipt_long
                </span>
                Create expenses
              </button>
              <span className={styles.bulkSep} />
              <button
                type="button"
                className={styles.bulkBtn}
                onClick={() => void handleBulkAction('delete')}
              >
                <span
                  className="material-symbols-outlined"
                  style={{ fontSize: 14, marginRight: 4 }}
                >
                  delete
                </span>
                Delete
              </button>
              <button
                type="button"
                className={styles.bulkCloseBtn}
                onClick={() => void handleBulkAction('close')}
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
                <th className={styles.th} style={{ width: 36, paddingLeft: 12 }}>
                  <input
                    type="checkbox"
                    checked={
                      filteredReceipts.length > 0 &&
                      selectedIds.size === filteredReceipts.length
                    }
                    onChange={handleSelectAll}
                    style={{ accentColor: '#0077c5' }}
                  />
                </th>
                <th className={styles.th} style={{ width: 48 }}>
                  Receipt
                </th>
                <th className={styles.th}>Date</th>
                <th className={styles.th}>Vendor</th>
                <th className={styles.th}>Payment account</th>
                <th className={styles.th} style={{ textAlign: 'right' }}>
                  Amount / Tax
                </th>
                <th className={styles.th}>Category</th>
                <th className={styles.th}>Action</th>
                <th className={styles.th} style={{ width: 36 }} />
              </tr>
            </thead>
            <tbody>
              {filteredReceipts.map((rec) => {
                const isSelected = selectedIds.has(rec.id);
                return (
                  <tr
                    key={rec.id}
                    className={`${styles.row} ${rec.isProcessing ? styles.processingRow : ''}`}
                    onClick={() => {
                      if (!rec.isProcessing) handleOpenReceipt(rec);
                    }}
                  >
                    <td
                      className={styles.td}
                      style={{ width: 36, paddingLeft: 12 }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        disabled={rec.isProcessing}
                        checked={isSelected}
                        onChange={() => handleToggleRow(rec.id)}
                        style={{ accentColor: '#0077c5' }}
                      />
                    </td>
                    <td className={styles.td}>
                      <div className={styles.receiptThumb}>
                        {rec.isProcessing && <div className={styles.spinner} />}
                      </div>
                    </td>
                    <td className={styles.td}>{rec.date}</td>
                    <td
                      className={styles.td}
                      style={{
                        fontWeight: rec.isProcessing ? 400 : 500,
                        fontStyle: rec.isProcessing ? 'italic' : 'normal',
                        color: rec.isProcessing ? '#5a6355' : '#1a1c1e',
                      }}
                    >
                      {rec.vendor}
                    </td>
                    <td className={styles.td} style={{ color: '#5a6355' }}>
                      {rec.account}
                    </td>
                    <td
                      className={styles.td}
                      style={{
                        textAlign: 'right',
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      <div>{rec.amount}</div>
                      {!rec.isProcessing && (
                        <div style={{ fontSize: 10, color: '#5a6355' }}>
                          Tax {rec.tax}
                        </div>
                      )}
                    </td>
                    <td className={styles.td} onClick={(e) => e.stopPropagation()}>
                      {rec.isProcessing ? (
                        <span
                          style={{
                            fontSize: 11,
                            color: '#5a6355',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4,
                          }}
                        >
                          <div
                            className={styles.spinner}
                            style={{ width: 12, height: 12 }}
                          />
                          Processing
                        </span>
                      ) : rec.category ? (
                        <button
                          type="button"
                          className={`${styles.catChip} ${
                            rec.status === 'reviewed'
                              ? styles.catChipDone
                              : styles.catChipSuggested
                          }`}
                          onClick={(e) => {
                            const rect = e.currentTarget.getBoundingClientRect();
                            setCatPickerPos({
                              top: rect.bottom + 4,
                              left: Math.min(rect.left, window.innerWidth - 300),
                            });
                            setCatPickerTargetId(rec.id);
                            setCatPickerOpen(true);
                            setRowMenuOpen(false);
                            setMatchMenuOpen(false);
                          }}
                        >
                          <span
                            className="material-symbols-outlined"
                            style={{ fontSize: 12 }}
                          >
                            {rec.status === 'reviewed' ? 'check_circle' : 'auto_awesome'}
                          </span>
                          {rec.category}
                        </button>
                      ) : (
                        <button
                          type="button"
                          className={`${styles.catChip} ${styles.catChipUncat}`}
                          onClick={(e) => {
                            const rect = e.currentTarget.getBoundingClientRect();
                            setCatPickerPos({
                              top: rect.bottom + 4,
                              left: Math.min(rect.left, window.innerWidth - 300),
                            });
                            setCatPickerTargetId(rec.id);
                            setCatPickerOpen(true);
                            setRowMenuOpen(false);
                            setMatchMenuOpen(false);
                          }}
                        >
                          <span
                            className="material-symbols-outlined"
                            style={{ fontSize: 12 }}
                          >
                            error
                          </span>
                          Needs category
                        </button>
                      )}
                    </td>
                    <td className={styles.td} onClick={(e) => e.stopPropagation()}>
                      {rec.isProcessing ? (
                        <span style={{ fontSize: 11, color: '#5a6355' }}>—</span>
                      ) : rec.status === 'review' ? (
                        <button
                          type="button"
                          className={styles.actionBtn}
                          onClick={() => handleOpenReceipt(rec)}
                        >
                          Review
                        </button>
                      ) : (
                        <span className={styles.reviewedBadge}>
                          <span
                            className="material-symbols-outlined"
                            style={{ fontSize: 14 }}
                          >
                            check
                          </span>
                          {rec.actionLabel || 'Reviewed'}
                        </span>
                      )}
                    </td>
                    <td
                      className={styles.td}
                      style={{ textAlign: 'right' }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        disabled={rec.isProcessing}
                        className={styles.moreBtn}
                        onClick={(e) => {
                          const rect = e.currentTarget.getBoundingClientRect();
                          setRowMenuPos({
                            top: rect.bottom + 4,
                            left: Math.min(rect.right - 250, window.innerWidth - 270),
                          });
                          setRowMenuTargetId(rec.id);
                          setRowMenuOpen(true);
                          setCatPickerOpen(false);
                          setMatchMenuOpen(false);
                        }}
                      >
                        <span
                          className="material-symbols-outlined"
                          style={{ fontSize: 16 }}
                        >
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

      {/* Hidden real file pickers */}
      <input
        ref={uploadInputRef}
        type="file"
        accept="image/*,application/pdf"
        multiple
        style={{ display: 'none' }}
        onChange={(e) => {
          processFiles(e.target.files);
          e.target.value = '';
        }}
      />
      <input
        ref={snapInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: 'none' }}
        onChange={(e) => {
          processFiles(e.target.files, 'photo');
          e.target.value = '';
        }}
      />

      {/* ═══════════ RECEIPT PREVIEW DRAWER ═══════════ */}
      {isDrawerOpen && (
        <>
          <div className={styles.drawerScrim} onClick={handleCloseReceipt} />
          <aside className={styles.drawer}>
            {/* Drawer Header */}
            <div className={styles.drawerHeader}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                <span
                  className="material-symbols-outlined"
                  style={{ fontSize: 20, color: '#0a6400' }}
                >
                  receipt_long
                </span>
                <div style={{ minWidth: 0 }}>
                  <div className={styles.drawerHeaderTitle}>
                    Receipt — {activeReceipt?.vendor || 'Vendor'}
                  </div>
                  <div className={styles.drawerHeaderSub}>
                    {activeReceipt?.no || activeReceipt?.id} ·{' '}
                    {activeReceipt?.status === 'review' ? 'For review' : 'Reviewed'}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <button
                  type="button"
                  className={styles.drawerIconBtn}
                  title="Download original"
                  onClick={() => showToast('Original files are served by the platform file service')}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                    download
                  </span>
                </button>
                <button
                  type="button"
                  className={styles.drawerIconBtn}
                  onClick={handleCloseReceipt}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                    close
                  </span>
                </button>
              </div>
            </div>

            {/* Drawer Split */}
            <div className={styles.drawerSplit}>
              {/* Left: intake summary — the platform holds the original
                  file and runs extraction; nothing here is invented */}
              <div className={styles.drawerImage}>
                <div className={styles.drawerImageViewer}>
                  <div className={styles.fakeReceipt}>
                    <div className={styles.fakeReceiptStore}>
                      {(drawerForm.vendor || 'AWAITING EXTRACTION').toUpperCase()}
                    </div>
                    <div className={styles.fakeReceiptSub}>{activeReceipt?.dto?.fileName || 'Receipt intake'}</div>
                    <div className={styles.receiptLineSep} />
                    <div className={styles.receiptRow}>
                      <span>Date</span>
                      <span>{drawerForm.date ? fmtDate(drawerForm.date) : '—'}</span>
                    </div>
                    <div className={styles.receiptRow}>
                      <span>Source</span>
                      <span>{activeReceipt?.dto?.source || 'upload'}</span>
                    </div>
                    <div className={styles.receiptRow}>
                      <span>Intake status</span>
                      <span>{activeReceipt?.dto?.rawStatus || '—'}</span>
                    </div>
                    <div className={styles.receiptRow}>
                      <span>Extraction</span>
                      <span>{activeReceipt?.dto?.extractionStatus || 'pending'}</span>
                    </div>
                    <div className={styles.receiptDottedSep} />
                    <div className={styles.receiptRow}>
                      <span>Subtotal</span>
                      <span>
                        $
                        {Math.max(
                          0,
                          parseFloat(drawerForm.amount.replace('$', '') || '0') -
                            parseFloat(drawerForm.tax.replace('$', '') || '0')
                        ).toFixed(2)}
                      </span>
                    </div>
                    <div className={styles.receiptRow}>
                      <span>Tax</span>
                      <span>{drawerForm.tax ? `$${parseMoney(drawerForm.tax).toFixed(2)}` : '$0.00'}</span>
                    </div>
                    <div className={styles.receiptTotalRow}>
                      <span>TOTAL</span>
                      <span>{drawerForm.amount ? `$${parseMoney(drawerForm.amount).toFixed(2)}` : '$0.00'}</span>
                    </div>
                    <div className={styles.receiptDottedSep} />
                    <div className={styles.receiptFooter}>
                      Original file is held by the platform
                      <br />
                      file service — fields on the right are
                      <br />
                      the extracted values.
                    </div>
                  </div>
                </div>

                {/* Bottom Image Toolbar */}
                <div className={styles.imageToolbar}>
                  <button
                    type="button"
                    className={styles.imageToolBtn}
                    onClick={() => showToast('Original files are served by the platform file service')}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
                      open_in_new
                    </span>
                    Open original
                  </button>
                </div>
              </div>

              {/* Right: Extracted Fields */}
              <div className={styles.drawerFields}>
                <div className={styles.drawerFieldsBody}>
                  <div className={styles.fieldsSectionTitle}>Extracted fields</div>
                  <div className={styles.fieldRow}>
                    <div className={styles.fieldLabel}>Vendor</div>
                    <div className={styles.fieldValue}>
                      <input
                        className={styles.fieldInput}
                        value={drawerForm.vendor}
                        onChange={(e) =>
                          setDrawerForm({ ...drawerForm, vendor: e.target.value })
                        }
                        onBlur={() => void persistDrawerFields()}
                      />
                    </div>
                  </div>
                  <div className={styles.fieldRow}>
                    <div className={styles.fieldLabel}>Date</div>
                    <div className={styles.fieldValue}>
                      <input
                        type="date"
                        className={styles.fieldInput}
                        value={drawerForm.date}
                        onChange={(e) =>
                          setDrawerForm({ ...drawerForm, date: e.target.value })
                        }
                        onBlur={() => void persistDrawerFields()}
                      />
                    </div>
                  </div>
                  <div className={styles.fieldRow}>
                    <div className={styles.fieldLabel}>Amount</div>
                    <div className={styles.fieldValue}>
                      <input
                        className={styles.fieldInput}
                        value={drawerForm.amount}
                        onChange={(e) =>
                          setDrawerForm({ ...drawerForm, amount: e.target.value })
                        }
                        onBlur={() => void persistDrawerFields()}
                      />
                    </div>
                  </div>
                  <div className={styles.fieldRow}>
                    <div className={styles.fieldLabel}>Tax</div>
                    <div className={styles.fieldValue}>
                      <input
                        className={styles.fieldInput}
                        value={drawerForm.tax}
                        onChange={(e) =>
                          setDrawerForm({ ...drawerForm, tax: e.target.value })
                        }
                        onBlur={() => void persistDrawerFields()}
                      />
                    </div>
                  </div>
                  <div className={styles.fieldRow}>
                    <div className={styles.fieldLabel}>Payment account</div>
                    <div className={styles.fieldValue}>
                      <select
                        className={styles.fieldSelect}
                        value={drawerForm.account}
                        onChange={(e) =>
                          setDrawerForm({ ...drawerForm, account: e.target.value })
                        }
                      >
                        <option value="">— Select account —</option>
                        {bankAccounts.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name}{a.maskedNumber ? ` •${a.maskedNumber}` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className={styles.fieldRow}>
                    <div className={styles.fieldLabel}>Category</div>
                    <div className={styles.fieldValue}>
                      <select
                        className={styles.fieldSelect}
                        value={drawerForm.category}
                        onChange={(e) => {
                          setDrawerForm({ ...drawerForm, category: e.target.value });
                        }}
                        onBlur={() => void persistDrawerFields()}
                      >
                        <option value="">— Select category —</option>
                        {coaAccounts.map((a) => (
                          <option key={a.id} value={a.id}>{a.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className={styles.fieldRow}>
                    <div className={styles.fieldLabel}>Notes</div>
                    <div className={styles.fieldValue}>
                      <input
                        className={styles.fieldInput}
                        placeholder="Add a note…"
                        value={drawerForm.notes}
                        onChange={(e) =>
                          setDrawerForm({ ...drawerForm, notes: e.target.value })
                        }
                        onBlur={() => void persistDrawerFields()}
                      />
                    </div>
                  </div>
                </div>

                {/* Drawer Footer Actions */}
                <div className={styles.drawerFooter}>
                  <button
                    type="button"
                    className={styles.btnSecondaryOutline}
                    onClick={handleCloseReceipt}
                  >
                    Cancel
                  </button>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button
                      type="button"
                      className={styles.btnSecondaryOutline}
                      onClick={(e) => {
                        if (!activeReceipt) return;
                        const rect = e.currentTarget.getBoundingClientRect();
                        void openMatchMenu(activeReceipt.id, {
                          top: rect.bottom + 4,
                          left: Math.min(rect.left, window.innerWidth - 360),
                        });
                      }}
                    >
                      <span
                        className="material-symbols-outlined"
                        style={{ fontSize: 16 }}
                      >
                        link
                      </span>
                      Match to transaction
                    </button>
                    <div className={styles.btnSplitExpense}>
                      <button
                        type="button"
                        className={styles.btnSplitExpenseMain}
                        onClick={handleDrawerCreateExpense}
                      >
                        Create expense
                      </button>
                      <button
                        type="button"
                        className={styles.btnSplitExpenseArrow}
                        onClick={handleDrawerCreateExpense}
                      >
                        <span
                          className="material-symbols-outlined"
                          style={{ fontSize: 16 }}
                        >
                          expand_more
                        </span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </aside>
        </>
      )}

      {/* ═══════════ CATEGORY PICKER POPUP — real chart of accounts ═══════════ */}
      {catPickerOpen && (
        <div
          className={styles.catPicker}
          style={{ top: catPickerPos.top, left: catPickerPos.left }}
          onClick={(e) => e.stopPropagation()}
        >
          <input
            className={styles.catPickerSearch}
            placeholder="Search categories…"
            value={catSearch}
            onChange={(e) => setCatSearch(e.target.value)}
          />
          <div className={styles.pickerSection}>Suggested</div>
          {coaAccounts
            .filter((a) => a.type === 'Expense')
            .slice(0, 4)
            .filter((a) => a.name.toLowerCase().includes(catSearch.toLowerCase()))
            .map((a, i) => (
              <div
                key={a.id}
                className={styles.catPickerOpt}
                onClick={() => void handlePickCategory(a.id)}
              >
                <span className={styles.catDot} style={{ backgroundColor: ['#0077c5', '#1e5a38', '#6b1e28', '#0e5e6f'][i % 4] }} />
                {a.name}
              </div>
            ))}
          <div className={styles.pickerSep} />
          <div className={styles.pickerSection}>All categories</div>
          {coaAccounts
            .filter((a) => a.name.toLowerCase().includes(catSearch.toLowerCase()))
            .map((a) => (
              <div
                key={a.id}
                className={styles.catPickerOpt}
                onClick={() => void handlePickCategory(a.id)}
              >
                <span className={styles.catDot} style={{ backgroundColor: '#dad9dd' }} />
                {a.name}
              </div>
            ))}
        </div>
      )}

      {/* ═══════════ ROW ⋯ MENU ═══════════ */}
      {rowMenuOpen && (
        <div
          className={styles.rowMenu}
          style={{ top: rowMenuPos.top, left: rowMenuPos.left }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className={styles.menuHeader}>This receipt</div>
          <button
            type="button"
            className={styles.menuItem}
            onClick={() => handleRowMenuAction('view')}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
              open_in_new
            </span>
            View receipt
          </button>
          <button
            type="button"
            className={styles.menuItem}
            onClick={() => handleRowMenuAction('edit')}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
              edit
            </span>
            Edit extracted fields
          </button>
          <button
            type="button"
            className={styles.menuItem}
            onClick={() => handleRowMenuAction('download')}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
              download
            </span>
            Download original
          </button>
          <div className={styles.menuSep} />
          <div className={styles.menuHeader}>Create from receipt</div>
          <button
            type="button"
            className={styles.menuItem}
            onClick={() => handleRowMenuAction('create-expense')}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
              credit_card
            </span>
            Create expense
          </button>
          <button
            type="button"
            className={styles.menuItem}
            onClick={() => handleRowMenuAction('create-bill')}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
              description
            </span>
            Create bill
          </button>
          <button
            type="button"
            className={styles.menuItem}
            onClick={() => handleRowMenuAction('attach')}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
              attach_file
            </span>
            Attach to existing…
          </button>
          <div className={styles.menuSep} />
          <div className={styles.menuHeader}>Match</div>
          <button
            type="button"
            className={styles.menuItem}
            onClick={() => {
              const id = rowMenuTargetId;
              setRowMenuOpen(false);
              if (id) void openMatchMenu(id, { top: rowMenuPos.top, left: rowMenuPos.left });
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
              link
            </span>
            Match to transaction…
          </button>
          <div className={styles.menuSep} />
          <div className={styles.menuHeader}>State</div>
          {(() => {
            const currentRec = receipts.find((r) => r.id === rowMenuTargetId);
            return currentRec?.status === 'reviewed' ? (
              <button
                type="button"
                className={styles.menuItem}
                onClick={() => handleRowMenuAction('unmark-reviewed')}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                  restart_alt
                </span>
                Move back to review
              </button>
            ) : (
              <button
                type="button"
                className={styles.menuItem}
                onClick={() => handleRowMenuAction('mark-reviewed')}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                  check_circle
                </span>
                Mark as reviewed
              </button>
            );
          })()}
          <button
            type="button"
            className={`${styles.menuItem} ${styles.menuItemDanger}`}
            onClick={() => handleRowMenuAction('delete')}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
              delete
            </span>
            Delete receipt
          </button>
        </div>
      )}

      {/* ═══════════ MATCH MENU POPUP — real candidates + open bills ═══════════ */}
      {matchMenuOpen && (
        <div
          className={styles.matchMenu}
          style={{ top: matchMenuPos.top, left: matchMenuPos.left }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className={styles.matchHeader}>Unmatched bank transactions</div>
          {matchCandidates.map((txn) => (
            <div
              key={txn.bankTransactionId}
              className={styles.matchItem}
              onClick={() => void handleSelectBankMatch(txn)}
            >
              <span
                className="material-symbols-outlined"
                style={{ fontSize: 16, color: '#ba1a1a', marginTop: 2 }}
              >
                account_balance
              </span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 500,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {txn.description}
                </div>
                <div className={styles.matchDate}>{fmtDate(txn.date)}{txn.bankAccountName ? ` · ${txn.bankAccountName}` : ''}</div>
              </div>
              <span className={styles.matchAmt} style={{ color: '#ba1a1a' }}>
                −${Math.abs(txn.amount).toFixed(2)}
              </span>
            </div>
          ))}
          {matchCandidates.length === 0 && (
            <div style={{ padding: '8px 12px', fontSize: 11, color: '#5a6355' }}>
              No candidates — matching looks for the same amount within ±10 days.
            </div>
          )}

          <div className={styles.matchHeader}>Open bills</div>
          {openBillsList.map((bill) => (
            <div
              key={bill.id}
              className={styles.matchItem}
              onClick={() => void handleSelectBillAttach(bill)}
            >
              <span
                className="material-symbols-outlined"
                style={{ fontSize: 16, color: '#6b1e28', marginTop: 2 }}
              >
                description
              </span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 500,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  Bill {bill.billNumber}{bill.vendorName ? ` · ${bill.vendorName}` : ''}
                </div>
                <div className={styles.matchDate}>{bill.dueDate ? `Due ${fmtDate(bill.dueDate)}` : ''}</div>
              </div>
              <span className={styles.matchAmt} style={{ color: '#5a6355' }}>
                ${bill.total.toFixed(2)}
              </span>
            </div>
          ))}
          {openBillsList.length === 0 && (
            <div style={{ padding: '8px 12px', fontSize: 11, color: '#5a6355' }}>
              No open bills to attach to.
            </div>
          )}
        </div>
      )}

      {/* ═══════════ TOAST NOTIFICATION ═══════════ */}
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
