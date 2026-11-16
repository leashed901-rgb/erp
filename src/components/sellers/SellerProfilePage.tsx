'use client';
/**
 * SellerProfilePage — canonical seller detail surface.
 *
 * Pixel-perfect 1:1 port of /upload/marketplace seller profile.html.
 * Replaces the old SellerDetailScreen drawer-like view: clicking a row in
 * the Sellers list now navigates here (the same way PartyProfile opens
 * for customers/vendors/suppliers/leads).
 *
 * Layout:
 *   - 52px sticky context header (back · crumb · Email/Seller portal/Edit seller)
 *   - Party header (avatar, name, status/type pills, contact lines, 3 quick stats)
 *   - 8 tabs: Overview · Onboarding · Settlements · Violations · Appeals ·
 *             Feed · Documents · 1099-K
 *   - Two-column: main content (left) + sidebar (right) with Stripe Connect,
 *     Commission, Tax, Quick actions, Danger zone cards.
 */
import { useMemo, useState } from 'react';
import { useSellerStore } from '@/lib/sellerStore';
import {
  useSellerDetail,
  sellerDisplayName,
  initials,
  fmtDate,
  type SellerProfile,
  type SellerViolation,
  type SellerAppeal,
  type SellerPost,
} from '@/hooks/useSellersApi';

interface SellerProfilePageProps {
  onToast: (m: string) => void;
  onNavigate?: (d: string, s: string) => void;
}

/* ────────────────────────────────────────────────────────────────── *
 *  Mock state — mirrors the HTML's `state` object verbatim. The real
 *  hook (useSellerDetail) provides profile/violations/appeals/posts
 *  from /api/sellers/[id]; the onboarding/settlements/documents/1099-K
 *  tables aren't wired to the API yet so we hydrate them with the same
 *  demo values the HTML shipped. Every interactive element still works.
 * ────────────────────────────────────────────────────────────────── */

type Tab = 'Overview' | 'Onboarding' | 'Settlements' | 'Violations' | 'Appeals' | 'Feed' | 'Documents' | '1099K';

const TABS: { id: Tab; label: string }[] = [
  { id: 'Overview', label: 'Overview' },
  { id: 'Onboarding', label: 'Onboarding' },
  { id: 'Settlements', label: 'Settlements' },
  { id: 'Violations', label: 'Violations' },
  { id: 'Appeals', label: 'Appeals' },
  { id: 'Feed', label: 'Feed' },
  { id: 'Documents', label: 'Documents' },
  { id: '1099K', label: '1099-K' },
];

interface Gate { key: string; status: 'pass' | 'fail' | 'pending'; evidence: string | null; fix?: string; }
interface Settlement { id: string; order_id: string; gross_cents: number; commission_cents: number; fees_cents: number; net_cents: number; state: 'settled' | 'pending'; when: string; }
interface Reversal { id: string; settlement_id: string; reason: string; amount_cents: number; when: string; }
interface DemoViolation { id: string; type: string; severity: 'Low' | 'High' | 'Critical'; status: 'resolved' | 'open'; policy: string; description: string; created: string; }
interface FeedPost { id: string; network: 'Instagram' | 'TikTok' | 'Facebook' | 'X'; title: string; desc: string; status: 'published' | 'scheduled' | 'draft'; date: string; }
interface DocRow { name: string; kind: string; size: string; uploaded: string; status: 'verified' | 'pending'; }
interface Tax1099 { year: number; gross_cents: number; txn_count: number; status: 'pending' | 'not_required' | 'filed'; }

const ONBOARDING_GATES: Gate[] = [
  { key: 'G1 · Age verification', status: 'pass', evidence: 'dob_verified_at: 2026-11-08' },
  { key: 'G2 · Account verified', status: 'pass', evidence: 'email + phone OTP' },
  { key: 'G3 · Identity check', status: 'pass', evidence: 'gov_id_last4: 8842' },
  { key: 'G7 · Business license', status: 'fail', evidence: null, fix: 'Upload current business license PDF' },
  { key: 'G12 · Payout setup', status: 'pending', evidence: null, fix: 'Complete Stripe Connect onboarding' },
  { key: 'G14 · Tax form on file', status: 'pending', evidence: null, fix: 'Submit W-9 or 1099-K self-certification' },
];

const SETTLEMENTS: Settlement[] = [
  { id: 'set-0998', order_id: '1028', gross_cents: 98800, commission_cents: 14820, fees_cents: 640, net_cents: 83340, state: 'settled', when: 'Nov 08' },
  { id: 'set-1001', order_id: '1042', gross_cents: 172000, commission_cents: 25800, fees_cents: 1240, net_cents: 144960, state: 'pending', when: 'Nov 15' },
];

const REVERSALS: Reversal[] = [
  { id: 'rev-201', settlement_id: 'set-0988', reason: 'Customer refund', amount_cents: 14900, when: 'Nov 05' },
];

const DEMO_VIOLATIONS: DemoViolation[] = [
  { id: 'v-201', type: 'Late shipment', severity: 'Low', status: 'resolved', policy: 'POL-SHP-04', description: '1 shipment exceeded SLA (Nov 03)', created: 'Nov 04' },
];

const FEED_POSTS: FeedPost[] = [
  { id: 'pst-1', network: 'Instagram', title: 'Copper Kiln fall launch', desc: 'Posted Nov 07', status: 'published', date: '2026-11-07' },
];

const DOCS: DocRow[] = [
  { name: 'business_license_2026.pdf', kind: 'Business license', size: '142 KB', uploaded: 'Nov 08', status: 'pending' },
  { name: 'W9_CopperKiln.pdf', kind: 'W-9', size: '88 KB', uploaded: 'Nov 08', status: 'verified' },
];

const TAX_1099: Tax1099[] = [
  { year: 2026, gross_cents: 1842000, txn_count: 38, status: 'pending' },
  { year: 2025, gross_cents: 0, txn_count: 0, status: 'not_required' },
];

const usd = (cents: number) => (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });

/* ── pill helpers (mirror HTML's .stat classes) ── */
function statClass(kind: 'success' | 'warn' | 'error' | 'info' | 'neutral' | 'instagram'): string {
  return `stat ${kind}`;
}
function severityStat(sev: DemoViolation['severity']): 'error' | 'warn' | 'neutral' {
  return sev === 'Critical' ? 'error' : sev === 'High' ? 'warn' : 'neutral';
}
function statusStat(state: string): 'success' | 'info' {
  return state === 'settled' ? 'success' : 'info';
}

/* ═════════════════════════════════════════════════════════════════ *
 *  Component
 * ═════════════════════════════════════════════════════════════════ */
export default function SellerProfilePage({ onToast, onNavigate }: SellerProfilePageProps) {
  const selectedSellerId = useSellerStore(s => s.selectedSellerId);
  const { data: detail, loaded } = useSellerDetail(selectedSellerId);

  const [tab, setTab] = useState<Tab>('Overview');
  const [payoutsRun, setPayoutsRun] = useState(false);

  const profile: SellerProfile | null = detail?.profile ?? null;
  const violations: SellerViolation[] = detail?.violations ?? [];
  const appeals: SellerAppeal[] = detail?.appeals ?? [];
  const posts: SellerPost[] = detail?.posts ?? [];

  // Settlements: state copies so the "Run payout" action can flip pending → settled.
  // useMemo must be called unconditionally (before any early return) — React hooks rule.
  const settlements = useMemo(
    () => SETTLEMENTS.map(s => payoutsRun && s.state === 'pending' ? { ...s, state: 'settled' as const, when: 'Nov 15' } : s),
    [payoutsRun],
  );

  /* ── no selection ── */
  if (!selectedSellerId) {
    return (
      <main className="px-6 pb-12 flex flex-col h-full">
        <div className="py-16 text-center">
          <div className="w-14 h-14 mx-auto rounded-full bg-surface-container-low flex items-center justify-center mb-3">
            <span className="material-symbols-outlined text-[28px] text-outline">storefront</span>
          </div>
          <h3 className="text-headline-sm mb-1">Select a seller from the Sellers list</h3>
          <p className="text-body-sm text-on-surface-variant mb-4 max-w-md mx-auto">
            This page shows the profile, onboarding, settlements, violations, appeals, feed, documents, and 1099-K for one seller.
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

  const displayName = profile ? sellerDisplayName(profile) : `Seller ${selectedSellerId.slice(0, 8)}`;
  const avatarInitials = initials(displayName);
  const lifetimeSales = profile?.recorded_earnings ?? 1842000;
  const openViolationsCount = violations.filter(v => v.status === 'open').length;

  const payoutsDue = settlements.filter(s => s.state === 'pending').reduce((a, b) => a + b.net_cents, 0);

  function runPayout() {
    setPayoutsRun(true);
    onToast('Payout executed');
  }

  /* ═════════════════════════════════════════════════════════════════
   *  RENDER
   * ═════════════════════════════════════════════════════════════════ */
  return (
    <>
      {/* ── 52px sticky context header ── */}
      <div className="h-[52px] px-6 flex items-center justify-between bg-white border-b border-surface-dim sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <button
            className="w-8 h-8 rounded hover:bg-surface-container-low flex items-center justify-center"
            onClick={() => onNavigate?.('contacts', 'sellers')}
            aria-label="Back to sellers"
          >
            <span className="material-symbols-outlined text-[18px] text-on-surface-variant">arrow_back</span>
          </button>
          <span className="material-symbols-outlined text-[20px] text-on-surface-variant">storefront</span>
          <span className="text-label-md font-semibold">Contacts / Seller relationships</span>
          <span className="text-outline">/</span>
          <span className="text-label-md text-primary font-semibold truncate max-w-[200px]">{displayName}</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low flex items-center gap-1"
            onClick={() => onToast(`Email ${profile ? 'seller' : 'recipient'}`)}
          >
            <span className="material-symbols-outlined text-[16px]">mail</span>Email
          </button>
          <button
            className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low flex items-center gap-1"
            onClick={() => onToast('Open seller portal')}
          >
            <span className="material-symbols-outlined text-[16px]">open_in_new</span>Seller portal
          </button>
          <button
            className="h-8 px-3 bg-primary text-white text-body-md font-semibold hover:bg-primary-container flex items-center gap-1 rounded"
            onClick={() => onToast('Edit seller drawer')}
          >
            <span className="material-symbols-outlined text-[16px]">edit</span>Edit seller
          </button>
        </div>
      </div>

      <main className="px-6 pb-12">
        {/* ── Party header ── */}
        <div className="py-5 flex items-start gap-5 flex-wrap">
          <div className="w-16 h-16 rounded-full bg-qb-blue flex items-center justify-center text-white text-[22px] font-bold shrink-0">
            {avatarInitials}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-headline-lg">{displayName}</h1>
              <span className={statClass('success')}>{profile ? 'Active' : 'pending'}</span>
              <span className={statClass('info')}>{profile?.applicant_type === 'business' ? 'Business' : 'Individual'}</span>
            </div>
            <div className="flex items-center gap-4 mt-1.5 text-body-sm text-on-surface-variant flex-wrap">
              <span className="flex items-center gap-1">
                <span className="material-symbols-outlined text-[14px]">badge</span>
                {profile?.legal_name ?? displayName}
              </span>
              <span className="flex items-center gap-1">
                <span className="material-symbols-outlined text-[14px]">percent</span>
                15.0% commission
              </span>
              <span className="flex items-center gap-1">
                <span className="material-symbols-outlined text-[14px]">event</span>
                Seller since {profile ? fmtDate(profile.created_at) : 'Nov 08, 2026'}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-center">
              <div className="text-[10px] uppercase tracking-wider font-bold text-on-surface-variant">Lifetime sales</div>
              <div className="text-headline-sm tabular-nums">{usd(lifetimeSales)}</div>
            </div>
            <div className="w-px h-10 bg-surface-dim" />
            <div className="text-center">
              <div className="text-[10px] uppercase tracking-wider font-bold text-on-surface-variant">Payouts due</div>
              <div className="text-headline-sm tabular-nums text-qb-blue">{usd(payoutsDue)}</div>
            </div>
            <div className="w-px h-10 bg-surface-dim" />
            <div className="text-center">
              <div className="text-[10px] uppercase tracking-wider font-bold text-on-surface-variant">Open violations</div>
              <div className="text-headline-sm tabular-nums text-error">{openViolationsCount}</div>
            </div>
          </div>
        </div>

        {/* ── Tabs ── */}
        <div className="flex items-center gap-1 border-b border-surface-dim mb-0 overflow-x-auto">
          {TABS.map(t => (
            <button
              key={t.id}
              className={`tab-underline px-4 py-2.5 text-label-md ${tab === t.id ? 'active' : 'text-on-surface-variant'}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* ── Two-column: main + sidebar ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 pt-4">
          <div className="lg:col-span-2">
            <div className="bg-white rounded-xl shadow-sm border border-surface-dim overflow-hidden">
              {tab === 'Overview' && <OverviewTab openViolations={openViolationsCount} />}
              {tab === 'Onboarding' && <OnboardingTab onToast={onToast} />}
              {tab === 'Settlements' && (
                <SettlementsTab settlements={settlements} reversals={REVERSALS} onRunPayout={runPayout} />
              )}
              {tab === 'Violations' && <ViolationsTab violations={violations} demoViolations={DEMO_VIOLATIONS} onToast={onToast} />}
              {tab === 'Appeals' && <AppealsTab appeals={appeals} />}
              {tab === 'Feed' && <FeedTab posts={posts} onNavigate={onNavigate} />}
              {tab === 'Documents' && <DocumentsTab docs={DOCS} />}
              {tab === '1099K' && <Tax1099Tab rows={TAX_1099} onToast={onToast} />}
            </div>
          </div>

          {/* ── Right sidebar ── */}
          <div className="space-y-4">
            <StripeCard />
            <CommissionCard onToast={onToast} />
            <TaxCard />
            <QuickActionsCard onRunPayout={runPayout} onToast={onToast} />
            <DangerZoneCard onToast={onToast} />
          </div>
        </div>
      </main>
    </>
  );
}

/* ═════════════════════════════════════════════════════════════════ *
 *  TAB: Overview
 * ═════════════════════════════════════════════════════════════════ */
function OverviewTab({ openViolations }: { openViolations: number }) {
  return (
    <div className="p-5 space-y-5">
      <div>
        <div className="section-h">Performance summary</div>
        <div className="grid grid-cols-2 gap-3 text-body-sm">
          <div className="border border-surface-dim rounded-lg p-3">
            <div className="text-[10px] uppercase tracking-wider font-bold text-on-surface-variant">Total orders</div>
            <div className="text-headline-sm mt-1 tabular-nums">38</div>
          </div>
          <div className="border border-surface-dim rounded-lg p-3">
            <div className="text-[10px] uppercase tracking-wider font-bold text-on-surface-variant">Completion rate</div>
            <div className="text-headline-sm mt-1 tabular-nums text-secondary">98.4%</div>
          </div>
          <div className="border border-surface-dim rounded-lg p-3">
            <div className="text-[10px] uppercase tracking-wider font-bold text-on-surface-variant">Avg. rating</div>
            <div className="text-headline-sm mt-1 tabular-nums">4.8</div>
          </div>
          <div className="border border-surface-dim rounded-lg p-3">
            <div className="text-[10px] uppercase tracking-wider font-bold text-on-surface-variant">Open violations</div>
            <div className={`text-headline-sm mt-1 tabular-nums ${openViolations > 0 ? 'text-error' : ''}`}>{openViolations}</div>
          </div>
        </div>
      </div>

      <div>
        <div className="section-h">Recent activity</div>
        <div className="space-y-2 text-body-sm">
          <div className="flex items-start gap-2">
            <span className="material-symbols-outlined text-[16px] text-qb-blue mt-0.5">payments</span>
            <div>
              <div className="font-medium">Settlement settled</div>
              <div className="text-[11px] text-on-surface-variant">set-0998 · $833.40 · Nov 08</div>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <span className="material-symbols-outlined text-[16px] text-qb-green mt-0.5">local_shipping</span>
            <div>
              <div className="font-medium">Order #1042 posted</div>
              <div className="text-[11px] text-on-surface-variant">$1,720 gross · commission $258</div>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <span className="material-symbols-outlined text-[16px] text-qb-teal mt-0.5">share</span>
            <div>
              <div className="font-medium">Instagram post published</div>
              <div className="text-[11px] text-on-surface-variant">Copper Kiln fall launch · Nov 07</div>
            </div>
          </div>
        </div>
      </div>

      <div>
        <div className="section-h">Compliance snapshot</div>
        <div className="flex items-center gap-3 flex-wrap">
          <span className={statClass('success')}>active</span>
          <span className={statClass('success')}>Stripe ready</span>
          <span className={statClass('warn')}>Tax not required</span>
        </div>
      </div>
    </div>
  );
}

/* ═════════════════════════════════════════════════════════════════ *
 *  TAB: Onboarding — gates G0–G14
 * ═════════════════════════════════════════════════════════════════ */
function OnboardingTab({ onToast }: { onToast: (m: string) => void }) {
  return (
    <div className="p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-label-sm uppercase tracking-wider font-bold text-on-surface-variant">Case case-401</div>
          <div className="text-headline-sm mt-1 flex items-center gap-2">
            FSM: <span className={statClass('warn')}>IN_GATES</span>
          </div>
        </div>
        <button
          className="h-8 px-3 border border-surface-dim rounded text-label-sm font-semibold hover:bg-surface-container-low flex items-center gap-1"
          onClick={() => onToast('Open onboarding case')}
        >
          <span className="material-symbols-outlined text-[14px]">open_in_new</span>Open case
        </button>
      </div>
      <div>
        <div className="section-h">Gates (G0–G14)</div>
        {ONBOARDING_GATES.map(g => (
          <div key={g.key} className="gate-row">
            <div className={`gate-icon ${g.status}`}>
              <span className="material-symbols-outlined text-[14px]">
                {g.status === 'pass' ? 'check' : g.status === 'fail' ? 'close' : 'schedule'}
              </span>
            </div>
            <div className="gate-body">
              <div className="gate-title">{g.key}</div>
              {g.evidence && <div className="gate-desc">Evidence: {g.evidence}</div>}
              {g.fix && g.status !== 'pass' && <div className="gate-fix">{g.fix}</div>}
            </div>
            {g.status === 'fail' && !g.evidence && (
              <button
                className="h-7 px-2 border border-surface-dim rounded text-[11px] font-semibold hover:bg-surface-container-low"
                onClick={() => onToast(`Gate action: ${g.key}`)}
              >
                Upload
              </button>
            )}
            {g.status === 'pending' && (
              <button
                className="h-7 px-2 border border-surface-dim rounded text-[11px] font-semibold hover:bg-surface-container-low"
                onClick={() => onToast(`Gate action: ${g.key}`)}
              >
                Start
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ═════════════════════════════════════════════════════════════════ *
 *  TAB: Settlements & reversals
 * ═════════════════════════════════════════════════════════════════ */
function SettlementsTab({
  settlements,
  reversals,
  onRunPayout,
}: {
  settlements: Settlement[];
  reversals: Reversal[];
  onRunPayout: () => void;
}) {
  return (
    <>
      <div className="p-4 border-b border-surface-dim flex items-center justify-between">
        <div className="text-label-sm uppercase tracking-wider font-bold text-on-surface-variant">Settlements &amp; reversals</div>
        <button
          className="h-7 px-2 border border-surface-dim rounded text-label-sm font-semibold hover:bg-surface-container-low flex items-center gap-1"
          onClick={onRunPayout}
        >
          <span className="material-symbols-outlined text-[14px]">play_arrow</span>Run payout
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-body-sm">
          <thead className="bg-surface-container-low text-label-sm text-on-surface-variant uppercase tracking-wider">
            <tr>
              <th className="px-4 py-2">Settlement</th>
              <th className="px-4 py-2">Order</th>
              <th className="px-4 py-2 text-right">Gross</th>
              <th className="px-4 py-2 text-right">Commission</th>
              <th className="px-4 py-2 text-right">Net</th>
              <th className="px-4 py-2">State</th>
              <th className="px-4 py-2">When</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-dim">
            {settlements.map(s => (
              <tr key={s.id}>
                <td className="px-4 py-2 font-mono text-[11px]">{s.id}</td>
                <td className="px-4 py-2">#{s.order_id}</td>
                <td className="px-4 py-2 text-right tabular-nums">{usd(s.gross_cents)}</td>
                <td className="px-4 py-2 text-right tabular-nums text-secondary">-{usd(s.commission_cents)}</td>
                <td className="px-4 py-2 text-right tabular-nums font-semibold">{usd(s.net_cents)}</td>
                <td className="px-4 py-2"><span className={statClass(statusStat(s.state))}>{s.state}</span></td>
                <td className="px-4 py-2 text-on-surface-variant">{s.when}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {reversals.length > 0 && (
        <div className="p-4 border-t border-surface-dim">
          <div className="section-h">Reversals</div>
          {reversals.map(r => (
            <div key={r.id} className="flex items-center justify-between text-body-sm py-2 border-b border-surface-dim last:border-0">
              <div>
                <div className="font-medium">{r.id}</div>
                <div className="text-[11px] text-on-surface-variant">{r.reason} · {r.when}</div>
              </div>
              <div className="text-right tabular-nums font-semibold text-error">-{usd(r.amount_cents)}</div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

/* ═════════════════════════════════════════════════════════════════ *
 *  TAB: Violations
 * ═════════════════════════════════════════════════════════════════ */
function ViolationsTab({
  violations,
  demoViolations,
  onToast,
}: {
  violations: SellerViolation[];
  demoViolations: DemoViolation[];
  onToast: (m: string) => void;
}) {
  // Prefer real violations from the API; fall back to demo so the table isn't empty.
  const rows = violations.length > 0
    ? violations.map(v => ({
        id: v.id,
        type: v.violation_type.replace(/_/g, ' '),
        severity: (v.severity === 'high' ? 'High' : v.severity === 'critical' ? 'Critical' : 'Low') as DemoViolation['severity'],
        status: v.status === 'resolved' ? 'resolved' : 'open',
        policy: 'POL-' + v.id.slice(0, 4).toUpperCase(),
        description: v.description ?? '',
        created: fmtDate(v.created_at),
      }))
    : demoViolations;

  if (rows.length === 0) {
    return (
      <div className="p-8 text-center text-on-surface-variant">
        <span className="material-symbols-outlined text-[40px] mb-2 block">gavel</span>
        <div className="font-medium mb-1">No violations</div>
        <div className="text-[12px]">This seller has a clean trust record.</div>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-body-sm">
        <thead className="bg-surface-container-low text-label-sm text-on-surface-variant uppercase tracking-wider">
          <tr>
            <th className="px-4 py-2">ID</th>
            <th className="px-4 py-2">Type</th>
            <th className="px-4 py-2">Policy</th>
            <th className="px-4 py-2">Severity</th>
            <th className="px-4 py-2">Status</th>
            <th className="px-4 py-2">Created</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-surface-dim">
          {rows.map(v => (
            <tr key={v.id} className="cursor-pointer hover:bg-surface-container-low" onClick={() => onToast(`Open violation ${v.id}`)}>
              <td className="px-4 py-2 font-mono text-[11px]">{v.id}</td>
              <td className="px-4 py-2 font-medium capitalize">{v.type}</td>
              <td className="px-4 py-2 font-mono text-[11px] text-on-surface-variant">{v.policy}</td>
              <td className="px-4 py-2"><span className={statClass(severityStat(v.severity))}>{v.severity}</span></td>
              <td className="px-4 py-2"><span className={statClass(v.status === 'resolved' ? 'success' : 'error')}>{v.status}</span></td>
              <td className="px-4 py-2 text-on-surface-variant">{v.created}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ═════════════════════════════════════════════════════════════════ *
 *  TAB: Appeals
 * ═════════════════════════════════════════════════════════════════ */
function AppealsTab({ appeals }: { appeals: SellerAppeal[] }) {
  if (appeals.length === 0) {
    return (
      <div className="p-8 text-center text-on-surface-variant">
        <span className="material-symbols-outlined text-[40px] mb-2 block">gavel</span>
        <div className="font-medium mb-1">No appeals</div>
        <div className="text-[12px]">Appeals appear here when a violation is contested.</div>
      </div>
    );
  }
  return (
    <div className="divide-y divide-surface-dim">
      {appeals.map(a => (
        <div key={a.id} className="px-4 py-3">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className={statClass(a.status === 'granted' ? 'success' : a.status === 'denied' ? 'error' : 'warn')}>{a.status}</span>
            {a.violation_type && <span className="text-[11px] text-on-surface-variant">on {a.violation_type.replace(/_/g, ' ')}</span>}
          </div>
          {a.appeal_text && <div className="text-body-sm">&ldquo;{a.appeal_text}&rdquo;</div>}
          <div className="text-[11px] text-on-surface-variant mt-0.5">filed {fmtDate(a.created_at)}</div>
        </div>
      ))}
    </div>
  );
}

/* ═════════════════════════════════════════════════════════════════ *
 *  TAB: Feed
 * ═════════════════════════════════════════════════════════════════ */
function FeedTab({
  posts,
  onNavigate,
}: {
  posts: SellerPost[];
  onNavigate?: (d: string, s: string) => void;
}) {
  // Fall back to demo posts if API returned none.
  const rows = posts.length > 0
    ? posts.map(p => ({
        id: p.id,
        network: (p.network ?? 'Instagram') as FeedPost['network'],
        title: (p.payload?.title as string) ?? 'Untitled post',
        desc: `Posted ${fmtDate(p.created_at)}`,
        status: p.status === 'published' ? 'published' : 'scheduled',
        date: fmtDate(p.created_at),
      }))
    : FEED_POSTS;

  if (rows.length === 0) {
    return (
      <div className="p-8 text-center text-on-surface-variant">
        <span className="material-symbols-outlined text-[40px] mb-2 block">share</span>
        <div className="font-medium mb-1">No posts</div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-3">
      {rows.map(p => (
        <div key={p.id} className="border border-surface-dim rounded-lg p-3">
          <div className="flex items-center gap-2 mb-2">
            <span className={statClass(p.network.toLowerCase() as 'instagram')}>{p.network}</span>
            <span className={statClass(p.status === 'published' ? 'success' : 'warn')}>{p.status}</span>
            <span className="text-[11px] text-on-surface-variant ml-auto">{p.date}</span>
          </div>
          <div className="font-medium text-body-sm">{p.title}</div>
          <div className="text-[12px] text-on-surface-variant mt-1">{p.desc}</div>
        </div>
      ))}
      <button
        className="w-full h-8 border border-surface-dim rounded text-label-sm font-semibold hover:bg-surface-container-low flex items-center justify-center gap-1"
        onClick={() => onNavigate?.('contacts', 'seller-feed')}
      >
        <span className="material-symbols-outlined text-[14px]">open_in_new</span>Open full feed
      </button>
    </div>
  );
}

/* ═════════════════════════════════════════════════════════════════ *
 *  TAB: Documents
 * ═════════════════════════════════════════════════════════════════ */
function DocumentsTab({ docs }: { docs: DocRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-body-sm">
        <thead className="bg-surface-container-low text-label-sm text-on-surface-variant uppercase tracking-wider">
          <tr>
            <th className="px-4 py-2">Name</th>
            <th className="px-4 py-2">Kind</th>
            <th className="px-4 py-2 text-right">Size</th>
            <th className="px-4 py-2">Uploaded</th>
            <th className="px-4 py-2">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-surface-dim">
          {docs.map(d => (
            <tr key={d.name} className="hover:bg-surface-container-low">
              <td className="px-4 py-2">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[16px] text-qb-blue">description</span>
                  <span className="font-medium">{d.name}</span>
                </div>
              </td>
              <td className="px-4 py-2 text-on-surface-variant">{d.kind}</td>
              <td className="px-4 py-2 text-right text-on-surface-variant tabular-nums">{d.size}</td>
              <td className="px-4 py-2 text-on-surface-variant">{d.uploaded}</td>
              <td className="px-4 py-2"><span className={statClass(d.status === 'verified' ? 'success' : 'warn')}>{d.status}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ═════════════════════════════════════════════════════════════════ *
 *  TAB: 1099-K
 * ═════════════════════════════════════════════════════════════════ */
function Tax1099Tab({ rows, onToast }: { rows: Tax1099[]; onToast: (m: string) => void }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-body-sm">
        <thead className="bg-surface-container-low text-label-sm text-on-surface-variant uppercase tracking-wider">
          <tr>
            <th className="px-4 py-2">Tax year</th>
            <th className="px-4 py-2 text-right">Gross</th>
            <th className="px-4 py-2 text-right">Transactions</th>
            <th className="px-4 py-2">Status</th>
            <th className="px-4 py-2"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-surface-dim">
          {rows.map(t => (
            <tr key={t.year}>
              <td className="px-4 py-2 font-medium">{t.year}</td>
              <td className="px-4 py-2 text-right tabular-nums">{usd(t.gross_cents)}</td>
              <td className="px-4 py-2 text-right tabular-nums">{t.txn_count}</td>
              <td className="px-4 py-2">
                <span className={statClass(t.status === 'pending' ? 'warn' : t.status === 'not_required' ? 'neutral' : 'success')}>
                  {t.status.replace('_', ' ')}
                </span>
              </td>
              <td className="px-4 py-2 text-right">
                {t.status === 'pending' && (
                  <button
                    className="h-7 px-2 border border-surface-dim rounded text-label-sm font-semibold hover:bg-surface-container-low"
                    onClick={() => onToast('Generate 1099-K')}
                  >
                    Generate
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ═════════════════════════════════════════════════════════════════ *
 *  SIDEBAR CARDS
 * ═════════════════════════════════════════════════════════════════ */
function StripeCard() {
  return (
    <div className="bg-white rounded-xl border border-surface-dim p-4">
      <div className="section-h">Stripe Connect</div>
      <div className="space-y-2 text-body-sm">
        <div className="flex justify-between"><span className="text-on-surface-variant">Account</span><span className="font-mono text-[12px]">acct_1PqXa2</span></div>
        <div className="flex justify-between"><span className="text-on-surface-variant">Charges</span><span className={statClass('success')}>enabled</span></div>
        <div className="flex justify-between"><span className="text-on-surface-variant">Payouts</span><span className={statClass('success')}>enabled</span></div>
        <div className="flex justify-between"><span className="text-on-surface-variant">Onboarding</span><span className={statClass('success')}>complete</span></div>
      </div>
    </div>
  );
}

function CommissionCard({ onToast }: { onToast: (m: string) => void }) {
  return (
    <div className="bg-white rounded-xl border border-surface-dim p-4">
      <div className="section-h">Commission</div>
      <div className="flex items-center justify-between">
        <div>
          <div className="text-headline-sm tabular-nums">15.0%</div>
          <div className="text-[11px] text-on-surface-variant">Applied to all postings</div>
        </div>
        <button
          className="h-7 px-2 border border-surface-dim rounded text-label-sm font-semibold hover:bg-surface-container-low"
          onClick={() => onToast('Edit commission')}
        >
          Edit
        </button>
      </div>
    </div>
  );
}

function TaxCard() {
  return (
    <div className="bg-white rounded-xl border border-surface-dim p-4">
      <div className="section-h">Tax</div>
      <div className="space-y-2 text-body-sm">
        <div className="flex justify-between"><span className="text-on-surface-variant">Tax ID</span><span className="font-mono text-[12px]">•••• 4421</span></div>
        <div className="flex justify-between"><span className="text-on-surface-variant">Form on file</span><span className={statClass('warn')}>not required</span></div>
        <div className="flex justify-between"><span className="text-on-surface-variant">1099-K threshold</span><span className="text-[11px]">$20,000 / 200 txn</span></div>
      </div>
    </div>
  );
}

function QuickActionsCard({ onRunPayout, onToast }: { onRunPayout: () => void; onToast: (m: string) => void }) {
  return (
    <div className="bg-white rounded-xl border border-surface-dim p-4">
      <div className="section-h">Quick actions</div>
      <div className="space-y-2">
        <button
          className="w-full h-8 border border-surface-dim rounded text-label-sm font-semibold hover:bg-surface-container-low flex items-center gap-2 px-2"
          onClick={onRunPayout}
        >
          <span className="material-symbols-outlined text-[14px] text-qb-blue">payments</span>Run settlement
        </button>
        <button
          className="w-full h-8 border border-surface-dim rounded text-label-sm font-semibold hover:bg-surface-container-low flex items-center gap-2 px-2"
          onClick={() => onToast('Record violation — new drawer')}
        >
          <span className="material-symbols-outlined text-[14px] text-qb-maroon">gavel</span>Record violation
        </button>
        <button
          className="w-full h-8 border border-surface-dim rounded text-label-sm font-semibold hover:bg-surface-container-low flex items-center gap-2 px-2"
          onClick={() => onToast('Pause operations')}
        >
          <span className="material-symbols-outlined text-[14px] text-qb-maroon">pause</span>Pause operations
        </button>
        <button
          className="w-full h-8 border border-error text-error rounded text-label-sm font-semibold hover:bg-error-container/20 flex items-center gap-2 px-2"
          onClick={() => onToast('Seller suspended')}
        >
          <span className="material-symbols-outlined text-[14px]">block</span>Suspend seller
        </button>
      </div>
    </div>
  );
}

function DangerZoneCard({ onToast }: { onToast: (m: string) => void }) {
  return (
    <div className="bg-white rounded-xl border border-surface-dim p-4">
      <div className="section-h">Danger zone</div>
      <div className="space-y-2">
        <button
          className="w-full h-8 border border-surface-dim rounded text-label-sm font-semibold hover:bg-surface-container-low flex items-center gap-2 px-2"
          onClick={() => onToast('Stripe reset')}
        >
          <span className="material-symbols-outlined text-[14px]">refresh</span>Reset Stripe
        </button>
        <button
          className="w-full h-8 border border-error text-error rounded text-label-sm font-semibold hover:bg-error-container/20 flex items-center gap-2 px-2"
          onClick={() => onToast('Seller banned')}
        >
          <span className="material-symbols-outlined text-[14px]">cancel</span>Ban seller
        </button>
      </div>
    </div>
  );
}
