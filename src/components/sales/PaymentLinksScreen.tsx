'use client';
import './sales.css';
import { useState, useMemo, useEffect, useCallback } from 'react';
import { SalesScreenProps, SALES_NAV } from './types';
import RowMenu from '@/components/ListPrimitives';
import type { DemoRow } from '@/data/shellData';
import { exportToCsv } from '@/lib/csvExport';

type LinkStatus = 'Active' | 'Paid' | 'Expired' | 'Inactive';

interface PaymentLinkRow {
  id: string;
  code: string;
  title: string;
  description: string;
  amount: number | null;
  customer: string;
  created: string;
  expires: string | null;
  status: LinkStatus;
  db_status: string;
  invoice_id: string | null;
  kind: string;
  provider_url: string | null;
  use_count: number;
  total_collected: number;
}

type TabKey = 'All' | 'Active' | 'Paid' | 'Expired';
type RangeKey = 'all' | '30d' | 'month';

const TABS: TabKey[] = ['All', 'Active', 'Paid', 'Expired'];

const STATUS_BADGE: Record<LinkStatus, string> = {
  Active: 'bg-primary/10 text-primary',
  Paid: 'bg-secondary-container text-on-secondary-container',
  Expired: 'bg-surface-container text-on-surface-variant',
  Inactive: 'bg-surface-container text-on-surface-variant',
};

const money = (n: number | null) =>
  n == null ? '—' : '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtDate = (iso: string | null) => {
  if (!iso) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[2]}/${m[3]}/${m[1]}` : iso.slice(0, 10);
};

const toIso = (mmddyyyy: string) => {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(mmddyyyy.trim());
  return m ? `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}` : '';
};

export default function PaymentLinksScreen({ onNavigate, onToast, onOpenPeek }: SalesScreenProps) {
  const [rows, setRows] = useState<PaymentLinkRow[]>([]);
  const [kpis, setKpis] = useState({ active: 0, collected30d: 0, pending: 0, conversion: 0 });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>('All');
  const [searchText, setSearchText] = useState('');
  const [range, setRange] = useState<RangeKey>('all');

  // Create / edit modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<PaymentLinkRow | null>(null);
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [invoiceId, setInvoiceId] = useState('');
  const [expires, setExpires] = useState('');
  const [expiresOn, setExpiresOn] = useState(true);
  const [activeToggle, setActiveToggle] = useState(true);
  const [saving, setSaving] = useState(false);
  const [createdToken, setCreatedToken] = useState<string | null>(null);
  const [openInvoices, setOpenInvoices] = useState<{ id: string; label: string; balance: number }[]>([]);

  const loadAll = useCallback(() => {
    setLoading(true);
    setLoadError(null);
    Promise.all([
      fetch('/api/payment-links').then((r) => r.json()).catch(() => ({ data: [], meta: {} })),
      fetch('/api/v1/documents?type=Invoice').then((r) => r.json()).catch(() => ({ data: [] })),
    ])
      .then(([linksJson, invJson]) => {
        setRows(((linksJson.data || []) as PaymentLinkRow[]));
        const meta = linksJson.meta || {};
        setKpis({
          active: Number(meta.active ?? 0),
          collected30d: Number(meta.collected30d ?? 0),
          pending: Number(meta.pending ?? 0),
          conversion: Number(meta.conversion ?? 0),
        });
        setOpenInvoices(
          ((invJson.data || []) as Record<string, unknown>[])
            .filter((d) => String(d.status) !== 'paid' && Number(d.open_balance ?? 0) > 0)
            .map((d) => ({
              id: String(d.id),
              label: `${String(d.invoice_number || '')} — ${money(Number(d.open_balance ?? 0))}`,
              balance: Number(d.open_balance ?? 0),
            })),
        );
      })
      .catch(() => setLoadError('Could not load payment links.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const filtered = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    const now = Date.now();
    const rangeFrom =
      range === '30d' ? now - 30 * 86400000 : range === 'month' ? new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime() : 0;
    return rows.filter((r) => {
      const matchTab = activeTab === 'All' || r.status === activeTab;
      const matchSearch =
        !q ||
        r.code.toLowerCase().includes(q) ||
        r.description.toLowerCase().includes(q) ||
        r.customer.toLowerCase().includes(q);
      const matchRange = range === 'all' || new Date(r.created + 'T00:00:00').getTime() >= rangeFrom;
      return matchTab && matchSearch && matchRange;
    });
  }, [rows, activeTab, searchText, range]);

  const countText =
    filtered.length === 0 ? `0 of ${rows.length}` : `1–${filtered.length} of ${rows.length}`;

  const openCreate = () => {
    setEditing(null);
    setAmount('');
    setDescription('');
    setInvoiceId('');
    setExpires('');
    setExpiresOn(true);
    setActiveToggle(true);
    setCreatedToken(null);
    setModalOpen(true);
  };

  const openEdit = (row: PaymentLinkRow) => {
    setEditing(row);
    setAmount(row.amount != null ? row.amount.toFixed(2) : '');
    setDescription(row.description);
    setInvoiceId(row.invoice_id ?? '');
    setExpires(row.expires ? fmtDate(row.expires) : '');
    setExpiresOn(Boolean(row.expires));
    setActiveToggle(row.db_status === 'active');
    setCreatedToken(null);
    setModalOpen(true);
  };

  const closeModal = () => setModalOpen(false);

  const saveLink = async (andNew: boolean) => {
    const amt = parseFloat(amount.replace(/,/g, '')) || 0;
    if (!invoiceId && amt <= 0) {
      onToast('Enter an amount, or link an open invoice');
      return;
    }
    if (!description.trim() && !invoiceId) {
      onToast('Enter a description');
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        const res = await fetch(`/api/payment-links/${editing.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: description.trim() || editing.title,
            description: description.trim(),
            amount: invoiceId ? undefined : amt,
            expires_at: expiresOn && expires ? toIso(expires) : null,
            status: activeToggle ? 'active' : 'inactive',
          }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(String(json?.error?.message || `Save failed (${res.status})`));
        onToast('Payment link updated');
      } else {
        const res = await fetch('/api/payment-links', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: description.trim(),
            description: description.trim(),
            amount: invoiceId ? undefined : amt,
            expires_at: expiresOn && expires ? toIso(expires) : null,
            invoice_id: invoiceId || undefined,
          }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(String(json?.error?.message || `Create failed (${res.status})`));
        setCreatedToken(String(json?.data?.public_token || ''));
        onToast('Payment link created');
      }
      loadAll();
      if (andNew) {
        openCreate();
      } else {
        closeModal();
      }
    } catch (e) {
      onToast(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const copyText = async (text: string, okMsg: string) => {
    try {
      await navigator.clipboard?.writeText(text);
      onToast(okMsg);
    } catch {
      onToast('Copy failed — select and copy manually');
    }
  };

  const shareRow = async (row: PaymentLinkRow) => {
    const text = row.provider_url ?? row.code;
    if (typeof navigator !== 'undefined' && 'share' in navigator) {
      try {
        await (navigator as Navigator & { share: (d: { title: string; text: string }) => Promise<void> }).share({
          title: `Payment link ${row.code}`,
          text,
        });
        return;
      } catch {
        /* user cancelled — fall through to copy */
      }
    }
    void copyText(text, 'Link copied to clipboard');
  };

  const setStatus = async (row: PaymentLinkRow, status: 'active' | 'inactive') => {
    const res = await fetch(`/api/payment-links/${row.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) {
      onToast('Could not update the link');
      return;
    }
    onToast(status === 'active' ? `Activated ${row.code}` : `Deactivated ${row.code}`);
    loadAll();
  };

  const deleteRow = async (row: PaymentLinkRow) => {
    const res = await fetch(`/api/payment-links/${row.id}`, { method: 'DELETE' });
    if (!res.ok) {
      onToast('Could not delete the link');
      return;
    }
    onToast(`Deleted ${row.code}`);
    loadAll();
  };

  return (
    <div className="bg-background font-sans text-body-md text-on-surface antialiased min-h-screen">
      {/* Context header */}
      <div className="h-[52px] px-6 flex items-center justify-between bg-white border-b border-surface-dim">
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-[20px] text-on-surface-variant">account_balance</span>
          <span className="text-label-md font-semibold">Finance</span>
          <span className="text-outline">/</span>
          <button
            className="text-label-md hover:text-primary"
            onClick={() => onNavigate(...SALES_NAV.overview())}
          >
            Sales &amp; Get Paid
          </button>
          <span className="text-outline">/</span>
          <button
            className="text-label-md text-primary font-semibold hover:underline"
            onClick={() => onNavigate(...SALES_NAV.paymentLinks())}
          >
            Payment links
          </button>
        </div>
      </div>

      <main className="px-6 pb-12">
        {/* Page header */}
        <div className="flex items-center justify-between gap-4 py-4">
          <div>
            <h1 className="text-headline-lg">Payment links</h1>
            <p className="text-body-sm text-on-surface-variant mt-0.5">
              Share a link — customer pays via card or bank transfer. Links are stored in acct_payment_links; no checkout provider is connected yet, so links carry the payment request until a provider publishes them.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              className="h-8 px-3 bg-primary text-white rounded text-body-md font-semibold hover:bg-primary-container flex items-center gap-1"
              onClick={openCreate}
            >
              <span className="material-symbols-outlined text-[16px]">link</span>New payment link
            </button>
            <button
              className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low flex items-center gap-1"
              onClick={() => {
                const cols = [
                  { key: 'code', label: 'Code' },
                  { key: 'description', label: 'Description' },
                  { key: 'amount', label: 'Amount' },
                  { key: 'customer', label: 'Customer' },
                  { key: 'created', label: 'Created' },
                  { key: 'expires', label: 'Expires' },
                  { key: 'status', label: 'Status' },
                ];
                exportToCsv(filtered as unknown as Record<string, unknown>[], cols, 'payment-links');
                onToast(`Exported ${filtered.length} records to CSV`);
              }}
            >
              <span className="material-symbols-outlined text-[16px]">download</span>Export
            </button>
          </div>
        </div>

        {/* KPI strip */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-5">
          <div className="bg-white rounded-xl border border-surface-dim p-3">
            <span className="text-[10px] text-on-surface-variant uppercase tracking-wider font-bold">Active links</span>
            <div className="text-headline-sm mt-1 tabular-nums">{loading ? '…' : kpis.active}</div>
          </div>
          <div className="bg-white rounded-xl border border-surface-dim p-3">
            <span className="text-[10px] text-on-surface-variant uppercase tracking-wider font-bold">Collected (30d)</span>
            <div className="text-headline-sm mt-1 tabular-nums">{loading ? '…' : money(kpis.collected30d)}</div>
          </div>
          <div className="bg-white rounded-xl border border-surface-dim p-3">
            <span className="text-[10px] text-on-surface-variant uppercase tracking-wider font-bold">Pending</span>
            <div className="text-headline-sm mt-1 tabular-nums">{loading ? '…' : money(kpis.pending)}</div>
          </div>
          <div className="bg-white rounded-xl border border-surface-dim p-3">
            <span className="text-[10px] text-on-surface-variant uppercase tracking-wider font-bold">Conversion</span>
            <div className="text-headline-sm mt-1 tabular-nums">{loading ? '…' : `${kpis.conversion}%`}</div>
          </div>
        </div>

        {/* Table card */}
        <div className="bg-white rounded-xl shadow-sm border border-surface-dim overflow-hidden">
          {/* Status tabs */}
          <div className="flex items-center gap-1 px-4 h-11 border-b border-surface-dim overflow-x-auto">
            {TABS.map((tab) => (
              <button
                key={tab}
                className={`h-full px-3 text-label-md tab-underline ${activeTab === tab ? 'active' : 'text-on-surface-variant'}`}
                onClick={() => setActiveTab(tab)}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Filter bar */}
          <div className="px-4 py-2 flex items-center gap-2 border-b border-surface-dim flex-wrap">
            <div className="relative flex items-center flex-1 max-w-sm min-w-[180px]">
              <span className="material-symbols-outlined absolute left-2 text-[15px] text-outline">search</span>
              <input
                className="w-full h-7 pl-7 pr-2 bg-surface-container-low border border-surface-dim rounded text-body-sm focus:outline-none focus:border-primary"
                placeholder="Filter by code, description…"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
              />
            </div>
            <label className="h-7 px-2 border border-surface-dim rounded text-label-sm hover:bg-surface-container-low flex items-center gap-1 bg-white">
              <span className="material-symbols-outlined text-[14px]">calendar_today</span>
              <span className="text-on-surface-variant">Created:</span>
              <select
                className="bg-transparent border-none text-label-sm text-on-surface focus:outline-none"
                value={range}
                onChange={(e) => setRange(e.target.value as RangeKey)}
              >
                <option value="all">All time</option>
                <option value="30d">Last 30 days</option>
                <option value="month">This month</option>
              </select>
            </label>
            <span className="ml-auto text-[11px] text-on-surface-variant">{countText}</span>
          </div>

          {/* Table */}
          <table className="w-full text-left text-body-sm">
            <thead className="bg-surface-container-low text-label-sm text-on-surface-variant uppercase tracking-wider">
              <tr>
                <th className="px-3 py-2">Code</th>
                <th className="px-3 py-2">Description</th>
                <th className="px-3 py-2 text-right">Amount</th>
                <th className="px-3 py-2">Customer</th>
                <th className="px-3 py-2">Created</th>
                <th className="px-3 py-2">Expires</th>
                <th className="px-3 py-2">Status</th>
                <th className="w-8"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-dim">
              {loading && (
                <tr>
                  <td className="px-3 py-4 text-on-surface-variant" colSpan={8}>Loading payment links…</td>
                </tr>
              )}
              {!loading && loadError && (
                <tr>
                  <td className="px-3 py-4" colSpan={8}>
                    {loadError}{' '}
                    <button type="button" className="text-primary font-semibold" onClick={loadAll}>Retry</button>
                  </td>
                </tr>
              )}
              {!loading && !loadError && filtered.length === 0 && (
                <tr>
                  <td className="px-3 py-4 text-on-surface-variant" colSpan={8}>No payment links yet — create one to share a payment request.</td>
                </tr>
              )}
              {filtered.map((row) => (
                <tr
                  key={row.id}
                  className="hover:bg-surface-container-low cursor-pointer pl-row"
                  onClick={(e) => {
                    if ((e.target as HTMLElement).closest('input,button')) return;
                    onOpenPeek?.(row as unknown as DemoRow, 'sales');
                  }}
                >
                  <td className={`px-3 py-2 font-mono font-medium ${row.status === 'Expired' ? 'text-on-surface-variant' : 'text-primary'}`}>{row.code}</td>
                  <td className="px-3 py-2">{row.description || row.title}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{money(row.amount)}</td>
                  <td className="px-3 py-2">{row.customer}</td>
                  <td className="px-3 py-2">{fmtDate(row.created)}</td>
                  <td className="px-3 py-2">{fmtDate(row.expires)}</td>
                  <td className="px-3 py-2">
                    <span className={`px-2 py-0.5 rounded-full text-label-sm ${STATUS_BADGE[row.status]}`}>{row.status}</span>
                  </td>
                  <td className="px-2 py-2 text-right">
                    <RowMenu
                      ariaLabel={`Row actions for ${row.code}`}
                      items={[
                        {
                          label: 'View',
                          icon: 'open_in_new',
                          onClick: () => onOpenPeek?.(row as unknown as DemoRow, 'sales'),
                        },
                        {
                          label: 'Edit',
                          icon: 'edit',
                          onClick: () => openEdit(row),
                        },
                        {
                          label: 'Copy link',
                          icon: 'content_copy',
                          onClick: () => void copyText(row.provider_url ?? row.code, 'Link copied to clipboard'),
                        },
                        {
                          label: 'Share',
                          icon: 'share',
                          onClick: () => void shareRow(row),
                        },
                        row.db_status === 'active'
                          ? {
                              label: 'Deactivate',
                              icon: 'block',
                              danger: true,
                              onClick: () => void setStatus(row, 'inactive'),
                            }
                          : {
                              label: 'Activate',
                              icon: 'check_circle',
                              onClick: () => void setStatus(row, 'active'),
                            },
                        {
                          label: 'Delete',
                          icon: 'delete',
                          danger: true,
                          onClick: () => void deleteRow(row),
                        },
                      ]}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>

      {/* ═══════════ PAYMENT LINK MODAL ═══════════ */}
      <div
        className={`modal-scrim ${modalOpen ? 'open' : ''}`}
        onClick={(e) => {
          if (e.target === e.currentTarget) closeModal();
        }}
      >
        <div className="w-full max-w-[640px] bg-white rounded-xl shadow-2xl flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-5 h-14 border-b border-surface-dim">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[20px] text-primary">link</span>
              <div>
                <div className="text-headline-sm">{editing ? 'Edit payment link' : 'New payment link'}</div>
                <div className="text-[11px] text-on-surface-variant">Amount, description, expiry</div>
              </div>
            </div>
            <button
              className="w-8 h-8 rounded hover:bg-surface-container flex items-center justify-center"
              onClick={closeModal}
            >
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
          </div>

          {/* Body */}
          <div className="p-5 space-y-4 overflow-y-auto max-h-[70vh]">
            {/* Amount */}
            <div>
              <label className="block text-label-sm text-on-surface-variant mb-1">Amount</label>
              <div className="relative flex items-center">
                <span className="absolute left-3 text-on-surface-variant text-body-md">$</span>
                <input
                  className="w-full h-11 pl-7 pr-3 border border-surface-dim rounded text-headline-md font-semibold tabular-nums focus:outline-none focus:border-primary"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ''))}
                  placeholder="0.00"
                  type="text"
                />
              </div>
            </div>

            {/* Description */}
            <div>
              <label className="block text-label-sm text-on-surface-variant mb-1">Description</label>
              <input
                className="w-full h-9 px-2.5 border border-surface-dim rounded text-body-md focus:outline-none focus:border-primary"
                placeholder="What is this payment for?"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            {/* Invoice + Expiry row */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-label-sm text-on-surface-variant mb-1">Link to invoice (optional)</label>
                <select
                  className="w-full h-9 px-2.5 border border-surface-dim rounded text-body-md focus:outline-none focus:border-primary bg-white"
                  value={invoiceId}
                  onChange={(e) => {
                    const id = e.target.value;
                    setInvoiceId(id);
                    const inv = openInvoices.find((o) => o.id === id);
                    if (inv) setAmount(inv.balance.toFixed(2));
                  }}
                >
                  <option value="">No invoice — fixed amount</option>
                  {openInvoices.map((o) => (
                    <option key={o.id} value={o.id}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-label-sm text-on-surface-variant mb-1">Expires</label>
                <div className="flex items-center gap-2">
                  <input
                    className="flex-1 h-9 px-2.5 border border-surface-dim rounded text-body-md focus:outline-none focus:border-primary"
                    placeholder="MM/DD/YYYY"
                    value={expires}
                    disabled={!expiresOn}
                    onChange={(e) => setExpires(e.target.value)}
                  />
                  <label className="flex items-center gap-1.5 text-label-sm">
                    <input type="checkbox" className="row-check" checked={expiresOn} onChange={(e) => setExpiresOn(e.target.checked)} />
                    <span>On</span>
                  </label>
                </div>
              </div>
            </div>

            {/* Share */}
            <div className="border-t border-surface-dim pt-4">
              <div className="text-label-sm text-on-surface-variant uppercase tracking-wider font-bold mb-2">Share</div>
              {createdToken || editing ? (
                <div className="space-y-2">
                  <label className="block text-label-sm text-on-surface-variant">Payment link token</label>
                  <div className="flex items-center gap-1">
                    <input
                      className="flex-1 h-9 px-2.5 border border-surface-dim rounded text-body-sm font-mono bg-surface-container-low"
                      readOnly
                      value={(editing?.provider_url ?? createdToken) || (editing?.code ?? '')}
                    />
                    <button
                      className="h-9 px-3 bg-primary text-white rounded text-label-sm font-semibold hover:bg-primary-container flex items-center gap-1"
                      onClick={() => void copyText(editing?.provider_url ?? createdToken ?? editing?.code ?? '', 'Link copied to clipboard')}
                    >
                      <span className="material-symbols-outlined text-[16px]">content_copy</span>Copy
                    </button>
                  </div>
                  <p className="text-[11px] text-on-surface-variant">
                    No checkout provider is connected — this token identifies the payment request in acct_payment_links. Connect a provider to publish a public checkout URL.
                  </p>
                </div>
              ) : (
                <p className="text-[12px] text-on-surface-variant">
                  Save the link to get its share token. No checkout provider is connected yet.
                </p>
              )}
            </div>

            {/* Active toggle */}
            <div className="flex items-center justify-between p-3 rounded-lg bg-surface-container-low">
              <div>
                <div className="text-body-md font-medium">Link is active</div>
                <div className="text-[11px] text-on-surface-variant">Turn off to pause payments without deleting the link.</div>
              </div>
              <div
                className={`toggle ${activeToggle ? 'on' : 'off'}`}
                onClick={() => setActiveToggle((v) => !v)}
              />
            </div>
          </div>

          {/* Footer */}
          <div className="h-14 border-t border-surface-dim px-4 flex items-center justify-between shrink-0">
            <button
              className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low"
              onClick={closeModal}
            >
              Cancel
            </button>
            <div className="flex items-center gap-2">
              {!editing && (
                <button
                  className="h-8 px-3 bg-white border border-surface-dim text-body-md font-semibold hover:bg-surface-container-low"
                  onClick={() => void saveLink(true)}
                  disabled={saving}
                >
                  {saving ? 'Saving…' : 'Save and new'}
                </button>
              )}
              <button
                className="h-8 px-3 bg-primary text-white text-body-md font-semibold hover:bg-primary-container disabled:opacity-40"
                onClick={() => void saveLink(false)}
                disabled={saving}
              >
                {saving ? 'Saving…' : editing ? 'Save changes' : 'Create link'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
