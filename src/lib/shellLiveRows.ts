import { DEMO_ROWS } from '@/data/shellData';

/* Live rows for the shell's list screens (docs 10–12 redo, wiring
   only): the payroll / 1099s / contractors / payroll-tax list children
   render through SCREEN_DEFS + DEMO_ROWS — the same mechanism the
   published-skus merge uses in ScreenContent. These loaders fetch the
   real API data and replace those DEMO_ROWS keys with live rows in
   the exact column shapes the defs declare. Screens re-render on
   navigation, so the live rows appear when the user opens the child.
 *
 * Each loader is registered per key so a screen can refresh its own
 * rows after a mutation (refreshShellRows). Rows for API-backed keys
 * carry the record `id`, and SHELL_LIST_ENDPOINTS below is the
 * persistence bridge the generic list view uses for Delete /
 * Duplicate — without it those row actions were toast-only. */

const fmt = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-US') : '—');

interface PayRunDto {
  periodStart: string | null; periodEnd: string | null; payDate: string | null;
  status: string; grossTotal: number; netTotal: number; employeeTaxTotal: number;
  employerTaxTotal: number; glJournalEntryId: string | null;
}
interface Form1099Dto {
  vendorName: string; w9Received: boolean; totalPaid: number; meetsThreshold: boolean; status: string;
}
interface ContractorInviteDto { name: string | null; email: string | null; status: string }
interface PayrollTaxFormDto { formType: string; periodLabel: string | null; status: string }

async function getJson(url: string): Promise<Record<string, unknown>> {
  const r = await fetch(url);
  return (await r.json()) as Record<string, unknown>;
}

function loadPayrollRuns(): Promise<void> {
  return getJson('/api/payroll/runs')
    .then((json) => {
      const runs = (json.data || []) as PayRunDto[];
      if (runs.length) {
        DEMO_ROWS['payroll'] = runs.map((run) => ({
          period: run.periodStart && run.periodEnd ? `${fmtDate(run.periodStart)} – ${fmtDate(run.periodEnd)}` : '—',
          status: run.glJournalEntryId ? 'Posted' : run.status === 'approved' ? 'Approved' : run.status === 'paid' ? 'Paid' : 'Draft',
          payDate: fmtDate(run.payDate),
          gross: fmt(run.grossTotal),
          taxes: fmt(run.employeeTaxTotal + run.employerTaxTotal),
          net: fmt(run.netTotal),
        }));
      }
    })
    .catch(() => {});
}

function load1099s(): Promise<void> {
  return getJson('/api/tax/1099/summary?year=2026')
    .then((json) => {
      const payees = ((json.data as Record<string, unknown> | undefined)?.payees || []) as Form1099Dto[];
      if (payees.length) {
        DEMO_ROWS['1099s'] = payees.map((p) => ({
          contractor: p.vendorName,
          tin: p.w9Received ? 'On file' : 'Missing',
          ytd: fmt(p.totalPaid),
          threshold: p.meetsThreshold ? '$600 met' : 'Below $600',
          status: p.status && p.status !== 'not_generated' ? p.status : p.w9Received ? 'Ready' : 'Blocked',
        }));
        const inviteRows = payees.map((p) => ({
          name: p.vendorName,
          invite: 'Profile complete',
          w9: p.w9Received ? 'Yes' : 'No',
          paid: fmt(p.totalPaid),
          status: p.meetsThreshold ? 'Met' : 'Not met',
        }));
        fetch('/api/payroll/contractors')
          .then((r) => r.json())
          .then((cj) => {
            const invites = (cj.data || []) as ContractorInviteDto[];
            const known = new Set(inviteRows.map((r) => r.name));
            const extra = invites
              .filter((i) => !known.has(i.name || i.email || ''))
              .map((i) => ({
                name: i.name || i.email || '—',
                invite: i.status === 'accepted' ? 'Profile complete' : 'Invite sent',
                w9: '—',
                paid: '$0.00',
                status: 'Not met',
              }));
            DEMO_ROWS['contractors'] = [...inviteRows, ...extra];
          })
          .catch(() => { DEMO_ROWS['contractors'] = inviteRows; });
      }
    })
    .catch(() => {});
}

/* CMS (doc 25): banners / popups / pages / blocks / website hub.
   These keys have no demo rows at all — empty tables render the
   defs' honest empty states. */
function loadBanners(): Promise<void> {
  return getJson('/api/v1/marketing/banners')
    .then((json) => {
      const rows = (json.data || []) as Record<string, unknown>[];
      DEMO_ROWS['banners'] = rows.map((b) => ({
        id: String(b.id || ''),
        name: String(b.name || ''),
        placement: String(b.placement || '—'),
        headline: String(b.headline || '—'),
        status: b.is_active ? 'Active' : 'Off',
        window: b.starts_at || b.ends_at ? `${fmtDate(b.starts_at as string)} – ${fmtDate(b.ends_at as string)}` : 'Always',
      }));
    })
    .catch(() => {});
}

function loadPopups(): Promise<void> {
  return getJson('/api/v1/marketing/popups')
    .then((json) => {
      const rows = (json.data || []) as Record<string, unknown>[];
      DEMO_ROWS['popups'] = rows.map((p) => ({
        id: String(p.id || ''),
        name: String(p.name || ''),
        trigger: String(p.trigger_type || '—'),
        status: p.is_active ? 'Active' : 'Off',
        impressions: String(p.impressions ?? 0),
        conversions: String(p.conversions ?? 0),
      }));
    })
    .catch(() => {});
}

function loadCmsPages(): Promise<void> {
  return getJson('/api/cms/pages')
    .then((json) => {
      const pages = (json.data || []) as { id: string; title: string; slug: string; pageType: string | null; status: string; updatedAt: string }[];
      const mapped = pages.map((p) => ({
        id: p.id,
        title: p.title,
        slug: p.slug,
        type: p.pageType || 'page',
        status: p.status === 'published' ? 'Published' : p.status === 'archived' ? 'Archived' : 'Draft',
        updated: fmtDate(p.updatedAt),
      }));
      DEMO_ROWS['cms-pages'] = mapped;
      DEMO_ROWS['website-cms'] = mapped;
    })
    .catch(() => {});
}

function loadBlocks(): Promise<void> {
  return getJson('/api/cms/blocks')
    .then((json) => {
      const blocks = (json.data || []) as { id: string; blockId: string; componentType: string; slotId: string | null; status: string }[];
      DEMO_ROWS['content-blocks'] = blocks.map((b) => ({
        id: b.id,
        block: b.blockId,
        component: b.componentType,
        slot: b.slotId || '—',
        status: b.status === 'published' ? 'Published' : 'Draft',
      }));
    })
    .catch(() => {});
}

/* Support (doc 26): queues / SLA / automations / KB / docs /
   policies list children — real config tables, no demo rows. */
function loadQueues(): Promise<void> {
  return getJson('/api/support/queues')
    .then((json) => {
      const rows = (json.data || []) as { id: string; name: string; ownerType: string; isShared: boolean }[];
      DEMO_ROWS['queues'] = rows.map((x) => ({
        id: x.id,
        name: x.name,
        owner: x.ownerType,
        shared: x.isShared ? 'Shared' : 'Private',
      }));
    })
    .catch(() => {});
}

function loadSla(): Promise<void> {
  return getJson('/api/support/sla-policies')
    .then((json) => {
      const rows = (json.data || []) as { id: string; name: string; firstResponseMinutes: number | null; nextReplyMinutes: number | null; resolutionMinutes: number | null; isActive: boolean; isDefault: boolean }[];
      DEMO_ROWS['sla'] = rows.map((x) => ({
        id: x.id,
        name: x.name,
        first: x.firstResponseMinutes != null ? `${x.firstResponseMinutes}m` : '—',
        reply: x.nextReplyMinutes != null ? `${x.nextReplyMinutes}m` : '—',
        resolution: x.resolutionMinutes != null ? `${x.resolutionMinutes}m` : '—',
        status: !x.isActive ? 'Off' : x.isDefault ? 'Default' : 'Active',
      }));
    })
    .catch(() => {});
}

function loadAutomations(): Promise<void> {
  return getJson('/api/support/automations')
    .then((json) => {
      const rows = (json.data || []) as { id: string; name: string; triggerEvent: string; isActive: boolean; killSwitch: boolean }[];
      DEMO_ROWS['automations'] = rows.map((x) => ({
        id: x.id,
        name: x.name,
        trigger: x.triggerEvent,
        status: x.killSwitch ? 'Killed' : x.isActive ? 'Active' : 'Off',
      }));
    })
    .catch(() => {});
}

function loadKb(): Promise<void> {
  return getJson('/api/support/kb')
    .then((json) => {
      const rows = (json.data || []) as { id: string; title: string; collection: string; audience: string; status: string; usageCount: number }[];
      const mapped = rows.map((x) => ({
        id: x.id,
        title: x.title,
        collection: x.collection,
        audience: x.audience,
        status: x.status === 'published' ? 'Published' : 'Draft',
        usage: String(x.usageCount),
      }));
      DEMO_ROWS['trust'] = mapped;
      DEMO_ROWS['help-center'] = mapped.filter((x) => x.status === 'Published');
    })
    .catch(() => {});
}

function loadDocs(): Promise<void> {
  return getJson('/api/cms/pages')
    .then((json) => {
      const pages = (json.data || []) as { id: string; title: string; slug: string; status: string; updatedAt: string }[];
      DEMO_ROWS['docs'] = pages.map((p) => ({
        id: p.id,
        title: p.title,
        slug: p.slug,
        status: p.status === 'published' ? 'Published' : p.status === 'archived' ? 'Archived' : 'Draft',
        updated: fmtDate(p.updatedAt),
      }));
    })
    .catch(() => {});
}

function loadPolicies(): Promise<void> {
  return getJson('/api/support/policies')
    .then((json) => {
      const rows = (json.data || []) as { key: string; value: unknown; updatedAt: string }[];
      DEMO_ROWS['policies'] = rows.map((x) => ({
        key: x.key,
        value: typeof x.value === 'string' ? x.value : JSON.stringify(x.value),
        updated: fmtDate(x.updatedAt),
      }));
    })
    .catch(() => {});
}

function loadPayrollTax(): Promise<void> {
  return getJson('/api/payroll/tax-forms?year=2026')
    .then((json) => {
      const forms = (json.data || []) as PayrollTaxFormDto[];
      if (forms.length) {
        DEMO_ROWS['payroll_tax'] = forms.map((f) => ({
          quarter: f.periodLabel || '—',
          wages: '—',
          federal: '—',
          state: '—',
          due: '—',
          form: f.formType,
          status: f.status,
        }));
      }
    })
    .catch(() => {});
}

const KEY_LOADERS: Record<string, () => Promise<void>> = {
  payroll: loadPayrollRuns,
  '1099s': load1099s,
  contractors: load1099s,
  banners: loadBanners,
  popups: loadPopups,
  'cms-pages': loadCmsPages,
  'website-cms': loadCmsPages,
  'content-blocks': loadBlocks,
  queues: loadQueues,
  sla: loadSla,
  automations: loadAutomations,
  trust: loadKb,
  'help-center': loadKb,
  docs: loadDocs,
  policies: loadPolicies,
  payroll_tax: loadPayrollTax,
};

let started = false;

export function ensureLiveShellRows(): void {
  if (started || typeof window === 'undefined') return;
  started = true;
  for (const loader of new Set(Object.values(KEY_LOADERS))) void loader();
}

/** Re-fetch one list key's rows after a mutation so the screen shows
 *  the server's state, not a local guess. */
export async function refreshShellRows(key: string): Promise<void> {
  const loader = KEY_LOADERS[key];
  if (loader) await loader();
}

/* ── Persistence bridge for the generic list view ─────────────────
   Keys whose rows come from a real collection endpoint. Delete hits
   the collection's DELETE route; Duplicate re-POSTs the record's DTO
   (support config family only — CMS pages/banners carry unique
   slugs/campaign identity, so they are delete-only here). */
interface ShellListEndpoint {
  listUrl: string;
  deleteUrl: (id: string) => string;
  postUrl?: string;
}

const SHELL_LIST_ENDPOINTS: Record<string, ShellListEndpoint> = {
  queues: { listUrl: '/api/support/queues', deleteUrl: (id) => `/api/support/queues?id=${encodeURIComponent(id)}`, postUrl: '/api/support/queues' },
  sla: { listUrl: '/api/support/sla-policies', deleteUrl: (id) => `/api/support/sla-policies?id=${encodeURIComponent(id)}`, postUrl: '/api/support/sla-policies' },
  automations: { listUrl: '/api/support/automations', deleteUrl: (id) => `/api/support/automations?id=${encodeURIComponent(id)}`, postUrl: '/api/support/automations' },
  trust: { listUrl: '/api/support/kb', deleteUrl: (id) => `/api/support/kb?id=${encodeURIComponent(id)}`, postUrl: '/api/support/kb' },
  'help-center': { listUrl: '/api/support/kb', deleteUrl: (id) => `/api/support/kb?id=${encodeURIComponent(id)}`, postUrl: '/api/support/kb' },
  docs: { listUrl: '/api/cms/pages', deleteUrl: (id) => `/api/cms/pages/${encodeURIComponent(id)}` },
  'cms-pages': { listUrl: '/api/cms/pages', deleteUrl: (id) => `/api/cms/pages/${encodeURIComponent(id)}` },
  'website-cms': { listUrl: '/api/cms/pages', deleteUrl: (id) => `/api/cms/pages/${encodeURIComponent(id)}` },
  'content-blocks': { listUrl: '/api/cms/blocks', deleteUrl: (id) => `/api/cms/blocks/${encodeURIComponent(id)}` },
  banners: { listUrl: '/api/v1/marketing/banners', deleteUrl: (id) => `/api/v1/marketing/banners/${encodeURIComponent(id)}` },
  popups: { listUrl: '/api/v1/marketing/popups', deleteUrl: (id) => `/api/v1/marketing/popups/${encodeURIComponent(id)}` },
};

export function shellListEndpoint(key: string): ShellListEndpoint | null {
  return SHELL_LIST_ENDPOINTS[key] ?? null;
}

async function apiError(res: Response): Promise<string> {
  const json = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
  return json.error?.message || `Request failed (${res.status})`;
}

export async function shellListDelete(key: string, id: string): Promise<{ ok: boolean; error?: string }> {
  const ep = SHELL_LIST_ENDPOINTS[key];
  if (!ep) return { ok: false, error: 'This list is not API-backed' };
  const res = await fetch(ep.deleteUrl(id), { method: 'DELETE' });
  if (!res.ok) return { ok: false, error: await apiError(res) };
  return { ok: true };
}

export async function shellListDuplicate(key: string, id: string): Promise<{ ok: boolean; error?: string }> {
  const ep = SHELL_LIST_ENDPOINTS[key];
  if (!ep?.postUrl) return { ok: false, error: 'Duplicate is not available for this list' };
  const listRes = await fetch(ep.listUrl);
  if (!listRes.ok) return { ok: false, error: await apiError(listRes) };
  const listJson = (await listRes.json()) as { data?: Record<string, unknown>[] };
  const found = (listJson.data || []).find((r) => String(r.id) === id);
  if (!found) return { ok: false, error: 'Record not found' };
  const body: Record<string, unknown> = { ...found };
  delete body.id;
  const res = await fetch(ep.postUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) return { ok: false, error: await apiError(res) };
  return { ok: true };
}
