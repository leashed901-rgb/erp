'use client';
import { useState, useEffect, useCallback } from 'react';
import type { PaymentTerm, Currency, ExchangeRate, RefundPolicy, TransactionTemplate, Control, BookAccountMapping, ChannelAccount, ReportPackage } from '@/lib/batchITypes';
import { fmtMoney, fmtDate } from '@/lib/batchITypes';

/**
 * Reference data screen (doc 28 Batch I) — the small tables the
 * engine reads but no document screen owns: payment terms,
 * currencies, exchange rates, refund policies, transaction
 * templates, controls, book mappings, channel accounts, report
 * packages. Each tab is a plain CRUD table over its own route.
 */

type Tab = 'terms' | 'currencies' | 'rates' | 'refunds' | 'templates' | 'controls' | 'mappings' | 'channels' | 'packages';

const TABS: [Tab, string][] = [
  ['terms', 'Payment terms'],
  ['currencies', 'Currencies'],
  ['rates', 'Exchange rates'],
  ['refunds', 'Refund policies'],
  ['templates', 'Transaction templates'],
  ['controls', 'Controls'],
  ['mappings', 'Book mappings'],
  ['channels', 'Channel accounts'],
  ['packages', 'Report packages'],
];

interface Props {
  onToast: (msg: string) => void;
}

interface Account {
  id: string;
  code: string;
  name: string;
}

interface Book {
  id: string;
  name: string;
}

interface Entity {
  id: string;
  name: string;
}

export default function ReferenceScreen({ onToast }: Props) {
  const [tab, setTab] = useState<Tab>('terms');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [terms, setTerms] = useState<PaymentTerm[] | null>(null);
  const [currencies, setCurrencies] = useState<Currency[] | null>(null);
  const [rates, setRates] = useState<ExchangeRate[] | null>(null);
  const [refunds, setRefunds] = useState<RefundPolicy[] | null>(null);
  const [templates, setTemplates] = useState<TransactionTemplate[] | null>(null);
  const [controls, setControls] = useState<Control[] | null>(null);
  const [mappings, setMappings] = useState<BookAccountMapping[] | null>(null);
  const [channels, setChannels] = useState<ChannelAccount[] | null>(null);
  const [packages, setPackages] = useState<ReportPackage[] | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadTab = useCallback(async (t: Tab, force = false) => {
    setError(null);
    setLoading(true);
    try {
      const get = async (url: string) => {
        const j = await fetch(url).then((r) => r.json()).catch(() => null);
        if (j?.error) throw new Error(j.error.message || 'Load failed');
        return j?.data || [];
      };
      if (t === 'terms' && (force || !terms)) setTerms((await get('/api/payment-terms')) as PaymentTerm[]);
      else if (t === 'currencies' && (force || !currencies)) setCurrencies((await get('/api/currencies')) as Currency[]);
      else if (t === 'rates' && (force || !rates)) setRates((await get('/api/exchange-rates')) as ExchangeRate[]);
      else if (t === 'refunds' && (force || !refunds)) setRefunds((await get('/api/refund-policies')) as RefundPolicy[]);
      else if (t === 'templates' && (force || !templates)) setTemplates((await get('/api/transaction-templates')) as TransactionTemplate[]);
      else if (t === 'controls' && (force || !controls)) setControls((await get('/api/controls')) as Control[]);
      else if (t === 'mappings' && (force || !mappings)) setMappings((await get('/api/book-account-mappings')) as BookAccountMapping[]);
      else if (t === 'channels' && (force || !channels)) setChannels((await get('/api/channel-accounts')) as ChannelAccount[]);
      else if (t === 'packages' && (force || !packages)) setPackages((await get('/api/report-packages')) as ReportPackage[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [terms, currencies, rates, refunds, templates, controls, mappings, channels, packages]);

  useEffect(() => { loadTab('terms'); }, [loadTab]);

  const post = async (url: string, body: Record<string, unknown>, method = 'POST') => {
    const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j?.error) throw new Error(j?.error?.message || `Request failed (${r.status})`);
    return j;
  };

  const del = async (url: string, label: string) => {
    setBusy(true); setError(null);
    try {
      const r = await fetch(url, { method: 'DELETE' });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j?.error) throw new Error(j?.error?.message || 'Delete failed');
      onToast(`${label} deleted`);
      await loadTab(tab, true);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  const create = async (url: string, body: Record<string, unknown>, label: string) => {
    setBusy(true); setFormError(null);
    try {
      await post(url, body);
      setShowCreate(false);
      onToast(`${label} created`);
      await loadTab(tab, true);
    } catch (e) { setFormError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Reference data</h1>
        <button className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white" onClick={() => { setShowCreate(true); setFormError(null); }}>New {TABS.find(([k]) => k === tab)?.[1].replace(/s$/, '').toLowerCase()}</button>
      </div>

      <div className="mt-4 flex flex-wrap gap-2 border-b pb-2">
        {TABS.map(([k, label]) => (
          <button key={k} className={tab === k ? 'rounded bg-gray-900 px-3 py-1 text-sm text-white' : 'rounded px-3 py-1 text-sm text-gray-600 hover:bg-gray-100'} onClick={() => { setTab(k); loadTab(k); }}>{label}</button>
        ))}
      </div>

      {error && <div className="mt-4 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {loading && <div className="mt-4 text-sm text-gray-500">Loading…</div>}

      {!loading && tab === 'terms' && (
        <div className="mt-4 overflow-x-auto">
          {(terms?.length ?? 0) === 0 ? <p className="text-sm text-gray-500">No payment terms yet. Terms set the due date on invoices and bills (e.g. Net 30).</p> : (
            <table className="w-full text-sm">
              <thead><tr className="text-left text-gray-500"><th className="py-2 pr-3">Code</th><th className="py-2 pr-3">Name</th><th className="py-2 pr-3">Due days</th><th className="py-2 pr-3">Discount days</th><th className="py-2 pr-3">Discount %</th><th className="py-2" /></tr></thead>
              <tbody>{terms!.map((t) => (
                <tr key={t.id} className="border-t"><td className="py-2 pr-3 font-mono text-xs">{t.code}</td><td className="py-2 pr-3">{t.name}</td><td className="py-2 pr-3">{t.dueDays}</td><td className="py-2 pr-3">{t.discountDays ?? '—'}</td><td className="py-2 pr-3">{t.discountPercent == null ? '—' : `${t.discountPercent}%`}</td><td className="py-2"><button className="text-xs text-red-600" onClick={() => del(`/api/payment-terms?id=${t.id}`, 'Payment term')}>Delete</button></td></tr>
              ))}</tbody>
            </table>
          )}
        </div>
      )}

      {!loading && tab === 'currencies' && (
        <div className="mt-4 overflow-x-auto">
          {(currencies?.length ?? 0) === 0 ? <p className="text-sm text-gray-500">No currencies yet.</p> : (
            <table className="w-full text-sm">
              <thead><tr className="text-left text-gray-500"><th className="py-2 pr-3">Code</th><th className="py-2 pr-3">Name</th><th className="py-2 pr-3">Symbol</th><th className="py-2 pr-3">Minor units</th><th className="py-2 pr-3">Active</th><th className="py-2" /></tr></thead>
              <tbody>{currencies!.map((c) => (
                <tr key={c.code} className="border-t"><td className="py-2 pr-3 font-mono text-xs">{c.code}</td><td className="py-2 pr-3">{c.name}</td><td className="py-2 pr-3">{c.symbol ?? '—'}</td><td className="py-2 pr-3">{c.minorUnits}</td><td className="py-2 pr-3">{c.isActive ? 'Yes' : 'No'}</td><td className="py-2"><button className="text-xs text-red-600" onClick={() => del(`/api/currencies?code=${c.code}`, 'Currency')}>Delete</button></td></tr>
              ))}</tbody>
            </table>
          )}
        </div>
      )}

      {!loading && tab === 'rates' && (
        <div className="mt-4 overflow-x-auto">
          {(rates?.length ?? 0) === 0 ? <p className="text-sm text-gray-500">No exchange rates yet. The FX engine reads the latest rate on or before the date it needs — add the currencies first, then their rates.</p> : (
            <table className="w-full text-sm">
              <thead><tr className="text-left text-gray-500"><th className="py-2 pr-3">Date</th><th className="py-2 pr-3">From</th><th className="py-2 pr-3">To</th><th className="py-2 text-right">Rate</th><th className="py-2 pr-3">Type</th><th className="py-2 pr-3">Source</th><th className="py-2" /></tr></thead>
              <tbody>{rates!.map((r) => (
                <tr key={r.id} className="border-t"><td className="py-2 pr-3">{fmtDate(r.rateDate)}</td><td className="py-2 pr-3">{r.fromCurrency}</td><td className="py-2 pr-3">{r.toCurrency}</td><td className="py-2 text-right">{r.rate}</td><td className="py-2 pr-3">{r.rateType ?? '—'}</td><td className="py-2 pr-3">{r.source ?? '—'}</td><td className="py-2"><button className="text-xs text-red-600" onClick={() => del(`/api/exchange-rates?id=${r.id}`, 'Exchange rate')}>Delete</button></td></tr>
              ))}</tbody>
            </table>
          )}
        </div>
      )}

      {!loading && tab === 'refunds' && (
        <div className="mt-4 overflow-x-auto">
          {(refunds?.length ?? 0) === 0 ? <p className="text-sm text-gray-500">No refund policies yet.</p> : (
            <table className="w-full text-sm">
              <thead><tr className="text-left text-gray-500"><th className="py-2 pr-3">Window (days)</th><th className="py-2 pr-3">Restocking fee %</th><th className="py-2 text-right">Approval above</th><th className="py-2 text-right">Auto-approve below</th><th className="py-2 pr-3">Notes</th><th className="py-2" /></tr></thead>
              <tbody>{refunds!.map((p) => (
                <tr key={p.id} className="border-t"><td className="py-2 pr-3">{p.windowDays ?? '—'}</td><td className="py-2 pr-3">{p.restockingFeePercent == null ? '—' : `${p.restockingFeePercent}%`}</td><td className="py-2 text-right">{p.requireApprovalAbove == null ? '—' : fmtMoney(p.requireApprovalAbove)}</td><td className="py-2 text-right">{p.autoApproveBelow == null ? '—' : fmtMoney(p.autoApproveBelow)}</td><td className="py-2 pr-3">{p.notes ?? '—'}</td><td className="py-2"><button className="text-xs text-red-600" onClick={() => del(`/api/refund-policies?id=${p.id}`, 'Refund policy')}>Delete</button></td></tr>
              ))}</tbody>
            </table>
          )}
        </div>
      )}

      {!loading && tab === 'templates' && (
        <div className="mt-4 overflow-x-auto">
          {(templates?.length ?? 0) === 0 ? <p className="text-sm text-gray-500">No transaction templates yet. A template is a named, balanced set of journal lines with parameters — the reusable shape of a recurring posting.</p> : (
            <table className="w-full text-sm">
              <thead><tr className="text-left text-gray-500"><th className="py-2 pr-3">Name</th><th className="py-2 pr-3">Lines</th><th className="py-2 pr-3">Adjusting</th><th className="py-2 pr-3">Auto-reverse</th><th className="py-2 pr-3">Active</th><th className="py-2" /></tr></thead>
              <tbody>{templates!.map((t) => (
                <tr key={t.id} className="border-t"><td className="py-2 pr-3">{t.name}</td><td className="py-2 pr-3">{Array.isArray(t.lines) ? (t.lines as unknown[]).length : '—'}</td><td className="py-2 pr-3">{t.isAdjusting ? 'Yes' : 'No'}</td><td className="py-2 pr-3">{t.autoReverse ? 'Yes' : 'No'}</td><td className="py-2 pr-3">{t.isActive ? 'Yes' : 'No'}</td><td className="py-2"><button className="text-xs text-red-600" onClick={() => del(`/api/transaction-templates?id=${t.id}`, 'Transaction template')}>Delete</button></td></tr>
              ))}</tbody>
            </table>
          )}
        </div>
      )}

      {!loading && tab === 'controls' && (
        <div className="mt-4 overflow-x-auto">
          {(controls?.length ?? 0) === 0 ? <p className="text-sm text-gray-500">No controls yet. A control is a documented check — domain, process, policy rule, threshold, owner role, enforcement, frequency, status.</p> : (
            <table className="w-full text-sm">
              <thead><tr className="text-left text-gray-500"><th className="py-2 pr-3">Code</th><th className="py-2 pr-3">Domain</th><th className="py-2 pr-3">Process</th><th className="py-2 pr-3">Owner role</th><th className="py-2 pr-3">Enforcement</th><th className="py-2 pr-3">Frequency</th><th className="py-2 pr-3">Status</th><th className="py-2" /></tr></thead>
              <tbody>{controls!.map((c) => (
                <tr key={c.id} className="border-t"><td className="py-2 pr-3 font-mono text-xs">{c.controlCode}</td><td className="py-2 pr-3">{c.domain}</td><td className="py-2 pr-3">{c.process}</td><td className="py-2 pr-3">{c.ownerRole ?? '—'}</td><td className="py-2 pr-3">{c.enforcement ?? '—'}</td><td className="py-2 pr-3">{c.frequency ?? '—'}</td><td className="py-2 pr-3">{c.status}</td><td className="py-2"><button className="text-xs text-red-600" onClick={() => del(`/api/controls?id=${c.id}`, 'Control')}>Delete</button></td></tr>
              ))}</tbody>
            </table>
          )}
        </div>
      )}

      {!loading && tab === 'mappings' && (
        <div className="mt-4 overflow-x-auto">
          {(mappings?.length ?? 0) === 0 ? <p className="text-sm text-gray-500">No book mappings yet. A mapping says which account a second book uses for the same posting.</p> : (
            <table className="w-full text-sm">
              <thead><tr className="text-left text-gray-500"><th className="py-2 pr-3">Source account</th><th className="py-2 pr-3">Target book</th><th className="py-2 pr-3">Target account</th><th className="py-2" /></tr></thead>
              <tbody>{mappings!.map((m) => (
                <tr key={m.id} className="border-t"><td className="py-2 pr-3">{m.sourceAccount}</td><td className="py-2 pr-3">{m.targetBook}</td><td className="py-2 pr-3">{m.targetAccount}</td><td className="py-2"><button className="text-xs text-red-600" onClick={() => del(`/api/book-account-mappings?id=${m.id}`, 'Book mapping')}>Delete</button></td></tr>
              ))}</tbody>
            </table>
          )}
        </div>
      )}

      {!loading && tab === 'channels' && (
        <div className="mt-4 overflow-x-auto">
          {(channels?.length ?? 0) === 0 ? <p className="text-sm text-gray-500">No channel accounts yet. Per entity and channel, this maps the payout, fee, advertising, shipping and reserve accounts and the clearing register settlements land in.</p> : (
            <table className="w-full text-sm">
              <thead><tr className="text-left text-gray-500"><th className="py-2 pr-3">Channel</th><th className="py-2 pr-3">Payout</th><th className="py-2 pr-3">Fees</th><th className="py-2 pr-3">Advertising</th><th className="py-2 pr-3">Shipping</th><th className="py-2 pr-3">Reserve</th><th className="py-2 pr-3">Active</th><th className="py-2" /></tr></thead>
              <tbody>{channels!.map((c) => (
                <tr key={c.id} className="border-t"><td className="py-2 pr-3">{c.channel}</td><td className="py-2 pr-3">{c.payoutBankAccount}</td><td className="py-2 pr-3">{c.feeAccount}</td><td className="py-2 pr-3">{c.advertisingAccount}</td><td className="py-2 pr-3">{c.shippingAccount}</td><td className="py-2 pr-3">{c.reserveAccount}</td><td className="py-2 pr-3">{c.isActive ? 'Yes' : 'No'}</td><td className="py-2"><button className="text-xs text-red-600" onClick={() => del(`/api/channel-accounts?id=${c.id}`, 'Channel account mapping')}>Delete</button></td></tr>
              ))}</tbody>
            </table>
          )}
        </div>
      )}

      {!loading && tab === 'packages' && (
        <div className="mt-4 overflow-x-auto">
          {(packages?.length ?? 0) === 0 ? <p className="text-sm text-gray-500">No report packages yet. A package bundles report sections with flux thresholds and recipients.</p> : (
            <table className="w-full text-sm">
              <thead><tr className="text-left text-gray-500"><th className="py-2 pr-3">Name</th><th className="py-2 pr-3">Sections</th><th className="py-2 text-right">Flux $</th><th className="py-2 text-right">Flux %</th><th className="py-2 pr-3">Recipients</th><th className="py-2" /></tr></thead>
              <tbody>{packages!.map((p) => (
                <tr key={p.id} className="border-t"><td className="py-2 pr-3">{p.name}</td><td className="py-2 pr-3">{(p.sections || []).join(', ')}</td><td className="py-2 text-right">{p.fluxAmountThreshold == null ? '—' : fmtMoney(p.fluxAmountThreshold)}</td><td className="py-2 text-right">{p.fluxPctThreshold == null ? '—' : `${p.fluxPctThreshold}%`}</td><td className="py-2 pr-3">{(p.recipients || []).join(', ') || '—'}</td><td className="py-2"><button className="text-xs text-red-600" onClick={() => del(`/api/report-packages?id=${p.id}`, 'Report package')}>Delete</button></td></tr>
              ))}</tbody>
            </table>
          )}
        </div>
      )}

      {showCreate && (
        <CreatePanel
          tab={tab}
          currencies={currencies ?? []}
          error={formError}
          busy={busy}
          onCancel={() => setShowCreate(false)}
          onSubmit={(url, body, label) => create(url, body, label)}
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

function CreatePanel({ tab, currencies, error, busy, onCancel, onSubmit }: {
  tab: Tab;
  currencies: Currency[];
  error: string | null; busy: boolean;
  onCancel: () => void;
  onSubmit: (url: string, body: Record<string, unknown>, label: string) => Promise<void>;
}) {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [dueDays, setDueDays] = useState('30');
  const [discountDays, setDiscountDays] = useState('');
  const [discountPercent, setDiscountPercent] = useState('');
  const [symbol, setSymbol] = useState('');
  const [rateDate, setRateDate] = useState(new Date().toISOString().slice(0, 10));
  const [fromCurrency, setFromCurrency] = useState('USD');
  const [toCurrency, setToCurrency] = useState('');
  const [rate, setRate] = useState('');
  const [windowDays, setWindowDays] = useState('30');
  const [restockingFee, setRestockingFee] = useState('');
  const [notes, setNotes] = useState('');
  const [linesText, setLinesText] = useState('[{"account_id":"","debit":0,"credit":0}]');
  const [domain, setDomain] = useState('');
  const [processName, setProcessName] = useState('');
  const [status, setStatus] = useState('active');
  const [sourceAccountId, setSourceAccountId] = useState('');
  const [targetBookId, setTargetBookId] = useState('');
  const [targetAccountId, setTargetAccountId] = useState('');
  const [channel, setChannel] = useState('');
  const [entityId, setEntityId] = useState('');
  const [clearingRegisterId, setClearingRegisterId] = useState('');
  const [sections, setSections] = useState('profit_and_loss,balance_sheet');
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [books, setBooks] = useState<Book[] | null>(null);
  const [entities, setEntities] = useState<Entity[] | null>(null);

  const title = TABS.find(([k]) => k === tab)?.[1] ?? 'Item';

  const submit = () => {
    if (tab === 'terms') return onSubmit('/api/payment-terms', { code, name, dueDays: Number(dueDays), discountDays: discountDays ? Number(discountDays) : null, discountPercent: discountPercent ? Number(discountPercent) : null }, 'Payment term');
    if (tab === 'currencies') return onSubmit('/api/currencies', { code, name, symbol: symbol || null }, 'Currency');
    if (tab === 'rates') return onSubmit('/api/exchange-rates', { rateDate, fromCurrency, toCurrency, rate: Number(rate) }, 'Exchange rate');
    if (tab === 'refunds') return onSubmit('/api/refund-policies', { windowDays: windowDays ? Number(windowDays) : null, restockingFeePercent: restockingFee ? Number(restockingFee) : null, notes: notes || null }, 'Refund policy');
    if (tab === 'templates') {
      let lines: unknown = [];
      try { lines = JSON.parse(linesText); } catch { lines = null; }
      return onSubmit('/api/transaction-templates', { name, lines, parameters: {} }, 'Transaction template');
    }
    if (tab === 'controls') return onSubmit('/api/controls', { controlCode: code, domain, process: processName, status }, 'Control');
    if (tab === 'mappings') return onSubmit('/api/book-account-mappings', { sourceAccountId, targetBookId, targetAccountId }, 'Book mapping');
    if (tab === 'channels') return onSubmit('/api/channel-accounts', { entityId, channel, clearingRegisterId }, 'Channel account mapping');
    if (tab === 'packages') return onSubmit('/api/report-packages', { name, sections: sections.split(',').map((s) => s.trim()).filter(Boolean), recipients: [] }, 'Report package');
  };

  const loadAccounts = async () => {
    if (!accounts) { const j = await fetch('/api/accounts').then((r) => r.json()).catch(() => null); setAccounts((j?.data || []) as Account[]); }
  };
  const loadBooks = async () => {
    if (!books) { const j = await fetch('/api/books').then((r) => r.json()).catch(() => null); setBooks((j?.data || []) as Book[]); }
  };
  const loadEntities = async () => {
    if (!entities) { const j = await fetch('/api/entities').then((r) => r.json()).catch(() => null); setEntities((j?.data || []) as Entity[]); }
  };

  return (
    <div className="fixed inset-y-0 right-0 w-full max-w-md overflow-y-auto bg-white p-6 shadow-xl">
      <h2 className="text-lg font-semibold">New {title.replace(/s$/, '').toLowerCase()}</h2>
      {error && <div className="mt-2 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      <div className="mt-4 space-y-3">
        {tab === 'terms' && (<>
          <Field label="Code"><input className={inputCls} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="e.g. NET30" /></Field>
          <Field label="Name"><input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Net 30" /></Field>
          <Field label="Due days"><input className={inputCls} type="number" min="0" value={dueDays} onChange={(e) => setDueDays(e.target.value)} /></Field>
          <Field label="Discount days"><input className={inputCls} type="number" min="0" value={discountDays} onChange={(e) => setDiscountDays(e.target.value)} /></Field>
          <Field label="Discount %"><input className={inputCls} type="number" step="0.01" min="0" value={discountPercent} onChange={(e) => setDiscountPercent(e.target.value)} /></Field>
        </>)}
        {tab === 'currencies' && (<>
          <Field label="Code (3 letters)"><input className={inputCls} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={3} placeholder="e.g. EUR" /></Field>
          <Field label="Name"><input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Euro" /></Field>
          <Field label="Symbol"><input className={inputCls} value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder="e.g. €" /></Field>
        </>)}
        {tab === 'rates' && (<>
          <Field label="Date"><input className={inputCls} type="date" value={rateDate} onChange={(e) => setRateDate(e.target.value)} /></Field>
          <Field label="From currency"><select className={inputCls} value={fromCurrency} onChange={(e) => setFromCurrency(e.target.value)}>{currencies.map((c) => <option key={c.code} value={c.code}>{c.code} — {c.name}</option>)}</select></Field>
          <Field label="To currency"><input className={inputCls} value={toCurrency} onChange={(e) => setToCurrency(e.target.value.toUpperCase())} maxLength={3} placeholder="e.g. EUR" /></Field>
          <Field label="Rate"><input className={inputCls} type="number" step="0.000001" min="0" value={rate} onChange={(e) => setRate(e.target.value)} /></Field>
        </>)}
        {tab === 'refunds' && (<>
          <Field label="Window (days)"><input className={inputCls} type="number" min="0" value={windowDays} onChange={(e) => setWindowDays(e.target.value)} /></Field>
          <Field label="Restocking fee %"><input className={inputCls} type="number" step="0.01" min="0" value={restockingFee} onChange={(e) => setRestockingFee(e.target.value)} /></Field>
          <Field label="Notes"><input className={inputCls} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
        </>)}
        {tab === 'templates' && (<>
          <Field label="Name"><input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Monthly rent accrual" /></Field>
          <Field label="Lines (JSON, at least two balanced lines)"><textarea className={inputCls} rows={5} value={linesText} onChange={(e) => setLinesText(e.target.value)} /></Field>
        </>)}
        {tab === 'controls' && (<>
          <Field label="Control code"><input className={inputCls} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="e.g. AP-01" /></Field>
          <Field label="Domain"><input className={inputCls} value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="e.g. accounts_payable" /></Field>
          <Field label="Process"><input className={inputCls} value={processName} onChange={(e) => setProcessName(e.target.value)} placeholder="e.g. bill approval" /></Field>
          <Field label="Status"><input className={inputCls} value={status} onChange={(e) => setStatus(e.target.value)} /></Field>
        </>)}
        {tab === 'mappings' && (<>
          <Field label="Source account"><select className={inputCls} value={sourceAccountId} onChange={(e) => setSourceAccountId(e.target.value)} onFocus={loadAccounts}><option value="">—</option>{(accounts ?? []).map((a) => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}</select></Field>
          <Field label="Target book"><select className={inputCls} value={targetBookId} onChange={(e) => setTargetBookId(e.target.value)} onFocus={loadBooks}><option value="">—</option>{(books ?? []).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>
          <Field label="Target account"><select className={inputCls} value={targetAccountId} onChange={(e) => setTargetAccountId(e.target.value)} onFocus={loadAccounts}><option value="">—</option>{(accounts ?? []).map((a) => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}</select></Field>
        </>)}
        {tab === 'channels' && (<>
          <Field label="Entity"><select className={inputCls} value={entityId} onChange={(e) => setEntityId(e.target.value)} onFocus={loadEntities}><option value="">—</option>{(entities ?? []).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select></Field>
          <Field label="Channel"><input className={inputCls} value={channel} onChange={(e) => setChannel(e.target.value)} placeholder="e.g. shopify, amazon" /></Field>
          <Field label="Clearing register id"><input className={inputCls} value={clearingRegisterId} onChange={(e) => setClearingRegisterId(e.target.value)} placeholder="UUID of the clearing register" /></Field>
        </>)}
        {tab === 'packages' && (<>
          <Field label="Name"><input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Monthly board pack" /></Field>
          <Field label="Sections (comma-separated)"><input className={inputCls} value={sections} onChange={(e) => setSections(e.target.value)} /></Field>
          <p className="text-xs text-gray-500">Sections: profit_and_loss, balance_sheet, cash_flow, trial_balance, kpis, flux, close_status, ar_aging, ap_aging</p>
        </>)}
      </div>
      <div className="mt-5 flex gap-2">
        <button className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white disabled:opacity-50" disabled={busy} onClick={submit}>Create</button>
        <button className="rounded px-3 py-1.5 text-sm text-gray-600" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
