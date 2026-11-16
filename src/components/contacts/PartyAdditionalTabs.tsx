'use client';
/**
 * PartyAdditionalTabs — the customer-profile tabs that bind every
 * finance/commerce object back to the customer record.
 *
 * Ported 1:1 from /upload/customer profile addtional tabs.html. Every tab
 * uses the same table pattern (Date · No. · Memo · Amount · Status) with
 * a row menu (Open record / Print slip / Print label / Refund / Return /
 * Cancel) and the same empty-state. Tabs included:
 *
 *   Orders            — sales orders placed by this customer
 *   Invoices          — invoices issued to this customer (instant charges)
 *   Returns           — RMAs linked to this customer
 *   Support tickets   — support tickets opened by/for this customer
 *   Tracked records   — properties/addresses/properties tracked against the customer
 *   Calls             — call log (inbound/outbound)
 *   Files             — documents uploaded against the customer
 *
 * Note on Statements vs Invoices (USER-GUIDE):
 *   - Statement = a rolling 30-day SUMMARY of charges/transactions over time
 *   - Invoice   = an INSTANT, single charge
 *   Both already exist as separate tabs on PartyProfile ('statements' and
 *   'invoices'). Don't conflate them.
 */
import { useState } from 'react';

export interface AddlRow {
  id: string;
  date: string;
  memo: string;
  amount?: number;
  status: string;
  progress?: string; // for sequences
}

/* ────────────────────────────────────────────────────────────────── *
 *  DEMO DATA — same values as the HTML. Production: hydrate from the
 *  real APIs (/api/orders?customer_id, /api/invoices?customer_id, etc.)
 * ────────────────────────────────────────────────────────────────── */
const ORDERS: AddlRow[] = [
  { id: '1047', date: 'Nov 03, 2026', memo: 'Classic Tee ×2, Canvas Tote ×1',  amount: 71.28,  status: 'Unfulfilled' },
  { id: '1042', date: 'Oct 29, 2026', memo: 'Classic Tee ×1, Hoodie ×1',       amount: 156.00, status: 'Unfulfilled' },
  { id: '1041', date: 'Oct 28, 2026', memo: 'Canvas Tote ×3',                   amount: 54.00,  status: 'Ready' },
  { id: '1039', date: 'Oct 22, 2026', memo: 'Hoodie ×1, Beanie ×2',            amount: 128.00, status: 'Shipped' },
  { id: '1032', date: 'Oct 15, 2026', memo: 'Canvas Tote ×2, Sticker pack ×4', amount: 168.00, status: 'Delivered' },
  { id: '1028', date: 'Oct 08, 2026', memo: 'Hoodie ×1',                       amount: 58.00,  status: 'Delivered' },
  { id: '1021', date: 'Sep 28, 2026', memo: 'Mug ×2, Sticker pack ×2',         amount: 92.00,  status: 'Delivered' },
  { id: '1018', date: 'Sep 14, 2026', memo: 'Classic Tee ×2',                  amount: 84.00,  status: 'Delivered' },
  { id: '1015', date: 'Sep 05, 2026', memo: 'Canvas Tote ×1',                   amount: 18.00,  status: 'Cancelled' },
  { id: '1012', date: 'Aug 22, 2026', memo: 'Hoodie ×1, Mug ×2',                amount: 96.00,  status: 'Delivered' },
  { id: '1009', date: 'Aug 10, 2026', memo: 'Classic Tee ×1',                  amount: 24.00,  status: 'Delivered' },
  { id: '1004', date: 'Jul 18, 2026', memo: 'Beanie ×2',                       amount: 48.00,  status: 'Delivered' },
];

const INVOICES: AddlRow[] = [
  { id: 'INV-2847', date: 'Nov 03, 2026', memo: 'Order #1047', amount: 71.28,  status: 'Paid' },
  { id: 'INV-2846', date: 'Oct 29, 2026', memo: 'Order #1042', amount: 156.00, status: 'Paid' },
  { id: 'INV-2845', date: 'Oct 28, 2026', memo: 'Order #1041', amount: 54.00,  status: 'Paid' },
  { id: 'INV-2840', date: 'Oct 22, 2026', memo: 'Order #1039', amount: 128.00, status: 'Paid' },
  { id: 'INV-2834', date: 'Oct 15, 2026', memo: 'Order #1032', amount: 168.00, status: 'Paid' },
  { id: 'INV-2830', date: 'Oct 08, 2026', memo: 'Order #1028', amount: 58.00,  status: 'Paid' },
  { id: 'INV-2821', date: 'Sep 28, 2026', memo: 'Order #1021', amount: 92.00,  status: 'Paid' },
  { id: 'INV-2815', date: 'Sep 14, 2026', memo: 'Order #1018', amount: 84.00,  status: 'Paid' },
];

const RETURNS: AddlRow[] = [
  { id: 'RMA-099', date: 'Oct 30, 2026', memo: 'Hoodie ×1 — wrong size', amount: 58.00, status: 'In transit' },
];

const TICKETS: AddlRow[] = [
  { id: 'TKT-412', date: 'Nov 04, 2026', memo: 'Question about shipping delay',   status: 'Open' },
  { id: 'TKT-388', date: 'Oct 20, 2026', memo: 'Request for invoice copy',        status: 'Completed' },
];

const TRACKED: AddlRow[] = [
  { id: 'TRK-01', date: 'Jan 12, 2024', memo: 'Acme warehouse — Property, 22 Park Ave', status: 'Active' },
];

const CALLS: AddlRow[] = [
  { id: 'CALL-31', date: 'Nov 02, 2026', memo: 'Inbound — 4m 22s — shipment question',   status: 'Completed' },
  { id: 'CALL-22', date: 'Oct 15, 2026', memo: 'Outbound — 8m 11s — bulk order inquiry', status: 'Completed' },
];

const FILES: AddlRow[] = [
  { id: 'FILE-01', date: 'Oct 15, 2026', memo: 'W9_Acme_2024.pdf · 88 KB',                status: 'Info' },
  { id: 'FILE-02', date: 'Sep 22, 2026', memo: 'Purchase_agreement_signed.pdf · 340 KB', status: 'Info' },
];

/* ── pill class helper — mirrors the HTML's .stat classes ── */
function statClass(status: string): string {
  const s = status.toLowerCase().replace(/\s+/g, '');
  if (['delivered', 'paid', 'completed', 'active'].includes(s)) return 'stat success';
  if (['unfulfilled', 'pending', 'ready', 'upcoming', 'in-transit'].includes(s)) return s === 'ready' ? 'stat info' : 'stat warn';
  if (['cancelled', 'failed', 'error', 'overdue'].includes(s)) return 'stat error';
  if (['shipped', 'sent', 'open', 'info'].includes(s)) return 'stat info';
  return 'stat neutral';
}

function usd(n: number): string {
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/* ── columns per tab (matches the HTML's TAB_MAP) ── */
const COLUMNS: Record<string, string[]> = {
  orders:   ['Date', 'No.', 'Memo', 'Amount', 'Status'],
  invoices: ['Date', 'No.', 'Memo', 'Amount', 'Status'],
  returns:  ['Date', 'No.', 'Memo', 'Amount', 'Status'],
  tickets:  ['Date', 'No.', 'Memo', 'Status'],
  tracked:  ['Added', 'No.', 'Record', 'Status'],
  calls:    ['When', 'No.', 'Call', 'Status'],
  files:    ['Added', 'No.', 'File', 'Status'],
};

const DATA: Record<string, AddlRow[]> = {
  orders: ORDERS,
  invoices: INVOICES,
  returns: RETURNS,
  tickets: TICKETS,
  tracked: TRACKED,
  calls: CALLS,
  files: FILES,
};

/* ── row-menu items per tab (mirrors the HTML's #rowMenu) ── */
const ROW_MENU_ITEMS = [
  { header: 'Open' },
  { action: 'view',      label: 'Open record',      icon: 'open_in_new' },
  { header: 'Fulfillment' },
  { action: 'slip',      label: 'Print packing slip', icon: 'receipt' },
  { action: 'label',     label: 'Print shipping label', icon: 'print' },
  { header: 'Post-order' },
  { action: 'refund',    label: 'Issue refund…',    icon: 'undo' },
  { action: 'return',    label: 'Create return',    icon: 'assignment_return' },
  { sep: true },
  { action: 'cancel',    label: 'Cancel',            icon: 'block', danger: true },
];

/* ═════════════════════════════════════════════════════════════════ *
 *  COMPONENT — one per tab, all share the same table renderer.
 * ═════════════════════════════════════════════════════════════════ */
interface TabProps {
  onToast: (m: string) => void;
  onNavigate?: (d: string, s: string) => void;
}

function RecordTable({
  tabKey,
  rows,
  isOrder,
  onToast,
  onNavigate,
}: {
  tabKey: string;
  rows: AddlRow[];
  isOrder: boolean;
  onToast: (m: string) => void;
  onNavigate?: (d: string, s: string) => void;
}) {
  const [rowMenuForId, setRowMenuForId] = useState<string | null>(null);
  const cols = COLUMNS[tabKey];

  if (rows.length === 0) {
    return (
      <div className="p-12 text-center text-on-surface-variant">
        <span className="material-symbols-outlined text-[48px] text-surface-dim mb-3 block">inbox</span>
        <div className="text-[14px] font-semibold text-on-surface mb-1">No {tabKey.replace('-', ' ')}</div>
        <div className="text-[12px]">Nothing here yet.</div>
      </div>
    );
  }

  return (
    <div className="relative">
      <table className="w-full text-left text-[13px]">
        <thead className="bg-surface-container-low text-[11px] text-on-surface-variant uppercase tracking-wider border-b border-surface-dim">
          <tr>
            <th className="w-10 px-4 py-2 text-center">
              <input type="checkbox" className="rounded border-surface-dim" />
            </th>
            {isOrder && <th className="px-4 py-2 font-semibold">Type</th>}
            {cols.map(c => (
              <th
                key={c}
                className={`px-4 py-2 font-semibold ${c === 'Amount' ? 'text-right' : ''}`}
              >
                {c}
              </th>
            ))}
            {isOrder && <th className="px-4 py-2 font-semibold">Customer</th>}
            <th className="w-10 px-4 py-2" />
          </tr>
        </thead>
        <tbody className="divide-y divide-surface-dim">
          {rows.map(r => (
            <tr
              key={r.id}
              className="table-row cursor-pointer hover:bg-[#faf9fc] relative"
              onClick={() => {
                // Orders open the Order Detail page; everything else just toasts.
                if (tabKey === 'orders') {
                  onNavigate?.('orders', 'order-detail');
                } else {
                  onToast(`Navigate → ${r.id}`);
                }
              }}
            >
              <td className="px-4 py-3 text-center" onClick={e => e.stopPropagation()}>
                <input type="checkbox" className="rounded border-surface-dim" />
              </td>
              {isOrder && <td className="px-4 py-3">Order</td>}
              <td className="px-4 py-3 text-on-surface-variant whitespace-nowrap">{r.date}</td>
              <td className="px-4 py-3 font-semibold text-primary hover:underline">{r.id}</td>
              <td className="px-4 py-3 text-on-surface-variant">{r.memo}</td>
              {cols.includes('Amount') && (
                <td className="px-4 py-3 text-right tabular-nums">
                  {r.amount !== undefined ? usd(r.amount) : '—'}
                </td>
              )}
              <td className="px-4 py-3">
                <span className={statClass(r.status)}>{r.status}</span>
              </td>
              {isOrder && <td className="px-4 py-3">Acme Corp</td>}
              <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
                <button
                  className="w-6 h-6 rounded hover:bg-surface-container flex items-center justify-center row-actions text-on-surface-variant"
                  onClick={ev => {
                    ev.stopPropagation();
                    setRowMenuForId(rowMenuForId === r.id ? null : r.id);
                  }}
                >
                  <span className="material-symbols-outlined text-[16px]">more_horiz</span>
                </button>
                {rowMenuForId === r.id && (
                  <>
                    <div className="fixed inset-0 z-30" onClick={() => setRowMenuForId(null)} />
                    <div className="row-menu open absolute right-0 mt-1 z-40" style={{ minWidth: 250 }}>
                      {ROW_MENU_ITEMS.map((item, i) => {
                        if ('sep' in item) return <div key={i} className="sep" />;
                        if ('header' in item) return <div key={i} className="menu-header">{item.header}</div>;
                        return (
                          <button
                            key={i}
                            className={item.danger ? 'danger' : ''}
                            onClick={ev => {
                              ev.stopPropagation();
                              setRowMenuForId(null);
                              const act = item.action;
                              if (act === 'cancel') {
                                if (window.confirm(`Cancel ${r.id}? A refund will be issued.`)) {
                                  onToast(`${r.id} cancelled`);
                                }
                              } else {
                                onToast(`${act} — ${r.id}`);
                              }
                            }}
                          >
                            <span className="material-symbols-outlined">{item.icon}</span>
                            {item.label}
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ── Per-tab exports — each is a thin wrapper around RecordTable ── */
export function OrdersTab({ onToast, onNavigate }: TabProps) {
  return <RecordTable tabKey="orders" rows={ORDERS} isOrder onToast={onToast} onNavigate={onNavigate} />;
}
export function InvoicesTab({ onToast }: TabProps) {
  return <RecordTable tabKey="invoices" rows={INVOICES} isOrder={false} onToast={onToast} />;
}
export function ReturnsTab({ onToast }: TabProps) {
  return <RecordTable tabKey="returns" rows={RETURNS} isOrder={false} onToast={onToast} />;
}
export function TicketsTab({ onToast }: TabProps) {
  return <RecordTable tabKey="tickets" rows={TICKETS} isOrder={false} onToast={onToast} />;
}
export function TrackedTab({ onToast }: TabProps) {
  return <RecordTable tabKey="tracked" rows={TRACKED} isOrder={false} onToast={onToast} />;
}
export function CallsTab({ onToast }: TabProps) {
  return <RecordTable tabKey="calls" rows={CALLS} isOrder={false} onToast={onToast} />;
}
export function FilesTab({ onToast }: TabProps) {
  return <RecordTable tabKey="files" rows={FILES} isOrder={false} onToast={onToast} />;
}

/* ── count exports — for the tab badges in PartyProfile ── */
export const ADDL_COUNTS = {
  orders: ORDERS.length,
  invoices: INVOICES.length,
  returns: RETURNS.length,
  tickets: TICKETS.length,
  tracked: TRACKED.length,
  calls: CALLS.length,
  files: FILES.length,
};
