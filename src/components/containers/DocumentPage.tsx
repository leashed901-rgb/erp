'use client';

import { useState } from 'react';
import type { DocumentDef, Document, DocumentLine } from '@/lib/contracts';
import { PartyPicker, ItemPicker } from '@/components/pickers/UniversalPicker';
import { ActivityTimeline } from '@/components/primitives/ActivityTimeline';
import { RelatedRail } from '@/components/primitives/RelatedRail';
import { ExistingRecordBanner } from '@/components/primitives/ExistingRecordBanner';

/**
 * DocumentPage — the full-page document surface (spec §1.2, §B.2.4).
 * Header → LineGrid → Totals → ViewTabs → SidePanel.
 * Right rail = Related + Activity.
 * Renders any document type from its DocumentDef config.
 */
export function DocumentPage({ def, doc, onToast }: {
  def: DocumentDef;
  doc?: Document;
  onToast?: (msg: string) => void;
}) {
  const [partyId, setPartyId] = useState<string | null>(doc?.partyId || null);
  const [number] = useState(doc?.number || `${def.numberPrefix}${Date.now()}`);
  const [date, setDate] = useState(doc?.date || new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState(doc?.dueDate || '');
  const [lines, setLines] = useState<DocumentLine[]>(doc?.lines || [{ id: 'L1', itemId: null, description: '', qty: 1, rate: 0, amount: 0, taxRate: 0, account: '', tags: [] }]);
  const [shipping, setShipping] = useState(doc?.shipping || 0);
  const [memo, setMemo] = useState(doc?.memo || '');
  const [notes, setNotes] = useState(doc?.notes || '');
  const [view, setView] = useState(def.views[0] || 'edit');
  const [saving, setSaving] = useState(false);

  const subtotal = lines.reduce((s, l) => s + l.amount, 0);
  const tax = lines.reduce((s, l) => s + (l.amount * l.taxRate / 100), 0);
  const total = subtotal + tax + shipping;
  const balance = total - (doc?.amountPaid || 0);

  const updateLine = (idx: number, updates: Partial<DocumentLine>) => {
    setLines((prev) => prev.map((l, i) => {
      if (i !== idx) return l;
      const updated = { ...l, ...updates };
      updated.amount = updated.qty * updated.rate;
      return updated;
    }));
  };

  const addLine = () => {
    setLines((prev) => [...prev, { id: `L${prev.length + 1}`, itemId: null, description: '', qty: 1, rate: 0, amount: 0, taxRate: 0, account: '', tags: [] }]);
  };

  const removeLine = (idx: number) => {
    setLines((prev) => prev.filter((_, i) => i !== idx));
  };

  const save = async () => {
    if (saving) return;
    if (!partyId) { onToast?.(`${def.partyLabel} is required`); return; }
    const hasValidLines = lines.some((l) => l.description.trim() && l.amount > 0);
    if (!hasValidLines) { onToast?.('Add at least one line item'); return; }

    setSaving(true);
    try {
      const res = await fetch(def.apiPath, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: partyId,
          number, status: 'OPEN',
          subtotal, total, balanceDue: balance,
          dueDate: dueDate || null,
          notes: notes || memo || null,
          items: lines.filter((l) => l.description.trim()).map((l) => ({
            description: l.description, quantity: l.qty,
            unitPrice: String(l.rate), totalPrice: String(l.amount),
          })),
        }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        onToast?.(json?.error?.message || `HTTP ${res.status}`);
        return;
      }
      onToast?.(`${def.label} ${number} saved`);
      window.dispatchEvent(new CustomEvent('document-saved', { detail: { type: def.type, partyId } }));
    } catch (e: unknown) {
      onToast?.(`Error: ${e instanceof Error ? e.message : 'Save failed'}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header bar */}
      <header className="h-12 bg-white border-b border-surface-dim flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-1">
          {def.views.map((v) => (
            <button key={v} className={`px-3 py-2 text-[13px] tab-underline ${view === v ? 'active' : 'text-on-surface-variant'}`} onClick={() => setView(v)}>
              {v === 'edit' ? 'Edit' : v === 'email' ? 'Email view' : v === 'payor' ? 'Payor view' : 'PDF view'}
            </button>
          ))}
        </div>
      </header>

      {/* Main content + right rail */}
      <div className="flex flex-1 overflow-hidden">
        {/* Document form */}
        <div className="flex-1 overflow-y-auto p-6">
          {doc?.id && <ExistingRecordBanner type={def.type.toLowerCase()} id={doc.id} />}

          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-[24px] font-bold text-primary">{def.label.toUpperCase()}</h1>
              <div className="text-[12px] text-on-surface-variant font-mono">{number}</div>
            </div>
            <div className="text-right">
              <div className="text-[10px] uppercase font-bold text-on-surface-variant">{def.label} Total</div>
              <div className="text-[24px] font-bold">${total.toFixed(2)}</div>
            </div>
          </div>

          {view === 'edit' && (
            <>
              {/* Party + dates */}
              <div className="grid grid-cols-2 gap-4 mb-6">
                <PartyPicker label={def.partyLabel} value={partyId} onChange={setPartyId} role={def.partyRole} />
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="field-label">{def.dateLabel}</label>
                    <input type="date" className="field-input" value={date} onChange={(e) => setDate(e.target.value)} />
                  </div>
                  <div>
                    <label className="field-label">{def.dueLabel}</label>
                    <input type="date" className="field-input" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
                  </div>
                </div>
              </div>

              {/* Line items */}
              <div className="bg-white border border-surface-dim rounded-xl overflow-hidden mb-6">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-surface-dim">
                      <th className="w-8"></th>
                      {def.lineColumns.map((col) => (
                        <th key={col.key} className={`px-3 py-2 text-[10px] uppercase font-bold text-on-surface-variant ${col.align === 'right' ? 'text-right' : ''}`} style={{ width: col.width }}>
                          {col.label}
                        </th>
                      ))}
                      <th className="w-8"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((line, idx) => (
                      <tr key={line.id} className="border-b border-surface-dim">
                        <td className="px-2 py-1 text-center text-on-surface-variant cursor-grab">⠿</td>
                        <td className="px-2 py-1">
                          <input
                            type="text"
                            placeholder="Type to search items or enter description"
                            className="w-full border-0 bg-transparent text-[13px] focus:outline-none"
                            value={line.description}
                            onChange={(e) => updateLine(idx, { description: e.target.value })}
                          />
                        </td>
                        {def.lineColumns.find((c) => c.key === 'qty') && (
                          <td className="px-2 py-1" style={{ width: '80px' }}>
                            <input type="number" className="w-full border-0 bg-transparent text-[13px] text-right focus:outline-none" value={line.qty} onChange={(e) => updateLine(idx, { qty: Number(e.target.value) || 0 })} />
                          </td>
                        )}
                        {def.lineColumns.find((c) => c.key === 'rate') && (
                          <td className="px-2 py-1" style={{ width: '100px' }}>
                            <input type="number" step="0.01" className="w-full border-0 bg-transparent text-[13px] text-right focus:outline-none" value={line.rate} onChange={(e) => updateLine(idx, { rate: Number(e.target.value) || 0 })} />
                          </td>
                        )}
                        {def.lineColumns.find((c) => c.key === 'amount') && (
                          <td className="px-2 py-1 text-right text-[13px] font-semibold" style={{ width: '120px' }}>${line.amount.toFixed(2)}</td>
                        )}
                        <td className="px-1 py-1">
                          <button className="w-5 h-5 rounded hover:bg-surface-container text-on-surface-variant" onClick={() => removeLine(idx)}>
                            <span className="material-symbols-outlined text-[14px]">close</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <button className="px-3 py-2 text-[13px] font-semibold text-primary hover:bg-surface-container-low" onClick={addLine}>
                  + Add line
                </button>
              </div>

              {/* Totals + memo */}
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-3">
                  <div>
                    <label className="field-label">Memo (on statement)</label>
                    <textarea className="field-input min-h-[60px] resize-y text-[13px]" value={memo} onChange={(e) => setMemo(e.target.value)} />
                  </div>
                  <div>
                    <label className="field-label">Note to customer</label>
                    <textarea className="field-input min-h-[60px] resize-y text-[13px]" value={notes} onChange={(e) => setNotes(e.target.value)} />
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between text-[13px]">
                    <span className="text-on-surface-variant">Subtotal</span>
                    <span className="font-semibold">${subtotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-[13px]">
                    <span className="text-on-surface-variant">Tax</span>
                    <span className="font-semibold">${tax.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-[13px]">
                    <span className="text-on-surface-variant">Shipping</span>
                    <input type="number" step="0.01" className="w-20 text-right border border-surface-dim rounded px-1 text-[13px]" value={shipping} onChange={(e) => setShipping(Number(e.target.value) || 0)} />
                  </div>
                  <div className="flex justify-between border-t border-surface-dim pt-2 mt-2">
                    <span className="text-[14px] font-bold">Total</span>
                    <span className="text-[14px] font-bold">${total.toFixed(2)}</span>
                  </div>
                  {doc && doc.amountPaid > 0 && (
                    <div className="flex justify-between text-[13px]">
                      <span className="text-on-surface-variant">Paid</span>
                      <span className="font-semibold text-[#137333]">-${doc.amountPaid.toFixed(2)}</span>
                    </div>
                  )}
                  {balance > 0 && (
                    <div className="flex justify-between border-t border-surface-dim pt-2">
                      <span className="text-[14px] font-bold">Balance due</span>
                      <span className="text-[14px] font-bold text-error">${balance.toFixed(2)}</span>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          {view === 'email' && (
            <div className="bg-white border border-surface-dim rounded-xl p-8 max-w-2xl mx-auto">
              <h2 className="text-[18px] font-semibold mb-4">{def.label} preview</h2>
              <div className="text-[13px] text-on-surface-variant space-y-2">
                <p>Hi {partyId ? 'Customer' : '[Customer]'},</p>
                <p>Here is your {def.label.toLowerCase()} ({number}).</p>
                <p>Total: ${total.toFixed(2)}</p>
                {balance > 0 && <p>Balance due: ${balance.toFixed(2)}</p>}
              </div>
              <button className="mt-4 h-8 px-4 bg-primary text-white rounded text-[13px] font-semibold">Review and accept</button>
            </div>
          )}

          {view === 'payor' && (
            <div className="bg-white border border-surface-dim rounded-xl p-8 max-w-2xl mx-auto">
              <h2 className="text-[18px] font-semibold mb-4">Pay ${balance.toFixed(2)}</h2>
              {balance > 0 && def.canRecordPayment ? (
                <button className="h-10 px-6 bg-primary text-white rounded text-[14px] font-semibold">Pay now</button>
              ) : (
                <p className="text-[13px] text-on-surface-variant">No balance due.</p>
              )}
            </div>
          )}

          {view === 'pdf' && (
            <div className="bg-white border border-surface-dim rounded-xl p-8 max-w-2xl mx-auto shadow-lg" style={{ minHeight: '400px' }}>
              <div className="flex justify-between mb-6 pb-4 border-b-2 border-primary">
                <div>
                  <div className="text-[20px] font-bold text-primary">{def.label.toUpperCase()}</div>
                  <div className="text-[12px] text-on-surface-variant">{number}</div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] uppercase text-on-surface-variant">Total</div>
                  <div className="text-[20px] font-bold">${total.toFixed(2)}</div>
                </div>
              </div>
              <table className="w-full text-[12px] mb-4">
                <thead><tr className="border-b border-surface-dim"><th className="text-left py-1">Description</th><th className="text-right py-1">Qty</th><th className="text-right py-1">Rate</th><th className="text-right py-1">Amount</th></tr></thead>
                <tbody>
                  {lines.map((l) => (
                    <tr key={l.id} className="border-b border-surface-dim/50">
                      <td className="py-1">{l.description || '—'}</td>
                      <td className="text-right">{l.qty}</td>
                      <td className="text-right">${l.rate.toFixed(2)}</td>
                      <td className="text-right">${l.amount.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="flex justify-end">
                <div className="w-48 space-y-1">
                  <div className="flex justify-between text-[11px]"><span>Subtotal</span><span>${subtotal.toFixed(2)}</span></div>
                  <div className="flex justify-between text-[11px]"><span>Tax</span><span>${tax.toFixed(2)}</span></div>
                  <div className="flex justify-between text-[11px]"><span>Shipping</span><span>${shipping.toFixed(2)}</span></div>
                  <div className="flex justify-between font-bold text-[13px] border-t border-surface-dim pt-1"><span>Total</span><span>${total.toFixed(2)}</span></div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right rail */}
        {doc?.id && (
          <aside className="w-72 border-l border-surface-dim bg-white p-4 overflow-y-auto shrink-0 space-y-4">
            <RelatedRail relations={[]} />
            <ActivityTimeline type={def.type.toLowerCase()} id={doc.id} />
          </aside>
        )}
      </div>

      {/* Footer */}
      <footer className="h-16 bg-white border-t border-surface-dim px-6 flex items-center justify-between shrink-0">
        <div className="w-1/4">{doc && <span className={`st ${doc.status === 'Paid' ? 'paid' : doc.status === 'Overdue' ? 'overdue' : 'draft'}`}>{doc.status}</span>}</div>
        <div className="flex-1 flex justify-center gap-2">
          {def.canPrint && <button className="h-8 px-3 border border-surface-dim rounded text-[13px] hover:bg-surface-container-low" onClick={() => setView('pdf')}>PDF</button>}
          {def.canSend && doc && <button className="h-8 px-3 border border-surface-dim rounded text-[13px] hover:bg-surface-container-low" onClick={() => onToast?.('Queued for email')}>Send</button>}
          {def.canRecordPayment && doc && balance > 0 && <button className="h-8 px-3 border border-surface-dim rounded text-[13px] font-semibold hover:bg-surface-container-low" onClick={() => onToast?.('Record payment')}>Take payment</button>}
        </div>
        <div className="w-1/4 flex justify-end gap-2">
          <button className="h-8 px-4 border border-surface-dim rounded text-[13px] hover:bg-surface-container-low" onClick={() => { /* close */ }}>Cancel</button>
          <button className="h-8 px-4 bg-primary text-white rounded text-[13px] font-semibold disabled:opacity-50" disabled={saving} onClick={save}>
            {saving ? 'Saving…' : (doc ? 'Save' : def.primaryAction)}
          </button>
        </div>
      </footer>
    </div>
  );
}

export default DocumentPage;
