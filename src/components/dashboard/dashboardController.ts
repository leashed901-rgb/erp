'use client';
/* dashboardController — the hook + types, split out from DashboardScreens
   so GlobalShell can import just this (tiny) without pulling in 5,725
   lines of dashboard view components on initial page load.

   Queue data is LIVE: attention items compose from needs-attention
   flags, overdue CRM tasks and conversations awaiting a reply;
   customer queue rows derive from real customers + their invoices;
   seller queue rows derive from the sellers list + pending appeals.
   Setup-step completion is derived from real platform state (parties,
   bank accounts, settled receipts); the wizard's field values
   themselves are tenant settings with no backing endpoint — saving
   them stays in-session until a settings API exists. */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AttentionQueueItem,
  CustomerQueueItem,
  DEFAULT_PINNED_CREATE_ACTIONS,
  INITIAL_SETUP_STEPS,
  SellerQueueItem,
  SetupStepItem,
} from '@/data/dashboardData';
import { fetchJson } from '@/hooks/useCrmApi';

export const DASHBOARD_SCREEN_IDS = new Set<string>([
  'ops',
  'exec',
  'analytics',
  'explorer',
  'attention',
  'customer-queue',
  'seller-queue',
]);

const fmtDate = (iso: string | null | undefined) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
};
const fmtDateTime = (iso: string | null | undefined) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return `${fmtDate(iso)} ${d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}`;
};

export function useDashboardController() {
  const [setupSteps, setSetupSteps] =
    useState<SetupStepItem[]>(INITIAL_SETUP_STEPS);
  const [pinnedCreateActions, setPinnedCreateActions] = useState<string[]>(
    DEFAULT_PINNED_CREATE_ACTIONS
  );
  const [attentionItems, setAttentionItems] = useState<AttentionQueueItem[]>([]);
  const [customerQueueItems, setCustomerQueueItems] = useState<
    CustomerQueueItem[]
  >([]);
  const [sellerQueueItems, setSellerQueueItems] =
    useState<SellerQueueItem[]>([]);

  const [setupWizardStepIndex, setSetupWizardStepIndex] = useState<
    number | null
  >(null);
  const [customizeCreateOpen, setCustomizeCreateOpen] = useState<boolean>(false);
  const [contractorModalOpen, setContractorModalOpen] = useState<boolean>(false);
  const [quickTaskModalOpen, setQuickTaskModalOpen] = useState<boolean>(false);

  /* ── Live queue load ─────────────────────────────────────────── */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [flagsRes, tasksRes, convRes, partiesRes, invoicesRes, sellersRes, appealsRes, overviewRes, receiptsRes] =
        await Promise.all([
          fetchJson<{ data: Record<string, unknown>[] }>('/api/crm/needs-attention'),
          fetchJson<{ data: Record<string, unknown>[] }>('/api/crm/tasks'),
          fetchJson<{ data: Record<string, unknown>[] }>('/api/crm/conversations?status=open'),
          fetchJson<{ data: Record<string, unknown>[] }>('/api/parties'),
          fetchJson<{ data: Record<string, unknown>[] }>('/api/v1/documents?type=Invoice'),
          fetchJson<{ data: Record<string, unknown>[] }>('/api/sellers'),
          fetchJson<{ data: Record<string, unknown>[] }>('/api/sellers/appeals'),
          fetchJson<{ data: Record<string, unknown> }>('/api/accounting/overview'),
          fetchJson<{ data: Record<string, unknown>[] }>('/api/v1/documents?type=SalesReceipt'),
        ]);
      if (cancelled) return;

      const parties = partiesRes.ok ? partiesRes.data.data || [] : [];
      const partyName = new Map(parties.map(p => [String(p.id), String(p.displayName || p.name || 'Party')]));
      const now = Date.now();
      const today = new Date().toISOString().slice(0, 10);

      /* Attention: flags + overdue tasks + conversations awaiting reply */
      const attention: AttentionQueueItem[] = [];
      if (flagsRes.ok) {
        for (const f of flagsRes.data.data || []) {
          attention.push({
            id: `flag-${String(f.id)}`,
            refKind: 'flag',
            refId: String(f.id),
            code: String(f.issue_code || 'FLAG'),
            title: String(f.issue || 'Needs attention'),
            category: 'Support & RMA',
            severity: String(f.priority) === 'high' ? 'Critical' : 'For review',
            entity: partyName.get(String(f.customer_id || '')) || '—',
            owner: '—',
            impactAmount: 0,
            slaRemaining: f.due_by ? (new Date(String(f.due_by)).getTime() < now ? 'Overdue' : 'Due ' + fmtDate(String(f.due_by))) : '—',
            createdOn: fmtDateTime(String(f.created_at || '')),
            modifiedBy: '—',
            status: f.due_by && new Date(String(f.due_by)).getTime() < now ? 'SLA breach' : 'For review',
            targetDomain: 'support',
            targetScreen: 'attention',
            summary: String(f.recommendation || f.issue || ''),
          });
        }
      }
      if (tasksRes.ok) {
        for (const t of tasksRes.data.data || []) {
          if (String(t.status) === 'done' || String(t.status) === 'completed') continue;
          if (!t.due_at) continue;
          const due = new Date(String(t.due_at)).getTime();
          if (isNaN(due) || due >= now) continue;
          attention.push({
            id: `task-${String(t.id)}`,
            refKind: 'task',
            refId: String(t.id),
            code: 'TASK',
            title: String(t.title || 'Overdue task'),
            category: 'Orders & SLA',
            severity: String(t.priority) === 'high' ? 'Critical' : 'SLA warning',
            entity: partyName.get(String(t.customer_id || '')) || '—',
            owner: '—',
            impactAmount: 0,
            slaRemaining: 'Overdue',
            createdOn: fmtDateTime(String(t.created_at || '')),
            modifiedBy: '—',
            status: 'SLA breach',
            targetDomain: 'support',
            targetScreen: 'agent-workspace',
            summary: String(t.description || 'Overdue task'),
          });
        }
      }
      if (convRes.ok) {
        for (const c of convRes.data.data || []) {
          const lastMsg = c.last_message as { direction?: string } | null;
          const awaiting = lastMsg?.direction === 'inbound' || !!c.last_inbound_from;
          if (!awaiting) continue;
          attention.push({
            id: `conv-${String(c.id)}`,
            refKind: 'conversation',
            refId: String(c.id),
            code: 'CONV',
            title: String(c.subject || 'Conversation awaiting reply'),
            category: 'Support & RMA',
            severity: 'For review',
            entity: partyName.get(String(c.customer_id || '')) || 'Customer',
            owner: String(c.assigned_staff_name || '—'),
            impactAmount: 0,
            slaRemaining: '—',
            createdOn: fmtDateTime(String(c.started_at || c.created_at || '')),
            modifiedBy: '—',
            status: 'For review',
            targetDomain: 'support',
            targetScreen: 'messages',
            summary: 'Open conversation whose last word is the customer’s.',
          });
        }
      }
      setAttentionItems(attention);

      /* Customer queue: real customers with activity or a balance */
      const invoices = invoicesRes.ok ? invoicesRes.data.data || [] : [];
      const byCustomer = new Map<string, { orders: number; ltv: number; balance: number; lastOrder: string; overdue: boolean }>();
      for (const inv of invoices) {
        if (['void', 'written_off'].includes(String(inv.status))) continue;
        const cid = String(inv.customer_id || '');
        if (!cid) continue;
        const cur = byCustomer.get(cid) || { orders: 0, ltv: 0, balance: 0, lastOrder: '', overdue: false };
        const open = Math.max(0, Number(inv.total || 0) - Number(inv.amount_paid || 0) - Number(inv.amount_credited || 0));
        cur.orders++;
        cur.ltv += Number(inv.total || 0);
        cur.balance += open;
        const d = String(inv.invoice_date || '');
        if (d > cur.lastOrder) cur.lastOrder = d;
        if (open > 0 && String(inv.due_date || '') < today) cur.overdue = true;
        byCustomer.set(cid, cur);
      }
      const customers: CustomerQueueItem[] = [];
      for (const p of parties) {
        if (!((p.roles as string[]) || []).includes('customer')) continue;
        const agg = byCustomer.get(String(p.id));
        if (!agg || (agg.orders === 0 && agg.balance === 0)) continue;
        const daysSinceOrder = agg.lastOrder
          ? Math.floor((now - new Date(agg.lastOrder + 'T00:00:00').getTime()) / 86400000)
          : 9999;
        let bucket: CustomerQueueItem['queueBucket'];
        let status: CustomerQueueItem['status'];
        let reason: string;
        if (agg.overdue) {
          bucket = 'Overdue balance'; status = 'Overdue';
          reason = `Open balance ${agg.balance.toFixed(2)} past due`;
        } else if (agg.balance > 0 && daysSinceOrder > 30) {
          bucket = 'At risk'; status = 'At risk';
          reason = `No order in ${daysSinceOrder} days with a balance open`;
        } else if (agg.ltv >= 1000) {
          bucket = 'VIP / High LTV'; status = 'VIP';
          reason = `Lifetime value ${agg.ltv.toFixed(2)}`;
        } else {
          bucket = 'Needs follow-up'; status = 'Needs follow-up';
          reason = agg.balance > 0 ? `Open balance ${agg.balance.toFixed(2)}` : 'Recent order — check in';
        }
        customers.push({
          id: String(p.id),
          name: String(p.displayName || p.name || 'Customer'),
          email: String(p.email || ''),
          queueBucket: bucket,
          orders: agg.orders,
          ltv: agg.ltv,
          balance: agg.balance,
          lastOrder: agg.lastOrder ? fmtDate(agg.lastOrder) : '—',
          marketingConsent: 'No',
          source: 'Storefront',
          reason,
          owner: '—',
          createdOn: fmtDate(String(p.addedAt || '')),
          status,
        });
      }
      setCustomerQueueItems(customers);

      /* Seller queue: sellers with anything outstanding + pending appeals */
      const sellers: SellerQueueItem[] = [];
      if (sellersRes.ok) {
        for (const s of sellersRes.data.data || []) {
          const openViolations = Number(s.open_violations || 0);
          const pendingAppeals = Number(s.pending_appeals || 0);
          const taxStatus = String(s.tax_form_status || '');
          if (s.has_profile && openViolations === 0 && pendingAppeals === 0 && taxStatus !== 'pending' && taxStatus !== 'prompted') continue;
          const w9: SellerQueueItem['w9Status'] = taxStatus === 'received' || taxStatus === 'verified'
            ? 'Verified'
            : taxStatus === 'exempt'
              ? 'Exempt (Corp)'
              : 'Pending W-9';
          sellers.push({
            id: String(s.seller_id || s.id),
            seller: String(s.display_name || s.legal_name || 'Seller'),
            contactEmail: '',
            role: 'Marketplace Seller',
            stage: !s.has_profile ? 'Onboarding & KYB' : openViolations > 0 ? 'SLA & Quality' : 'Payouts & 1099',
            gmvOrSpend: Number(s.recorded_earnings || 0),
            takeOrMarginPct: 0,
            openItems: [
              openViolations ? `${openViolations} open violation${openViolations === 1 ? '' : 's'}` : '',
              pendingAppeals ? `${pendingAppeals} pending appeal${pendingAppeals === 1 ? '' : 's'}` : '',
              w9 === 'Pending W-9' ? 'W-9 outstanding' : '',
            ].filter(Boolean).join(' · ') || 'Onboarding incomplete',
            slaPct: openViolations === 0 ? 100 : 90,
            w9Status: w9,
            payoutHold: 0,
            updatedOn: fmtDate(String(s.created_at || '')),
            status: !s.has_profile ? 'Pending KYB' : w9 === 'Pending W-9' ? 'Pending W-9' : openViolations > 0 ? 'SLA warning' : 'Catalog review',
          });
        }
      }
      if (appealsRes.ok) {
        for (const a of appealsRes.data.data || []) {
          if (String(a.status) !== 'pending') continue;
          if (sellers.some(x => x.id === String(a.seller_id))) continue;
          sellers.push({
            id: String(a.seller_id),
            seller: 'Seller',
            contactEmail: '',
            role: 'Marketplace Seller',
            stage: 'SLA & Quality',
            gmvOrSpend: 0,
            takeOrMarginPct: 0,
            openItems: 'Appeal awaiting a decision',
            slaPct: 90,
            w9Status: 'Pending W-9',
            payoutHold: 0,
            updatedOn: fmtDate(String(a.created_at || '')),
            status: 'SLA warning',
          });
        }
      }
      setSellerQueueItems(sellers);

      /* Setup steps: completion from real platform state */
      const overview = overviewRes.ok ? overviewRes.data.data : null;
      const receipts = receiptsRes.ok ? receiptsRes.data.data || [] : [];
      setSetupSteps(prev => prev.map(step => {
        if (step.id === 'profile') {
          return {
            ...step,
            completed: parties.length > 0,
            fields: step.fields.map(f => /legal/i.test(f.label) ? { ...f, value: 'Unsaid' } : f),
          };
        }
        if (step.id === 'bank') {
          return { ...step, completed: Number(overview?.bankAccountCount || 0) > 0 };
        }
        if (step.id === 'payments') {
          return { ...step, completed: receipts.length > 0 };
        }
        return step;
      }));
    })();
    return () => { cancelled = true; };
  }, []);

  const openSetupWizard = useCallback((stepIdx = 0) => {
    setSetupWizardStepIndex(stepIdx);
  }, []);

  const closeSetupWizard = useCallback(() => {
    setSetupWizardStepIndex(null);
  }, []);

  /* Resolve: hit the real source record first, then mark locally. */
  const resolveAttentionItem = useCallback((id: string) => {
    setAttentionItems((prev) => {
      const item = prev.find((it) => it.id === id);
      if (item?.refKind && item.refId) {
        if (item.refKind === 'flag') {
          void fetchJson(`/api/crm/needs-attention/${item.refId}`, {
            method: 'PATCH',
            body: JSON.stringify({ status: 'resolved' }),
          });
        } else if (item.refKind === 'task') {
          void fetchJson(`/api/crm/tasks/${item.refId}`, {
            method: 'PATCH',
            body: JSON.stringify({ status: 'done' }),
          });
        } else if (item.refKind === 'conversation') {
          void fetchJson(`/api/crm/conversations/${item.refId}`, {
            method: 'PATCH',
            body: JSON.stringify({ status: 'resolved' }),
          });
        }
      }
      return prev.map((it) =>
        it.id === id
          ? { ...it, status: 'Resolved', slaRemaining: 'Completed' }
          : it
      );
    });
  }, []);

  /* Quick-task modal: create the real CRM task, then show it here. */
  const addAttentionTask = useCallback(async (item: AttentionQueueItem): Promise<boolean> => {
    const res = await fetchJson<{ data: { id: string } }>('/api/tasks', {
      method: 'POST',
      body: JSON.stringify({
        title: item.title,
        description: item.summary,
        priority: item.severity === 'Critical' ? 'high' : 'medium',
      }),
    });
    if (!res.ok) return false;
    const realId = res.data.data?.id;
    setAttentionItems((prev) => [
      {
        ...item,
        id: realId ? `task-${realId}` : item.id,
        refKind: 'task',
        refId: realId,
      },
      ...prev,
    ]);
    return true;
  }, []);

  /* Contractor/seller invite: create the real party record
     (contractors are 1099 vendors; sellers go through the sellers
     table pair; suppliers through suppliers). */
  const addSellerInvite = useCallback(async (item: SellerQueueItem): Promise<boolean> => {
    const role = item.role === 'Marketplace Seller' || item.role === 'Design Partner'
      ? 'seller'
      : item.role === 'POD Supplier'
        ? 'supplier'
        : 'vendor';
    const res = await fetchJson('/api/parties', {
      method: 'POST',
      body: JSON.stringify({
        role,
        name: item.seller,
        email: item.contactEmail || undefined,
        is1099: item.role === '1099 Contractor' ? true : undefined,
      }),
    });
    if (!res.ok) return false;
    setSellerQueueItems((prev) => [item, ...prev]);
    return true;
  }, []);

  const queueBadges = useMemo<Record<string, number>>(
    () => ({
      attention: attentionItems.filter((i) => i.status !== 'Resolved').length,
      'customer-queue': customerQueueItems.filter((i) => i.status !== 'Resolved')
        .length,
      'seller-queue': sellerQueueItems.filter((i) => i.status !== 'Approved')
        .length,
    }),
    [attentionItems, customerQueueItems, sellerQueueItems]
  );

  return {
    setupSteps,
    setSetupSteps,
    pinnedCreateActions,
    setPinnedCreateActions,
    attentionItems,
    setAttentionItems,
    customerQueueItems,
    setCustomerQueueItems,
    sellerQueueItems,
    setSellerQueueItems,
    setupWizardStepIndex,
    openSetupWizard,
    closeSetupWizard,
    customizeCreateOpen,
    setCustomizeCreateOpen,
    contractorModalOpen,
    setContractorModalOpen,
    quickTaskModalOpen,
    setQuickTaskModalOpen,
    resolveAttentionItem,
    addAttentionTask,
    addSellerInvite,
    queueBadges,
  };
}

export type DashboardController = ReturnType<typeof useDashboardController>;
