'use client';

/**
 * useTenantNav — hydrates GlobalShell's navigation from the database.
 *
 * Source of truth: GET /api/v1/nav — { data: { domains, actions }, meta }.
 *   - domains: 22 modules / 331 screens from platform_feature_tree_coverage
 *   - actions: 181 entries from platform_quick_action_registry
 *
 * Fallback: shellData.ts's static DOMAINS + (for CreateFlyout)
 * QuickActionsDrawer's ALL_ACTION_GROUPS. The app never breaks if the DB
 * is unreachable or the response shape drifts.
 *
 * The DB domains have a different shape than shellData's DomainConfig
 * (no icon, no bg, no ScreenType). `mergeDbDomains` layers them on top
 * of shellData's DOMAINS so the static styling + the design-studio
 * catalog tree stay intact while DB-driven screens surface in the
 * side rail. Append-only: static screens are never dropped, so any
 * already-open tab keeps resolving through findScreen.
 *
 * A module-level cache (60s TTL) shares one fetch across every consumer
 * on the page (GlobalShell, SideRail, CreateFlyout, …).
 */

import { useEffect, useState } from 'react';
import {
  DOMAINS,
  DomainConfig,
  DomainGroup,
  DomainKey,
  GroupBgToken,
  ScreenItem,
  ScreenType,
  ScreenWithGroup,
  findScreen as findScreenStatic,
  screensOf,
} from '@/data/shellData';

// ── DB shapes (returned by /api/v1/nav) ──
export interface DbScreen {
  id: string;
  label: string;
  module?: string;
  backingTable?: string | null;
  implemented?: boolean;
}

export interface DbGroup {
  id: string;
  label: string;
  screens: DbScreen[];
}

export interface DbDomain {
  key: string;
  label: string;
  groups: DbGroup[];
}

export interface DbAction {
  // /api/v1/nav shape (slim):
  display_name: string;
  kind?: string;
  area?: string;
  object_type?: string;
  implementation?: string;
  rpc_function?: string | null;
  target_table?: string | null;
  ui_route?: string | null;
  // /api/v1/tenant/actions shape (richer) — present when the legacy
  // endpoint is reused. Normalize on the consumer side.
  action_code?: string;
  module?: string;
  sort_order?: number;
  is_active?: boolean;
  required_access?: string;
}

export interface TenantNavMeta {
  domainCount: number;
  screenCount: number;
  actionCount: number;
}

export interface TenantNavResult {
  /** Merged map — shellData DOMAINS overlaid with DB-driven groups. */
  domains: Record<DomainKey, DomainConfig>;
  /** 181-action registry (empty until the fetch lands). */
  actions: DbAction[];
  loading: boolean;
  error: string | null;
  meta: TenantNavMeta | null;
  /** 'db' once the fetch resolved with data; 'fallback' otherwise. */
  source: 'db' | 'fallback';
}

// ── Module-level cache (one fetch per page lifetime) ──
interface CacheEntry {
  domains: Record<DomainKey, DomainConfig>;
  actions: DbAction[];
  meta: TenantNavMeta | null;
  ts: number;
}
let cache: CacheEntry | null = null;
let inflight: Promise<TenantNavResult> | null = null;
const CACHE_TTL_MS = 60_000;

const FALLBACK_BG: GroupBgToken = 'bg-qb-navy';

/**
 * DB domain key → static DomainKey. The DB calls the CRM module 'crm'
 * and the Design Studio module 'studio'; the app's static domains are
 * 'contacts' and 'design'. Every other DB domain gets its own key
 * (shellData.ts DomainKey lists all 22), so no module is ever dropped.
 * The same map resolves registry ui_route first segments ('/crm/...')
 * to the domain that actually renders them.
 */
export const DOMAIN_ALIASES: Record<string, DomainKey> = {
  crm: 'contacts',
  studio: 'design',
};

/** Resolve a DB/nav domain key (or a ui_route first segment) to the DomainKey that renders it. */
export function resolveDomainKey(key: string): DomainKey {
  return (DOMAIN_ALIASES[key] ?? key) as DomainKey;
}

/**
 * Layer DB-driven groups on top of shellData's DOMAINS. Append-only —
 * static screens are preserved, DB screens are added (deduped by id).
 * A DB domain with no static entry is ADDED as its own domain (label
 * from the DB) — dropping it hid 14 whole modules (LMS, CRM pipeline,
 * tasks, social, sales tax, business tax, community, marketplace,
 * payroll, advertising, cap table, platform) from the sidebar.
 *
 * DB screen ids are `<domain>-<group>--<slug>` (e.g.
 * `catalog-products-&-variants--blanks`) while static ids are the bare
 * slug (`blanks`). A raw id comparison therefore NEVER matches and the
 * same screen gets appended a second time — the sidebar showed every
 * Products & Variants item twice (19 instead of 9) and Channels 15
 * instead of 7. Normalize the DB id to the slug before deduping, and
 * only claim the static id when it lives in the group being merged
 * into — the same slug can denote a different page in another group
 * (Sources/Products is supplier_catalog_products, not the Products
 * list), so a foreign static id keeps its full DB id.
 */
const DB_ID_ALIASES: Record<string, string> = {
  // DB slug → static id for the same page under a different slug.
  'published-items-&-skus': 'published-skus',
  'suppliers----vendors----sellers': 'catalog-parties',
};

/** DB slugs that are not screens in the catalog sidebar at all. */
const CATALOG_DROP_SLUGS = new Set([
  'website----cms', // Website / CMS lives in Settings, not the Catalog domain.
  'catalog-review', // A quick action / review tab on the Products table, not a screen.
  'catalog-items', // A view on the products table, not a screen.
]);

function dbScreenSlug(dbId: string): string {
  const i = dbId.indexOf('--');
  return i >= 0 ? dbId.slice(i + 2) : dbId;
}

function collectIds(screens: ScreenItem[], into = new Set<string>()): Set<string> {
  for (const s of screens) {
    into.add(s.id);
    if (s.children?.length) collectIds(s.children, into);
  }
  return into;
}

/**
 * Domains whose nav is the designed static nav (Kim's pages) and
 * nothing else: mergeDbDomains skips these domains entirely, so no
 * registration — visible or hidden — ever lands in them. A
 * registration is a table, not a page. The remaining domains are
 * DB-driven modules whose page-level registrations ARE their pages;
 * even there, child registrations (below) never surface.
 */
const DESIGNED_DOMAIN_KEYS = new Set<string>([
  'dashboard',
  'marketing',
  'catalog',
  'design',
  'orders',
  'inventory',
  'finance',
  'contacts',
  'support',
  'settings',
  'reports',
  'connected-suppliers',
  'staff',
]);

export function mergeDbDomains(
  dbDomains: DbDomain[],
  base: Record<DomainKey, DomainConfig> = DOMAINS,
): Record<DomainKey, DomainConfig> {
  const result: Record<string, DomainConfig> = {};

  // Deep-clone the static map so we don't mutate the singleton.
  for (const key of Object.keys(base) as DomainKey[]) {
    const cfg = base[key];
    result[key] = {
      ...cfg,
      groups: cfg.groups.map((g) => ({
        ...g,
        screens: g.screens.map((s) => ({ ...s, ...(s.children ? { children: [...s.children] } : {}) })),
      })),
    };
  }

  const knownKeys = new Set<string>(Object.keys(base));

  // Every DB screen id in the payload. A screen whose id minus its
  // last `--segment` is itself a registered screen is a CHILD of that
  // screen — stages of a pipeline, stops of a route, blocked times of
  // appointments, score bands of lead scoring. A child is a table
  // inside its parent, never a sidebar page of its own.
  const allDbIds = new Set<string>();
  for (const d of dbDomains || []) {
    for (const g of d?.groups || []) {
      for (const s of g?.screens || []) {
        if (s?.id) allDbIds.add(s.id);
      }
    }
  }

  for (const dbd of dbDomains || []) {
    if (!dbd || !dbd.key) continue;
    // Alias crm → contacts, studio → design; any other DB domain
    // becomes its own domain instead of being dropped.
    const resolvedKey = resolveDomainKey(dbd.key);
    if (!knownKeys.has(resolvedKey)) {
      result[resolvedKey] = {
        label: dbd.label || resolvedKey,
        icon: 'play_circle',
        groups: [],
      };
      knownKeys.add(resolvedKey);
    }

    const cfg = result[resolvedKey as DomainKey];
    if (!cfg) continue;

    // Designed domains take NOTHING from the registry — not even
    // hidden. Their pages are the designed static nav, full stop; a
    // registration merged here only ever produced a dumped sidebar
    // entry or a generic drawer with database names. Unresolvable is
    // the correct state for a registration id in these domains.
    if (DESIGNED_DOMAIN_KEYS.has(resolvedKey)) continue;

    // All static ids in this domain (any group) — a normalized slug that
    // collides with one of these outside the target group keeps its DB id.
    const domainIds = new Set<string>();
    for (const g of cfg.groups) collectIds(g.screens, domainIds);

    // Static group that owns each id (children included) — per-screen
    // homing looks the slug's home group up here.
    const idToGroup = new Map<string, DomainGroup>();
    for (const g of cfg.groups) {
      const walk = (ss: ScreenItem[]) => {
        for (const s of ss) {
          if (!idToGroup.has(s.id)) idToGroup.set(s.id, g);
          if (s.children?.length) walk(s.children);
        }
      };
      walk(g.screens);
    }

    // Index static groups by lowercased label for collision detection.
    const staticByLabel = new Map<string, DomainGroup>();
    for (const g of cfg.groups) staticByLabel.set(g.name.toLowerCase(), g);

    for (const dbg of dbd.groups || []) {
      const label = (dbg.label || dbg.id || 'Group').trim();
      const lookupKey = label.toLowerCase();

      const dbScreens: ScreenItem[] = (dbg.screens || []).map((s) => {
        const cut = s.id.lastIndexOf('--');
        const parentId = cut >= 0 ? s.id.slice(0, cut) : null;
        const isChild = parentId !== null && allDbIds.has(parentId);
        return {
          id: s.id,
          dbId: s.id,
          label: s.label,
          type: 'list' as ScreenType,
          backingTable: s.backingTable ?? null,
          // Children never surface — a child is a table inside its
          // parent, not a page. (Designed domains never reach this
          // map at all; they are skipped above.)
          ...(isChild ? { hidden: true } : {}),
        };
      });
      const resolvedOf = (s: ScreenItem): string => {
        const slug = dbScreenSlug(s.id);
        return DB_ID_ALIASES[slug] ?? slug;
      };
      const droppable = (n: string) => dbd.key === 'catalog' && CATALOG_DROP_SLUGS.has(n);

      // Per-screen homing. A DB screen is the same screen as a static
      // one — skip it — when (a) its RAW id already exists in the domain
      // (DB 'support-overview' IS static 'support-overview'), or (b) its
      // normalized slug exists in the static group this DB group denotes
      // (DB 'catalog-products-&-variants--blanks' IS static 'blanks' in
      // the label-matched 'Products & Variants' group). The same slug in
      // a DIFFERENT group is a different page — Sources/Products reads
      // supplier_catalog_products, not the Products list — so it keeps
      // its full DB id and lands in its own group. Screens with no
      // static home at all join the label-matched group, or a new group
      // under the DB label. This is what kills the duplicates without
      // dropping genuinely new screens: the DB 'Catalog' group (just
      // Overview) adds nothing, 'Listing' and 'Sources' still appear,
      // and no id is listed twice in any domain.
      const homeless: ScreenItem[] = [];
      for (const s of dbScreens) {
        const resolved = resolvedOf(s);
        if (droppable(resolved)) continue;
        if (domainIds.has(s.id)) continue; // (a) raw id already listed
        const home = idToGroup.get(resolved);
        if (home && home.name.toLowerCase() === lookupKey) continue; // (b) same page
        const id = domainIds.has(resolved) ? s.id : resolved;
        if (homeless.some((x) => x.id === id)) continue;
        homeless.push({ ...s, id });
      }
      if (homeless.length === 0) continue;

      let target = staticByLabel.get(lookupKey);
      if (!target) {
        target = {
          name: label,
          icon: cfg.icon || 'play_circle',
          bg: FALLBACK_BG,
          screens: [],
        };
        cfg.groups.push(target);
        staticByLabel.set(lookupKey, target);
      }
      const seen = collectIds(target.screens);
      for (const s of homeless) {
        if (seen.has(s.id)) continue;
        target.screens.push(s);
        seen.add(s.id);
        domainIds.add(s.id);
        idToGroup.set(s.id, target);
      }
    }

    // Inherit the DB label when the static one was a placeholder.
    if (dbd.label && cfg.label && cfg.label.toLowerCase() === dbd.key) {
      // keep cfg.label (it's already human-readable)
    }
  }

  return result as Record<DomainKey, DomainConfig>;
}

/**
 * Tenant-aware findScreen — looks up the screen in the merged map first,
 * falls back to shellData's static findScreen (which handles design-catalog
 * path screens like studio-apparel--women--t-shirts and the all[0] final
 * fallback).
 */
export function findScreenIn(
  domains: Record<DomainKey, DomainConfig>,
  domainId: DomainKey,
  screenId: string,
): ScreenWithGroup {
  const domain = domains[domainId];
  if (domain) {
    const all = screensOf(domain);
    const found = all.find((s) => s.id === screenId);
    if (found) return found;
  }
  return findScreenStatic(domainId, screenId);
}

async function fetchTenantNav(): Promise<TenantNavResult> {
  try {
    const res = await fetch('/api/v1/nav', { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const data = json?.data;
    if (!data || !Array.isArray(data.domains) || !Array.isArray(data.actions)) {
      throw new Error('bad response shape');
    }
    const domains = mergeDbDomains(data.domains as DbDomain[], DOMAINS);
    const actions = data.actions as DbAction[];
    const meta = (json.meta || null) as TenantNavMeta | null;
    cache = { domains, actions, meta, ts: Date.now() };
    return {
      domains,
      actions,
      loading: false,
      error: null,
      meta,
      source: 'db',
    };
  } catch (err) {
    // Silent fallback to shellData — the app keeps working.
    return {
      domains: DOMAINS,
      actions: [],
      loading: false,
      error: err instanceof Error ? err.message : 'unknown',
      meta: null,
      source: 'fallback',
    };
  }
}

export function useTenantNav(): TenantNavResult {
  const [state, setState] = useState<TenantNavResult>(() => {
    // Hydration-safe initial state — never block first paint.
    if (cache && Date.now() - cache.ts < CACHE_TTL_MS) {
      return {
        domains: cache.domains,
        actions: cache.actions,
        loading: false,
        error: null,
        meta: cache.meta,
        source: 'db',
      };
    }
    return {
      domains: DOMAINS,
      actions: [],
      loading: true,
      error: null,
      meta: null,
      source: 'fallback',
    };
  });

  useEffect(() => {
    // Fresh cache → initial useState already reflected it. Skip the
    // effect entirely; no fetch, no setState, no cascading render.
    if (cache && Date.now() - cache.ts < CACHE_TTL_MS) {
      return;
    }

    let cancelled = false;
    if (!inflight) {
      inflight = fetchTenantNav().finally(() => {
        inflight = null;
      });
    }

    // All setState calls happen inside the async resolution — never
    // synchronously in the effect body. This avoids the cascading-render
    // lint rule (react-hooks/set-state-in-effect).
    inflight.then((result) => {
      if (cancelled) return;
      setState(result);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}

/** Group the 181-action registry by `area` for the Create flyout. The
 *  action shape from /api/v1/nav is slimmer than the legacy
 *  /api/v1/tenant/actions response — normalize `action_code` /
 *  `module` so consumers don't care which endpoint produced the row. */
export function groupActionsByArea(actions: DbAction[]): Record<string, DbAction[]> {
  const grouped: Record<string, DbAction[]> = {};
  for (const raw of actions || []) {
    const area = (raw.area || 'other').trim();
    if (!grouped[area]) grouped[area] = [];
    grouped[area].push({
      ...raw,
      action_code: raw.action_code || raw.display_name,
      module: raw.module || raw.area,
    });
  }
  // Stable order: alphabetical by area, then by display_name within.
  for (const area of Object.keys(grouped)) {
    grouped[area].sort((a, b) =>
      (a.display_name || '').localeCompare(b.display_name || ''),
    );
  }
  return grouped;
}
