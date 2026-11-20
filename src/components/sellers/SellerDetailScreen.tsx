'use client';
/**
 * SellerDetailScreen — the seller profile (Contacts → Seller
 * relationships), built to Kim's marketplace_seller_profile template.
 *
 * A seller is a PARTY: this screen is the seller lens on the same
 * party entity the Parties list shows — identity and lifecycle from
 * the canonical `sellers` row, with settlements, violations,
 * appeals, feed posts, onboarding paperwork and 1099-K generations
 * as tabs over their own tables. Every action writes through the
 * sellers API and refreshes in place.
 */
import { useMemo, useState } from 'react';
import { useSellerStore } from '@/lib/sellerStore';
import {
  useSellerDetail,
  decideAppeal,
  resolveViolation,
  recordViolation,
  createPost,
  patchSeller,
  updateSellerProfile,
  decideSellerApplication,
  setSellerOperationsPaused,
  setSellerStatus,
  approveSettlement,
  holdSettlement,
  reverseSettlement,
  sellerDisplayName,
  initials,
  fmtDate,
  fmtMoney,
  type SellerAppeal,
  type SellerViolation,
} from '@/hooks/useSellersApi';
import type { SellerSettlement } from '@/lib/sellerTypes';

interface SellerDetailScreenProps {
  onToast: (m: string) => void;
  onNavigate?: (d: string, s: string) => void;
}

type Tab = 'overview' | 'onboarding' | 'settlements' | 'violations' | 'appeals' | 'feed' | 'documents' | '1099k';

const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'onboarding', label: 'Onboarding' },
  { id: 'settlements', label: 'Settlements' },
  { id: 'violations', label: 'Violations' },
  { id: 'appeals', label: 'Appeals' },
  { id: 'feed', label: 'Feed' },
  { id: 'documents', label: 'Documents' },
  { id: '1099k', label: '1099-K' },
];

function severityPillClass(sev: string): string {
  if (sev === 'high') return 'bad';
  if (sev === 'medium' || sev === 'moderate') return 'warn';
  return 'neutral';
}

function statusPill(status: string | null | undefined): string {
  switch (status) {
    case 'approved': return 'status role customer';
    case 'applied': return 'warn';
    case 'suspended': return 'bad';
    case 'closed': return 'tag';
    default: return 'tag';
  }
}

export default function SellerDetailScreen({ onToast, onNavigate }: SellerDetailScreenProps) {
  const selectedSellerId = useSellerStore(s => s.selectedSellerId);
  const { data: detail, loaded, refresh } = useSellerDetail(selectedSellerId);
  const [tab, setTab] = useState<Tab>('overview');
  const [busy, setBusy] = useState<string | null>(null);

  // Edit drawer
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [editLegal, setEditLegal] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editCommission, setEditCommission] = useState('');

  // Violation form
  const [vioType, setVioType] = useState('policy_violation');
  const [vioSeverity, setVioSeverity] = useState('medium');
  const [vioDesc, setVioDesc] = useState('');

  // Feed composer
  const [postNetwork, setPostNetwork] = useState('instagram');
  const [postTitle, setPostTitle] = useState('');
  const [postNote, setPostNote] = useState('');

  // Settlement row actions
  const [holdReason, setHoldReason] = useState('');
  const [refundId, setRefundId] = useState('');

  const seller = detail?.seller ?? null;
  const profile = detail?.profile ?? null;
  const violations = detail?.violations ?? [];
  const appeals = detail?.appeals ?? [];
  const posts = detail?.posts ?? [];
  const settlements = detail?.settlements ?? [];
  const form1099k = detail?.form1099k ?? [];

  const openViolations = violations.filter(v => v.status === 'open').length;
  const pendingAppeals = appeals.filter(a => a.status === 'pending').length;
  const payoutsDue = useMemo(
    () => settlements.filter(s => s.state === 'pending').reduce((sum, s) => sum + Number(s.net || 0), 0),
    [settlements],
  );
  const lifetimeSales = profile?.recorded_earnings ?? 0;

  if (!selectedSellerId) {
    return (
      <main className="px-6 pb-12 flex flex-col h-full">
        <div className="py-16 text-center">
          <div className="w-14 h-14 mx-auto rounded-full bg-surface-container-low flex items-center justify-center mb-3">
            <span className="material-symbols-outlined text-[28px] text-outline">storefront</span>
          </div>
          <h3 className="text-headline-sm mb-1">Select a seller from the Sellers list</h3>
          <p className="text-body-sm text-on-surface-variant mb-4 max-w-md mx-auto">
            This screen shows the profile, settlements, violations, appeals and feed for one seller.
          </p>
          <button
            className="h-8 px-3 bg-primary text-white rounded text-body-md font-semibold hover:bg-primary-container"
            onClick={() => onNavigate?.('contacts', 'sellers')}
          >
            Go to Sellers
          </button>
        </div>
      </main>
    );
  }

  const name = seller?.display_name || seller?.legal_name || (profile ? sellerDisplayName(profile) : `Seller ${selectedSellerId.slice(0, 8)}`);

  async function run(key: string, fn: () => Promise<{ ok: boolean; error?: string }>, okMsg: string) {
    setBusy(key);
    const res = await fn();
    setBusy(null);
    if (!res.ok) { onToast(`Failed: ${res.error}`); return; }
    onToast(okMsg);
    refresh();
  }

  function openEdit() {
    if (!seller) return;
    setEditName(seller.display_name || '');
    setEditLegal(seller.legal_name || '');
    setEditEmail(seller.email || '');
    setEditCommission(seller.commission_rate != null ? String(Number(seller.commission_rate) * 100) : '');
    setEditOpen(true);
  }

  async function saveEdit() {
    if (!seller) return;
    const pct = editCommission.trim() === '' ? null : Number(editCommission) / 100;
    await run('edit', () => patchSeller(seller.id, {
      display_name: editName || null,
      legal_name: editLegal || seller.legal_name,
      email: editEmail || null,
      commission_rate: pct,
    } as any), 'Seller updated');
    setEditOpen(false);
  }

  async function handleRecordViolation() {
    if (!seller) return;
    await run('violation', () => recordViolation({
      seller_id: seller.id,
      violation_type: vioType,
      severity: vioSeverity,
      description: vioDesc || undefined,
    }), 'Violation recorded');
    setVioDesc('');
  }

  async function handleCreatePost() {
    if (!seller) return;
    await run('post', () => createPost({
      seller_id: seller.id,
      network: postNetwork,
      title: postTitle,
      note: postNote || undefined,
    }), 'Post published to the seller feed');
    setPostTitle('');
    setPostNote('');
  }

  return (
    <main className="px-6 pb-12 flex flex-col h-full overflow-y-auto">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-label-sm text-on-surface-variant mt-4 mb-2">
        <button className="flex items-center gap-1 hover:text-primary" onClick={() => onNavigate?.('contacts', 'sellers')}>
          <span className="material-symbols-outlined text-[16px]">arrow_back</span>Sellers
        </button>
        <span className="text-outline">/</span>
        <span>Contacts / Seller relationships</span>
        <span className="text-outline">/</span>
        <span className="text-on-surface font-semibold">{name}</span>
      </div>

      {!loaded && !detail ? (
        <div className="flex items-center justify-center h-64 text-on-surface-variant/60 text-body-sm">Loading seller…</div>
      ) : !seller && !profile ? (
        <div className="py-16 text-center text-body-sm text-on-surface-variant">
          This seller exists only in enforcement data — no seller record yet.
        </div>
      ) : (
        <>
          {/* Header */}
          <div className="bg-white rounded-xl border border-surface-dim p-5 mb-4">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="flex items-start gap-4">
                <div className="avatar-warm w-16 h-16 rounded-full flex items-center justify-center text-headline-sm font-bold shrink-0">
                  {initials(name)}
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h1 className="text-headline-lg">{name}</h1>
                    {seller && <span className={`pill ${statusPill(seller.status)}`}>{seller.status}</span>}
                    {seller?.operations_paused && <span className="pill bad">operations paused</span>}
                    <span className="pill tag">{seller?.seller_type === 'first_party' ? 'First-party' : 'Business'}</span>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5 text-body-sm text-on-surface-variant">
                    {seller?.legal_name && <span className="flex items-center gap-1"><span className="material-symbols-outlined text-[15px]">badge</span>{seller.legal_name}</span>}
                    {seller?.email && <span className="flex items-center gap-1"><span className="material-symbols-outlined text-[15px]">mail</span>{seller.email}</span>}
                    <span className="flex items-center gap-1"><span className="material-symbols-outlined text-[15px]">percent</span>{seller?.commission_rate != null ? `${(Number(seller.commission_rate) * 100).toFixed(1)}% commission` : 'No commission set'}</span>
                    {seller && <span className="flex items-center gap-1"><span className="material-symbols-outlined text-[15px]">event</span>Seller since {fmtDate(seller.created_at)}</span>}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button className="h-8 px-3 border border-surface-dim rounded text-body-md font-medium hover:bg-surface-container-low flex items-center gap-1" onClick={openEdit}>
                  <span className="material-symbols-outlined text-[16px]">edit</span>Edit seller
                </button>
                {seller?.status === 'applied' && (
                  <button
                    className="h-8 px-3 bg-primary text-white rounded text-body-md font-semibold hover:bg-primary-container disabled:opacity-40"
                    disabled={busy === 'approve'}
                    onClick={() => run('approve', () => decideSellerApplication(seller.id, 'approved'), `${name} approved — seller is live`)}
                  >
                    Approve seller
                  </button>
                )}
              </div>
            </div>

            {/* KPI tiles */}
            <div className="grid grid-cols-3 gap-3 mt-5">
              <div className="bg-surface-container-low rounded-lg p-3">
                <div className="text-[10px] text-on-surface-variant uppercase font-bold">Lifetime sales</div>
                <div className="text-headline-sm tabular-nums">{fmtMoney(lifetimeSales)}</div>
              </div>
              <div className="bg-surface-container-low rounded-lg p-3">
                <div className="text-[10px] text-on-surface-variant uppercase font-bold">Payouts due</div>
                <div className="text-headline-sm tabular-nums">{fmtMoney(payoutsDue)}</div>
              </div>
              <div className="bg-surface-container-low rounded-lg p-3">
                <div className="text-[10px] text-on-surface-variant uppercase font-bold">Open violations</div>
                <div className={`text-headline-sm tabular-nums ${openViolations > 0 ? 'text-error' : ''}`}>{openViolations}</div>
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 border-b border-surface-dim mb-4 overflow-x-auto">
            {TABS.map(t => (
              <button
                key={t.id}
                className={`h-9 px-3 text-body-md whitespace-nowrap border-b-2 -mb-px ${tab === t.id ? 'border-primary text-primary font-semibold' : 'border-transparent text-on-surface-variant hover:text-on-surface'}`}
                onClick={() => setTab(t.id)}
              >
                {t.label}
                {t.id === 'violations' && openViolations > 0 && <span className="ml-1 pill bad" style={{ fontSize: 9, padding: '0 4px' }}>{openViolations}</span>}
                {t.id === 'appeals' && pendingAppeals > 0 && <span className="ml-1 pill warn" style={{ fontSize: 9, padding: '0 4px' }}>{pendingAppeals}</span>}
                {t.id === 'settlements' && settlements.length > 0 && <span className="ml-1 pill tag" style={{ fontSize: 9, padding: '0 4px' }}>{settlements.length}</span>}
              </button>
            ))}
          </div>

          {tab === 'overview' && (
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 items-start">
              <div className="xl:col-span-2 space-y-4">
                <div className="bg-white rounded-xl border border-surface-dim p-4">
                  <h3 className="text-headline-sm mb-3">Stripe Connect</h3>
                  {profile?.stripe_account_id ? (
                    <dl className="space-y-2 text-body-sm">
                      <div className="flex justify-between"><dt className="text-on-surface-variant">Account</dt><dd className="font-mono text-[12px]">{profile.stripe_account_id}</dd></div>
                      <div className="flex justify-between"><dt className="text-on-surface-variant">Settlements via</dt><dd>{settlements[0]?.via || '—'}</dd></div>
                    </dl>
                  ) : (
                    <p className="text-body-sm text-on-surface-variant">No Stripe Connect account on file for this seller. Settlements record their Stripe references when they run.</p>
                  )}
                </div>
                <div className="bg-white rounded-xl border border-surface-dim p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-headline-sm">Commission</h3>
                    <button className="text-body-sm text-primary hover:underline" onClick={openEdit}>Edit</button>
                  </div>
                  <div className="text-headline-sm tabular-nums">{seller?.commission_rate != null ? `${(Number(seller.commission_rate) * 100).toFixed(1)}%` : '—'}</div>
                  <p className="text-body-sm text-on-surface-variant">Applied to all postings</p>
                </div>
                <div className="bg-white rounded-xl border border-surface-dim p-4">
                  <h3 className="text-headline-sm mb-3">Tax</h3>
                  <dl className="space-y-2 text-body-sm">
                    <div className="flex justify-between"><dt className="text-on-surface-variant">Tax ID</dt><dd>{seller?.tax_id_last4 ? `•••• ${seller.tax_id_last4}` : '—'}</dd></div>
                    <div className="flex justify-between"><dt className="text-on-surface-variant">Form on file</dt><dd>{profile?.tax_form_status || '—'}</dd></div>
                    <div className="flex justify-between"><dt className="text-on-surface-variant">1099-K threshold</dt><dd>$20,000 / 200 txn</dd></div>
                  </dl>
                </div>
              </div>
              <div className="space-y-4">
                <div className="bg-white rounded-xl border border-surface-dim p-4">
                  <h3 className="text-headline-sm mb-3">Quick actions</h3>
                  <div className="space-y-2">
                    <button className="w-full h-9 px-3 border border-surface-dim rounded text-body-md font-medium hover:bg-surface-container-low flex items-center gap-2 disabled:opacity-40"
                      disabled={!settlements.some(s => s.state === 'pending') || busy === 'run-settlement'}
                      onClick={() => {
                        const pending = settlements.find(s => s.state === 'pending');
                        if (pending) void run('run-settlement', () => approveSettlement(pending.id), 'Settlement run — marked settled');
                      }}>
                      <span className="material-symbols-outlined text-[17px]">payments</span>Run settlement
                    </button>
                    <button className="w-full h-9 px-3 border border-surface-dim rounded text-body-md font-medium hover:bg-surface-container-low flex items-center gap-2"
                      onClick={() => setTab('violations')}>
                      <span className="material-symbols-outlined text-[17px]">gavel</span>Record violation
                    </button>
                    {seller && (
                      <button className="w-full h-9 px-3 border border-surface-dim rounded text-body-md font-medium hover:bg-surface-container-low flex items-center gap-2 disabled:opacity-40"
                        disabled={busy === 'pause'}
                        onClick={() => run('pause', () => setSellerOperationsPaused(seller.id, !seller.operations_paused), seller.operations_paused ? 'Operations resumed' : 'Operations paused')}>
                        <span className="material-symbols-outlined text-[17px]">{seller.operations_paused ? 'play_arrow' : 'pause'}</span>
                        {seller.operations_paused ? 'Resume operations' : 'Pause operations'}
                      </button>
                    )}
                    {seller && seller.status !== 'suspended' && (
                      <button className="w-full h-9 px-3 border border-surface-dim rounded text-body-md font-medium hover:bg-surface-container-low flex items-center gap-2 disabled:opacity-40"
                        disabled={busy === 'suspend'}
                        onClick={() => run('suspend', () => setSellerStatus(seller.id, 'suspended'), 'Seller suspended')}>
                        <span className="material-symbols-outlined text-[17px]">block</span>Suspend seller
                      </button>
                    )}
                    {seller && seller.status === 'suspended' && (
                      <button className="w-full h-9 px-3 border border-surface-dim rounded text-body-md font-medium hover:bg-surface-container-low flex items-center gap-2 disabled:opacity-40"
                        disabled={busy === 'reinstate'}
                        onClick={() => run('reinstate', () => setSellerStatus(seller.id, 'approved'), 'Seller reinstated')}>
                        <span className="material-symbols-outlined text-[17px]">restart_alt</span>Reinstate seller
                      </button>
                    )}
                  </div>
                </div>
                {seller && seller.status !== 'closed' && (
                  <div className="bg-white rounded-xl border border-error/40 p-4">
                    <h3 className="text-headline-sm mb-2 text-error">Danger zone</h3>
                    <button className="w-full h-9 px-3 border border-error text-error rounded text-body-md font-semibold hover:bg-error/5 flex items-center gap-2 disabled:opacity-40"
                      disabled={busy === 'close'}
                      onClick={() => run('close', () => setSellerStatus(seller.id, 'closed'), 'Seller closed')}>
                      <span className="material-symbols-outlined text-[17px]">cancel</span>Close seller (ban)
                    </button>
                    <p className="text-[11px] text-on-surface-variant mt-2">Closing ends the seller relationship. The party record and its history stay.</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === 'onboarding' && (
            <div className="bg-white rounded-xl border border-surface-dim p-4 max-w-2xl">
              <h3 className="text-headline-sm mb-3">Onboarding</h3>
              <dl className="space-y-2 text-body-sm">
                <div className="flex justify-between"><dt className="text-on-surface-variant">Status</dt><dd>{seller ? <span className={`pill ${statusPill(seller.status)}`}>{seller.status}</span> : '—'}</dd></div>
                <div className="flex justify-between"><dt className="text-on-surface-variant">Applied</dt><dd>{seller ? fmtDate(seller.created_at) : '—'}</dd></div>
                <div className="flex justify-between"><dt className="text-on-surface-variant">Approved</dt><dd>{seller?.approved_at ? fmtDate(seller.approved_at) : '—'}</dd></div>
                <div className="flex justify-between"><dt className="text-on-surface-variant">Tax form</dt><dd>{profile?.tax_form_status || '—'}</dd></div>
                <div className="flex justify-between"><dt className="text-on-surface-variant">Tax form prompted</dt><dd>{profile?.tax_form_prompted_at ? fmtDate(profile.tax_form_prompted_at) : '—'}</dd></div>
                <div className="flex justify-between"><dt className="text-on-surface-variant">Tax form received</dt><dd>{profile?.tax_form_received_at ? fmtDate(profile.tax_form_received_at) : '—'}</dd></div>
              </dl>
              {profile && (
                <div className="flex gap-2 mt-4">
                  <button className="h-8 px-3 border border-surface-dim rounded text-body-md font-medium hover:bg-surface-container-low disabled:opacity-40"
                    disabled={busy === 'prompt'}
                    onClick={() => run('prompt', () => updateSellerProfile(selectedSellerId, { tax_form_prompted_at: new Date().toISOString() }), 'Tax form prompted')}>
                    Prompt tax form
                  </button>
                  <button className="h-8 px-3 border border-surface-dim rounded text-body-md font-medium hover:bg-surface-container-low disabled:opacity-40"
                    disabled={busy === 'received'}
                    onClick={() => run('received', () => updateSellerProfile(selectedSellerId, { tax_form_status: 'received' }), 'Tax form marked received')}>
                    Mark form received
                  </button>
                </div>
              )}
            </div>
          )}

          {tab === 'settlements' && (
            <div className="bg-white rounded-xl border border-surface-dim overflow-hidden">
              {settlements.length === 0 ? (
                <div className="py-10 text-center text-body-sm text-on-surface-variant">No settlements for this seller yet.</div>
              ) : (
                <table className="w-full text-left text-body-sm">
                  <thead className="bg-surface-container-low text-label-sm text-on-surface-variant uppercase tracking-wider">
                    <tr><th className="px-3 py-2">Created</th><th className="px-3 py-2">State</th><th className="px-3 py-2">Gross</th><th className="px-3 py-2">Commission</th><th className="px-3 py-2">Net</th><th className="px-3 py-2">Via</th><th className="px-3 py-2"></th></tr>
                  </thead>
                  <tbody className="divide-y divide-surface-dim">
                    {settlements.map((s: SellerSettlement) => (
                      <tr key={s.id} className="hover:bg-surface-container-low">
                        <td className="px-3 py-2 text-[12px]">{fmtDate(s.createdAt)}</td>
                        <td className="px-3 py-2"><span className={`pill ${s.state === 'settled' ? 'status role customer' : s.state === 'reversed' ? 'bad' : 'warn'}`}>{s.state}</span>{s.pendingReason && <div className="text-[11px] text-on-surface-variant mt-0.5">{s.pendingReason}</div>}</td>
                        <td className="px-3 py-2 tabular-nums">{fmtMoney(s.gross)}</td>
                        <td className="px-3 py-2 tabular-nums">{fmtMoney(s.commission)}</td>
                        <td className="px-3 py-2 tabular-nums font-medium">{fmtMoney(s.net)}</td>
                        <td className="px-3 py-2 text-[12px]">{s.via || '—'}</td>
                        <td className="px-3 py-2">
                          {s.state === 'pending' && (
                            <div className="flex items-center gap-1.5 justify-end flex-wrap">
                              <button className="h-7 px-2 bg-primary text-white rounded text-label-sm font-semibold hover:bg-primary-container disabled:opacity-40" disabled={busy === `settle-${s.id}`}
                                onClick={() => run(`settle-${s.id}`, () => approveSettlement(s.id), 'Settlement approved — marked settled')}>Settle</button>
                              <input className="h-7 w-28 border border-surface-dim rounded px-1.5 text-[11px]" placeholder="Hold reason" value={holdReason} onChange={e => setHoldReason(e.target.value)} />
                              <button className="h-7 px-2 border border-surface-dim rounded text-label-sm font-medium hover:bg-surface-container-low disabled:opacity-40" disabled={busy === `hold-${s.id}`}
                                onClick={() => run(`hold-${s.id}`, () => holdSettlement(s.id, { reason: holdReason || 'On hold' }), 'Settlement held')}>Hold</button>
                            </div>
                          )}
                          {(s.state === 'settled' || s.state === 'partially_reversed') && (
                            <div className="flex items-center gap-1.5 justify-end flex-wrap">
                              <input className="h-7 w-32 border border-surface-dim rounded px-1.5 text-[11px]" placeholder="Stripe refund id" value={refundId} onChange={e => setRefundId(e.target.value)} />
                              <button className="h-7 px-2 border border-error text-error rounded text-label-sm font-semibold hover:bg-error/5 disabled:opacity-40" disabled={!refundId.trim() || busy === `reverse-${s.id}`}
                                onClick={() => run(`reverse-${s.id}`, () => reverseSettlement(s.id, { stripeRefundId: refundId.trim() }), 'Settlement reversed')}>Reverse</button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {tab === 'violations' && (
            <div className="space-y-4 max-w-3xl">
              <div className="bg-white rounded-xl border border-surface-dim p-4">
                <h3 className="text-headline-sm mb-3">Record violation</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="field-label">Type</label>
                    <select className="field-input" value={vioType} onChange={e => setVioType(e.target.value)}>
                      <option value="policy_violation">Policy violation</option>
                      <option value="late_shipment">Late shipment</option>
                      <option value="counterfeit">Counterfeit</option>
                      <option value="ip_infringement">IP infringement</option>
                      <option value="prohibited_item">Prohibited item</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  <div>
                    <label className="field-label">Severity</label>
                    <select className="field-input" value={vioSeverity} onChange={e => setVioSeverity(e.target.value)}>
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                    </select>
                  </div>
                </div>
                <div className="mt-3">
                  <label className="field-label">Description</label>
                  <textarea className="field-input" rows={2} value={vioDesc} onChange={e => setVioDesc(e.target.value)} />
                </div>
                <div className="flex justify-end mt-3">
                  <button className="h-8 px-3 bg-primary text-white rounded text-body-md font-semibold hover:bg-primary-container disabled:opacity-40" disabled={busy === 'violation'} onClick={() => void handleRecordViolation()}>
                    {busy === 'violation' ? 'Recording…' : 'Record violation'}
                  </button>
                </div>
              </div>
              <div className="bg-white rounded-xl border border-surface-dim overflow-hidden">
                {violations.length === 0 ? (
                  <div className="py-8 text-center text-body-sm text-on-surface-variant">No violations recorded.</div>
                ) : (
                  <div className="divide-y divide-surface-dim">
                    {violations.map((v: SellerViolation) => (
                      <div key={v.id} className="px-4 py-3 flex items-start gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium">{v.violation_type.replace(/_/g, ' ')}</span>
                            <span className={`pill ${severityPillClass(v.severity)}`}>{v.severity}</span>
                            <span className={`pill ${v.status === 'open' ? 'warn' : 'tag'}`}>{v.status}</span>
                          </div>
                          {v.description && <div className="text-body-sm mt-0.5">{v.description}</div>}
                          <div className="text-[11px] text-on-surface-variant mt-0.5">{fmtDate(v.created_at)}</div>
                        </div>
                        {v.status === 'open' && (
                          <button className="h-7 px-2.5 border border-surface-dim rounded text-label-sm font-medium hover:bg-surface-container-low shrink-0 disabled:opacity-40" disabled={busy === `resolve-${v.id}`}
                            onClick={() => run(`resolve-${v.id}`, () => resolveViolation(v.id, 'resolved'), 'Violation resolved')}>
                            Resolve
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === 'appeals' && (
            <div className="bg-white rounded-xl border border-surface-dim overflow-hidden max-w-3xl">
              {appeals.length === 0 ? (
                <div className="py-8 text-center text-body-sm text-on-surface-variant">No appeals filed.</div>
              ) : (
                <div className="divide-y divide-surface-dim">
                  {appeals.map((a: SellerAppeal) => (
                    <div key={a.id} className="px-4 py-3 flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`pill ${a.status === 'pending' ? 'warn' : a.status === 'granted' ? 'status role customer' : 'bad'}`}>{a.status}</span>
                          {a.violation_type && <span className="text-[11px] text-on-surface-variant">on {a.violation_type.replace(/_/g, ' ')}</span>}
                        </div>
                        {a.appeal_text && <div className="text-body-sm mt-0.5">&ldquo;{a.appeal_text}&rdquo;</div>}
                        <div className="text-[11px] text-on-surface-variant mt-0.5">filed {fmtDate(a.created_at)}</div>
                      </div>
                      {a.status === 'pending' && (
                        <div className="flex gap-2 shrink-0">
                          <button className="h-7 px-2.5 bg-primary text-white rounded text-label-sm font-semibold hover:bg-primary-container disabled:opacity-40" disabled={busy === `appeal-${a.id}`}
                            onClick={() => run(`appeal-${a.id}`, () => decideAppeal(a.id, 'granted'), 'Appeal granted — linked violation resolved')}>Grant</button>
                          <button className="h-7 px-2.5 border border-error text-error rounded text-label-sm font-semibold hover:bg-error/5 disabled:opacity-40" disabled={busy === `appeal-${a.id}`}
                            onClick={() => run(`appeal-${a.id}`, () => decideAppeal(a.id, 'denied'), 'Appeal denied')}>Deny</button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === 'feed' && (
            <div className="space-y-4 max-w-3xl">
              <div className="bg-white rounded-xl border border-surface-dim p-4">
                <h3 className="text-headline-sm mb-3">New feed post</h3>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="field-label">Network</label>
                    <select className="field-input" value={postNetwork} onChange={e => setPostNetwork(e.target.value)}>
                      <option value="instagram">Instagram</option>
                      <option value="facebook">Facebook</option>
                      <option value="tiktok">TikTok</option>
                      <option value="x">X</option>
                    </select>
                  </div>
                  <div className="col-span-2">
                    <label className="field-label">Title</label>
                    <input className="field-input" value={postTitle} onChange={e => setPostTitle(e.target.value)} />
                  </div>
                </div>
                <div className="mt-3">
                  <label className="field-label">Note</label>
                  <textarea className="field-input" rows={2} value={postNote} onChange={e => setPostNote(e.target.value)} />
                </div>
                <div className="flex justify-end mt-3">
                  <button className="h-8 px-3 bg-primary text-white rounded text-body-md font-semibold hover:bg-primary-container disabled:opacity-40" disabled={!postTitle.trim() || busy === 'post'} onClick={() => void handleCreatePost()}>
                    {busy === 'post' ? 'Posting…' : 'Publish post'}
                  </button>
                </div>
              </div>
              <div className="bg-white rounded-xl border border-surface-dim overflow-hidden">
                {posts.length === 0 ? (
                  <div className="py-8 text-center text-body-sm text-on-surface-variant">No feed posts yet.</div>
                ) : (
                  <div className="divide-y divide-surface-dim">
                    {posts.map(post => {
                      const payload = (post.payload || {}) as { title?: string; note?: string };
                      return (
                        <div key={post.id} className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className="pill info">{post.network}</span>
                            <span className={`pill ${post.status === 'published' ? 'status role customer' : 'tag'}`}>{post.status}</span>
                            <span className="text-[11px] text-on-surface-variant">{fmtDate(post.created_at)}</span>
                          </div>
                          <div className="font-medium mt-1">{payload.title || 'Untitled post'}</div>
                          {payload.note && <div className="text-body-sm text-on-surface-variant">{payload.note}</div>}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === 'documents' && (
            <div className="bg-white rounded-xl border border-surface-dim p-4 max-w-2xl">
              <h3 className="text-headline-sm mb-3">Documents & paperwork</h3>
              <dl className="space-y-2 text-body-sm">
                <div className="flex justify-between"><dt className="text-on-surface-variant">Tax form status</dt><dd>{profile?.tax_form_status || '—'}</dd></div>
                <div className="flex justify-between"><dt className="text-on-surface-variant">Tax form ticket</dt><dd>{profile?.tax_form_ticket_ref || '—'}</dd></div>
                <div className="flex justify-between"><dt className="text-on-surface-variant">Completion ticket</dt><dd>{profile?.completion_ticket_ref || '—'}</dd></div>
                <div className="flex justify-between"><dt className="text-on-surface-variant">Case</dt><dd>{profile?.case_id || '—'}</dd></div>
              </dl>
              {!profile && <p className="text-body-sm text-on-surface-variant mt-3">No onboarding paperwork file exists for this seller yet — it opens with the first paperwork action.</p>}
            </div>
          )}

          {tab === '1099k' && (
            <div className="bg-white rounded-xl border border-surface-dim overflow-hidden max-w-3xl">
              {form1099k.length === 0 ? (
                <div className="py-8 px-4 text-center text-body-sm text-on-surface-variant">
                  No 1099-K generations yet. A generation is produced when the seller crosses the $20,000 / 200-transaction threshold for a tax year.
                </div>
              ) : (
                <table className="w-full text-left text-body-sm">
                  <thead className="bg-surface-container-low text-label-sm text-on-surface-variant uppercase tracking-wider">
                    <tr><th className="px-3 py-2">Tax year</th><th className="px-3 py-2">Gross</th><th className="px-3 py-2">Transactions</th><th className="px-3 py-2">Basis</th><th className="px-3 py-2">Filing status</th></tr>
                  </thead>
                  <tbody className="divide-y divide-surface-dim">
                    {form1099k.map(f => (
                      <tr key={f.id}>
                        <td className="px-3 py-2">{f.tax_year}</td>
                        <td className="px-3 py-2 tabular-nums">{fmtMoney(f.gross_amount)}</td>
                        <td className="px-3 py-2 tabular-nums">{f.transaction_count}</td>
                        <td className="px-3 py-2">{f.basis || '—'}</td>
                        <td className="px-3 py-2">{f.filing_status || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </>
      )}

      {/* Edit drawer */}
      {editOpen && (
        <>
          <div className="drawer-scrim open" onClick={() => setEditOpen(false)} />
          <div className="drawer open" style={{ width: 440 }}>
            <div className="flex items-center justify-between px-6 h-14 border-b border-surface-dim shrink-0">
              <h3 className="text-[16px] font-semibold">Edit seller</h3>
              <button className="w-8 h-8 rounded hover:bg-surface-container flex items-center justify-center" onClick={() => setEditOpen(false)}>
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              <div><label className="field-label">Display name</label><input className="field-input" value={editName} onChange={e => setEditName(e.target.value)} /></div>
              <div><label className="field-label">Legal name</label><input className="field-input" value={editLegal} onChange={e => setEditLegal(e.target.value)} /></div>
              <div><label className="field-label">Email</label><input className="field-input" type="email" value={editEmail} onChange={e => setEditEmail(e.target.value)} /></div>
              <div><label className="field-label">Commission %</label><input className="field-input" type="number" min="0" max="100" step="0.5" value={editCommission} onChange={e => setEditCommission(e.target.value)} /></div>
            </div>
            <div className="px-6 py-4 border-t border-surface-dim flex justify-end gap-2 shrink-0">
              <button className="h-9 px-4 border border-surface-dim rounded text-[13px] font-medium hover:bg-surface-container-low" onClick={() => setEditOpen(false)}>Cancel</button>
              <button className="h-9 px-4 bg-primary text-white rounded text-[13px] font-semibold hover:bg-primary-container disabled:opacity-40" disabled={busy === 'edit'} onClick={() => void saveEdit()}>
                {busy === 'edit' ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </>
      )}
    </main>
  );
}
