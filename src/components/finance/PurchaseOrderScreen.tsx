'use client';

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import styles from './PurchaseOrderScreen.module.css';

// A PO line as the screen edits it. erp_purchase_order_lines carries no
// SKU and no expense account — description, quantity, cost and received
// quantity are the whole line.
interface LineItem {
  id: string;
  item: string;
  description: string;
  qtyOrd: number;
  qtyRcvd: number;
  unitCost: number;
}

interface Vendor {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
}

type POViewMode = 'edit' | 'email' | 'vendor' | 'pdf';
// Stored erp_purchase_orders statuses. Receiving is DERIVED from the
// lines (Σ received vs Σ ordered), never stored or set from this screen.
type StoredStatus = 'ordered' | 'approved' | 'cancelled';
type POStatus = 'Open' | 'Sent to Vendor' | 'Cancelled';

const toDisplayStatus = (s: StoredStatus): POStatus =>
  s === 'approved' ? 'Sent to Vendor' : s === 'cancelled' ? 'Cancelled' : 'Open';
const toStoredStatus = (s: POStatus): StoredStatus =>
  s === 'Sent to Vendor' ? 'approved' : s === 'Cancelled' ? 'cancelled' : 'ordered';

/* The approved screen shows MM/DD/YYYY; the API uses ISO dates */
const toDisplayDate = (iso: string): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec((iso || '').trim());
  return m ? `${m[2]}/${m[3]}/${m[1]}` : iso || '—';
};

const toIsoDate = (display: string): string => {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec((display || '').trim());
  return m ? `${m[3]}-${m[1]}-${m[2]}` : display;
};

const todayIso = () => new Date().toISOString().slice(0, 10);

interface PurchaseOrderScreenProps {
  onClose?: () => void;
  onToast?: (message: string) => void;
  documentId?: string | null;
}

export default function PurchaseOrderScreen({
  onClose,
  onToast,
  documentId,
}: PurchaseOrderScreenProps) {
  // ── Live data ──
  const [poId, setPoId] = useState<string | null>(documentId || null);
  const [poNumber, setPoNumber] = useState(() => `PO-${Date.now()}`);
  const [storedStatus, setStoredStatus] = useState<StoredStatus>('ordered');
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [vendorId, setVendorId] = useState('');
  const [productNames, setProductNames] = useState<string[]>([]);
  const [expenseAccounts, setExpenseAccounts] = useState<{ id: string; label: string }[]>([]);
  const [billAccountId, setBillAccountId] = useState('');
  const [loading, setLoading] = useState(!!documentId);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);

  // Editor state — order date defaults to today, delivery blank.
  const [orderDate, setOrderDate] = useState(() => toDisplayDate(todayIso()));
  const [deliveryDate, setDeliveryDate] = useState('');
  const [paymentTerms, setPaymentTerms] = useState('Net 30');
  const [shipVia, setShipVia] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<LineItem[]>([]);
  const [shipping, setShipping] = useState(0);

  const [viewMode, setViewMode] = useState<POViewMode>('edit');
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const activeVendor = vendors.find(v => v.id === vendorId) || vendors[0];
  const status: POStatus = toDisplayStatus(storedStatus);

  const loadPo = useCallback(async (id: string) => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(`/api/v1/documents/${id}?type=PurchaseOrder&include=lines`);
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error?.message || `PO failed to load (${res.status})`);
      const d = json.data;
      setPoId(d.id);
      setPoNumber(d.po_number || `PO-${Date.now()}`);
      setStoredStatus(d.status === 'approved' ? 'approved' : d.status === 'cancelled' ? 'cancelled' : 'ordered');
      setVendorId(String(d.vendor_id || ''));
      setOrderDate(toDisplayDate(String(d.order_date || '')));
      setDeliveryDate(toDisplayDate(String(d.expected_date || '')));
      setNotes(String(d.notes || ''));
      setShipping(Number(d.shipping_total || 0));
      setLines((json.lines || []).map((l: Record<string, unknown>) => ({
        id: String(l.id),
        item: String(l.description || ''),
        description: String(l.description || ''),
        qtyOrd: Number(l.quantity ?? l.quantity_ordered ?? 1),
        qtyRcvd: Number(l.quantity_received ?? 0),
        unitCost: Number(l.unit_cost || 0),
      })));
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Purchase order failed to load.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Vendors, products (item picker only — never priced from here) and
    // expense accounts (bill lines require one; the user picks it).
    fetch('/api/parties?role=vendor')
      .then(r => r.json())
      .then(j => {
        const rows = (j.data || []).map((p: Record<string, unknown>) => ({
          id: String(p.id),
          name: String(p.displayName || p.name || 'Unnamed'),
          email: (p.email as string) || null,
          phone: (p.phone as string) || null,
        }));
        setVendors(rows);
        setVendorId(prev => prev || rows[0]?.id || '');
      })
      .catch(() => {});
    fetch('/api/products')
      .then(r => r.json())
      .then(j => setProductNames((j.data || []).map((p: Record<string, unknown>) => String(p.name || '')).filter(Boolean)))
      .catch(() => {});
    fetch('/api/accounts')
      .then(r => r.json())
      .then(j => {
        const rows = (j.data || [])
          .filter((a: Record<string, unknown>) => a.account_type === 'expense')
          .map((a: Record<string, unknown>) => ({ id: String(a.id), label: `${a.code} · ${a.name}` }));
        setExpenseAccounts(rows);
        setBillAccountId(prev => prev || rows[0]?.id || '');
      })
      .catch(() => {});
    if (documentId) loadPo(documentId);
  }, [documentId, loadPo]);

  // Accordions in sidebar
  const [expandedAccordions, setExpandedAccordions] = useState<Record<string, boolean>>({
    customization: false,
    receiving: true,
    billing: false,
    attachments: false,
  });

  // Customization switches (column visibility — the toggles below are real)
  const [showUnitCost, setShowUnitCost] = useState(true);
  const [showReceivingStatus, setShowReceivingStatus] = useState(true);

  // Table column toggles
  const [colNum, setColNum] = useState(true);
  const [colItem, setColItem] = useState(true);
  const [colDesc, setColDesc] = useState(true);
  const [colQtyOrd, setColQtyOrd] = useState(true);
  const [colQtyRcvd, setColQtyRcvd] = useState(true);
  const [colCost, setColCost] = useState(true);
  const [colAmount, setColAmount] = useState(true);

  // Footer menus
  const [saveMenuOpen, setSaveMenuOpen] = useState(false);
  const [sendMenuOpen, setSendMenuOpen] = useState(false);

  const toggleAccordion = (id: string) => {
    setExpandedAccordions((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  // Calculations
  const subtotal = useMemo(() => {
    return lines.reduce((acc, l) => acc + l.qtyOrd * l.unitCost, 0);
  }, [lines]);

  const tax = 0.0;
  const grandTotal = subtotal + shipping + tax;

  const totalQtyOrd = useMemo(() => {
    return lines.reduce((acc, l) => acc + l.qtyOrd, 0);
  }, [lines]);

  const totalQtyRcvd = useMemo(() => {
    return lines.reduce((acc, l) => acc + l.qtyRcvd, 0);
  }, [lines]);

  const totalQtyRemaining = Math.max(0, totalQtyOrd - totalQtyRcvd);

  // Receiving is derived from the lines — it is a fact about the PO, not
  // a status the user sets. The dropdown offers only the stored states.
  const receiving: 'None received' | 'Partially Received' | 'Fully Received' =
    totalQtyOrd === 0 || totalQtyRcvd === 0
      ? 'None received'
      : totalQtyRcvd >= totalQtyOrd
        ? 'Fully Received'
        : 'Partially Received';

  const handleUpdateLine = (id: string, field: keyof LineItem, val: string | number) => {
    setLines((prev) =>
      prev.map((l) => (l.id === id ? { ...l, [field]: val } : l))
    );
  };

  const handleAddLine = () => {
    const newLine: LineItem = {
      id: `line-${Date.now()}`,
      item: '',
      description: '',
      qtyOrd: 1,
      qtyRcvd: 0,
      unitCost: 0,
    };
    setLines((prev) => [...prev, newLine]);
  };

  const handleClearLines = () => {
    setLines([]);
  };

  // Screen lines → the documents API's line shape (erp_purchase_order_lines
  // carries description / quantity / unit_cost / received quantity).
  const toApiLines = (ls: LineItem[]) =>
    ls.map((l) => ({
      description: l.description || l.item,
      quantity: l.qtyOrd,
      unit_cost: l.unitCost,
      received_quantity: l.qtyRcvd,
    }));

  // Persist the editor to erp_purchase_orders (creates the PO when none
  // exists). Returns the PO id, or null on failure — the caller reports
  // the real outcome, never a success toast for a failed save.
  const savePo = async (linesOverride?: LineItem[]): Promise<string | null> => {
    const linesToSave = linesOverride ?? lines;
    if (!vendorId) {
      onToast?.('Choose a vendor first');
      return null;
    }
    const sub = linesToSave.reduce((acc, l) => acc + l.qtyOrd * l.unitCost, 0);
    setSaving(true);
    try {
      if (poId) {
        const res = await fetch(`/api/v1/documents/${poId}?type=PurchaseOrder`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            po_number: poNumber,
            order_date: toIsoDate(orderDate),
            expected_date: toIsoDate(deliveryDate) || null,
            status: storedStatus,
            subtotal: sub,
            tax_total: 0,
            total: sub + shipping,
            shipping_total: shipping,
            memo: notes,
            lines: toApiLines(linesToSave),
          }),
        });
        const json = await res.json();
        if (!res.ok || json.error) throw new Error(json.error?.message || `Save failed (${res.status})`);
        return poId;
      }
      const res = await fetch('/api/v1/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'PurchaseOrder',
          partyId: vendorId,
          number: poNumber,
          date: toIsoDate(orderDate),
          dueDate: toIsoDate(deliveryDate) || null,
          status: storedStatus,
          shipping,
          memo: notes,
          lines: toApiLines(linesToSave),
        }),
      });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error?.message || `Save failed (${res.status})`);
      setPoId(json.data.id);
      return json.data.id as string;
    } catch (e) {
      onToast?.(e instanceof Error ? e.message : 'Save failed.');
      return null;
    } finally {
      setSaving(false);
    }
  };

  // Change the stored status (Open / Sent to Vendor / Cancelled). A saved
  // PO patches immediately; a new one just records it for the first save.
  const changeStatus = async (next: POStatus) => {
    const stored = toStoredStatus(next);
    setStoredStatus(stored);
    setStatusMenuOpen(false);
    if (!poId) return;
    try {
      const res = await fetch(`/api/v1/documents/${poId}?type=PurchaseOrder`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: stored }),
      });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error?.message || `Status update failed (${res.status})`);
      onToast?.(`Status changed to ${next}`);
    } catch (e) {
      onToast?.(e instanceof Error ? e.message : 'Status update failed.');
      loadPo(poId);
    }
  };

  // Send the PO to the vendor by email (Resend). Saves first when the PO
  // is new, then POSTs the send route — a 502 means the email did not go
  // out (e.g. RESEND_API_KEY not set) and the status stays as it was.
  const sendPo = async () => {
    if (!activeVendor) {
      onToast?.('Choose a vendor first');
      return;
    }
    setSending(true);
    try {
      let id = poId;
      if (!id) id = await savePo();
      if (!id) return;
      const sendRes = await fetch(`/api/v1/documents/${id}/send?type=PurchaseOrder`, { method: 'POST' });
      const json = await sendRes.json();
      if (!sendRes.ok || json.error) {
        throw new Error(json.error?.message || `Send failed (${sendRes.status})`);
      }
      setStoredStatus('approved');
      onToast?.(`${poNumber} sent to ${activeVendor.name} (${activeVendor.email})`);
    } catch (e) {
      onToast?.(e instanceof Error ? e.message : 'Send failed.');
    } finally {
      setSending(false);
    }
  };

  // Create a bill from this PO. Bill lines REQUIRE an expense account, so
  // the account picked in the Billing accordion rides on every line.
  const handleCreateBill = async () => {
    if (!poId) {
      onToast?.('Save the purchase order before creating a bill');
      return;
    }
    if (!billAccountId) {
      onToast?.('Choose an expense account for the bill lines first (Billing & Terms)');
      setExpandedAccordions(prev => ({ ...prev, billing: true }));
      return;
    }
    const due = toIsoDate(deliveryDate);
    const billDate = todayIso();
    try {
      const res = await fetch('/api/v1/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'Bill',
          partyId: vendorId,
          date: billDate,
          dueDate: due && due >= billDate ? due : billDate,
          status: 'draft',
          memo: `Created from purchase order ${poNumber}`,
          lines: lines.map(l => ({
            description: l.description || l.item,
            quantity: l.qtyOrd,
            unit_cost: l.unitCost,
            expense_account_id: billAccountId,
          })),
        }),
      });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error?.message || `Bill failed (${res.status})`);
      onToast?.(`Bill ${json.data.bill_number} created from ${poNumber}`);
    } catch (e) {
      onToast?.(e instanceof Error ? e.message : 'Bill failed.');
    }
  };

  const handleReceiveItems = async () => {
    const received = lines.map((l) => ({ ...l, qtyRcvd: l.qtyOrd }));
    setLines(received);
    if (poId) {
      const saved = await savePo(received);
      if (saved) onToast?.('All items marked as received');
    } else {
      onToast?.('All items marked as received — save the PO to record it');
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(amount);
  };

  const getStatusClass = (st: POStatus) => {
    switch (st) {
      case 'Open':
        return styles.statusOpen;
      case 'Sent to Vendor':
        return styles.statusSent;
      case 'Cancelled':
        return styles.statusCancelled;
      default:
        return styles.statusOpen;
    }
  };

  if (loading) {
    return (
      <div className={styles.container} style={{ padding: 32, color: '#5a6355' }}>
        Loading purchase order…
      </div>
    );
  }

  if (loadError) {
    return (
      <div className={styles.container} style={{ padding: 32 }}>
        <p style={{ color: '#b3261e' }}>{loadError}</p>
        <button type="button" className={styles.headerBtn} onClick={() => documentId && loadPo(documentId)}>
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {/* ═══════════ TOP HEADER ═══════════ */}
      <header className={styles.header}>
        <div className={styles.topRow}>
          <div className={styles.titleArea}>
            <h1 className={styles.mainTitle}>Purchase Order {poNumber.replace(/^PO-/, '')}</h1>
            <span className={`${styles.statusPill} ${getStatusClass(status)}`}>
              {status}
            </span>
            {receiving !== 'None received' && (
              <span className={styles.statusPill} style={{ background: '#e8f5e9', color: '#0a6400' }}>
                {receiving}
              </span>
            )}
          </div>

          <div className={styles.topRightActions}>
            <button
              type="button"
              className={styles.iconBtn}
              title="Close"
              onClick={() => onClose?.()}
            >
              <span className="material-symbols-outlined">close</span>
            </button>
          </div>
        </div>

        {/* Tabs & Quick Actions */}
        <div className={styles.tabRow}>
          <div className={styles.viewsTabs}>
            <button
              type="button"
              className={`${styles.tabBtn} ${viewMode === 'edit' ? styles.tabBtnActive : ''}`}
              onClick={() => setViewMode('edit')}
            >
              Edit
            </button>
            <button
              type="button"
              className={`${styles.tabBtn} ${viewMode === 'email' ? styles.tabBtnActive : ''}`}
              onClick={() => setViewMode('email')}
            >
              Email view
            </button>
            <button
              type="button"
              className={`${styles.tabBtn} ${viewMode === 'vendor' ? styles.tabBtnActive : ''}`}
              onClick={() => setViewMode('vendor')}
            >
              Vendor view
            </button>
            <button
              type="button"
              className={`${styles.tabBtn} ${viewMode === 'pdf' ? styles.tabBtnActive : ''}`}
              onClick={() => setViewMode('pdf')}
            >
              PDF view
            </button>
          </div>

          <div className={styles.quickActionsGroup}>
            <button
              type="button"
              className={styles.quickActionLink}
              onClick={() => setSidebarOpen((prev) => !prev)}
            >
              <span className="material-symbols-outlined">settings</span>
              Manage
            </button>
            <button
              type="button"
              className={styles.quickActionLink}
              onClick={handleReceiveItems}
            >
              <span className="material-symbols-outlined">local_shipping</span>
              Receive items
            </button>
            <button
              type="button"
              className={styles.quickActionLink}
              onClick={handleCreateBill}
            >
              <span className="material-symbols-outlined">receipt_long</span>
              Create bill
            </button>
          </div>
        </div>
      </header>

      {/* ═══════════ MAIN WORKSPACE AREA ═══════════ */}
      <div className={styles.workspace}>
        {/* Left Side: Document Canvas */}
        <div className={styles.canvasWrapper}>
          {/* 1. EDIT VIEW */}
          {viewMode === 'edit' && (
            <div className={styles.editContainer}>
              <div className={styles.documentPaper}>
                {/* Header: Company & PO # */}
                <div className={styles.docHeader}>
                  <div>
                    <h2 className={styles.companyTitle}>PURCHASE ORDER</h2>
                    <div className={styles.companyName}>Unsaid</div>
                    <div className={styles.companyMeta}>
                      123 Business Rd, Suite 100
                      <br />
                      hello@unsaid.com
                    </div>
                  </div>
                  <div className={styles.poNumberBlock}>
                    <div className={styles.poLabel}>PO Number</div>
                    <div className={styles.poValue}>{poNumber}</div>
                  </div>
                </div>

                {/* Vendor / Ship To Grid */}
                <div className={styles.partyGrid}>
                  <div className={styles.vendorBlock}>
                    <div className={styles.partyLabel}>Vendor</div>
                    <div className={styles.selectWrapper}>
                      <select
                        className={styles.vendorSelect}
                        value={vendorId}
                        onChange={(e) => setVendorId(e.target.value)}
                      >
                        {vendors.length === 0 && <option value="">No vendors on file</option>}
                        {vendors.map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.name}
                          </option>
                        ))}
                      </select>
                      <span className={`material-symbols-outlined ${styles.selectArrow}`}>
                        expand_more
                      </span>
                    </div>
                    <div className={styles.partyDetails}>
                      {activeVendor?.email}
                      <br />
                      {activeVendor?.phone}
                    </div>
                  </div>

                  <div>
                    <div className={styles.partyLabel}>Ship To</div>
                    <div className={styles.partyName}>Unsaid Warehouse</div>
                    <div className={styles.partyDetails}>
                      456 Warehouse Way
                      <br />
                      Dock 4
                      <br />
                      Springfield, IL 62701
                    </div>
                  </div>
                </div>

                {/* Dates & Terms Row */}
                <div className={styles.metaGrid}>
                  <div className={styles.metaField}>
                    <label className={styles.fieldLabel}>Order Date</label>
                    <input
                      type="text"
                      className={styles.textInput}
                      value={orderDate}
                      onChange={(e) => setOrderDate(e.target.value)}
                    />
                  </div>
                  <div className={styles.metaField}>
                    <label className={styles.fieldLabel}>Expected Delivery</label>
                    <input
                      type="text"
                      className={styles.textInput}
                      value={deliveryDate}
                      onChange={(e) => setDeliveryDate(e.target.value)}
                    />
                  </div>
                  <div className={styles.metaField}>
                    <label className={styles.fieldLabel}>Payment Terms</label>
                    <input
                      type="text"
                      className={styles.textInput}
                      value={paymentTerms}
                      onChange={(e) => setPaymentTerms(e.target.value)}
                    />
                  </div>
                  <div className={styles.metaField}>
                    <label className={styles.fieldLabel}>Ship Via</label>
                    <input
                      type="text"
                      className={styles.textInput}
                      value={shipVia}
                      onChange={(e) => setShipVia(e.target.value)}
                    />
                  </div>
                </div>

                {/* Product Lines Table */}
                <div className={styles.tableWrapper}>
                  <table className={styles.linesTable}>
                    <thead>
                      <tr className={styles.linesHeaderRow}>
                        <th className={styles.thCell} style={{ width: 36 }}></th>
                        {colNum && <th className={styles.thCell} style={{ width: 36 }}>#</th>}
                        {colItem && <th className={styles.thCell}>Item</th>}
                        {colDesc && <th className={styles.thCell}>Description</th>}
                        {colQtyOrd && (
                          <th className={styles.thCellRight} style={{ width: 70 }}>
                            Qty Ord
                          </th>
                        )}
                        {colQtyRcvd && (
                          <th className={styles.thCellRight} style={{ width: 70 }}>
                            Qty Rcvd
                          </th>
                        )}
                        {colCost && (
                          <th className={styles.thCellRight} style={{ width: 90 }}>
                            Unit Cost
                          </th>
                        )}
                        {colAmount && (
                          <th className={styles.thCellLast} style={{ width: 90 }}>
                            Amount
                          </th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {lines.map((line, idx) => (
                        <tr key={line.id} className={styles.lineRow}>
                          <td className={styles.dragCell}>
                            <span className={`material-symbols-outlined ${styles.dragHandle}`}>
                              drag_indicator
                            </span>
                          </td>
                          {colNum && <td className={styles.numCell}>{idx + 1}</td>}
                          {colItem && (
                            <td className={styles.inputCell}>
                              <input
                                className={styles.cellInput}
                                list="po-product-names"
                                value={line.item}
                                onChange={(e) =>
                                  handleUpdateLine(line.id, 'item', e.target.value)
                                }
                              />
                            </td>
                          )}
                          {colDesc && (
                            <td className={styles.inputCell}>
                              <input
                                className={styles.cellInput}
                                value={line.description}
                                onChange={(e) =>
                                  handleUpdateLine(line.id, 'description', e.target.value)
                                }
                              />
                            </td>
                          )}
                          {colQtyOrd && (
                            <td className={styles.numberCell}>
                              <input
                                className={styles.cellInput}
                                style={{ textAlign: 'right' }}
                                type="number"
                                value={line.qtyOrd}
                                onChange={(e) =>
                                  handleUpdateLine(
                                    line.id,
                                    'qtyOrd',
                                    Number(e.target.value) || 0
                                  )
                                }
                              />
                            </td>
                          )}
                          {colQtyRcvd && (
                            <td className={styles.numberCell}>
                              <input
                                className={styles.cellInput}
                                style={{
                                  textAlign: 'right',
                                  color: line.qtyRcvd > 0 ? '#0a6400' : '#5a6355',
                                  fontWeight: 600,
                                }}
                                type="number"
                                value={line.qtyRcvd}
                                onChange={(e) =>
                                  handleUpdateLine(
                                    line.id,
                                    'qtyRcvd',
                                    Number(e.target.value) || 0
                                  )
                                }
                              />
                            </td>
                          )}
                          {colCost && (
                            <td className={styles.numberCell}>
                              <input
                                className={styles.cellInput}
                                style={{ textAlign: 'right' }}
                                type="number"
                                step="0.5"
                                value={line.unitCost}
                                onChange={(e) =>
                                  handleUpdateLine(
                                    line.id,
                                    'unitCost',
                                    Number(e.target.value) || 0
                                  )
                                }
                              />
                            </td>
                          )}
                          {colAmount && (
                            <td className={styles.numberCellLast}>
                              {formatCurrency(line.qtyOrd * line.unitCost)}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {/* Product names for the item picker — names only; unit
                      cost is always entered by hand, never a sell price. */}
                  <datalist id="po-product-names">
                    {productNames.map((n) => (
                      <option key={n} value={n} />
                    ))}
                  </datalist>

                  <div className={styles.tableBtnGroup}>
                    <button
                      type="button"
                      className={styles.tableBtn}
                      onClick={handleAddLine}
                    >
                      Add line item
                      <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                        expand_more
                      </span>
                    </button>
                    <button
                      type="button"
                      className={styles.tableBtn}
                      onClick={handleClearLines}
                    >
                      Clear all lines
                    </button>
                  </div>

                  {/* Notes & Totals */}
                  <div className={styles.bottomSection}>
                    <div className={styles.notesArea}>
                      <div>
                        <label className={styles.sectionLabel}>Vendor Instructions / Notes</label>
                        <textarea
                          className={styles.textarea}
                          placeholder="Include packing slip with PO number. Do not substitute items without approval."
                          value={notes}
                          onChange={(e) => setNotes(e.target.value)}
                        />
                      </div>
                    </div>

                    <div className={styles.totalsArea}>
                      <div className={styles.totalsRow}>
                        <span className={styles.totalsRowMuted}>Subtotal</span>
                        <span style={{ fontWeight: 500 }}>{formatCurrency(subtotal)}</span>
                      </div>
                      <div className={styles.totalsRow}>
                        <span className={styles.totalsRowMuted}>Shipping</span>
                        <input
                          className={styles.cellInput}
                          style={{ textAlign: 'right', width: 110 }}
                          type="number"
                          min={0}
                          step="0.5"
                          value={shipping}
                          onChange={(e) => setShipping(Number(e.target.value) || 0)}
                        />
                      </div>
                      <div className={styles.totalsRow}>
                        <span className={styles.totalsRowMuted}>Tax</span>
                        <span style={{ fontWeight: 500 }}>{formatCurrency(tax)}</span>
                      </div>
                      <div className={styles.totalsRowFinal}>
                        <span>PO Total</span>
                        <span>{formatCurrency(grandTotal)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 2. EMAIL VIEW */}
          {viewMode === 'email' && (
            <div className={styles.emailCard}>
              <div className={styles.emailBanner}>
                <h2 className={styles.emailTitle}>Purchase Order {poNumber}</h2>
                <div className={styles.emailCompany}>Unsaid</div>
                <div className={styles.emailBadgeBox}>
                  <div className={styles.emailBadgeLabel}>PO Total</div>
                  <div className={styles.emailBadgeAmount}>
                    {formatCurrency(grandTotal)}
                  </div>
                </div>
              </div>

              <div className={styles.emailBody}>
                <div className={styles.emailParagraph}>
                  <p>Hi {activeVendor?.name},</p>
                  <p>
                    Please find attached our purchase order {poNumber}. Please confirm
                    receipt and expected delivery date of {deliveryDate}.
                  </p>
                </div>
                <div className={styles.emailCtaWrapper}>
                  <button
                    type="button"
                    className={styles.emailCtaBtn}
                    onClick={() => setViewMode('vendor')}
                  >
                    View Purchase Order
                  </button>
                </div>
                <div className={styles.emailFooter}>
                  <p style={{ fontWeight: 600, color: '#1a1c1e', marginBottom: 2 }}>
                    Unsaid
                  </p>
                  <p>123 Business Rd, Suite 100</p>
                  <p>hello@unsaid.com</p>
                </div>
              </div>
            </div>
          )}

          {/* 3. VENDOR VIEW */}
          {viewMode === 'vendor' && (
            <div className={styles.vendorCard}>
              <div className={styles.docHeader}>
                <div>
                  <h1 className={styles.companyTitle} style={{ fontSize: 28 }}>
                    PURCHASE ORDER
                  </h1>
                  <div className={styles.companyName}>Unsaid</div>
                </div>
                <div className={styles.poNumberBlock}>
                  <div className={styles.poLabel}>PO Total</div>
                  <div className={styles.poValue} style={{ fontSize: 24 }}>
                    {formatCurrency(grandTotal)}
                  </div>
                </div>
              </div>

              <div className={styles.partyGrid}>
                <div>
                  <div className={styles.partyLabel}>Vendor</div>
                  <div className={styles.partyName}>{activeVendor?.name}</div>
                  <div className={styles.partyDetails}>
                    {activeVendor?.email}
                    <br />
                    {activeVendor?.phone}
                  </div>
                </div>
                <div>
                  <div className={styles.partyLabel}>Ship To</div>
                  <div className={styles.partyName}>Unsaid Warehouse</div>
                  <div className={styles.partyDetails}>
                    456 Warehouse Way, Dock 4
                    <br />
                    Springfield, IL 62701
                  </div>
                </div>
              </div>

              <div className={styles.metaGrid}>
                <div>
                  <span className={styles.fieldLabel}>PO Number</span>
                  <span style={{ fontWeight: 500, fontSize: 13 }}>{poNumber}</span>
                </div>
                <div>
                  <span className={styles.fieldLabel}>Order Date</span>
                  <span style={{ fontWeight: 500, fontSize: 13 }}>{orderDate}</span>
                </div>
                <div>
                  <span className={styles.fieldLabel}>Expected Delivery</span>
                  <span style={{ fontWeight: 500, fontSize: 13 }}>{deliveryDate}</span>
                </div>
                <div>
                  <span className={styles.fieldLabel}>Terms</span>
                  <span style={{ fontWeight: 500, fontSize: 13 }}>{paymentTerms}</span>
                </div>
              </div>

              <table className={styles.linesTable} style={{ marginBottom: 32 }}>
                <thead>
                  <tr className={styles.linesHeaderRow}>
                    <th className={styles.thCell}>Item</th>
                    <th className={styles.thCell}>Description</th>
                    <th className={styles.thCellRight}>Qty Ord</th>
                    <th className={styles.thCellRight}>Unit Cost</th>
                    <th className={styles.thCellLast}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l) => (
                    <tr key={l.id} className={styles.lineRow}>
                      <td style={{ fontWeight: 500 }}>{l.item}</td>
                      <td style={{ color: '#5a6355' }}>
                        {l.description || l.item}
                      </td>
                      <td style={{ textAlign: 'right' }}>{l.qtyOrd}</td>
                      <td style={{ textAlign: 'right' }}>{formatCurrency(l.unitCost)}</td>
                      <td style={{ textAlign: 'right', fontWeight: 500 }}>
                        {formatCurrency(l.qtyOrd * l.unitCost)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 48 }}>
                <div style={{ width: 260, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                    <span style={{ color: '#5a6355' }}>Subtotal</span>
                    <span>{formatCurrency(subtotal)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                    <span style={{ color: '#5a6355' }}>Shipping</span>
                    <span>{formatCurrency(shipping)}</span>
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: 14,
                      fontWeight: 600,
                      borderTop: '1px solid #dad9dd',
                      paddingTop: 8,
                      marginTop: 4,
                    }}
                  >
                    <span>Total</span>
                    <span>{formatCurrency(grandTotal)}</span>
                  </div>
                </div>
              </div>

              <div
                style={{
                  borderTop: '1px solid #dad9dd',
                  paddingTop: 24,
                  textAlign: 'center',
                  fontSize: 12,
                  color: '#5a6355',
                }}
              >
                <p>
                  Please include PO Number <strong>{poNumber}</strong> on all packing slips and invoices.
                </p>
              </div>
            </div>
          )}

          {/* 4. PDF VIEW */}
          {viewMode === 'pdf' && (
            <div className={styles.pdfCard}>
              <div className={styles.docHeader} style={{ marginBottom: 48 }}>
                <div>
                  <div className={styles.companyTitle} style={{ fontSize: 24, marginBottom: 4 }}>
                    PURCHASE ORDER
                  </div>
                  <div className={styles.companyName}>Unsaid</div>
                  <div className={styles.companyMeta} style={{ marginTop: 4 }}>
                    123 Business Rd, Suite 100
                  </div>
                </div>
                <div className={styles.poNumberBlock}>
                  <div className={styles.poLabel}>PO Total</div>
                  <div className={styles.poValue} style={{ fontSize: 28, fontWeight: 700 }}>
                    {formatCurrency(grandTotal)}
                  </div>
                </div>
              </div>

              <div className={styles.partyGrid} style={{ marginBottom: 48 }}>
                <div>
                  <div className={styles.partyLabel}>Vendor</div>
                  <div className={styles.partyName}>{activeVendor?.name}</div>
                  <div className={styles.partyDetails}>
                    {activeVendor?.email}
                    <br />
                    {activeVendor?.phone}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div className={styles.partyLabel}>Ship To</div>
                  <div className={styles.partyName}>Unsaid Warehouse</div>
                  <div className={styles.partyDetails}>
                    456 Warehouse Way, Dock 4
                    <br />
                    Springfield, IL 62701
                  </div>
                </div>
              </div>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginBottom: 36,
                  fontSize: 12,
                }}
              >
                <table>
                  <tbody>
                    <tr>
                      <td style={{ color: '#5a6355', paddingRight: 16, paddingBottom: 4 }}>
                        PO Number
                      </td>
                      <td style={{ fontWeight: 600 }}>{poNumber}</td>
                    </tr>
                    <tr>
                      <td style={{ color: '#5a6355', paddingRight: 16, paddingBottom: 4 }}>
                        Order Date
                      </td>
                      <td style={{ fontWeight: 600 }}>{orderDate}</td>
                    </tr>
                  </tbody>
                </table>
                <table>
                  <tbody>
                    <tr>
                      <td style={{ color: '#5a6355', paddingRight: 16, paddingBottom: 4 }}>
                        Expected Delivery
                      </td>
                      <td style={{ fontWeight: 600 }}>{deliveryDate}</td>
                    </tr>
                    <tr>
                      <td style={{ color: '#5a6355', paddingRight: 16, paddingBottom: 4 }}>
                        Terms
                      </td>
                      <td style={{ fontWeight: 600 }}>{paymentTerms}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <table className={styles.linesTable} style={{ marginBottom: 32, fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #dad9dd', color: '#5a6355', fontWeight: 700 }}>
                    <th style={{ padding: '12px 0' }}>Item</th>
                    <th style={{ padding: '12px 0' }}>Description</th>
                    <th style={{ padding: '12px 0', textAlign: 'right' }}>Qty</th>
                    <th style={{ padding: '12px 0', textAlign: 'right' }}>Unit Cost</th>
                    <th style={{ padding: '12px 0', textAlign: 'right' }}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l) => (
                    <tr key={l.id} style={{ borderBottom: '1px solid #eeedf1' }}>
                      <td style={{ padding: '16px 0', fontWeight: 600 }}>
                        {l.item}
                      </td>
                      <td style={{ padding: '16px 0', color: '#5a6355' }}>{l.description}</td>
                      <td style={{ padding: '16px 0', textAlign: 'right' }}>{l.qtyOrd}</td>
                      <td style={{ padding: '16px 0', textAlign: 'right' }}>{formatCurrency(l.unitCost)}</td>
                      <td style={{ padding: '16px 0', textAlign: 'right', fontWeight: 600 }}>
                        {formatCurrency(l.qtyOrd * l.unitCost)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '2px solid #dad9dd', paddingTop: 16 }}>
                <div style={{ width: 260, display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#5a6355' }}>Subtotal</span>
                    <span style={{ fontWeight: 600 }}>{formatCurrency(subtotal)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#5a6355' }}>Shipping</span>
                    <span style={{ fontWeight: 600 }}>{formatCurrency(shipping)}</span>
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: 14,
                      fontWeight: 700,
                      borderTop: '1px solid #eeedf1',
                      paddingTop: 8,
                      marginTop: 4,
                    }}
                  >
                    <span>Total</span>
                    <span>{formatCurrency(grandTotal)}</span>
                  </div>
                </div>
              </div>

              <div style={{ marginTop: 64, textAlign: 'center', fontSize: 11, color: '#6f7a69' }}>
                <p>Please include PO Number {poNumber} on all packing slips.</p>
              </div>
            </div>
          )}
        </div>

        {/* Right Side: Sidebar Controls (only in Edit view) */}
        {viewMode === 'edit' && sidebarOpen && (
          <aside className={styles.sidebar}>
            <div className={styles.sidebarHeader}>
              <h2 className={styles.sidebarTitle}>{poNumber}</h2>
              <button
                type="button"
                className={styles.iconBtn}
                onClick={() => setSidebarOpen(false)}
                title="Collapse sidebar"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <div className={styles.sidebarBody}>
              {/* Status Dropdown */}
              <div className={styles.statusDropdownContainer}>
                <button
                  type="button"
                  className={styles.statusSelectBtn}
                  onClick={() => setStatusMenuOpen((prev) => !prev)}
                >
                  {status}
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                    expand_more
                  </span>
                </button>

                {statusMenuOpen && (
                  <div className={styles.dropdownMenu}>
                    {(['Open', 'Sent to Vendor', 'Cancelled'] as POStatus[]).map((st) => (
                      <button
                        key={st}
                        type="button"
                        className={styles.dropdownMenuItem}
                        onClick={() => changeStatus(st)}
                      >
                        {st}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {/* Receiving is derived from the lines — shown here, not set. */}
              <div className={styles.kpiStatRow}>
                <span className={styles.kpiStatLabel}>Receiving</span>
                <span style={{ fontWeight: 500 }}>{receiving}</span>
              </div>

              {/* Accordions Stack */}
              <div className={styles.accordionsStack}>
                {/* 1. Customization */}
                <div className={styles.accordionCard}>
                  <button
                    type="button"
                    className={styles.accordionHeader}
                    onClick={() => toggleAccordion('customization')}
                  >
                    Customization
                    <span className="material-symbols-outlined">
                      {expandedAccordions.customization ? 'expand_less' : 'expand_more'}
                    </span>
                  </button>
                  {expandedAccordions.customization && (
                    <div className={styles.accordionContent}>
                      <div className={styles.switchRow}>
                        <span>Show Unit Cost</span>
                        <label className={styles.switch}>
                          <input
                            type="checkbox"
                            checked={showUnitCost}
                            onChange={(e) => setShowUnitCost(e.target.checked)}
                          />
                          <span className={styles.slider}></span>
                        </label>
                      </div>
                      <div className={styles.switchRow}>
                        <span>Show Receiving Status</span>
                        <label className={styles.switch}>
                          <input
                            type="checkbox"
                            checked={showReceivingStatus}
                            onChange={(e) => setShowReceivingStatus(e.target.checked)}
                          />
                          <span className={styles.slider}></span>
                        </label>
                      </div>

                      <div className={styles.tableContentSubhead}>
                        <span className={styles.subheadTitle}>Table content</span>
                      </div>

                      <div className={styles.switchRow}>
                        <span>#</span>
                        <label className={styles.switch}>
                          <input
                            type="checkbox"
                            checked={colNum}
                            onChange={(e) => setColNum(e.target.checked)}
                          />
                          <span className={styles.slider}></span>
                        </label>
                      </div>
                      <div className={styles.switchRow}>
                        <span>Item</span>
                        <label className={styles.switch}>
                          <input
                            type="checkbox"
                            checked={colItem}
                            onChange={(e) => setColItem(e.target.checked)}
                          />
                          <span className={styles.slider}></span>
                        </label>
                      </div>
                      <div className={styles.switchRow}>
                        <span>Description</span>
                        <label className={styles.switch}>
                          <input
                            type="checkbox"
                            checked={colDesc}
                            onChange={(e) => setColDesc(e.target.checked)}
                          />
                          <span className={styles.slider}></span>
                        </label>
                      </div>
                      <div className={styles.switchRow}>
                        <span>Qty Ordered</span>
                        <label className={styles.switch}>
                          <input
                            type="checkbox"
                            checked={colQtyOrd}
                            onChange={(e) => setColQtyOrd(e.target.checked)}
                          />
                          <span className={styles.slider}></span>
                        </label>
                      </div>
                      <div className={styles.switchRow}>
                        <span>Qty Received</span>
                        <label className={styles.switch}>
                          <input
                            type="checkbox"
                            checked={colQtyRcvd}
                            onChange={(e) => setColQtyRcvd(e.target.checked)}
                          />
                          <span className={styles.slider}></span>
                        </label>
                      </div>
                      <div className={styles.switchRow}>
                        <span>Unit Cost</span>
                        <label className={styles.switch}>
                          <input
                            type="checkbox"
                            checked={colCost}
                            onChange={(e) => setColCost(e.target.checked)}
                          />
                          <span className={styles.slider}></span>
                        </label>
                      </div>
                      <div className={styles.switchRow}>
                        <span>Amount</span>
                        <label className={styles.switch}>
                          <input
                            type="checkbox"
                            checked={colAmount}
                            onChange={(e) => setColAmount(e.target.checked)}
                          />
                          <span className={styles.slider}></span>
                        </label>
                      </div>
                    </div>
                  )}
                </div>

                {/* 2. Receiving */}
                <div className={styles.accordionCard}>
                  <button
                    type="button"
                    className={styles.accordionHeader}
                    onClick={() => toggleAccordion('receiving')}
                  >
                    Receiving
                    <span className="material-symbols-outlined">
                      {expandedAccordions.receiving ? 'expand_less' : 'expand_more'}
                    </span>
                  </button>
                  {expandedAccordions.receiving && (
                    <div className={styles.accordionContent}>
                      <div className={styles.kpiStatRow}>
                        <span className={styles.kpiStatLabel}>Items ordered</span>
                        <span style={{ fontWeight: 500 }}>{totalQtyOrd}</span>
                      </div>
                      <div className={styles.kpiStatRow}>
                        <span className={styles.kpiStatLabel}>Items received</span>
                        <span style={{ fontWeight: 600, color: '#0a6400' }}>
                          {totalQtyRcvd}
                        </span>
                      </div>
                      <div className={styles.kpiStatRow}>
                        <span className={styles.kpiStatLabel}>Items remaining</span>
                        <span
                          style={{
                            fontWeight: 600,
                            color: totalQtyRemaining > 0 ? '#ba1a1a' : '#0a6400',
                          }}
                        >
                          {totalQtyRemaining}
                        </span>
                      </div>
                      <button
                        type="button"
                        className={styles.receiveItemsBtn}
                        onClick={handleReceiveItems}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                          local_shipping
                        </span>
                        Receive items
                      </button>
                    </div>
                  )}
                </div>

                {/* 3. Billing & Terms */}
                <div className={styles.accordionCard}>
                  <button
                    type="button"
                    className={styles.accordionHeader}
                    onClick={() => toggleAccordion('billing')}
                  >
                    Billing &amp; Terms
                    <span className="material-symbols-outlined">
                      {expandedAccordions.billing ? 'expand_less' : 'expand_more'}
                    </span>
                  </button>
                  {expandedAccordions.billing && (
                    <div className={styles.accordionContent}>
                      <div className={styles.kpiStatRow}>
                        <span className={styles.kpiStatLabel}>Payment Terms</span>
                        <span style={{ fontWeight: 500 }}>{paymentTerms}</span>
                      </div>
                      <div className={styles.kpiStatRow}>
                        <span className={styles.kpiStatLabel}>Ship Via</span>
                        <span style={{ fontWeight: 500 }}>{shipVia || '—'}</span>
                      </div>
                      <div className={styles.kpiStatRow}>
                        <span className={styles.kpiStatLabel}>FOB</span>
                        <span style={{ fontWeight: 500 }}>Destination</span>
                      </div>
                      <div style={{ marginTop: 12 }}>
                        <label style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#5a6355', marginBottom: 6 }}>
                          Expense account for bill lines
                        </label>
                        <select
                          className={styles.vendorSelect}
                          style={{ width: '100%' }}
                          value={billAccountId}
                          onChange={(e) => setBillAccountId(e.target.value)}
                        >
                          {expenseAccounts.length === 0 && <option value="">No expense accounts</option>}
                          {expenseAccounts.map((a) => (
                            <option key={a.id} value={a.id}>{a.label}</option>
                          ))}
                        </select>
                        <div style={{ fontSize: 11, color: '#5a6355', marginTop: 6 }}>
                          Bill lines require an expense account — this one rides
                          on every line when you create a bill from this PO.
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* 4. Attachments */}
                <div className={styles.accordionCard}>
                  <button
                    type="button"
                    className={styles.accordionHeader}
                    onClick={() => toggleAccordion('attachments')}
                  >
                    Attachments
                    <span className="material-symbols-outlined">
                      {expandedAccordions.attachments ? 'expand_less' : 'expand_more'}
                    </span>
                  </button>
                  {expandedAccordions.attachments && (
                    <div
                      className={styles.accordionContent}
                      style={{ color: '#5a6355', fontSize: 13 }}
                    >
                      No attachments.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </aside>
        )}
      </div>

      {/* ═══════════ FOOTER ═══════════ */}
      <footer className={styles.footer}>
        <div style={{ width: '30%' }}></div>
        <div style={{ flex: 1, textAlign: 'center' }}>
          <button
            type="button"
            className={styles.printLink}
            onClick={() => window.print()}
          >
            Print or download
          </button>
        </div>

        <div className={styles.footerActions} style={{ width: '30%', justifyContent: 'flex-end' }}>
          {/* Split Save button */}
          <div className={styles.splitBtnGroup}>
            <button
              type="button"
              className={styles.splitBtnMain}
              disabled={saving}
              onClick={async () => {
                const id = await savePo();
                if (id) {
                  onToast?.(`Saved ${poNumber} successfully`);
                  onClose?.();
                }
              }}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              type="button"
              className={styles.splitBtnArrow}
              onClick={() => {
                setSaveMenuOpen((prev) => !prev);
                setSendMenuOpen(false);
              }}
              title="Save options"
            >
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                expand_more
              </span>
            </button>

            {saveMenuOpen && (
              <div className={styles.floatingMenu}>
                <button
                  type="button"
                  className={styles.floatingMenuItem}
                  onClick={async () => {
                    setSaveMenuOpen(false);
                    const id = await savePo();
                    if (id) {
                      // Start a fresh PO editor.
                      setPoId(null);
                      setPoNumber(`PO-${Date.now()}`);
                      setStoredStatus('ordered');
                      setOrderDate(toDisplayDate(todayIso()));
                      setDeliveryDate('');
                      setNotes('');
                      setLines([]);
                      setShipping(0);
                      onToast?.('Saved — new purchase order started');
                    }
                  }}
                >
                  Save and new
                </button>
                <button
                  type="button"
                  className={styles.floatingMenuItem}
                  onClick={async () => {
                    setSaveMenuOpen(false);
                    const id = await savePo();
                    if (id) {
                      onToast?.('Saved and closed');
                      if (onClose) onClose();
                    }
                  }}
                >
                  Save and close
                </button>
              </div>
            )}
          </div>

          {/* Split Send button */}
          <div className={styles.splitBtnGroup}>
            <button
              type="button"
              className={styles.splitBtnPrimaryMain}
              disabled={sending}
              onClick={sendPo}
            >
              {sending ? 'Sending…' : 'Send to Vendor'}
            </button>
            <button
              type="button"
              className={styles.splitBtnPrimaryArrow}
              onClick={() => {
                setSendMenuOpen((prev) => !prev);
                setSaveMenuOpen(false);
              }}
              title="Send options"
            >
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                expand_more
              </span>
            </button>

            {sendMenuOpen && (
              <div className={styles.floatingMenu}>
                <button
                  type="button"
                  className={styles.floatingMenuItem}
                  onClick={() => {
                    setSendMenuOpen(false);
                    sendPo();
                  }}
                >
                  Send to Vendor
                </button>
                <button
                  type="button"
                  className={styles.floatingMenuItem}
                  onClick={() => {
                    setSendMenuOpen(false);
                    window.print();
                  }}
                >
                  Download PDF
                </button>
              </div>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
}
