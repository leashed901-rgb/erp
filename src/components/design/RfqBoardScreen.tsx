/* eslint-disable react-hooks/rules-of-hooks, react-hooks/refs, react-hooks/immutability */
import { useEffect, useMemo, useState } from 'react';
import type { DomainKey } from '@/data/shellData';
import { useDesignCanvas } from '@/lib/designCanvasStore';
import { supabaseBrowser } from '@/lib/supabaseBrowser';

type Board = {
  rfq: {
    id: string;
    rfq_number: string;
    title: string;
    status: string;
    sealed: boolean;
    currency: string | null;
    bid_deadline: string | null;
    published_at: string | null;
    closed_at: string | null;
    awarded_at: string | null;
    created_at: string;
  };
  nda_required: boolean;
  lines: Array<{
    id: string;
    line_no: number;
    tech_pack_id: string | null;
    quantity: number;
    tech_pack: { style_number: string | null; base_size: string | null; bom_cost: number; artwork_count: number; title: string | null } | null;
  }>;
  invitations: Array<{
    id: string;
    vendor_id: string;
    vendor_name: string | null;
    status: string;
    nda_signed: boolean | null;
    invited_at: string | null;
    first_viewed_at: string | null;
  }>;
  bids: Array<{
    id: string;
    vendor_id: string;
    vendor_name: string | null;
    revision: number;
    status: string;
    currency: string | null;
    valid_until: string | null;
    lead_time_days: number | null;
    payment_terms: string | null;
    incoterm: string | null;
    notes: string | null;
    total_amount: number | null;
    submitted_at: string | null;
    sealed?: boolean;
    lines?: Array<{ id: string; rfq_line_id: string; unit_price: number | null; moq: number | null; lead_time_days: number | null; sample_cost: number | null; tooling_cost: number | null; notes: string | null }>;
  }>;
  sealed_hidden: boolean;
  questions: Array<{
    id: string;
    vendor_id: string | null;
    vendor_name: string | null;
    question: string;
    answer: string | null;
    answered_by: string | null;
    answered_at: string | null;
    broadcast: boolean;
    created_at: string;
  }>;
  access_log: Array<{
    id: string;
    occurred_at: string;
    actor_user_id: string | null;
    actor_vendor_id: string | null;
    actor_name: string | null;
    event: string;
    subject_type: string | null;
    subject_id: string | null;
  }>;
  awards: Array<{ id: string; rfq_line_id: string; bid_id: string; vendor_id: string; quantity: number; unit_price: number | null; purchase_order_id: string | null; po_number: string | null; awarded_at: string | null }>;
};

const TABS = ['Bids', 'Invitations', 'Questions', 'Access log'] as const;
type Tab = (typeof TABS)[number];

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
const fmtDateTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—';
const money = (n: number | null, currency = 'USD') =>
  n == null ? '—' : n.toLocaleString('en-US', { style: 'currency', currency });

const statusChip = (status: string) => {
  switch (status) {
    case 'published':
      return 'bg-[#e8f0fb] text-[#0055a5]';
    case 'awarded':
      return 'bg-[#8af5be] text-[#00714b]';
    case 'closed':
      return 'bg-surface-container text-on-surface-variant';
    case 'cancelled':
      return 'bg-[#ffdad6] text-[#93000a]';
    default:
      return 'bg-[#fff4dc] text-[#8a5a00]';
  }
};

export default function RfqBoardScreen({
  onNavigate,
  onToast,
}: {
  onNavigate: (domain: DomainKey, screenId: string) => void;
  onToast: (message: string) => void;
}) {
  const { rfqId, openTechPack, closeRfq } = useDesignCanvas();
  const [board, setBoard] = useState<Board | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [tab, setTab] = useState<Tab>('Bids');
  const [busy, setBusy] = useState<string | null>(null);
  const [compare, setCompare] = useState<Board['bids'] | null>(null);
  const [compareError, setCompareError] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [vendors, setVendors] = useState<Array<{ id: string; name: string; email: string | null }>>([]);
  const [inviteVendorId, setInviteVendorId] = useState('');
  const [detailBidId, setDetailBidId] = useState<string | null>(null);
  const [menuBidId, setMenuBidId] = useState<string | null>(null);
  const [answerFor, setAnswerFor] = useState<string | null>(null);
  const [answerText, setAnswerText] = useState('');
  const [answerBroadcast, setAnswerBroadcast] = useState(false);

  const load = async () => {
    if (!rfqId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/rfqs/${rfqId}`);
      if (!res.ok) throw new Error(`RFQ load failed (${res.status}).`);
      setBoard((await res.json()) as Board);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load the RFQ.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rfqId]);

  const rfq = board?.rfq ?? null;
  const fullBids = useMemo(() => (board?.bids ?? []).filter((b) => !b.sealed), [board]);
  const cheapestId = useMemo(() => {
    let min: number | null = null;
    let id: string | null = null;
    for (const b of fullBids) {
      if (b.total_amount != null && (min === null || b.total_amount < min)) {
        min = b.total_amount;
        id = b.id;
      }
    }
    return id;
  }, [fullBids]);
  const detailBid = fullBids.find((b) => b.id === detailBidId) ?? null;
  const canAward = rfq?.status === 'closed';
  const openQuestions = (board?.questions ?? []).filter((q) => !q.answer).length;

  const reloadWith = async (fn: () => Promise<void>, label: string) => {
    setBusy(label);
    setNotice(null);
    try {
      await fn();
      await load();
    } catch (e) {
      setNotice({ kind: 'err', text: e instanceof Error ? e.message : `${label} failed.` });
    } finally {
      setBusy(null);
    }
  };

  const doPublish = () =>
    reloadWith(async () => {
      const { error: rpcError } = await supabaseBrowser.rpc('ds_publish_rfq', { p_rfq: rfq!.id });
      if (rpcError) throw new Error(rpcError.message);
      setNotice({ kind: 'ok', text: 'RFQ published — invitations are live.' });
    }, 'Publishing…');

  const doClose = () =>
    reloadWith(async () => {
      const res = await fetch(`/api/v1/rfqs/${rfq!.id}/close`, { method: 'POST' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error?.message ?? `Close failed (${res.status}).`);
      }
      setCompare(null);
      setNotice({ kind: 'ok', text: 'RFQ closed — bids are revealed.' });
    }, 'Closing…');

  const doAward = (bidId: string) =>
    reloadWith(async () => {
      const bid = fullBids.find((b) => b.id === bidId);
      if (!bid) throw new Error('Select a bid first.');
      const lines = bid.lines ?? [];
      if (lines.length === 0) throw new Error('This bid has no priced lines — it cannot be awarded.');
      const { error: rpcError } = await supabaseBrowser.rpc('ds_award_rfq', {
        p_rfq: rfq!.id,
        p_awards: lines.map((l) => ({ bid_id: bid.id, rfq_line_id: l.rfq_line_id })),
      });
      if (rpcError) throw new Error(rpcError.message);
      setDetailBidId(null);
      setNotice({ kind: 'ok', text: `RFQ awarded to ${bid.vendor_name ?? 'the vendor'} — purchase order created.` });
    }, 'Awarding…');

  const doCompare = async () => {
    setBusy('Comparing…');
    setCompareError(null);
    try {
      const res = await fetch(`/api/v1/rfqs/${rfq!.id}/compare`, { method: 'POST' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error?.message ?? `Compare failed (${res.status}).`);
      }
      const data = await res.json();
      setCompare(data.bids ?? []);
    } catch (e) {
      setCompareError(e instanceof Error ? e.message : 'Compare failed.');
    } finally {
      setBusy(null);
    }
  };

  const doInvite = async () => {
    if (!inviteVendorId) return;
    await reloadWith(async () => {
      const res = await fetch(`/api/v1/rfqs/${rfq!.id}/invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vendorId: inviteVendorId }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error?.message ?? `Invite failed (${res.status}).`);
      }
      setInviteOpen(false);
      setInviteVendorId('');
      setNotice({ kind: 'ok', text: 'Vendor invited.' });
    }, 'Inviting…');
  };

  const doAnswer = async (questionId: string) => {
    if (!answerText.trim()) return;
    await reloadWith(async () => {
      const { error: rpcError } = await supabaseBrowser.rpc('ds_answer_question', {
        p_question: questionId,
        p_answer: answerText.trim(),
        p_broadcast: answerBroadcast,
      });
      if (rpcError) throw new Error(rpcError.message);
      setAnswerFor(null);
      setAnswerText('');
      setAnswerBroadcast(false);
      setNotice({ kind: 'ok', text: 'Answer posted.' });
    }, 'Answering…');
  };

  const openInvite = async () => {
    setInviteOpen(true);
    try {
      const res = await fetch('/api/v1/vendors?limit=100');
      if (res.ok) setVendors(((await res.json()).items ?? []) as Array<{ id: string; name: string; email: string | null }>);
    } catch {
      setVendors([]);
    }
  };

  if (!rfqId) {
    return (
      <div className="p-8 max-w-2xl">
        <h1 className="text-headline-md font-semibold">No RFQ open</h1>
        <p className="text-body-md text-on-surface-variant mt-2">Open an RFQ from the RFQs list to see its board.</p>
        <button className="mt-4 px-4 py-2 rounded bg-primary text-white text-[13px] font-medium" onClick={() => onNavigate('design', 'rfqs')}>
          Go to RFQs
        </button>
      </div>
    );
  }
  if (loading) return <div className="p-8 text-body-md text-on-surface-variant">Loading the RFQ board…</div>;
  if (error || !board || !rfq) {
    return (
      <div className="p-8 max-w-2xl">
        <h1 className="text-headline-md font-semibold">Couldn&apos;t load the RFQ</h1>
        <p className="text-body-md text-on-surface-variant mt-2">{error ?? 'RFQ not found.'}</p>
        <button className="mt-4 px-4 py-2 rounded bg-primary text-white text-[13px] font-medium" onClick={() => onNavigate('design', 'rfqs')}>
          Back to RFQs
        </button>
      </div>
    );
  }

  const firstLine = board.lines[0];
  const firstTp = firstLine?.tech_pack ?? null;
  const timeline = [
    { label: 'RFQ created', date: rfq.created_at, done: true },
    { label: 'RFQ published', date: rfq.published_at, done: Boolean(rfq.published_at) },
    { label: 'Bid deadline', date: rfq.bid_deadline, done: Boolean(rfq.closed_at) },
    { label: 'RFQ closed', date: rfq.closed_at, done: Boolean(rfq.closed_at) },
    { label: 'RFQ awarded', date: rfq.awarded_at, done: Boolean(rfq.awarded_at) },
  ];

  return (
    <div className="min-h-full">
      <div className="h-[52px] px-6 flex items-center justify-between bg-white border-b border-surface-dim sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <button className="w-8 h-8 rounded hover:bg-surface-container-low flex items-center justify-center" onClick={() => { closeRfq(); onNavigate('design', 'rfqs'); }}>
            <span className="material-symbols-outlined text-[18px] text-on-surface-variant">arrow_back</span>
          </button>
          <span className="material-symbols-outlined text-[20px] text-on-surface-variant">request_quote</span>
          <span className="text-label-md font-semibold">Design Studio</span>
          <span className="text-outline">/</span>
          <span className="text-label-md text-primary font-semibold">RFQ Board</span>
        </div>
        <div className="flex items-center gap-2">
          {rfq.status === 'draft' && (
            <button className="h-8 px-3 bg-primary text-white text-body-md font-semibold hover:bg-primary-container flex items-center gap-1 disabled:opacity-50" disabled={busy !== null} onClick={doPublish}>
              <span className="material-symbols-outlined text-[16px]">send</span>{busy === 'Publishing…' ? 'Publishing…' : 'Publish RFQ'}
            </button>
          )}
          <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low flex items-center gap-1 disabled:opacity-50" disabled={busy !== null} onClick={doCompare}>
            <span className="material-symbols-outlined text-[16px]">balance</span>{busy === 'Comparing…' ? 'Comparing…' : 'Compare bids'}
          </button>
          {rfq.status === 'published' && (
            <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low flex items-center gap-1 disabled:opacity-50" disabled={busy !== null} onClick={doClose}>
              <span className="material-symbols-outlined text-[16px]">lock</span>{busy === 'Closing…' ? 'Closing…' : 'Close RFQ'}
            </button>
          )}
          <button
            className="h-8 px-3 bg-primary text-white text-body-md font-semibold hover:bg-primary-container flex items-center gap-1 disabled:opacity-50"
            disabled={!canAward || busy !== null}
            title={canAward ? undefined : 'Close the RFQ first to reveal bids, then award.'}
            onClick={() => cheapestId && doAward(cheapestId)}
          >
            <span className="material-symbols-outlined text-[16px]">workspace_premium</span>{busy === 'Awarding…' ? 'Awarding…' : 'Award bid'}
          </button>
        </div>
      </div>

      <main className="px-6 pb-12">
        <div className="py-4 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-headline-lg">{rfq.title}</h1>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${statusChip(rfq.status)}`}>{rfq.status}</span>
              {rfq.sealed && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#fff4dc] text-[#8a5a00]">Sealed bid</span>}
            </div>
            <div className="text-body-sm text-on-surface-variant flex items-center gap-4 flex-wrap mt-1">
              <span className="flex items-center gap-1"><span className="material-symbols-outlined text-[14px]">tag</span>{rfq.rfq_number}</span>
              <span className="flex items-center gap-1"><span className="material-symbols-outlined text-[14px]">description</span>{firstTp?.title ?? firstLine?.tech_pack_id ?? '—'}</span>
              <span className="flex items-center gap-1"><span className="material-symbols-outlined text-[14px]">event</span>Bid deadline: {fmtDateTime(rfq.bid_deadline)}</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-center"><div className="text-[10px] uppercase font-bold text-on-surface-variant">Invited</div><div className="text-headline-sm tabular-nums">{board.invitations.length}</div></div>
            <div className="w-px h-10 bg-surface-dim" />
            <div className="text-center"><div className="text-[10px] uppercase font-bold text-on-surface-variant">Bids received</div><div className="text-headline-sm tabular-nums text-secondary">{board.bids.length}</div></div>
            <div className="w-px h-10 bg-surface-dim" />
            <div className="text-center"><div className="text-[10px] uppercase font-bold text-on-surface-variant">Questions</div><div className="text-headline-sm tabular-nums">{openQuestions}</div></div>
          </div>
        </div>

        {notice && (
          <div className={`mb-4 px-4 py-3 rounded-lg text-[13px] border ${notice.kind === 'ok' ? 'bg-[#f0fdf4] border-[#0a6400] text-[#00714b]' : 'bg-[#ffdad6] border-[#ba1a1a] text-[#93000a]'}`} role="status">
            {notice.text}
            <button className="float-right font-semibold" onClick={() => setNotice(null)} aria-label="Dismiss">×</button>
          </div>
        )}
        {board.awards.length > 0 && (
          <div className="mb-4 px-4 py-3 rounded-lg text-[13px] border bg-[#f0fdf4] border-[#0a6400] text-[#00714b]">
            Awarded — {board.awards.length} line{board.awards.length === 1 ? '' : 's'} awarded.
            {board.awards.map((a) => a.po_number).filter(Boolean).length > 0 && (
              <> Purchase order{board.awards.length === 1 ? '' : 's'}: {board.awards.map((a) => a.po_number).filter(Boolean).join(', ')}.</>
            )}
          </div>
        )}
        {rfq.status === 'published' && board.sealed_hidden && (
          <div className="mb-4 px-4 py-3 rounded-lg text-[13px] border bg-[#fff4dc] border-[#8a5a00] text-[#8a5a00]">
            Bids are sealed until the RFQ closes. Close the RFQ to reveal them, then award.
          </div>
        )}

        <div className="flex items-center gap-1 border-b border-surface-dim overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2.5 text-label-md border-b-2 ${tab === t ? 'border-qb-blue text-qb-blue font-semibold' : 'border-transparent text-on-surface-variant'}`}
            >
              {t}
              {t === 'Questions' && openQuestions > 0 && <span className="ml-1 text-[10px] font-bold bg-[#ba1a1a] text-white rounded-full px-1.5 py-0.5">{openQuestions}</span>}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 pt-4">
          <div className="lg:col-span-2">
            {board.nda_required && (
              <div className="bg-[#fff4dc] border-l-[3px] border-[#8a5a00] px-4 py-3 rounded-md text-[12px] text-[#8a5a00] mb-4">
                <strong>NDA required.</strong> Suppliers cannot view this RFQ until they accept the NDA. All access attempts are logged (see Access log tab).
              </div>
            )}

            {compare && (
              <div className="bg-white rounded-xl shadow-sm border border-surface-dim overflow-hidden mb-4">
                <div className="flex items-center justify-between px-5 py-3 border-b border-surface-dim">
                  <h2 className="text-headline-sm font-semibold">Bid comparison — cheapest first</h2>
                  <button className="text-[12px] font-semibold text-on-surface-variant" onClick={() => setCompare(null)}>Close</button>
                </div>
                <table className="w-full text-left text-body-sm">
                  <thead className="bg-surface-container-low text-label-sm text-on-surface-variant uppercase tracking-wider">
                    <tr><th className="px-4 py-2">#</th><th className="px-4 py-2">Vendor</th><th className="px-4 py-2">Total</th><th className="px-4 py-2">Lead time</th><th className="px-4 py-2">Lines</th><th className="px-4 py-2">Submitted</th></tr>
                  </thead>
                  <tbody className="divide-y divide-surface-dim">
                    {compare.map((b, i) => (
                      <tr key={b.id} className={i === 0 ? 'bg-[#f0fdf4]' : ''}>
                        <td className="px-4 py-2 font-bold">{i + 1}</td>
                        <td className="px-4 py-2 font-medium">{b.vendor_name ?? '—'}</td>
                        <td className="px-4 py-2 font-semibold">{money(b.total_amount, b.currency ?? rfq.currency ?? 'USD')}</td>
                        <td className="px-4 py-2">{b.lead_time_days != null ? `${b.lead_time_days}d` : '—'}</td>
                        <td className="px-4 py-2">{(b as unknown as { line_count?: number }).line_count ?? b.lines?.length ?? '—'}</td>
                        <td className="px-4 py-2 text-on-surface-variant">{fmtDate(b.submitted_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {compareError && (
              <div className="mb-4 px-4 py-3 rounded-lg text-[13px] border bg-[#ffdad6] border-[#ba1a1a] text-[#93000a]">{compareError}</div>
            )}

            <div className="bg-white rounded-xl shadow-sm border border-surface-dim overflow-hidden">
              {tab === 'Bids' && (
                <div className="p-5">
                  {board.sealed_hidden && (
                    <div className="text-[12px] text-on-surface-variant bg-surface-container-low p-3 rounded-lg mb-3 flex items-start gap-2">
                      <span className="material-symbols-outlined text-[16px] text-qb-maroon">lock</span>
                      <span><strong>Sealed bid.</strong> Bids will be revealed when the RFQ closes at {fmtDateTime(rfq.bid_deadline)}. {board.bids.length} bid{board.bids.length === 1 ? '' : 's'} received so far.</span>
                    </div>
                  )}
                  {board.bids.length === 0 && (
                    <div className="py-8 text-center text-on-surface-variant">
                      <div className="font-medium mb-1">No bids yet</div>
                      <div className="text-[12px]">Invited suppliers have not submitted bids.</div>
                    </div>
                  )}
                  {board.bids.map((b) => {
                    if (b.sealed) {
                      return (
                        <div key={b.id} className="border border-surface-dim rounded-[10px] p-4 bg-white mb-3 opacity-60">
                          <div className="flex items-center justify-between mb-2">
                            <div className="font-semibold text-body-sm">{b.vendor_name ?? '—'}</div>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-surface-container text-on-surface-variant">Sealed</span>
                          </div>
                          <div className="text-[12px] text-on-surface-variant">Bid submitted — details hidden until the RFQ closes</div>
                        </div>
                      );
                    }
                    const awarded = board.awards.some((a) => a.bid_id === b.id);
                    return (
                      <div key={b.id} className={`border rounded-[10px] p-4 mb-3 ${awarded ? 'border-[#0a6400] bg-[#dcfce7]' : b.id === cheapestId ? 'border-[#0a6400] bg-[#f0fdf4] shadow-[0_0_0_1px_#0a6400]' : 'border-surface-dim bg-white'}`}>
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <div className="font-semibold text-body-md">{b.vendor_name ?? '—'}</div>
                            {awarded && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#8af5be] text-[#00714b]">Awarded</span>}
                            {!awarded && b.id === cheapestId && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#8af5be] text-[#00714b]">Cheapest</span>}
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${b.status === 'awarded' ? 'bg-[#8af5be] text-[#00714b]' : b.status === 'rejected' ? 'bg-[#ffdad6] text-[#93000a]' : 'bg-surface-container text-on-surface-variant'}`}>{b.status}</span>
                          </div>
                          <div className="relative">
                            <button className="w-6 h-6 rounded hover:bg-surface-container flex items-center justify-center" onClick={() => setMenuBidId(menuBidId === b.id ? null : b.id)} aria-label="Bid actions">
                              <span className="material-symbols-outlined text-[16px] text-on-surface-variant">more_horiz</span>
                            </button>
                            {menuBidId === b.id && (
                              <div className="absolute right-0 mt-1 w-56 bg-white border border-surface-dim rounded-lg shadow-lg z-50 py-1 text-[13px]">
                                <button className="block w-full text-left px-3 py-2 hover:bg-surface-container-low" onClick={() => { setDetailBidId(b.id); setMenuBidId(null); }}>View bid details</button>
                                <button className="block w-full text-left px-3 py-2 hover:bg-surface-container-low" onClick={() => { setDetailBidId(b.id); setMenuBidId(null); }}>Evaluate</button>
                                <div className="h-px bg-surface-container my-1" />
                                <button className="block w-full text-left px-3 py-2 hover:bg-surface-container-low disabled:opacity-40" disabled={!canAward} onClick={() => { setMenuBidId(null); doAward(b.id); }}>
                                  Award this bid{!canAward ? ' — close the RFQ first' : ''}
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="grid grid-cols-4 gap-3 text-[12px]">
                          <div><div className="text-on-surface-variant text-[10px] uppercase font-bold">Total</div><div className="text-headline-sm tabular-nums mt-1">{money(b.total_amount, b.currency ?? rfq.currency ?? 'USD')}</div></div>
                          <div><div className="text-on-surface-variant text-[10px] uppercase font-bold">MOQ</div><div className="font-semibold mt-1">{b.lines?.[0]?.moq != null ? `${b.lines[0].moq} pcs` : '—'}</div></div>
                          <div><div className="text-on-surface-variant text-[10px] uppercase font-bold">Lead time</div><div className="font-semibold mt-1">{b.lead_time_days != null ? `${b.lead_time_days}d` : '—'}</div></div>
                          <div><div className="text-on-surface-variant text-[10px] uppercase font-bold">Valid until</div><div className="font-semibold mt-1">{fmtDate(b.valid_until)}</div></div>
                        </div>
                        <div className="mt-3 pt-3 border-t border-surface-dim flex items-center justify-between">
                          <div className="text-[11px] text-on-surface-variant">Rev {b.revision} · submitted {fmtDate(b.submitted_at)}{b.payment_terms ? ` · ${b.payment_terms}` : ''}{b.incoterm ? ` · ${b.incoterm}` : ''}</div>
                          <div className="flex gap-2">
                            <button className="h-7 px-2 border border-surface-dim rounded text-label-sm font-semibold hover:bg-surface-container" onClick={() => setDetailBidId(b.id)}>Evaluate</button>
                            <button className="h-7 px-2 bg-primary text-white rounded text-label-sm font-semibold hover:bg-primary-container disabled:opacity-40" disabled={!canAward || busy !== null} title={canAward ? undefined : 'Close the RFQ first to reveal bids, then award.'} onClick={() => doAward(b.id)}>Award</button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {tab === 'Invitations' && (
                <div>
                  <div className="flex items-center justify-between px-4 py-3 border-b border-surface-dim">
                    <span className="text-[13px] font-semibold">{board.invitations.length} invitation{board.invitations.length === 1 ? '' : 's'}</span>
                    <button className="h-8 px-3 border border-surface-dim rounded text-[13px] font-medium hover:bg-surface-container-low disabled:opacity-50" disabled={rfq.status === 'closed' || rfq.status === 'awarded' || busy !== null} onClick={openInvite}>
                      Invite vendor
                    </button>
                  </div>
                  {board.invitations.length === 0 ? (
                    <div className="p-8 text-center text-on-surface-variant">
                      <div className="font-medium mb-1">No invitations yet</div>
                      <div className="text-[12px]">Invite a vendor to start receiving bids.</div>
                    </div>
                  ) : (
                    <table className="w-full text-left text-body-sm">
                      <thead className="bg-surface-container-low text-label-sm text-on-surface-variant uppercase tracking-wider">
                        <tr><th className="px-4 py-2">Vendor</th><th className="px-4 py-2">Status</th><th className="px-4 py-2">NDA</th><th className="px-4 py-2">Invited</th><th className="px-4 py-2">First viewed</th></tr>
                      </thead>
                      <tbody className="divide-y divide-surface-dim">
                        {board.invitations.map((i) => (
                          <tr key={i.id}>
                            <td className="px-4 py-2 font-medium">{i.vendor_name ?? '—'}</td>
                            <td className="px-4 py-2"><span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${i.status === 'bid_submitted' || i.status === 'awarded' ? 'bg-[#8af5be] text-[#00714b]' : i.status === 'revoked' || i.status === 'not_awarded' ? 'bg-[#ffdad6] text-[#93000a]' : 'bg-[#fff4dc] text-[#8a5a00]'}`}>{i.status}</span></td>
                            <td className="px-4 py-2">
                              {i.nda_signed === null ? <span className="text-on-surface-variant">—</span> : (
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${i.nda_signed ? 'bg-[#8af5be] text-[#00714b]' : 'bg-[#ffdad6] text-[#93000a]'}`}>{i.nda_signed ? 'Signed' : 'Not signed'}</span>
                              )}
                            </td>
                            <td className="px-4 py-2 text-on-surface-variant">{fmtDate(i.invited_at)}</td>
                            <td className="px-4 py-2 text-on-surface-variant">{fmtDate(i.first_viewed_at)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              {tab === 'Questions' && (
                <div className="p-5 space-y-3">
                  {board.questions.length === 0 && (
                    <div className="py-8 text-center text-on-surface-variant">
                      <span className="material-symbols-outlined text-[40px] mb-2 block">help</span>
                      <div className="font-medium mb-1">No questions</div>
                    </div>
                  )}
                  {board.questions.map((q) => (
                    <div key={q.id} className="border border-surface-dim rounded-lg p-3">
                      <div className="flex items-center justify-between mb-2">
                        <div className="font-semibold text-body-sm">{q.vendor_name ?? '—'}</div>
                        {q.broadcast && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#e8f0fb] text-[#0055a5]">Broadcast</span>}
                      </div>
                      <div className="text-[12px] mb-2">{q.question}</div>
                      {q.answer ? (
                        <div className="bg-surface-container-low rounded p-2 text-[12px]"><strong>Answer ({fmtDate(q.answered_at)}):</strong> {q.answer}</div>
                      ) : answerFor === q.id ? (
                        <div className="space-y-2">
                          <textarea
                            className="w-full border border-surface-dim rounded p-2 text-[13px] min-h-[72px]"
                            value={answerText}
                            onChange={(e) => setAnswerText(e.target.value)}
                            placeholder="Write the answer…"
                          />
                          <label className="flex items-center gap-2 text-[12px]">
                            <input type="checkbox" checked={answerBroadcast} onChange={(e) => setAnswerBroadcast(e.target.checked)} />
                            Broadcast to all invited vendors
                          </label>
                          <div className="flex gap-2">
                            <button className="h-8 px-3 bg-primary text-white rounded text-[13px] font-semibold disabled:opacity-50" disabled={busy !== null || !answerText.trim()} onClick={() => doAnswer(q.id)}>
                              {busy === 'Answering…' ? 'Posting…' : 'Post answer'}
                            </button>
                            <button className="h-8 px-3 border border-surface-dim rounded text-[13px]" onClick={() => { setAnswerFor(null); setAnswerText(''); }}>Cancel</button>
                          </div>
                        </div>
                      ) : (
                        <button className="text-[12px] text-primary font-semibold" onClick={() => { setAnswerFor(q.id); setAnswerText(''); setAnswerBroadcast(false); }}>Answer</button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {tab === 'Access log' && (
                <div className="p-4">
                  {board.access_log.length === 0 ? (
                    <div className="py-8 text-center text-on-surface-variant">
                      <div className="font-medium mb-1">No access events yet</div>
                      <div className="text-[12px]">Every access attempt is logged to ds_access_events.</div>
                    </div>
                  ) : (
                    <div className="bg-surface-container-low rounded-md px-3 py-2 font-mono text-[11px] text-on-surface-variant">
                      {board.access_log.map((e) => {
                        const denied = /denied|unauthorized|rejected/i.test(e.event);
                        return (
                          <div key={e.id} className={`py-0.5 border-b border-surface-container last:border-0 ${denied ? 'text-[#ba1a1a]' : 'text-[#006c47]'}`}>
                            <span className="font-bold">{e.event}</span>
                            <span className="ml-2">{e.actor_name ?? e.actor_vendor_id ?? e.actor_user_id ?? '—'}</span>
                            <span className="ml-2 text-outline">{fmtDateTime(e.occurred_at)}</span>
                            {denied && <span className="ml-2 font-bold">DENIED</span>}
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <div className="text-[11px] text-on-surface-variant mt-3">
                    Every access attempt is logged to <code>ds_access_events</code>. NDA-gated RFQs require <code>ds_nda_acceptances</code> before any asset view.
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-surface-dim p-4">
              <div className="text-[11px] font-bold tracking-wider uppercase pb-2 border-b border-surface-dim mb-3">Tech pack</div>
              {board.lines.length === 0 ? (
                <p className="text-body-sm text-on-surface-variant">This RFQ has no lines.</p>
              ) : (
                <div className="space-y-2 text-body-sm">
                  <div className="flex justify-between"><span className="text-on-surface-variant">Style</span><span>{firstTp?.style_number ?? '—'}</span></div>
                  <div className="flex justify-between"><span className="text-on-surface-variant">Base size</span><span>{firstTp?.base_size ?? '—'}</span></div>
                  <div className="flex justify-between"><span className="text-on-surface-variant">BOM cost</span><span className="font-semibold">{firstTp ? money(firstTp.bom_cost, rfq.currency ?? 'USD') : '—'}</span></div>
                  <div className="flex justify-between"><span className="text-on-surface-variant">Artwork</span><span>{firstTp ? `${firstTp.artwork_count} placements` : '—'}</span></div>
                  {board.lines.length > 1 && (
                    <div className="flex justify-between"><span className="text-on-surface-variant">Lines</span><span>{board.lines.length} · {board.lines.reduce((s, l) => s + (l.quantity ?? 0), 0)} pcs</span></div>
                  )}
                </div>
              )}
              {firstLine?.tech_pack_id && (
                <button
                  className="w-full mt-3 h-8 border border-surface-dim rounded text-label-sm font-semibold hover:bg-surface-container-low flex items-center justify-center gap-1"
                  onClick={() => { openTechPack(firstLine.tech_pack_id!); onNavigate('design', 'tech-pack-editor'); }}
                >
                  <span className="material-symbols-outlined text-[14px]">open_in_new</span>Open tech pack
                </button>
              )}
            </div>
            <div className="bg-white rounded-xl border border-surface-dim p-4">
              <div className="text-[11px] font-bold tracking-wider uppercase pb-2 border-b border-surface-dim mb-3">Timeline</div>
              <div className="space-y-2 text-[12px]">
                {timeline.map((t) => (
                  <div key={t.label} className="flex items-start gap-2">
                    <span className={`material-symbols-outlined text-[14px] mt-0.5 ${t.done ? 'text-primary' : 'text-on-surface-variant'}`}>{t.done ? 'check_circle' : 'schedule'}</span>
                    <div>
                      <div className="font-medium">{t.label}</div>
                      <div className="text-[11px] text-on-surface-variant">{t.date ? fmtDateTime(t.date) : '—'}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </main>

      {inviteOpen && (
        <div className="fixed inset-0 z-[81] flex justify-end" role="dialog" aria-label="Invite vendor">
          <div className="absolute inset-0 bg-black/35" onClick={() => setInviteOpen(false)} />
          <div className="relative w-[440px] max-w-[96vw] bg-white h-full flex flex-col shadow-xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-surface-dim">
              <h2 className="text-headline-sm font-semibold">Invite vendor</h2>
              <button className="w-8 h-8 rounded hover:bg-surface-container-low flex items-center justify-center" onClick={() => setInviteOpen(false)} aria-label="Close">
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3 text-[13px]">
              <p className="text-on-surface-variant">The vendor gets the RFQ and, once the NDA is accepted, the watermarked tech pack preview.</p>
              <label className="block text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant">Vendor</label>
              <select className="w-full h-9 border border-surface-dim rounded px-2 text-[13px]" value={inviteVendorId} onChange={(e) => setInviteVendorId(e.target.value)}>
                <option value="">Select a vendor…</option>
                {vendors.map((v) => (
                  <option key={v.id} value={v.id}>{v.name}{v.email ? ` — ${v.email}` : ''}</option>
                ))}
              </select>
              {vendors.length === 0 && <p className="text-on-surface-variant">No vendors on file for this tenant yet.</p>}
              <button className="h-9 px-4 bg-primary text-white rounded text-[13px] font-semibold disabled:opacity-50" disabled={!inviteVendorId || busy !== null} onClick={doInvite}>
                {busy === 'Inviting…' ? 'Inviting…' : 'Send invitation'}
              </button>
            </div>
          </div>
        </div>
      )}

      {detailBid && (
        <div className="fixed inset-0 z-[81] flex justify-end" role="dialog" aria-label="Bid details">
          <div className="absolute inset-0 bg-black/35" onClick={() => setDetailBidId(null)} />
          <div className="relative w-[520px] max-w-[96vw] bg-white h-full flex flex-col shadow-xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-surface-dim">
              <div>
                <h2 className="text-headline-sm font-semibold">Bid — {detailBid.vendor_name ?? '—'}</h2>
                <p className="text-body-sm text-on-surface-variant mt-0.5">Rev {detailBid.revision} · submitted {fmtDate(detailBid.submitted_at)}</p>
              </div>
              <button className="w-8 h-8 rounded hover:bg-surface-container-low flex items-center justify-center" onClick={() => setDetailBidId(null)} aria-label="Close">
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 text-[13px]">
              <div className="grid grid-cols-2 gap-3">
                <div><div className="text-[11px] font-semibold uppercase text-on-surface-variant">Total</div><div className="text-headline-sm font-semibold">{money(detailBid.total_amount, detailBid.currency ?? rfq.currency ?? 'USD')}</div></div>
                <div><div className="text-[11px] font-semibold uppercase text-on-surface-variant">Lead time</div><div className="font-medium">{detailBid.lead_time_days != null ? `${detailBid.lead_time_days} days` : '—'}</div></div>
                <div><div className="text-[11px] font-semibold uppercase text-on-surface-variant">Valid until</div><div className="font-medium">{fmtDate(detailBid.valid_until)}</div></div>
                <div><div className="text-[11px] font-semibold uppercase text-on-surface-variant">Terms</div><div className="font-medium">{[detailBid.payment_terms, detailBid.incoterm].filter(Boolean).join(' · ') || '—'}</div></div>
              </div>
              {detailBid.notes && <p className="text-on-surface-variant">{detailBid.notes}</p>}
              <h3 className="font-semibold">Priced lines</h3>
              {(detailBid.lines ?? []).length === 0 ? (
                <p className="text-on-surface-variant">No priced lines on this bid.</p>
              ) : (
                <table className="w-full text-left text-[13px]">
                  <thead><tr className="text-[11px] uppercase text-on-surface-variant"><th className="py-1">Line</th><th className="py-1 text-right">Unit price</th><th className="py-1 text-right">MOQ</th><th className="py-1 text-right">Lead</th></tr></thead>
                  <tbody>
                    {(detailBid.lines ?? []).map((l) => (
                      <tr key={l.id} className="border-t border-surface-container">
                        <td className="py-2 font-mono text-[12px]">{l.rfq_line_id.slice(0, 8)}</td>
                        <td className="py-2 text-right">{money(l.unit_price, detailBid.currency ?? rfq.currency ?? 'USD')}</td>
                        <td className="py-2 text-right">{l.moq ?? '—'}</td>
                        <td className="py-2 text-right">{l.lead_time_days != null ? `${l.lead_time_days}d` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <div className="flex gap-2 pt-2">
                <button className="h-9 px-4 bg-primary text-white rounded text-[13px] font-semibold disabled:opacity-40" disabled={!canAward || busy !== null} title={canAward ? undefined : 'Close the RFQ first to reveal bids, then award.'} onClick={() => doAward(detailBid.id)}>
                  {busy === 'Awarding…' ? 'Awarding…' : 'Award this bid'}
                </button>
                <button className="h-9 px-4 border border-surface-dim rounded text-[13px]" onClick={() => setDetailBidId(null)}>Close</button>
              </div>
              {!canAward && <p className="text-[12px] text-on-surface-variant">Awarding opens once the RFQ is closed.</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
