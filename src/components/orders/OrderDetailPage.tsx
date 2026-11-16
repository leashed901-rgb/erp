'use client';
/**
 * OrderDetailPage — canonical order detail surface.
 *
 * Pixel-perfect 1:1 port of /upload/order detail and order record.html.
 * Clicking an order row in the Orders list navigates here (same pattern
 * as PartyProfile / SellerProfilePage).
 *
 * Layout:
 *   - 52px sticky context header (back · crumb · Email customer · Actions menu)
 *   - Order identity (title, status pill, SLA pill, drop-ship pill, placed
 *     date, channel, customer link, tags bar) + totals card (Order total + Paid + Fulfillment X/Y)
 *   - 4 tabs: Details · Timeline · Internal notes · Related records
 *   - Details: line items + totals + fulfillment pipeline (5 stages)
 *     + Customer card + Shipping card + Risk & compliance card
 *   - Timeline: immutable event log with category filter
 *   - Notes: threaded notes with pin/delete + composer
 *   - Related: 4 cards (Returns, Invoices, Support tickets, POs)
 *   - Modals: Advance status · Edit shipping address · Cancel order
 */
import { useMemo, useState } from 'react';
import { useOrderStore, type OrderSummary } from '@/lib/orderStore';

interface OrderDetailPageProps {
  onToast: (m: string) => void;
  onNavigate?: (d: string, s: string) => void;
}

type Tab = 'details' | 'timeline' | 'notes' | 'related';
type Status = 'Unfulfilled' | 'Ready' | 'Shipped' | 'Delivered' | 'Cancelled';

/* ────────────────────────────────────────────────────────────────── *
 *  TYPES — mirror the HTML `state` object verbatim.
 * ────────────────────────────────────────────────────────────────── */
interface OrderLine {
  id: string;
  name: string;
  sku: string;
  qty: number;
  unitPrice: number;
  icon: string;
  colorFrom: string;
  colorTo: string;
  supplier: string;
  fulfillment: 'Unfulfilled' | 'Shipped';
}
interface OrderTotals { subtotal: number; shipping: number; tax: number; total: number; }
interface OrderAddress { name: string; street: string; city: string; state: string; zip: string; country: string; }
interface TimelineEvent {
  id: string;
  category: 'fulfillment' | 'payment' | 'comms' | 'admin';
  action: string;
  title: string;
  detail: string;
  at: string;
  icon: string;
  color: string;
}
interface Note {
  id: string;
  author: string;
  authorInit: string;
  authorColor: string;
  body: string;
  at: string;
  pinned: boolean;
}
interface RelatedItem { id: string; amount?: number; status: string; at?: string; supplier?: string; }
interface RelatedRecords {
  returns: RelatedItem[];
  invoices: RelatedItem[];
  tickets: RelatedItem[];
  pos: RelatedItem[];
}

/* ────────────────────────────────────────────────────────────────── *
 *  DEMO STATE — same values as the HTML. If a real order summary is
 *  available (from the Orders list row), use its id/customer/total;
 *  otherwise default to the HTML's #1047 demo.
 * ────────────────────────────────────────────────────────────────── */
const DEMO_LINES: OrderLine[] = [
  { id: 'line-1', name: 'Classic Tee — M / White', sku: 'TEE-001-M-WHT', qty: 2, unitPrice: 24.00, icon: 'checkroom', colorFrom: '#0077c5', colorTo: '#1f2937', supplier: 'Printful', fulfillment: 'Unfulfilled' },
  { id: 'line-2', name: 'Canvas Tote', sku: 'TOTE-014', qty: 1, unitPrice: 18.00, icon: 'shopping_bag', colorFrom: '#0e5e6f', colorTo: '#1e5a38', supplier: 'Printful', fulfillment: 'Unfulfilled' },
];

const DEMO_TIMELINE: TimelineEvent[] = [
  { id: 't-4', category: 'fulfillment', action: 'slip_printed', title: 'Packing slip printed', detail: 'By Nate · 1 copy', at: 'Nov 03 · 2:18 PM', icon: 'receipt', color: '#1e5a38' },
  { id: 't-3', category: 'comms',       action: 'email_sent', title: 'Order confirmation email sent', detail: 'To accounting@acme.com', at: 'Nov 03 · 2:16 PM', icon: 'mail', color: '#1e5a38' },
  { id: 't-2', category: 'payment',     action: 'payment_captured', title: 'Payment captured', detail: '$71.28 · Visa •4421 · stripe ch_3PqXa2', at: 'Nov 03 · 2:15 PM', icon: 'payments', color: '#1e5a38' },
  { id: 't-1', category: 'admin',       action: 'order_placed', title: 'Order placed', detail: 'Source: Shop channel · session c-9a2b', at: 'Nov 03 · 2:15 PM', icon: 'shopping_cart', color: '#e9e8eb' },
];

const DEMO_NOTES: Note[] = [
  { id: 'n-2', author: 'Nate', authorInit: 'N', authorColor: '#6b1e28', body: 'Called Printful — their queue is delayed. Estimated label by EOD Nov 04. Set reminder.', at: 'Nov 03 · 3:45 PM', pinned: false },
  { id: 'n-1', author: 'Nate', authorInit: 'N', authorColor: '#6b1e28', body: 'Customer confirmed expedited shipping over email. Waiting on Printful label before we can dispatch.', at: 'Nov 03 · 2:20 PM', pinned: true },
];

const DEMO_RELATED: RelatedRecords = {
  returns: [],
  invoices: [{ id: 'INV-2847', amount: 71.28, status: 'paid', at: 'Nov 03' }],
  tickets: [],
  pos: [{ id: 'PO-2201', supplier: 'Printful', amount: 1836.00, status: 'confirmed' }],
};

const usd = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function statClass(status: string): string {
  const s = status.toLowerCase().replace(/\s+/g, '');
  if (['delivered', 'paid', 'completed', 'success', 'active'].includes(s)) return 'stat success';
  if (['unfulfilled', 'pending', 'ready', 'upcoming', 'warn'].includes(s)) return s === 'ready' ? 'stat info' : 'stat warn';
  if (['cancelled', 'failed', 'error', 'overdue'].includes(s)) return 'stat error';
  if (['shipped', 'in-transit'].includes(s)) return 'stat info';
  return 'stat neutral';
}

/* ═════════════════════════════════════════════════════════════════ *
 *  COMPONENT
 * ═════════════════════════════════════════════════════════════════ */
export default function OrderDetailPage({ onToast, onNavigate }: OrderDetailPageProps) {
  const selectedOrderId = useOrderStore(s => s.selectedOrderId);
  const selectedSummary = useOrderStore(s => s.selectedOrderSummary);

  const [tab, setTab] = useState<Tab>('details');
  const [actionMenuOpen, setActionMenuOpen] = useState(false);
  const [lineMenuForId, setLineMenuForId] = useState<string | null>(null);
  const [advanceModalOpen, setAdvanceModalOpen] = useState(false);
  const [addressModalOpen, setAddressModalOpen] = useState(false);
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [cancelConfirmText, setCancelConfirmText] = useState('');
  const [cancelReason, setCancelReason] = useState('Customer request');
  const [timelineFilter, setTimelineFilter] = useState<'all' | 'fulfillment' | 'payment' | 'comms' | 'admin'>('all');
  const [newNote, setNewNote] = useState('');
  const [pinNewNote, setPinNewNote] = useState(false);

  // Mutable copies of state so actions visibly mutate the page.
  const [lines, setLines] = useState<OrderLine[]>(DEMO_LINES);
  const [timeline, setTimeline] = useState<TimelineEvent[]>(DEMO_TIMELINE);
  const [notes, setNotes] = useState<Note[]>(DEMO_NOTES);
  const [related, setRelated] = useState<RelatedRecords>(DEMO_RELATED);
  const [status, setStatus] = useState<Status>('Unfulfilled');
  const [slipPrinted, setSlipPrinted] = useState(true);
  const [labelPrinted, setLabelPrinted] = useState(false);
  const [tracking, setTracking] = useState<string | null>(null);
  const [tags, setTags] = useState<string[]>(['needs_attention', 'wholesale']);
  const [address, setAddress] = useState<OrderAddress>({
    name: 'Acme Corp', street: '22 Park Ave', city: 'Asheville', state: 'NC', zip: '28801', country: 'United States',
  });

  // Derived totals — useMemo must be called unconditionally (before any early
  // return) per React hooks rules.
  const totals: OrderTotals = useMemo(() => {
    const subtotal = lines.reduce((s, l) => s + l.qty * l.unitPrice, 0);
    const tax = subtotal * 0.08;
    return { subtotal, shipping: 0, tax, total: subtotal + tax };
  }, [lines]);

  /* ── no selection ── */
  if (!selectedOrderId) {
    return (
      <main className="px-6 pb-12 flex flex-col h-full">
        <div className="py-16 text-center">
          <div className="w-14 h-14 mx-auto rounded-full bg-surface-container-low flex items-center justify-center mb-3">
            <span className="material-symbols-outlined text-[28px] text-outline">receipt_long</span>
          </div>
          <h3 className="text-headline-sm mb-1">Select an order from the Orders list</h3>
          <p className="text-body-sm text-on-surface-variant mb-4 max-w-md mx-auto">
            This screen shows the line items, fulfillment pipeline, timeline, internal notes, and related records for one order.
          </p>
          <button
            className="h-8 px-3 bg-primary text-white rounded text-body-md font-semibold hover:bg-primary-container"
            onClick={() => onNavigate?.('orders', 'orders')}
          >
            Go to Orders
          </button>
        </div>
      </main>
    );
  }

  const orderId = selectedOrderId;
  const customerName = selectedSummary?.customer ?? 'Acme Corp';

  const totalItems = lines.reduce((s, l) => s + l.qty, 0);
  const shippedItems = lines.filter(l => l.fulfillment === 'Shipped').reduce((s, l) => s + l.qty, 0);

  /* ── event logger ── */
  function logEvent(category: TimelineEvent['category'], action: string, title: string, detail: string) {
    const ev: TimelineEvent = {
      id: `t-${Date.now()}`,
      category,
      action,
      title,
      detail,
      at: 'Just now',
      icon: category === 'fulfillment' ? 'local_shipping' : category === 'payment' ? 'payments' : category === 'comms' ? 'mail' : 'settings',
      color: '#0077c5',
    };
    setTimeline(prev => [ev, ...prev]);
  }

  /* ── action handlers ── */
  function handlePrintSlip() {
    setSlipPrinted(true);
    logEvent('fulfillment', 'slip_printed', 'Packing slip printed', 'By operator · 1 copy');
    onToast('Packing slip queued for print');
  }
  function handlePrintLabel() {
    if (labelPrinted) { onToast('Label already printed'); return; }
    setLabelPrinted(true);
    const newTracking = '9400 1082 0549 6458 1234 56';
    setTracking(newTracking);
    logEvent('fulfillment', 'label_printed', 'Shipping label printed', `Tracking: ${newTracking} · via Printful`);
    onToast('Label generated · tracking attached');
  }
  function handleAddLine() {
    const newLine: OrderLine = {
      id: `line-${Date.now()}`,
      name: 'Sticker pack',
      sku: 'STK-09',
      qty: 1,
      unitPrice: 6.00,
      icon: 'local_offer',
      colorFrom: '#6b1e28',
      colorTo: '#1f2937',
      supplier: 'Printful',
      fulfillment: 'Unfulfilled',
    };
    setLines(prev => [...prev, newLine]);
    logEvent('admin', 'line_added', 'Line added: Sticker pack ×1', 'By operator · requires invoice adjustment');
    onToast('Line added — invoice will be updated');
  }
  function handleCreateReturn() {
    const newRma: RelatedItem = { id: `RMA-${100 + related.returns.length}`, amount: 24.00, status: 'requested', at: 'Today' };
    setRelated(prev => ({ ...prev, returns: [...prev.returns, newRma] }));
    logEvent('admin', 'rma_created', `Return created: ${newRma.id}`, 'Prefilled from order');
    onToast('Return created — awaiting customer shipment');
  }
  function handleReportProblem() {
    const newTkt: RelatedItem = { id: `TKT-${200 + related.tickets.length}`, status: 'open', at: 'Today' };
    setRelated(prev => ({ ...prev, tickets: [...prev.tickets, newTkt] }));
    logEvent('admin', 'ticket_created', 'Support ticket created', 'Linked to this order');
    onToast('Problem reported — support ticket opened');
  }
  function handleAddTag() {
    const tag = window.prompt('Tag name:');
    if (tag && !tags.includes(tag)) {
      setTags(prev => [...prev, tag]);
      logEvent('admin', 'tag_added', `Tag added: ${tag}`, 'By operator');
      onToast('Tag added');
    }
  }
  function removeTag(t: string) {
    setTags(prev => prev.filter(x => x !== t));
    logEvent('admin', 'tag_removed', `Tag removed: ${t}`, 'By Nate');
    onToast('Tag removed');
  }

  /* ── advance status ── */
  function openAdvance() { setAdvanceModalOpen(true); }
  function confirmAdvance() {
    const next: Status = status === 'Unfulfilled' ? 'Ready' : status === 'Ready' ? 'Shipped' : 'Delivered';
    if (next === 'Shipped' && !labelPrinted) { onToast('Cannot advance — generate a label first'); return; }
    setStatus(next);
    logEvent('fulfillment', 'status_changed', `Status: ${status} → ${next}`, 'By operator');
    setAdvanceModalOpen(false);
    onToast(`Order advanced to ${next}`);
  }

  /* ── address modal ── */
  function openAddress() {
    if (status === 'Shipped' || status === 'Delivered') { onToast('Cannot edit address after shipment'); return; }
    setAddressModalOpen(true);
  }
  function saveAddress() {
    logEvent('admin', 'address_changed', 'Shipping address updated', 'Customer notified via email');
    setAddressModalOpen(false);
    onToast('Address updated — customer notified');
  }

  /* ── cancel modal ── */
  function openCancel() {
    setCancelConfirmText('');
    setCancelReason('Customer request');
    setCancelModalOpen(true);
  }
  function confirmCancel() {
    if (cancelConfirmText.trim() !== orderId) { onToast('Type the order ID to confirm'); return; }
    setStatus('Cancelled');
    logEvent('admin', 'order_cancelled', 'Order cancelled', `Reason: ${cancelReason} · refund issued`);
    setCancelModalOpen(false);
    onToast(`Order cancelled · ${usd(totals.total)} refunded`);
  }

  /* ── line actions ── */
  function markLineShipped(lineId: string) {
    if (!labelPrinted) { onToast('Cannot mark shipped — no label yet'); return; }
    setLines(prev => prev.map(l => l.id === lineId ? { ...l, fulfillment: 'Shipped' as const } : l));
    const line = lines.find(l => l.id === lineId);
    if (line) {
      logEvent('fulfillment', 'line_shipped', `${line.name} marked shipped`, `Tracking: ${tracking ?? 'pending'}`);
      onToast('Line marked shipped');
    }
  }
  function removeLine(lineId: string) {
    const line = lines.find(l => l.id === lineId);
    if (!line) return;
    if (!window.confirm(`Remove "${line.name}"? A partial refund of ${usd(line.qty * line.unitPrice)} will be issued.`)) return;
    setLines(prev => prev.filter(l => l.id !== lineId));
    logEvent('admin', 'line_removed', `Line removed: ${line.name}`, `Partial refund: ${usd(line.qty * line.unitPrice)}`);
    onToast('Line removed · partial refund issued');
  }
  function editLineQty(lineId: string) {
    const line = lines.find(l => l.id === lineId);
    if (!line) return;
    const newQty = window.prompt('New quantity:', String(line.qty));
    if (newQty && !isNaN(Number(newQty))) {
      setLines(prev => prev.map(l => l.id === lineId ? { ...l, qty: parseInt(newQty) } : l));
      logEvent('admin', 'line_qty_changed', `${line.name} qty: → ${newQty}`, 'By operator');
      onToast('Quantity updated');
    }
  }
  function editLinePrice(lineId: string) {
    const line = lines.find(l => l.id === lineId);
    if (!line) return;
    const newPrice = window.prompt('New unit price:', line.unitPrice.toFixed(2));
    if (newPrice && !isNaN(Number(newPrice))) {
      setLines(prev => prev.map(l => l.id === lineId ? { ...l, unitPrice: parseFloat(newPrice) } : l));
      logEvent('admin', 'line_price_overridden', `${line.name} price: → ${usd(parseFloat(newPrice))}`, 'Reason required in audit');
      onToast('Price overridden');
    }
  }

  /* ── notes ── */
  function saveNote() {
    const body = newNote.trim();
    if (!body) { onToast('Note is empty'); return; }
    setNotes(prev => [{
      id: `n-${Date.now()}`,
      author: 'Nate',
      authorInit: 'N',
      authorColor: '#6b1e28',
      body,
      at: 'Just now',
      pinned: pinNewNote,
    }, ...prev]);
    setNewNote('');
    setPinNewNote(false);
    onToast('Note saved');
  }
  function toggleNotePin(noteId: string) {
    setNotes(prev => prev.map(n => n.id === noteId ? { ...n, pinned: !n.pinned } : n));
  }
  function deleteNote(noteId: string) {
    if (!window.confirm('Delete this note?')) return;
    setNotes(prev => prev.filter(n => n.id !== noteId));
    onToast('Note deleted');
  }

  /* ── filtered timeline ── */
  const filteredTimeline = timelineFilter === 'all' ? timeline : timeline.filter(t => t.category === timelineFilter);

  /* ── pipeline stages ── */
  const stages = [
    { key: 'Paid',          done: true,                                           at: 'Nov 03' },
    { key: 'Slip printed',  done: slipPrinted,                                    at: slipPrinted ? 'Nov 03' : null },
    { key: 'Label printed', done: labelPrinted, current: !labelPrinted,           at: null },
    { key: 'Shipped',       done: status === 'Shipped' || status === 'Delivered',  at: status === 'Shipped' ? 'Today' : null },
    { key: 'Delivered',     done: status === 'Delivered',                          at: null },
  ];

  /* ═════════════════════════════════════════════════════════════════
   *  RENDER
   * ═════════════════════════════════════════════════════════════════ */
  return (
    <>
      {/* ── 52px sticky header ── */}
      <div className="h-[52px] px-6 flex items-center justify-between bg-white border-b border-surface-dim sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <button
            className="w-8 h-8 rounded hover:bg-surface-container-low flex items-center justify-center"
            onClick={() => onNavigate?.('orders', 'orders')}
            aria-label="Back to Orders"
          >
            <span className="material-symbols-outlined text-[18px] text-on-surface-variant">arrow_back</span>
          </button>
          <span className="material-symbols-outlined text-[20px] text-on-surface-variant">receipt_long</span>
          <span className="text-label-md font-semibold">Orders</span>
          <span className="text-outline">/</span>
          <span className="text-label-md text-primary font-semibold">#{orderId}</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low flex items-center gap-1"
            onClick={() => onToast(`Opening email composer to ${customerName}`)}
          >
            <span className="material-symbols-outlined text-[16px]">mail</span>Email customer
          </button>
          <div className="relative">
            <button
              className="h-8 px-3 bg-primary text-white text-body-md font-semibold hover:bg-primary-container flex items-center gap-1"
              onClick={e => { e.stopPropagation(); setActionMenuOpen(o => !o); }}
            >
              <span className="material-symbols-outlined text-[16px]">bolt</span>Actions
              <span className="material-symbols-outlined text-[14px]">expand_more</span>
            </button>
            {actionMenuOpen && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setActionMenuOpen(false)} />
                <div className="row-menu open absolute right-0 mt-1 z-40" style={{ minWidth: 280 }}>
                  <div className="menu-header">Fulfillment</div>
                  <button onClick={() => { setActionMenuOpen(false); handlePrintSlip(); }}>
                    <span className="material-symbols-outlined">receipt</span>Print packing slip
                  </button>
                  <button onClick={() => { setActionMenuOpen(false); handlePrintLabel(); }}>
                    <span className="material-symbols-outlined">print</span>Print shipping label
                  </button>
                  <button onClick={() => { setActionMenuOpen(false); openAdvance(); }}>
                    <span className="material-symbols-outlined">arrow_forward</span>Advance status →
                  </button>
                  <div className="sep" />
                  <div className="menu-header">Modify</div>
                  <button onClick={() => { setActionMenuOpen(false); handleAddLine(); }}>
                    <span className="material-symbols-outlined">add_shopping_cart</span>Add line item
                  </button>
                  <button onClick={() => { setActionMenuOpen(false); onToast('Split flow requires selecting lines first'); }}>
                    <span className="material-symbols-outlined">call_split</span>Split into shipments
                  </button>
                  <button onClick={() => { setActionMenuOpen(false); openAddress(); }}>
                    <span className="material-symbols-outlined">local_shipping</span>Edit shipping address
                  </button>
                  <div className="sep" />
                  <div className="menu-header">Post-order</div>
                  <button onClick={() => { setActionMenuOpen(false); onToast('Opening refund drawer'); }}>
                    <span className="material-symbols-outlined">undo</span>Issue refund…
                  </button>
                  <button onClick={() => { setActionMenuOpen(false); handleCreateReturn(); }}>
                    <span className="material-symbols-outlined">assignment_return</span>Create return
                  </button>
                  <button onClick={() => { setActionMenuOpen(false); handleReportProblem(); }}>
                    <span className="material-symbols-outlined">report_problem</span>Report a problem
                  </button>
                  <div className="sep" />
                  <button className="danger" onClick={() => { setActionMenuOpen(false); openCancel(); }}>
                    <span className="material-symbols-outlined">block</span>Cancel order
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <main className="px-6 pb-12 max-w-7xl mx-auto">
        {/* ── Order identity ── */}
        <div className="py-6 flex items-start justify-between gap-6 flex-wrap">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap mb-2">
              <h1 className="text-headline-lg">Order #{orderId}</h1>
              <span className={statClass(status)}>{status === 'Ready' ? 'Ready to ship' : status}</span>
              <span className="stat error">Past SLA · 2 days overdue</span>
              <span className="stat neutral">Drop ship · Printful</span>
            </div>
            <div className="text-body-sm text-on-surface-variant flex items-center gap-4 flex-wrap">
              <span>Placed <strong>Nov 03, 2026 at 2:15 PM</strong></span>
              <span>·</span>
              <span>Shop channel</span>
              <span>·</span>
              <span className="text-qb-maroon">Customer: {customerName}</span>
            </div>
            <div className="flex items-center gap-2 mt-3 flex-wrap">
              <span className="text-[10px] uppercase font-bold text-on-surface-variant mr-1">Tags:</span>
              {tags.map(t => (
                <button
                  key={t}
                  className={`stat ${t === 'needs_attention' ? 'error' : 'warn'} cursor-pointer hover:opacity-80`}
                  onClick={() => removeTag(t)}
                  title="Click to remove"
                >
                  {t} ×
                </button>
              ))}
              <button
                className="h-6 px-2 border border-dashed border-surface-dim rounded text-[10px] font-semibold text-primary hover:bg-surface-container-low"
                onClick={handleAddTag}
              >
                + Add tag
              </button>
            </div>
          </div>
          <div className="flex items-center gap-4 bg-white border border-surface-dim rounded-xl p-4 shadow-sm">
            <div className="text-center">
              <div className="text-[10px] uppercase font-bold text-on-surface-variant">Order total</div>
              <div className="text-headline-md tabular-nums">{usd(totals.total)}</div>
              <div className="text-[11px] text-secondary font-semibold mt-1">Paid · Nov 03</div>
            </div>
            <div className="w-px h-12 bg-surface-dim" />
            <div className="text-center">
              <div className="text-[10px] uppercase font-bold text-on-surface-variant">Fulfillment</div>
              <div className="text-headline-md tabular-nums">{shippedItems}/{totalItems}</div>
              <div className="text-[11px] text-on-surface-variant mt-1">Items shipped</div>
            </div>
          </div>
        </div>

        {/* ── Tabs ── */}
        <div className="flex items-center gap-1 border-b border-surface-dim mb-6">
          {([
            ['details', 'Details'],
            ['timeline', `Timeline ${timeline.length}`],
            ['notes', `Internal notes ${notes.length}`],
            ['related', `Related records ${related.returns.length + related.invoices.length + related.tickets.length + related.pos.length}`],
          ] as [Tab, string][]).map(([id, label]) => (
            <button
              key={id}
              className={`tab-underline px-4 py-2.5 text-label-md ${tab === id ? 'active' : 'text-on-surface-variant'}`}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </div>

        {/* ════ DETAILS TAB ════ */}
        {tab === 'details' && (
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <div className="xl:col-span-2 space-y-6">
              {/* Line items */}
              <div className="bg-white rounded-xl shadow-sm border border-surface-dim overflow-hidden">
                <div className="px-5 py-4 border-b border-surface-dim flex justify-between items-center bg-surface-container-lowest">
                  <h2 className="text-headline-sm">
                    Line items
                    <span className="text-[11px] font-normal text-on-surface-variant ml-2">
                      {lines.length} items · 1 shipment
                    </span>
                  </h2>
                  <button
                    className="h-7 px-2 border border-surface-dim rounded text-[11px] font-semibold hover:bg-surface-container-low flex items-center gap-1"
                    onClick={handleAddLine}
                  >
                    <span className="material-symbols-outlined text-[12px]">add</span>Add line
                  </button>
                </div>
                <div className="divide-y divide-surface-dim">
                  {lines.map(l => (
                    <div key={l.id} className="line-item p-4 flex items-center gap-4 hover:bg-[#faf9fc] relative">
                      <div
                        className="w-14 h-14 rounded-lg flex items-center justify-center text-white shrink-0"
                        style={{ background: `linear-gradient(135deg, ${l.colorFrom}, ${l.colorTo})` }}
                      >
                        <span className="material-symbols-outlined text-[22px]">{l.icon}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-body-sm truncate">{l.name}</div>
                        <div className="text-[11px] text-on-surface-variant font-mono">{l.sku}</div>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[11px] text-on-surface-variant">{l.supplier}</span>
                          <span className={statClass(l.fulfillment)}>{l.fulfillment}</span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="tabular-nums font-medium text-body-sm">{usd(l.qty * l.unitPrice)}</div>
                        <div className="text-[11px] text-on-surface-variant mt-0.5">{l.qty} × {usd(l.unitPrice)}</div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          className="w-7 h-7 rounded hover:bg-surface-container flex items-center justify-center"
                          onClick={e => { e.stopPropagation(); setLineMenuForId(lineMenuForId === l.id ? null : l.id); }}
                        >
                          <span className="material-symbols-outlined text-[16px] text-on-surface-variant">more_horiz</span>
                        </button>
                        {lineMenuForId === l.id && (
                          <>
                            <div className="fixed inset-0 z-30" onClick={() => setLineMenuForId(null)} />
                            <div className="row-menu open absolute right-0 mt-1 z-40" style={{ minWidth: 250 }}>
                              <div className="menu-header">This line</div>
                              <button onClick={() => { setLineMenuForId(null); editLineQty(l.id); }}>
                                <span className="material-symbols-outlined">numbers</span>Change quantity
                              </button>
                              <button onClick={() => { setLineMenuForId(null); editLinePrice(l.id); }}>
                                <span className="material-symbols-outlined">attach_money</span>Override price
                              </button>
                              <button onClick={() => { setLineMenuForId(null); onToast(`Open product ${l.sku}`); }}>
                                <span className="material-symbols-outlined">inventory_2</span>Open product
                              </button>
                              <div className="sep" />
                              <div className="menu-header">Fulfillment</div>
                              <button onClick={() => { setLineMenuForId(null); onToast('Split to new shipment'); }}>
                                <span className="material-symbols-outlined">call_split</span>Split to new shipment
                              </button>
                              <button onClick={() => { setLineMenuForId(null); markLineShipped(l.id); }}>
                                <span className="material-symbols-outlined">local_shipping</span>Mark this line shipped
                              </button>
                              <div className="sep" />
                              <button className="danger" onClick={() => { setLineMenuForId(null); removeLine(l.id); }}>
                                <span className="material-symbols-outlined">delete</span>Remove line
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="px-5 py-4 bg-surface-container-lowest border-t border-surface-dim">
                  <div className="ml-auto w-64 space-y-1 text-[12px]">
                    <div className="flex justify-between"><span className="text-on-surface-variant">Subtotal</span><span className="tabular-nums">{usd(totals.subtotal)}</span></div>
                    <div className="flex justify-between"><span className="text-on-surface-variant">Shipping</span><span className="tabular-nums">{usd(totals.shipping)}</span></div>
                    <div className="flex justify-between"><span className="text-on-surface-variant">Tax</span><span className="tabular-nums">{usd(totals.tax)}</span></div>
                    <div className="flex justify-between pt-2 mt-1 border-t border-surface-dim font-semibold text-body-md"><span>Total</span><span className="tabular-nums">{usd(totals.total)}</span></div>
                  </div>
                </div>
              </div>

              {/* Fulfillment pipeline */}
              <div className="bg-white rounded-xl shadow-sm border border-surface-dim overflow-hidden">
                <div className="px-5 py-4 border-b border-surface-dim flex justify-between items-center bg-surface-container-lowest">
                  <h2 className="text-headline-sm">Fulfillment</h2>
                  <button
                    className="h-7 px-2 border border-surface-dim rounded text-[11px] font-semibold hover:bg-surface-container-low flex items-center gap-1"
                    onClick={openAdvance}
                  >
                    <span className="material-symbols-outlined text-[12px]">arrow_forward</span>Advance
                  </button>
                </div>
                <div className="p-5">
                  <div className="flex items-center justify-between relative">
                    {stages.map((s, i) => {
                      const completed = s.done;
                      const current = (s as { current?: boolean }).current;
                      const iconClass = completed
                        ? 'bg-qb-green text-white'
                        : current
                          ? 'bg-white border-2 border-qb-blue text-qb-blue'
                          : 'bg-surface-container border-2 border-surface-dim text-outline';
                      const icon = completed ? 'check' : current ? 'print' : ['paid', '', '', 'outbox', 'check_circle'][i] || 'circle';
                      return (
                        <div key={s.key} className="relative z-10 flex flex-col items-center gap-2 flex-1">
                          <div className={`w-8 h-8 rounded-full ${iconClass} flex items-center justify-center shadow`}>
                            <span className="material-symbols-outlined text-[16px]">{icon}</span>
                          </div>
                          <div className={`text-[11px] font-semibold text-center ${current ? 'text-qb-blue' : ''}`}>{s.key}</div>
                          <div className={`text-[10px] ${current ? 'text-qb-blue font-medium' : 'text-on-surface-variant'}`}>
                            {s.at ?? (current ? 'Pending' : '—')}
                          </div>
                          {i < stages.length - 1 && (
                            <div
                              className="absolute top-4 left-1/2 w-full h-0.5"
                              style={{ background: completed ? '#1e5a38' : '#dad9dd', zIndex: -1 }}
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-6 bg-qb-blue/5 border border-qb-blue/20 rounded-lg p-3 flex items-center justify-between">
                    {!labelPrinted ? (
                      <>
                        <div className="flex items-center gap-2 text-qb-blue text-[12px]">
                          <span className="material-symbols-outlined text-[16px]">info</span>
                          <span>Supplier is waiting for label generation.</span>
                        </div>
                        <button
                          className="h-7 px-3 bg-qb-blue text-white rounded font-semibold text-[11px] hover:bg-blue-700"
                          onClick={handlePrintLabel}
                        >
                          Generate label
                        </button>
                      </>
                    ) : !tracking ? (
                      <>
                        <div className="flex items-center gap-2 text-qb-green text-[12px]">
                          <span className="material-symbols-outlined text-[16px]">check_circle</span>
                          <span>Label printed. Awaiting carrier pickup to enter tracking.</span>
                        </div>
                        <button
                          className="h-7 px-3 bg-primary text-white rounded font-semibold text-[11px]"
                          onClick={openAdvance}
                        >
                          Mark shipped
                        </button>
                      </>
                    ) : (
                      <div className="flex items-center gap-2 text-qb-green text-[12px]">
                        <span className="material-symbols-outlined text-[16px]">check_circle</span>
                        <span>Tracking: <strong>{tracking}</strong></span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Right column */}
            <div className="space-y-6">
              {/* Customer */}
              <div className="bg-white rounded-xl shadow-sm border border-surface-dim overflow-hidden">
                <div className="px-5 py-4 border-b border-surface-dim flex justify-between items-center bg-surface-container-lowest">
                  <h2 className="text-headline-sm">Customer</h2>
                  <button
                    className="text-[11px] font-semibold text-primary hover:underline"
                    onClick={() => onToast(`Navigate → customer ${customerName}`)}
                  >
                    Open →
                  </button>
                </div>
                <div className="p-5">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-full bg-qb-blue text-white flex items-center justify-center font-bold text-[14px]">
                      {customerName[0]?.toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="font-medium truncate">{customerName}</div>
                      <div className="text-[12px] text-on-surface-variant truncate">accounting@acme.com</div>
                    </div>
                  </div>
                  <div className="space-y-1.5 text-[12px] border-t border-surface-dim pt-3">
                    <div className="flex justify-between"><span className="text-on-surface-variant">Customer since</span><span>Oct 2023</span></div>
                    <div className="flex justify-between"><span className="text-on-surface-variant">Lifetime value</span><span className="tabular-nums">$1,420.00</span></div>
                    <div className="flex justify-between"><span className="text-on-surface-variant">Previous orders</span><span>12</span></div>
                    <div className="flex justify-between"><span className="text-on-surface-variant">Return rate</span><span className="text-qb-maroon font-medium">8%</span></div>
                  </div>
                </div>
              </div>

              {/* Shipping */}
              <div className="bg-white rounded-xl shadow-sm border border-surface-dim overflow-hidden">
                <div className="px-5 py-4 border-b border-surface-dim flex justify-between items-center bg-surface-container-lowest">
                  <h2 className="text-headline-sm">Shipping</h2>
                  <button
                    className="text-[11px] font-semibold text-primary hover:underline"
                    onClick={openAddress}
                  >
                    Edit →
                  </button>
                </div>
                <div className="p-5 space-y-4">
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant mb-1">Ship to</div>
                    <div className="text-[13px] leading-relaxed">
                      {address.name}<br />
                      {address.street}<br />
                      {address.city}, {address.state} {address.zip}<br />
                      {address.country}
                    </div>
                  </div>
                  <div className="pt-3 border-t border-surface-dim">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant mb-1">Method</div>
                    <div className="text-[13px]">USPS Priority Mail</div>
                    <div className="text-[12px] text-on-surface-variant mt-1">Est. delivery Nov 05 – Nov 07</div>
                  </div>
                  <div className="pt-3 border-t border-surface-dim">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant mb-1">Tracking</div>
                    <div className="text-[12px]">
                      {tracking ? (
                        <span className="font-mono text-[11px]">{tracking}</span>
                      ) : (
                        <span className="text-on-surface-variant italic">Not yet generated</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Risk */}
              <div className="bg-white rounded-xl shadow-sm border border-surface-dim overflow-hidden">
                <div className="px-5 py-4 border-b border-surface-dim bg-surface-container-lowest">
                  <h2 className="text-headline-sm">Risk &amp; compliance</h2>
                </div>
                <div className="p-5 space-y-2 text-[12px]">
                  <div className="flex justify-between items-center"><span className="text-on-surface-variant">Address verified</span><span className="stat success">Verified</span></div>
                  <div className="flex justify-between items-center"><span className="text-on-surface-variant">Fraud score</span><span className="stat success">Low (12/100)</span></div>
                  <div className="flex justify-between items-center"><span className="text-on-surface-variant">3DS auth</span><span className="stat success">Passed</span></div>
                  <div className="flex justify-between items-center"><span className="text-on-surface-variant">Blocklist</span><span className="stat neutral">Not listed</span></div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ════ TIMELINE TAB ════ */}
        {tab === 'timeline' && (
          <div className="max-w-3xl bg-white rounded-xl shadow-sm border border-surface-dim overflow-hidden">
            <div className="px-5 py-4 border-b border-surface-dim bg-surface-container-lowest flex items-center justify-between">
              <h2 className="text-headline-sm">Event timeline</h2>
              <div className="flex items-center gap-2">
                <select
                  className="h-7 px-2 border border-surface-dim rounded text-[11px] bg-white"
                  value={timelineFilter}
                  onChange={e => setTimelineFilter(e.target.value as typeof timelineFilter)}
                >
                  <option value="all">All events</option>
                  <option value="fulfillment">Fulfillment</option>
                  <option value="payment">Payment</option>
                  <option value="comms">Communication</option>
                  <option value="admin">Admin</option>
                </select>
                <span className="text-[11px] text-on-surface-variant">Immutable</span>
              </div>
            </div>
            <div className="p-5">
              {filteredTimeline.length === 0 ? (
                <div className="text-center py-8 text-on-surface-variant text-[12px]">No events in this category</div>
              ) : (
                filteredTimeline.map(t => (
                  <div key={t.id} className="timeline-item flex gap-3 py-3 border-b border-surface-container-low last:border-0">
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center text-white shrink-0"
                      style={{ background: t.color }}
                    >
                      <span className="material-symbols-outlined text-[14px]">{t.icon}</span>
                    </div>
                    <div className="flex-1 pt-0.5">
                      <div className="font-medium text-[13px]">{t.title}</div>
                      <div className="text-[12px] text-on-surface-variant mt-0.5">{t.detail}</div>
                    </div>
                    <div className="text-[11px] text-on-surface-variant whitespace-nowrap">{t.at}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* ════ NOTES TAB ════ */}
        {tab === 'notes' && (
          <div className="max-w-3xl bg-white rounded-xl shadow-sm border border-surface-dim overflow-hidden">
            <div className="px-5 py-4 border-b border-surface-dim bg-surface-container-lowest flex items-center justify-between">
              <h2 className="text-headline-sm">Internal notes</h2>
              <span className="text-[11px] text-on-surface-variant">Visible to operators only · never to customer</span>
            </div>
            <div className="divide-y divide-surface-dim">
              {[...notes].sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0)).map(n => (
                <div key={n.id} className="p-4 hover:bg-[#faf9fc]">
                  <div className="flex items-center gap-2 mb-2">
                    <div
                      className="w-6 h-6 rounded-full text-white flex items-center justify-center text-[10px] font-bold"
                      style={{ background: n.authorColor }}
                    >
                      {n.authorInit}
                    </div>
                    <span className="text-[12px] font-semibold">{n.author}</span>
                    <span className="text-[11px] text-on-surface-variant">· {n.at}</span>
                    {n.pinned && <span className="stat error ml-auto">Pinned</span>}
                    <div className="ml-auto flex items-center gap-1">
                      <button
                        className="w-6 h-6 rounded hover:bg-surface-container flex items-center justify-center"
                        onClick={() => toggleNotePin(n.id)}
                        title={n.pinned ? 'Unpin' : 'Pin'}
                      >
                        <span className="material-symbols-outlined text-[14px] text-on-surface-variant">push_pin</span>
                      </button>
                      <button
                        className="w-6 h-6 rounded hover:bg-error-container flex items-center justify-center"
                        onClick={() => deleteNote(n.id)}
                        title="Delete"
                      >
                        <span className="material-symbols-outlined text-[14px] text-on-surface-variant">delete</span>
                      </button>
                    </div>
                  </div>
                  <div className="text-[13px] leading-relaxed">{n.body}</div>
                </div>
              ))}
            </div>
            <div className="p-4 bg-surface-container-lowest border-t border-surface-dim">
              <textarea
                className="w-full min-h-[60px] p-3 border border-surface-dim rounded-lg text-[13px] resize-none focus:outline-none focus:border-qb-blue"
                placeholder="Add internal note…"
                value={newNote}
                onChange={e => setNewNote(e.target.value)}
              />
              <div className="flex items-center justify-between mt-2">
                <label className="flex items-center gap-2 text-[11px] text-on-surface-variant cursor-pointer">
                  <input type="checkbox" checked={pinNewNote} onChange={e => setPinNewNote(e.target.checked)} className="row-check" />
                  Pin to top
                </label>
                <button
                  className="h-8 px-3 bg-primary text-white rounded text-[12px] font-semibold hover:bg-primary-container"
                  onClick={saveNote}
                >
                  Add note
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ════ RELATED TAB ════ */}
        {tab === 'related' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {([
              { key: 'returns',  title: 'Returns (RMA)',    items: related.returns,  empty: 'No returns linked', action: '+ Create return',         onAction: handleCreateReturn },
              { key: 'invoices', title: 'Invoices',          items: related.invoices, empty: 'No invoices',       action: null,                       onAction: null },
              { key: 'tickets',  title: 'Support tickets',   items: related.tickets,  empty: 'No tickets',        action: '+ Report problem',          onAction: handleReportProblem },
              { key: 'pos',      title: 'Purchase orders',   items: related.pos,      empty: 'No POs',            action: null,                       onAction: null },
            ] as { key: string; title: string; items: RelatedItem[]; empty: string; action: string | null; onAction: (() => void) | null }[]).map(c => (
              <div key={c.key} className="bg-white rounded-xl shadow-sm border border-surface-dim p-5">
                <h3 className="text-label-sm uppercase tracking-wider font-bold text-on-surface-variant mb-3 flex items-center justify-between">
                  <span>{c.title}</span>
                  {c.items.length > 0 && <span className="text-[10px] font-medium text-on-surface-variant normal-case tracking-normal">{c.items.length}</span>}
                </h3>
                {c.items.length === 0 ? (
                  <div className="text-[13px] text-on-surface-variant italic">{c.empty}</div>
                ) : (
                  c.items.map(i => (
                    <div key={i.id} className="flex items-center justify-between py-2 border-b border-surface-dim last:border-0">
                      <div>
                        <div className="font-medium text-[13px]">{i.id}</div>
                        <div className="text-[11px] text-on-surface-variant">
                          {i.supplier ?? ''}{i.amount ? ` · ${usd(i.amount)}` : ''}{i.at ? ` · ${i.at}` : ''}
                        </div>
                      </div>
                      <span className={`stat ${i.status === 'paid' || i.status === 'confirmed' ? 'success' : 'neutral'}`}>{i.status}</span>
                    </div>
                  ))
                )}
                {c.action && c.onAction && (
                  <button
                    className="mt-3 text-[12px] text-primary font-semibold hover:underline"
                    onClick={c.onAction}
                  >
                    {c.action}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </main>

      {/* ════ ADVANCE MODAL ════ */}
      {advanceModalOpen && (
        <div className="modal open fixed inset-0 bg-black/50 z-300 flex items-center justify-center p-6" onClick={() => setAdvanceModalOpen(false)}>
          <div className="bg-white rounded-xl max-w-[520px] w-full p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-headline-sm mb-1">Advance order status</h3>
            <p className="text-[12px] text-on-surface-variant mb-4">
              Current: <strong>{status === 'Ready' ? 'Ready to ship' : status}</strong> → next: <strong>{status === 'Unfulfilled' ? 'Ready to ship' : status === 'Ready' ? 'Shipped' : 'Delivered'}</strong>
            </p>
            <div className="bg-surface-container-lowest border border-surface-dim rounded-lg p-3 space-y-2 text-[12px] mb-4">
              <div className="flex items-center gap-2"><span className="material-symbols-outlined text-[16px] text-qb-green">check_circle</span>Payment captured</div>
              <div className="flex items-center gap-2"><span className="material-symbols-outlined text-[16px] text-qb-green">check_circle</span>Packing slip printed</div>
              <div className="flex items-center gap-2">
                <span className={`material-symbols-outlined text-[16px] ${labelPrinted ? 'text-qb-green' : 'text-on-surface-variant'}`}>
                  {labelPrinted ? 'check_circle' : 'radio_button_unchecked'}
                </span>
                Shipping label generated
              </div>
            </div>
            {!labelPrinted && status === 'Unfulfilled' && (
              <div className="bg-qb-maroon/5 border border-qb-maroon/20 rounded-lg p-3 text-[12px] text-qb-maroon mb-4">
                <strong>Prerequisite missing.</strong> A shipping label must be generated before advancing to Shipped.
              </div>
            )}
            <div className="flex gap-2 justify-end">
              <button
                className="h-9 px-4 border border-surface-dim rounded text-body-md font-semibold hover:bg-surface-container-low"
                onClick={() => setAdvanceModalOpen(false)}
              >
                Cancel
              </button>
              <button
                className="h-9 px-4 bg-primary text-white rounded text-body-md font-semibold hover:bg-primary-container"
                onClick={confirmAdvance}
              >
                Advance to {status === 'Unfulfilled' ? 'Ready' : status === 'Ready' ? 'Shipped' : 'Delivered'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ════ ADDRESS MODAL ════ */}
      {addressModalOpen && (
        <div className="modal open fixed inset-0 bg-black/50 z-300 flex items-center justify-center p-6" onClick={() => setAddressModalOpen(false)}>
          <div className="bg-white rounded-xl max-w-[520px] w-full p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-headline-sm mb-1">Edit shipping address</h3>
            <p className="text-[12px] text-on-surface-variant mb-4">Customer will be notified of the change.</p>
            <div className="space-y-3">
              <div>
                <label className="field-label">Street</label>
                <input
                  className="field-input"
                  value={address.street}
                  onChange={e => setAddress({ ...address, street: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="field-label">City</label>
                  <input
                    className="field-input"
                    value={address.city}
                    onChange={e => setAddress({ ...address, city: e.target.value })}
                  />
                </div>
                <div>
                  <label className="field-label">State</label>
                  <input
                    className="field-input"
                    value={address.state}
                    onChange={e => setAddress({ ...address, state: e.target.value })}
                  />
                </div>
                <div>
                  <label className="field-label">ZIP</label>
                  <input
                    className="field-input"
                    value={address.zip}
                    onChange={e => setAddress({ ...address, zip: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <label className="field-label">Reason for change</label>
                <input className="field-input" placeholder="e.g. customer requested correction" />
              </div>
            </div>
            <div className="flex gap-2 justify-end mt-4">
              <button
                className="h-9 px-4 border border-surface-dim rounded text-body-md font-semibold hover:bg-surface-container-low"
                onClick={() => setAddressModalOpen(false)}
              >
                Cancel
              </button>
              <button
                className="h-9 px-4 bg-primary text-white rounded text-body-md font-semibold hover:bg-primary-container"
                onClick={saveAddress}
              >
                Save &amp; notify customer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ════ CANCEL MODAL ════ */}
      {cancelModalOpen && (
        <div className="modal open fixed inset-0 bg-black/50 z-300 flex items-center justify-center p-6" onClick={() => setCancelModalOpen(false)}>
          <div className="bg-white rounded-xl max-w-[520px] w-full p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-headline-sm mb-1 text-qb-maroon">Cancel order #{orderId}</h3>
            <p className="text-[12px] text-on-surface-variant mb-4">
              This will cancel the order, refund {usd(totals.total)} to the original payment method, and notify the customer. This action requires reauthentication.
            </p>
            <div className="space-y-3">
              <div>
                <label className="field-label">Reason</label>
                <select
                  className="field-input"
                  value={cancelReason}
                  onChange={e => setCancelReason(e.target.value)}
                >
                  <option>Customer request</option>
                  <option>Out of stock</option>
                  <option>Fraud suspicion</option>
                  <option>Address invalid</option>
                  <option>Other</option>
                </select>
              </div>
              <div>
                <label className="field-label">Type order ID to confirm</label>
                <input
                  className="field-input font-mono"
                  placeholder={orderId}
                  value={cancelConfirmText}
                  onChange={e => setCancelConfirmText(e.target.value)}
                />
              </div>
            </div>
            <div className="flex gap-2 justify-end mt-4">
              <button
                className="h-9 px-4 border border-surface-dim rounded text-body-md font-semibold hover:bg-surface-container-low"
                onClick={() => setCancelModalOpen(false)}
              >
                Keep order
              </button>
              <button
                className="h-9 px-4 bg-error text-white rounded text-body-md font-semibold hover:bg-red-700 disabled:opacity-40"
                disabled={cancelConfirmText.trim() !== orderId}
                onClick={confirmCancel}
              >
                Cancel &amp; refund
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
