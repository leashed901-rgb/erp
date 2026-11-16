'use client';
import { useState, useEffect, useCallback } from 'react';
import type { AccountRoleRow, AccountBalanceRow, NumberSequenceRow, OrderPostingRow, GatewayClearingRow, ProcessorEventRow, AttachmentRow, AcctCustomerRow } from '@/lib/batchITypes';
import { fmtMoney, cap } from '@/lib/batchITypes';

/**
 * System records screen (doc 28 Batch I) — read-only registers the
 * engine writes and nothing else should touch: account roles,
 * account balances, number sequences, order postings, gateway
 * clearing entries, processor events, attachments, and the
 * accounting customer mirror. These are the audit trail of the
 * engine's own bookkeeping; the screen shows them and nothing here
 * edits them.
 */

type Tab = 'roles' | 'balances' | 'sequences' | 'postings' | 'clearing' | 'events' | 'attachments' | 'customers';

const TABS: [Tab, string][] = [
  ['roles', 'Roles'],
  ['balances', 'Balances'],
  ['sequences', 'Number sequences'],
  ['postings', 'Order postings'],
  ['clearing', 'Gateway clearing'],
  ['events', 'Processor events'],
  ['attachments', 'Attachments'],
  ['customers', 'Customers'],
];

interface Props {
  onToast: (msg: string) => void;
}

export default function RegistersScreen({ onToast }: Props) {
  const [tab, setTab] = useState<Tab>('roles');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [roles, setRoles] = useState<AccountRoleRow[] | null>(null);
  const [balances, setBalances] = useState<AccountBalanceRow[] | null>(null);
  const [sequences, setSequences] = useState<NumberSequenceRow[] | null>(null);
  const [postings, setPostings] = useState<OrderPostingRow[] | null>(null);
  const [clearing, setClearing] = useState<GatewayClearingRow[] | null>(null);
  const [events, setEvents] = useState<ProcessorEventRow[] | null>(null);
  const [attachments, setAttachments] = useState<AttachmentRow[] | null>(null);
  const [customers, setCustomers] = useState<AcctCustomerRow[] | null>(null);

  const loadTab = useCallback(async (t: Tab, force = false) => {
    setError(null);
    setLoading(true);
    try {
      const get = async (url: string) => {
        const j = await fetch(url).then((r) => r.json()).catch(() => null);
        if (j?.error) throw new Error(j.error.message || 'Load failed');
        return j?.data || [];
      };
      if (t === 'roles' && (force || !roles)) setRoles((await get('/api/registers/account-roles')) as AccountRoleRow[]);
      else if (t === 'balances' && (force || !balances)) setBalances((await get('/api/registers/account-balances')) as AccountBalanceRow[]);
      else if (t === 'sequences' && (force || !sequences)) setSequences((await get('/api/registers/number-sequences')) as NumberSequenceRow[]);
      else if (t === 'postings' && (force || !postings)) setPostings((await get('/api/registers/order-postings')) as OrderPostingRow[]);
      else if (t === 'clearing' && (force || !clearing)) setClearing((await get('/api/registers/gateway-clearing-entries')) as GatewayClearingRow[]);
      else if (t === 'events' && (force || !events)) setEvents((await get('/api/registers/processor-events')) as ProcessorEventRow[]);
      else if (t === 'attachments' && (force || !attachments)) setAttachments((await get('/api/registers/attachments')) as AttachmentRow[]);
      else if (t === 'customers' && (force || !customers)) setCustomers((await get('/api/registers/customers')) as AcctCustomerRow[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [roles, balances, sequences, postings, clearing, events, attachments, customers]);

  useEffect(() => { loadTab('roles'); }, [loadTab]);

  return (
    <div className="p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">System records</h1>
        <span className="text-sm text-gray-500">Read-only — written by the engine</span>
      </div>

      <div className="mt-4 flex flex-wrap gap-2 border-b pb-2">
        {TABS.map(([k, label]) => (
          <button key={k} className={tab === k ? 'rounded bg-gray-900 px-3 py-1 text-sm text-white' : 'rounded px-3 py-1 text-sm text-gray-600 hover:bg-gray-100'} onClick={() => { setTab(k); loadTab(k); }}>{label}</button>
        ))}
      </div>

      {error && <div className="mt-4 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {loading && <div className="mt-4 text-sm text-gray-500">Loading…</div>}

      {!loading && tab === 'roles' && (
        <div className="mt-4 overflow-x-auto">
          <p className="text-sm text-gray-600">The role → account map the engine resolves with acct_role_account (45 roles: accounts_receivable, undeposited_funds, inventory_asset, …). A role with no account reads as —.</p>
          {(roles?.length ?? 0) === 0 ? <p className="mt-2 text-sm text-gray-500">No role assignments yet.</p> : (
            <table className="mt-2 w-full text-sm">
              <thead><tr className="text-left text-gray-500"><th className="py-2 pr-3">Role</th><th className="py-2 pr-3">Account</th></tr></thead>
              <tbody>{roles!.map((r) => (
                <tr key={r.id} className="border-t"><td className="py-2 pr-3 font-mono text-xs">{r.role}</td><td className="py-2 pr-3">{r.account}</td></tr>
              ))}</tbody>
            </table>
          )}
        </div>
      )}

      {!loading && tab === 'balances' && (
        <div className="mt-4 overflow-x-auto">
          <p className="text-sm text-gray-600">Per-period closing balances, maintained by posting — never typed in.</p>
          {(balances?.length ?? 0) === 0 ? <p className="mt-2 text-sm text-gray-500">No balances recorded yet.</p> : (
            <table className="mt-2 w-full text-sm">
              <thead><tr className="text-left text-gray-500"><th className="py-2 pr-3">Account</th><th className="py-2 pr-3">Period</th><th className="py-2 text-right">Debit</th><th className="py-2 text-right">Credit</th><th className="py-2 text-right">Closing debit</th><th className="py-2 text-right">Closing credit</th></tr></thead>
              <tbody>{balances!.map((b) => (
                <tr key={b.id} className="border-t"><td className="py-2 pr-3">{b.account}</td><td className="py-2 pr-3">{b.period}</td><td className="py-2 text-right">{fmtMoney(b.debit)}</td><td className="py-2 text-right">{fmtMoney(b.credit)}</td><td className="py-2 text-right">{fmtMoney(b.closingDebit)}</td><td className="py-2 text-right">{fmtMoney(b.closingCredit)}</td></tr>
              ))}</tbody>
            </table>
          )}
        </div>
      )}

      {!loading && tab === 'sequences' && (
        <div className="mt-4 overflow-x-auto">
          <p className="text-sm text-gray-600">Document-number sequences. Created on demand by acct_next_number when a document asks for its next number — nothing here is typed in by hand.</p>
          {(sequences?.length ?? 0) === 0 ? <p className="mt-2 text-sm text-gray-500">No sequences yet.</p> : (
            <table className="mt-2 w-full text-sm">
              <thead><tr className="text-left text-gray-500"><th className="py-2 pr-3">Document type</th><th className="py-2 pr-3">Prefix</th><th className="py-2 pr-3">Next value</th><th className="py-2 pr-3">Padding</th></tr></thead>
              <tbody>{sequences!.map((s) => (
                <tr key={`${s.entityId}-${s.docType}`} className="border-t"><td className="py-2 pr-3 font-mono text-xs">{s.docType}</td><td className="py-2 pr-3 font-mono text-xs">{s.prefix}</td><td className="py-2 pr-3">{s.nextValue}</td><td className="py-2 pr-3">{s.padding}</td></tr>
              ))}</tbody>
            </table>
          )}
        </div>
      )}

      {!loading && tab === 'postings' && (
        <div className="mt-4 overflow-x-auto">
          <p className="text-sm text-gray-600">The order → journal map, written by a trigger from erp_orders. Read this to trace an order&apos;s GL footprint.</p>
          {(postings?.length ?? 0) === 0 ? <p className="mt-2 text-sm text-gray-500">No order postings yet.</p> : (
            <table className="mt-2 w-full text-sm">
              <thead><tr className="text-left text-gray-500"><th className="py-2 pr-3">Order</th><th className="py-2 text-right">Sale</th><th className="py-2 text-right">Tax</th><th className="py-2 pr-3">Reversed</th><th className="py-2 pr-3">Status</th><th className="py-2 pr-3">Error</th></tr></thead>
              <tbody>{postings!.map((o) => (
                <tr key={o.orderId} className="border-t"><td className="py-2 pr-3 font-mono text-xs">{o.orderId.slice(0, 8)}…</td><td className="py-2 text-right">{o.saleAmount == null ? '—' : fmtMoney(o.saleAmount)}</td><td className="py-2 text-right">{o.taxAmount == null ? '—' : fmtMoney(o.taxAmount)}</td><td className="py-2 pr-3">{o.saleReversed ? 'Yes' : 'No'}</td><td className="py-2 pr-3">{o.lastStatus ?? '—'}</td><td className="py-2 pr-3">{o.lastError ?? '—'}</td></tr>
              ))}</tbody>
            </table>
          )}
        </div>
      )}

      {!loading && tab === 'clearing' && (
        <div className="mt-4 overflow-x-auto">
          <p className="text-sm text-gray-600">The gateway clearing register — one row per gateway settlement batch: gross / fee / reserve / net and its state.</p>
          {(clearing?.length ?? 0) === 0 ? <p className="mt-2 text-sm text-gray-500">No gateway clearing entries yet.</p> : (
            <table className="mt-2 w-full text-sm">
              <thead><tr className="text-left text-gray-500"><th className="py-2 pr-3">Gateway</th><th className="py-2 text-right">Gross</th><th className="py-2 text-right">Fee</th><th className="py-2 text-right">Reserve</th><th className="py-2 text-right">Net</th><th className="py-2 pr-3">State</th></tr></thead>
              <tbody>{clearing!.map((e) => (
                <tr key={e.id} className="border-t"><td className="py-2 pr-3">{e.gateway}</td><td className="py-2 text-right">{fmtMoney(e.grossAmount)}</td><td className="py-2 text-right">{fmtMoney(e.feeAmount)}</td><td className="py-2 text-right">{fmtMoney(e.reserveAmount)}</td><td className="py-2 text-right">{fmtMoney(e.netAmount)}</td><td className="py-2 pr-3">{e.state}</td></tr>
              ))}</tbody>
            </table>
          )}
        </div>
      )}

      {!loading && tab === 'events' && (
        <div className="mt-4 overflow-x-auto">
          <p className="text-sm text-gray-600">Payment processor webhook events — provider, event id/type, status (received | processed | ignored | failed) and attempt count.</p>
          {(events?.length ?? 0) === 0 ? <p className="mt-2 text-sm text-gray-500">No processor events yet.</p> : (
            <table className="mt-2 w-full text-sm">
              <thead><tr className="text-left text-gray-500"><th className="py-2 pr-3">Provider</th><th className="py-2 pr-3">Event id</th><th className="py-2 pr-3">Type</th><th className="py-2 pr-3">Status</th><th className="py-2 pr-3">Attempts</th></tr></thead>
              <tbody>{events!.map((e) => (
                <tr key={e.id} className="border-t"><td className="py-2 pr-3">{e.provider}</td><td className="py-2 pr-3 font-mono text-xs">{e.eventId}</td><td className="py-2 pr-3">{e.eventType}</td><td className="py-2 pr-3">{cap(e.status)}</td><td className="py-2 pr-3">{e.attempts}</td></tr>
              ))}</tbody>
            </table>
          )}
        </div>
      )}

      {!loading && tab === 'attachments' && (
        <div className="mt-4 overflow-x-auto">
          <p className="text-sm text-gray-600">File attachments on accounting records — storage path, mime, size and sha256.</p>
          {(attachments?.length ?? 0) === 0 ? <p className="mt-2 text-sm text-gray-500">No attachments yet.</p> : (
            <table className="mt-2 w-full text-sm">
              <thead><tr className="text-left text-gray-500"><th className="py-2 pr-3">Entity type</th><th className="py-2 pr-3">File</th><th className="py-2 pr-3">Mime</th><th className="py-2 text-right">Size</th><th className="py-2 pr-3">SHA-256</th></tr></thead>
              <tbody>{attachments!.map((a) => (
                <tr key={a.id} className="border-t"><td className="py-2 pr-3">{a.entityType}</td><td className="py-2 pr-3">{a.fileName}</td><td className="py-2 pr-3">{a.mime ?? '—'}</td><td className="py-2 text-right">{a.size == null ? '—' : a.size.toLocaleString()}</td><td className="py-2 pr-3 font-mono text-xs">{a.sha256 ? a.sha256.slice(0, 12) + '…' : '—'}</td></tr>
              ))}</tbody>
            </table>
          )}
        </div>
      )}

      {!loading && tab === 'customers' && (
        <div className="mt-4 overflow-x-auto">
          <p className="text-sm text-gray-600">The accounting customer mirror — the GL-facing copy of a customer (customer number, legal name, AR account, payment terms, party link). CRM customers live in crm_customers; this register shows only the accounting mirror.</p>
          {(customers?.length ?? 0) === 0 ? <p className="mt-2 text-sm text-gray-500">No accounting customers yet — recurring invoices bill accounting customers, so the mirror has to be populated before a schedule can be created.</p> : (
            <table className="mt-2 w-full text-sm">
              <thead><tr className="text-left text-gray-500"><th className="py-2 pr-3">Number</th><th className="py-2 pr-3">Legal name</th><th className="py-2 pr-3">AR account</th><th className="py-2 pr-3">Terms (days)</th></tr></thead>
              <tbody>{customers!.map((c) => (
                <tr key={c.id} className="border-t"><td className="py-2 pr-3 font-mono text-xs">{c.customerNumber ?? '—'}</td><td className="py-2 pr-3">{c.legalName ?? '—'}</td><td className="py-2 pr-3 font-mono text-xs">{c.arAccountId ? c.arAccountId.slice(0, 8) + '…' : '—'}</td><td className="py-2 pr-3">{c.paymentTermsDays ?? '—'}</td></tr>
              ))}</tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
