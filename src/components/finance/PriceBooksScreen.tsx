'use client';
import { useState, useEffect, useCallback } from 'react';
import type { PriceBook, PriceBookLine } from '@/lib/batchITypes';
import { fmtMoney } from '@/lib/batchITypes';

/**
 * Price books screen (doc 28 Batch I) — named sets of product
 * price overrides. A line is one product (or SKU) with a base price
 * and an override price; the book itself is only a container, the
 * engine reads the lines when pricing an order.
 */

interface Props {
  onToast: (msg: string) => void;
}

export default function PriceBooksScreen({ onToast }: Props) {
  const [books, setBooks] = useState<PriceBook[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<PriceBook | null>(null);
  const [detail, setDetail] = useState<PriceBookLine[] | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const j = await fetch('/api/price-books').then((r) => r.json()).catch(() => null);
      if (j?.error) throw new Error(j.error.message || 'Price books load failed');
      setBooks((j?.data || []) as PriceBook[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openBook = async (b: PriceBook) => {
    setSelected(b);
    const j = await fetch(`/api/price-books/${b.id}`).then((r) => r.json()).catch(() => null);
    setDetail(((j?.data?.lines || []) as PriceBookLine[]));
  };

  const post = async (url: string, body: Record<string, unknown>, method = 'POST') => {
    const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j?.error) throw new Error(j?.error?.message || `Request failed (${r.status})`);
    return j;
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Price books</h1>
        <button className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white" onClick={() => { setShowCreate(true); setFormError(null); }}>New price book</button>
      </div>
      <p className="mt-1 text-sm text-gray-600">A price book is a named set of product price overrides — one line per product or SKU, with a base price and an override.</p>

      {error && <div className="mt-4 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {loading && <div className="mt-4 text-sm text-gray-500">Loading…</div>}

      {!loading && (
        <div className="mt-4 overflow-x-auto">
          {(books?.length ?? 0) === 0 ? (
            <p className="text-sm text-gray-500">No price books yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead><tr className="text-left text-gray-500"><th className="py-2 pr-3">Code</th><th className="py-2 pr-3">Title</th><th className="py-2 pr-3">Method</th><th className="py-2 pr-3">Active</th><th className="py-2 text-right">Lines</th></tr></thead>
              <tbody>
                {books!.map((b) => (
                  <tr key={b.id} className="cursor-pointer border-t hover:bg-gray-50" onClick={() => openBook(b)}>
                    <td className="py-2 pr-3 font-mono text-xs">{b.code}</td>
                    <td className="py-2 pr-3">{b.title}</td>
                    <td className="py-2 pr-3">{b.method ?? '—'}</td>
                    <td className="py-2 pr-3">{b.isActive ? 'Yes' : 'No'}</td>
                    <td className="py-2 text-right">{b.lineCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {showCreate && (
        <BookCreateForm
          error={formError}
          busy={busy}
          onCancel={() => setShowCreate(false)}
          onSubmit={async (body) => {
            setBusy(true); setFormError(null);
            try {
              await post('/api/price-books', body);
              setShowCreate(false);
              onToast('Price book created');
              await load();
            } catch (e) { setFormError(e instanceof Error ? e.message : String(e)); }
            finally { setBusy(false); }
          }}
        />
      )}

      {selected && (
        <BookDrawer
          book={selected}
          lines={detail}
          onClose={() => { setSelected(null); setDetail(null); }}
          onToast={onToast}
          onReload={async () => { await load(); if (selected) openBook(selected); }}
        />
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="text-gray-600">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

const inputCls = 'w-full rounded border px-2 py-1.5 text-sm';

function BookCreateForm({ error, busy, onCancel, onSubmit }: {
  error: string | null; busy: boolean;
  onCancel: () => void; onSubmit: (body: Record<string, unknown>) => Promise<void>;
}) {
  const [code, setCode] = useState('');
  const [title, setTitle] = useState('');
  const [method, setMethod] = useState('');
  const [qualifyingTerms, setQualifyingTerms] = useState('');
  const [catalogScope, setCatalogScope] = useState('');
  return (
    <div className="fixed inset-y-0 right-0 w-full max-w-md overflow-y-auto bg-white p-6 shadow-xl">
      <h2 className="text-lg font-semibold">New price book</h2>
      {error && <div className="mt-2 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      <div className="mt-4 space-y-3">
        <Field label="Code"><input className={inputCls} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="e.g. WHOLESALE" /></Field>
        <Field label="Title"><input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Wholesale pricing" /></Field>
        <Field label="Method"><input className={inputCls} value={method} onChange={(e) => setMethod(e.target.value)} placeholder="e.g. fixed, percent-off" /></Field>
        <Field label="Qualifying terms"><input className={inputCls} value={qualifyingTerms} onChange={(e) => setQualifyingTerms(e.target.value)} /></Field>
        <Field label="Catalog scope"><input className={inputCls} value={catalogScope} onChange={(e) => setCatalogScope(e.target.value)} placeholder="e.g. all, blanks-only" /></Field>
      </div>
      <div className="mt-5 flex gap-2">
        <button className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white disabled:opacity-50" disabled={busy || !code || !title} onClick={() => onSubmit({ code, title, method: method || null, qualifyingTerms: qualifyingTerms || null, catalogScope: catalogScope || null })}>Create price book</button>
        <button className="rounded px-3 py-1.5 text-sm text-gray-600" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

function BookDrawer({ book, lines, onClose, onToast, onReload }: {
  book: PriceBook;
  lines: PriceBookLine[] | null;
  onClose: () => void; onToast: (msg: string) => void; onReload: () => Promise<void>;
}) {
  const [sku, setSku] = useState('');
  const [channel, setChannel] = useState('');
  const [basePrice, setBasePrice] = useState('');
  const [overridePrice, setOverridePrice] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [isActive, setIsActive] = useState(book.isActive);

  const post = async (url: string, body: Record<string, unknown>, method = 'POST') => {
    const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j?.error) throw new Error(j?.error?.message || `Request failed (${r.status})`);
    return j;
  };

  return (
    <div className="fixed inset-y-0 right-0 w-full max-w-lg overflow-y-auto bg-white p-6 shadow-xl">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{book.code} — {book.title}</h2>
        <button className="text-sm text-gray-500" onClick={onClose}>Close</button>
      </div>
      <p className="mt-1 text-sm text-gray-600">Method {book.method ?? '—'}{book.qualifyingTerms ? ` · ${book.qualifyingTerms}` : ''}{book.catalogScope ? ` · scope ${book.catalogScope}` : ''}</p>
      {err && <div className="mt-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>}

      <div className="mt-4 flex flex-wrap items-end gap-2">
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} /> Active</label>
        <button className="rounded bg-gray-900 px-3 py-1.5 text-sm text-white disabled:opacity-50" disabled={busy || isActive === book.isActive} onClick={async () => {
          setBusy(true); setErr(null);
          try {
            await post(`/api/price-books/${book.id}`, { isActive }, 'PATCH');
            onToast('Price book updated');
            await onReload();
          } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
          finally { setBusy(false); }
        }}>Save</button>
        <button className="rounded px-3 py-1.5 text-sm text-red-600 disabled:opacity-50" disabled={busy} onClick={async () => {
          setBusy(true); setErr(null);
          try {
            const r = await fetch(`/api/price-books/${book.id}`, { method: 'DELETE' });
            const j = await r.json().catch(() => ({}));
            if (!r.ok || j?.error) throw new Error(j?.error?.message || 'Delete failed');
            onToast('Price book deleted');
            onClose();
            await onReload();
          } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
          finally { setBusy(false); }
        }}>Delete book</button>
      </div>

      <h3 className="mt-6 font-medium">Lines</h3>
      {(lines?.length ?? 0) === 0 ? (
        <p className="mt-1 text-sm text-gray-500">No lines yet.</p>
      ) : (
        <table className="mt-2 w-full text-sm">
          <thead><tr className="text-left text-gray-500"><th className="py-1 pr-3">Product</th><th className="py-1 pr-3">SKU</th><th className="py-1 pr-3">Channel</th><th className="py-1 text-right">Base</th><th className="py-1 text-right">Override</th><th className="py-1" /></tr></thead>
          <tbody>
            {lines!.map((l) => (
              <tr key={l.id} className="border-t">
                <td className="py-1 pr-3">{l.product ?? '—'}</td>
                <td className="py-1 pr-3 font-mono text-xs">{l.sku ?? '—'}</td>
                <td className="py-1 pr-3">{l.channel ?? '—'}</td>
                <td className="py-1 text-right">{l.basePrice == null ? '—' : fmtMoney(l.basePrice)}</td>
                <td className="py-1 text-right">{l.overridePrice == null ? '—' : fmtMoney(l.overridePrice)}</td>
                <td className="py-1"><button className="text-xs text-red-600" onClick={async () => {
                  setBusy(true); setErr(null);
                  try {
                    const r = await fetch(`/api/price-book-lines?id=${l.id}`, { method: 'DELETE' });
                    const j = await r.json().catch(() => ({}));
                    if (!r.ok || j?.error) throw new Error(j?.error?.message || 'Delete failed');
                    await onReload();
                  } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
                  finally { setBusy(false); }
                }}>Delete</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="mt-4 rounded border p-3">
        <h3 className="font-medium">Add line</h3>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <Field label="SKU"><input className={inputCls} value={sku} onChange={(e) => setSku(e.target.value)} placeholder="e.g. TEE-BLK-M" /></Field>
          <Field label="Channel"><input className={inputCls} value={channel} onChange={(e) => setChannel(e.target.value)} placeholder="e.g. online" /></Field>
          <Field label="Base price"><input className={inputCls} type="number" step="0.01" min="0" value={basePrice} onChange={(e) => setBasePrice(e.target.value)} /></Field>
          <Field label="Override price"><input className={inputCls} type="number" step="0.01" min="0" value={overridePrice} onChange={(e) => setOverridePrice(e.target.value)} /></Field>
        </div>
        <button className="mt-3 rounded bg-blue-600 px-3 py-1.5 text-sm text-white disabled:opacity-50" disabled={busy || !sku} onClick={async () => {
          setBusy(true); setErr(null);
          try {
            await post('/api/price-book-lines', { priceBookId: book.id, sku, channel: channel || null, basePrice: basePrice ? Number(basePrice) : null, overridePrice: overridePrice ? Number(overridePrice) : null });
            setSku(''); setChannel(''); setBasePrice(''); setOverridePrice('');
            onToast('Line added');
            await onReload();
          } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
          finally { setBusy(false); }
        }}>Add line</button>
      </div>
    </div>
  );
}
