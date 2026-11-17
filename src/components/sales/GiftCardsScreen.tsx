'use client';

/**
 * GiftCardsScreen — the Gift cards page (pack 3): status tabs
 * All · Active · Fully redeemed, columns Card · Issued · Balance ·
 * Redeemed · Status per the screen config. Issue and redeem run
 * through the accounting RPCs via /api/v1/gift-cards (issue posts
 * the gift-card liability; redeem moves liability against a posted
 * invoice and decrements the balance — no raw balance edits).
 */
import { useCallback, useEffect, useState } from 'react';

interface GiftCard {
  id: string;
  code: string;
  kind: string;
  status: string;
  initial: number;
  balance: number;
  currency: string;
  customer: string;
  expires: string | null;
  issuedAt: string;
}

interface InvoiceOption {
  id: string;
  number: string;
  balanceDue: number;
  status: string;
}

async function api<T>(url: string, init?: RequestInit): Promise<{ data: T | null; error: string | null }> {
  try {
    const r = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...init });
    const j = await r.json();
    if (!r.ok) return { data: null, error: j?.error?.message || `HTTP ${r.status}` };
    return { data: (j.data ?? j) as T, error: null };
  } catch (e: any) {
    return { data: null, error: e.message };
  }
}

const money = (n: number | null | undefined) => (n == null ? '—' : `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);

export default function GiftCardsScreen({ onToast }: { onToast: (m: string) => void }) {
  const [cards, setCards] = useState<GiftCard[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState<'All' | 'Active' | 'Fully redeemed'>('All');
  const [showIssue, setShowIssue] = useState(false);
  const [amount, setAmount] = useState('50');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [redeemCard, setRedeemCard] = useState<GiftCard | null>(null);
  const [invoices, setInvoices] = useState<InvoiceOption[]>([]);
  const [invoiceId, setInvoiceId] = useState('');
  const [redeemAmount, setRedeemAmount] = useState('');

  const load = useCallback(async () => {
    const { data } = await api<GiftCard[]>('/api/v1/gift-cards');
    setCards(data || []);
    setLoaded(true);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const visible = cards.filter(c =>
    tab === 'All' ? true : tab === 'Active' ? Number(c.balance) > 0 : Number(c.balance) <= 0,
  );
  const outstanding = cards.reduce((s, c) => s + (Number(c.balance) > 0 ? Number(c.balance) : 0), 0);

  async function issue() {
    const amt = Number(amount);
    if (!amt || amt <= 0) { onToast('Amount must be positive'); return; }
    setBusy(true);
    const { data, error } = await api<{ code: string }>('/api/v1/gift-cards', {
      method: 'POST',
      body: JSON.stringify({ amount: amt, email: email.trim() || undefined, code: code.trim() || undefined }),
    });
    setBusy(false);
    if (error) { onToast(`Issue failed: ${error}`); return; }
    onToast(`Gift card ${data?.code || ''} issued for ${money(amt)} — liability posted`);
    setShowIssue(false);
    setCode('');
    setEmail('');
    await load();
  }

  async function openRedeem(card: GiftCard) {
    setRedeemCard(card);
    setRedeemAmount('');
    const { data } = await api<any[]>('/api/invoices');
    const opts = (data || [])
      .map((i: any) => ({ id: i.id, number: i.number || i.invoice_number || i.id.slice(0, 8), balanceDue: Number(i.balanceDue ?? i.balance_due ?? i.open_balance ?? 0), status: i.status }))
      .filter((i: InvoiceOption) => i.balanceDue > 0);
    setInvoices(opts);
    setInvoiceId(opts[0]?.id || '');
  }

  async function redeem() {
    if (!redeemCard) return;
    const amt = Number(redeemAmount);
    if (!invoiceId) { onToast('Pick an invoice with an open balance'); return; }
    if (!amt || amt <= 0) { onToast('Amount must be positive'); return; }
    setBusy(true);
    const { data, error } = await api<{ card: { balance: number } }>('/api/v1/gift-cards/redeem', {
      method: 'POST',
      body: JSON.stringify({ code: redeemCard.code, invoice_id: invoiceId, amount: amt }),
    });
    setBusy(false);
    if (error) { onToast(`Redeem failed: ${error}`); return; }
    onToast(`Redeemed ${money(amt)} from ${redeemCard.code} — new balance ${money(data?.card?.balance)}`);
    setRedeemCard(null);
    await load();
  }

  return (
    <main className="px-6 pb-12 flex flex-col h-full overflow-y-auto">
      <div className="flex items-center justify-between py-4">
        <div>
          <h1 className="text-headline-lg">Gift cards</h1>
          <p className="text-body-sm text-on-surface-variant mt-0.5">
            Sale posts to gift card liability; redemption moves liability to revenue. {cards.length} cards · {money(outstanding)} outstanding.
          </p>
        </div>
        <button className="h-9 px-3 rounded bg-primary text-white text-body-md font-semibold flex items-center gap-1" onClick={() => setShowIssue(true)}>
          <span className="material-symbols-outlined text-[16px]">add</span>Gift card
        </button>
      </div>

      <div className="flex border border-surface-dim rounded overflow-hidden w-fit mb-3">
        {(['All', 'Active', 'Fully redeemed'] as const).map(t => (
          <button key={t} className={`h-8 px-3 text-body-md ${tab === t ? 'bg-primary text-white font-semibold' : 'hover:bg-surface-container-low'}`} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>

      {!loaded ? (
        <p className="text-body-sm text-on-surface-variant">Loading…</p>
      ) : visible.length === 0 ? (
        <p className="text-body-sm text-on-surface-variant">No gift cards in this view yet. Issue the first one — its balance is backed by a posted liability entry.</p>
      ) : (
        <div className="border border-outline-variant rounded-lg overflow-hidden">
          <div className="grid grid-cols-[1.2fr_.6fr_.7fr_.7fr_.7fr_1fr_.7fr_.6fr] gap-3 px-3 py-2 bg-surface-container-low text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">
            <span>Card</span><span>Kind</span><span>Status</span><span className="text-right">Issued</span><span className="text-right">Balance</span><span>Customer</span><span>Expires</span><span></span>
          </div>
          {visible.map(c => (
            <div key={c.id} className="grid grid-cols-[1.2fr_.6fr_.7fr_.7fr_.7fr_1fr_.7fr_.6fr] gap-3 px-3 py-2.5 border-t border-outline-variant bg-white items-center">
              <span className="text-body-md font-mono font-semibold">{c.code}</span>
              <span className="text-body-sm capitalize">{c.kind.replace('_', ' ')}</span>
              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full w-fit ${Number(c.balance) > 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-surface-container text-on-surface-variant'}`}>
                {Number(c.balance) > 0 ? 'Active' : 'Fully redeemed'}
              </span>
              <span className="text-body-md tabular-nums text-right">{money(c.initial)}</span>
              <span className="text-body-md tabular-nums text-right font-semibold">{money(c.balance)}</span>
              <span className="text-body-sm text-on-surface-variant truncate">{c.customer}</span>
              <span className="text-body-sm text-on-surface-variant">{c.expires ? new Date(c.expires).toLocaleDateString() : '—'}</span>
              <span className="text-right">
                {Number(c.balance) > 0 && (
                  <button className="h-7 px-2.5 rounded border border-outline text-body-sm" onClick={() => void openRedeem(c)}>Redeem</button>
                )}
              </span>
            </div>
          ))}
        </div>
      )}

      {showIssue && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowIssue(false)}>
          <div className="bg-white rounded-xl shadow-xl w-[420px] max-w-[92vw] p-5" onClick={e => e.stopPropagation()}>
            <h3 className="text-title-lg font-semibold">Issue gift card</h3>
            <p className="text-body-sm text-on-surface-variant mt-1">Promotional issue — the amount posts to gift card liability against the marketing expense account.</p>
            <div className="space-y-3 mt-4">
              <div>
                <label className="text-[11px] uppercase tracking-wider text-on-surface-variant">Amount</label>
                <input className="field-input w-full" type="number" min="1" value={amount} onChange={e => setAmount(e.target.value)} autoFocus />
              </div>
              <div>
                <label className="text-[11px] uppercase tracking-wider text-on-surface-variant">Recipient email (optional)</label>
                <input className="field-input w-full" value={email} onChange={e => setEmail(e.target.value)} placeholder="customer@example.com" />
              </div>
              <div>
                <label className="text-[11px] uppercase tracking-wider text-on-surface-variant">Code (optional — generated if blank)</label>
                <input className="field-input w-full" value={code} onChange={e => setCode(e.target.value)} placeholder="GC-…" />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button className="h-9 px-3 rounded text-body-md hover:bg-surface-container" onClick={() => setShowIssue(false)}>Cancel</button>
              <button className="h-9 px-4 rounded bg-primary text-white text-body-md font-semibold disabled:opacity-50" disabled={busy} onClick={() => void issue()}>{busy ? 'Issuing…' : 'Issue card'}</button>
            </div>
          </div>
        </div>
      )}

      {redeemCard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setRedeemCard(null)}>
          <div className="bg-white rounded-xl shadow-xl w-[420px] max-w-[92vw] p-5" onClick={e => e.stopPropagation()}>
            <h3 className="text-title-lg font-semibold">Redeem {redeemCard.code}</h3>
            <p className="text-body-sm text-on-surface-variant mt-1">Balance {money(redeemCard.balance)}. Applies against a posted invoice with an open balance; the redemption posts liability → accounts receivable.</p>
            <div className="space-y-3 mt-4">
              <div>
                <label className="text-[11px] uppercase tracking-wider text-on-surface-variant">Invoice</label>
                <select className="field-input w-full" value={invoiceId} onChange={e => setInvoiceId(e.target.value)}>
                  {invoices.length === 0 && <option value="">No open invoices</option>}
                  {invoices.map(i => <option key={i.id} value={i.id}>{i.number} — {money(i.balanceDue)} open</option>)}
                </select>
              </div>
              <div>
                <label className="text-[11px] uppercase tracking-wider text-on-surface-variant">Amount</label>
                <input className="field-input w-full" type="number" min="1" value={redeemAmount} onChange={e => setRedeemAmount(e.target.value)} placeholder={`Up to ${money(redeemCard.balance)}`} />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button className="h-9 px-3 rounded text-body-md hover:bg-surface-container" onClick={() => setRedeemCard(null)}>Cancel</button>
              <button className="h-9 px-4 rounded bg-primary text-white text-body-md font-semibold disabled:opacity-50" disabled={busy} onClick={() => void redeem()}>{busy ? 'Redeeming…' : 'Redeem'}</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
