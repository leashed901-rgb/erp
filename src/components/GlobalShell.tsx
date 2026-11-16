'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  DOMAINS,
  DRAWER_FIELDS,
  DemoRow,
  DomainConfig,
  DomainKey,
  PINNED,
  screensOf,
} from '@/data/shellData';
import Header, { WorkspaceTab } from './Header';
import MainRail from './MainRail';
import SideRail from './SideRail';
import ScreenContent from './ScreenContent';
import PeekDrawer from './PeekDrawer';
import RecordDrawer from './RecordDrawer';
import StudioDrawer from './StudioDrawer';
import DocumentEngine, { DocTabType } from './DocumentEngine';
import PaymentModal, { type PaymentPrefill } from './PaymentModal';
import PartyFormDrawer from './contacts/PartyFormDrawer';
import type { DocumentType, PartyRole } from '@/lib/platformStore';
import { getEnvelope, clearEnvelope } from '@/lib/contextEnvelope';
import { fetchJson } from '@/hooks/useCrmApi';
import { useLiveQueueBadges } from '@/hooks/useQueueApi';
import { useStoredJson, useStoredString } from '@/hooks/useStoredPref';
import { useTenantNav, findScreenIn, resolveDomainKey, type DbAction } from '@/hooks/useTenantNav';
import CreateFlyout from './CreateFlyout';
import { ALL_ACTIONS_MAP } from './QuickActionsDrawer';
import GenericCreateDrawer from './GenericCreateDrawer';
import { TABLE_REGISTRY } from '@/lib/tableRegistry';
import { TABLE_POST_ROUTES } from '@/lib/tablePostRoutes';
import NavigationHubFlyout from './NavigationHubFlyout';
import {
  DEFAULT_FAVORITE_IDS,
  FAVORITES_STORAGE_KEY,
  QuickActionsDrawer,
} from './QuickActionsDrawer';
import { FavoritesFlyout, PinMode, BookmarkEntry } from './FavoritesFlyout';
import Toast from './Toast';
import MailQuickAction from './contacts/MailQuickAction';
import {
  DashboardOverlays,
  useDashboardController,
} from './dashboard/DashboardScreens';
import { useDesignCanvas, type DrawerId, type StudioView } from '@/lib/designCanvasStore';

function buildWorkspaceTab(
  domain: DomainKey,
  screenId: string,
  domains: Record<DomainKey, DomainConfig> = DOMAINS,
): WorkspaceTab {
  const scr = findScreenIn(domains, domain, screenId);
  const label = scr.label === 'Overview' ? `${scr.group} · Overview` : scr.label;
  return {
    key: `${domain}:${scr.id}`,
    domain,
    screenId: scr.id,
    label,
  };
}

/** Case-insensitive key lookup for the create-routing maps. Callers pass
 *  their own casing ('Payment Link' from the profile TXN menu vs
 *  'Payment link' in the registry) — one canonical key per action,
 *  regardless of who's asking. Whitespace is collapsed too. */
function ciKey(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}
function ciLookup<T>(map: Record<string, T>, key: string): T | undefined {
  if (Object.prototype.hasOwnProperty.call(map, key)) return map[key];
  const lk = ciKey(key);
  for (const k of Object.keys(map)) {
    if (ciKey(k) === lk) return map[k];
  }
  return undefined;
}

function createInitialOpenGroups(): Record<DomainKey, string[]> {
  const initial = {} as Record<DomainKey, string[]>;
  for (const key of PINNED) {
    initial[key] = [DOMAINS[key].groups[0].name];
  }
  initial.dashboard = ['Overview', 'Analytics', 'Queues'];
  initial.finance = [
    'Accounting',
    'Sales',
    'Expenses & Bills',
    'Business Tax',
    'Cap Table',
  ];
  initial.design = [
    'Studio',
    'Catalog',
    'My products',
    'My orders',
    'Create wizard',
  ];
  return initial;
}

// ── Dual pin (bookmark | favorite) persistence ──
const PIN_MODE_STORAGE_KEY = 'unsaid.rail.pinmode.v1';
const BOOKMARKS_STORAGE_KEY = 'unsaid.rail.bookmarks.v1';

const DEFAULT_BOOKMARKS: BookmarkEntry[] = [
  { domain: 'dashboard', screen: 'ops' },
  { domain: 'orders', screen: 'orders' },
  { domain: 'reports', screen: 'reports-overview' },
  { domain: 'finance', screen: 'coa' },
];

/* Bookmark validation — only entries pointing at real domains survive. */
function isValidBookmarkList(v: unknown): boolean {
  return Array.isArray(v);
}
function sanitizeBookmarks(list: BookmarkEntry[]): BookmarkEntry[] {
  return list.filter(
    (b): b is BookmarkEntry =>
      b &&
      typeof b.domain === 'string' &&
      typeof b.screen === 'string' &&
      !!DOMAINS[b.domain as DomainKey]
  );
}

function isNonEmptyStringArray(v: unknown): boolean {
  return Array.isArray(v) && v.every(x => typeof x === 'string');
}


/**
 * ProfileActionModal — the execution surface for the two personal
 * registry create actions: create.out_of_office and
 * create.notification_preference. Both write the operator's own rows
 * through /api/platform/profile; existing records list inline with
 * delete. All feedback renders in the modal — no toasts.
 */
function ProfileActionModal({ kind, onClose }: { kind: 'out-of-office' | 'notification-preference'; onClose: () => void }) {
  const isOoo = kind === 'out-of-office';
  const [records, setRecords] = useState<Record<string, unknown>[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; error: boolean } | null>(null);
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [message, setMessage] = useState('');
  const [eventType, setEventType] = useState('');
  const [channel, setChannel] = useState('email');
  const [enabled, setEnabled] = useState(true);
  const [digest, setDigest] = useState('');

  const load = useCallback(() => {
    fetch(`/api/platform/profile?kind=${kind}`)
      .then((r) => r.json())
      .then((j) => setRecords((j.data as Record<string, unknown>[]) || []))
      .catch(() => {});
  }, [kind]);
  useEffect(() => { load(); }, [load]);

  const submit = async () => {
    setBusy(true);
    setMsg(null);
    const body = isOoo
      ? { startsAt, endsAt, message, appliesTo: ['all'] }
      : { eventType, channel, enabled, digest: digest || undefined };
    try {
      const r = await fetch(`/api/platform/profile?kind=${kind}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      const j = await r.json();
      if (!r.ok || j.error) throw new Error(j.error?.message || 'Save failed');
      setMsg({ text: isOoo ? 'Out of office saved' : 'Notification preference saved', error: false });
      load();
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : 'Save failed', error: true });
    }
    setBusy(false);
  };

  const remove = async (id: string) => {
    await fetch(`/api/platform/profile?kind=${kind}&id=${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(() => {});
    load();
  };

  const inputCls = 'w-full h-9 px-3 border border-surface-dim rounded text-body-sm focus:outline-none focus:border-primary';
  const labelCls = 'block text-label-sm font-semibold mb-1';

  return (
    <div className="fixed inset-0 z-[9990] bg-black/40 flex items-center justify-center" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-[440px] max-w-[92vw] max-h-[88vh] overflow-y-auto p-5" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={isOoo ? 'Out of office' : 'Notification preference'}>
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-headline-sm">{isOoo ? 'Out of office' : 'Notification preference'}</h2>
          <button type="button" className="text-on-surface-variant" onClick={onClose} aria-label="Close">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <p className="text-body-sm text-on-surface-variant mb-4">
          {isOoo ? 'While you are away, work routes to your delegate and senders see your message.' : 'Choose which events reach you, and on which channel.'}
        </p>

        {isOoo ? (
          <div className="flex flex-col gap-3">
            <div className="flex gap-3">
              <div className="flex-1">
                <label className={labelCls} htmlFor="ooo-start">Starts</label>
                <input id="ooo-start" type="date" className={inputCls} value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
              </div>
              <div className="flex-1">
                <label className={labelCls} htmlFor="ooo-end">Ends</label>
                <input id="ooo-end" type="date" className={inputCls} value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
              </div>
            </div>
            <div>
              <label className={labelCls} htmlFor="ooo-msg">Message</label>
              <input id="ooo-msg" type="text" className={inputCls} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Out for the holidays — back Monday" />
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div>
              <label className={labelCls} htmlFor="np-event">Event type</label>
              <input id="np-event" type="text" className={inputCls} value={eventType} onChange={(e) => setEventType(e.target.value)} placeholder="ticket.assigned" />
            </div>
            <div className="flex gap-3">
              <div className="flex-1">
                <label className={labelCls} htmlFor="np-channel">Channel</label>
                <select id="np-channel" className={inputCls} value={channel} onChange={(e) => setChannel(e.target.value)}>
                  <option value="email">Email</option>
                  <option value="in_app">In app</option>
                  <option value="sms">SMS</option>
                </select>
              </div>
              <div className="flex-1">
                <label className={labelCls} htmlFor="np-digest">Digest</label>
                <select id="np-digest" className={inputCls} value={digest} onChange={(e) => setDigest(e.target.value)}>
                  <option value="">Instant</option>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                </select>
              </div>
            </div>
            <label className="flex items-center gap-2 text-body-sm">
              <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
              Enabled
            </label>
          </div>
        )}

        {msg && (
          <p role="status" className="text-body-sm mt-3" style={{ color: msg.error ? '#b3261e' : '#2e7d32' }}>{msg.text}</p>
        )}

        <div className="flex justify-end gap-2 mt-4">
          <button type="button" className="h-9 px-4 rounded border border-surface-dim text-label-md" onClick={onClose}>Close</button>
          <button
            type="button"
            className="h-9 px-4 rounded bg-primary text-white text-label-md disabled:opacity-50"
            disabled={busy || (isOoo ? !startsAt || !endsAt : !eventType)}
            onClick={() => void submit()}
          >
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>

        {records.length > 0 && (
          <div className="mt-5 border-t border-surface-dim pt-3">
            <h3 className="text-label-md font-semibold mb-2">{isOoo ? 'Your out-of-office records' : 'Your preferences'}</h3>
            {records.map((r) => (
              <div key={String(r.id)} className="flex items-center justify-between py-1.5 text-body-sm">
                <span>
                  {isOoo
                    ? `${new Date(String(r.starts_at)).toLocaleDateString()} → ${new Date(String(r.ends_at)).toLocaleDateString()}${r.message ? ` · ${String(r.message)}` : ''}`
                    : `${String(r.event_type)} · ${String(r.channel)}${r.enabled ? '' : ' · off'}`}
                </span>
                <button type="button" className="text-error text-label-sm" onClick={() => void remove(String(r.id))}>Delete</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function GlobalShell() {
  const dashboardController = useDashboardController();
  // DB-driven navigation — /api/v1/nav (22 domains / 331 screens / 181
  // actions). Falls back to shellData's static DOMAINS on any failure,
  // so the shell always boots even if Supabase is unreachable.
  const { domains: tenantDomains, actions: tenantActions } = useTenantNav();
  // Live sidebar badges — real queue counts from Supabase override the
  // controller's local placeholder numbers once the background fetch lands.
  const liveQueueBadges = useLiveQueueBadges();
  const {
    closeSetupWizard,
    setCustomizeCreateOpen,
    setContractorModalOpen,
    setQuickTaskModalOpen,
  } = dashboardController;
  const [activeDomain, setActiveDomain] = useState<DomainKey>('dashboard');
  const [activeScreen, setActiveScreen] = useState<string>('ops');
  const [openTabs, setOpenTabs] = useState<WorkspaceTab[]>(() => [
    buildWorkspaceTab('dashboard', 'ops'),
  ]);
  const [openGroupsByDomain, setOpenGroupsByDomain] = useState<
    Record<DomainKey, string[]>
  >(createInitialOpenGroups);
  const [sideFilter, setSideFilter] = useState<string>('');
  const [sideRailCollapsed, setSideRailCollapsed] = useState<boolean>(false);
  const [viewMode, setViewMode] = useState<'business' | 'accountant'>('business');

  // Full-screen focus mode — frees the page from sidebar + tab bar.
  const [focusMode, setFocusMode] = useState<boolean>(false);

  // Overlays & Drawers
  const [peekOpen, setPeekOpen] = useState<boolean>(false);
  const [peekRow, setPeekRow] = useState<DemoRow | null>(null);

  const [recordDrawerOpen, setRecordDrawerOpen] = useState<boolean>(false);
  const [recordKind, setRecordKind] = useState<string>('Invoice');
  // Generic table create — the one create drawer every table funnels
  // into when it has no bespoke form (see GenericCreateDrawer).
  const [genericCreate, setGenericCreate] = useState<{ table: string; title: string; screenKey?: string } | null>(null);
  // Bumped whenever a generic create saves, so the open list re-reads.
  const [listRefreshSignal, setListRefreshSignal] = useState<number>(0);
  const openGenericCreate = useCallback((table: string, title: string, screenKey?: string) => {
    setGenericCreate({ table, title, screenKey });
  }, []);
  const [recordRole, setRecordRole] = useState<PartyRole | null>(null);
  const [recordInit, setRecordInit] = useState<Record<string, unknown> | null>(null);
  const [recordSessionKey, setRecordSessionKey] = useState<number>(0);
  // Canonical party create (global Create flyout / quick actions) for roles
  // that live in real Supabase tables — the SAME PartyFormDrawer every
  // Contacts screen uses. Writes go to POST /api/parties, never a phantom
  // localStorage-only record.
  const [partyFormRole, setPartyFormRole] = useState<PartyRole | null>(null);
  // Design studio tool drawers (Upload / AI / Add text / …) — sidebar items
  // of type 'drawer' open these instead of workspace tabs.
  const [studioDrawerOpen, setStudioDrawerOpen] = useState<boolean>(false);
  const [studioDrawerKind, setStudioDrawerKind] = useState<string>('Upload');
  // Create Wizard prefill — when the wizard icon next to a catalog child is
  // clicked, we navigate to the wizard screen with the category/subcategory
  // pre-selected.
  const [wizardPrefill, setWizardPrefill] = useState<{ category: string; subcategory?: string } | null>(null);

  const [docEngineOpen, setDocEngineOpen] = useState<boolean>(false);
  const [docTab, setDocTab] = useState<DocTabType>('edit');
  const [docType, setDocType] = useState<DocumentType>('Invoice');
  const [docId, setDocId] = useState<string | null>(null);
  // Prefill: when a document is created FROM a party record (profile page,
  // row menu), the engine opens with that party already selected.
  const [docPartyId, setDocPartyId] = useState<string | null>(null);

  // Payment modal — opened from a customer profile's New Transaction →
  // Payment (or the row-menu Receive payment). Opens a focused payment
  // form (amount, method, apply-to-invoice, deposit-to) instead of the
  // DocumentEngine — the user isn't creating an invoice, they're
  // recording money received.
  const [paymentModalOpen, setPaymentModalOpen] = useState<boolean>(false);
  const [paymentPrefill, setPaymentPrefill] = useState<PaymentPrefill | null>(null);

  const [createFlyoutOpen, setCreateFlyoutOpen] = useState<boolean>(false);
  const [profileAction, setProfileAction] = useState<'out-of-office' | 'notification-preference' | null>(null);
  // Inbox rail badge = the operator's real unread notification count
  // (user_notifications via /api/tasks/notifications), refreshed on
  // navigation. Replaces the badge count the rail used to hardcode.
  const [inboxUnread, setInboxUnread] = useState<number>(0);
  useEffect(() => {
    let cancelled = false;
    fetch('/api/tasks/notifications')
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        const rows = (json.data || []) as { isRead: boolean }[];
        setInboxUnread(rows.filter((n) => !n.isRead).length);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [activeDomain, activeScreen]);
  const [navigationHubOpen, setNavigationHubOpen] = useState<boolean>(false);
  const [quickActionsDrawerOpen, setQuickActionsDrawerOpen] = useState<boolean>(false);
  const [favoritesFlyoutOpen, setFavoritesFlyoutOpen] = useState<boolean>(false);

  // Persisted UI prefs (localStorage) via useSyncExternalStore — the
  // hydration-safe primitive. Server + hydration render use the defaults;
  // the stored values stream in right after hydration. No mismatch, and no
  // setState-in-effect.
  const [favoriteIds, setFavoriteIds] = useStoredJson<string[]>(
    FAVORITES_STORAGE_KEY,
    DEFAULT_FAVORITE_IDS,
    isNonEmptyStringArray,
  );
  const [pinMode, setPinMode] = useStoredString<PinMode>(
    PIN_MODE_STORAGE_KEY,
    'bookmarks',
    (v) => v === 'bookmarks' || v === 'favorites',
  );
  const [railBookmarks, setRailBookmarks] = useStoredJson<BookmarkEntry[]>(
    BOOKMARKS_STORAGE_KEY,
    DEFAULT_BOOKMARKS,
    isValidBookmarkList,
    sanitizeBookmarks,
  );


  // ── Rail pins ↔ platform tables ──
  // Bookmarks are saved views (entity_type 'screen', filters carry
  // {domain, screen}); favorites are platform_create_favorites rows
  // keyed by the registry action_code (matched to Quick Actions items
  // by display name; the shell id is the fallback code).
  const bookmarkViewIds = useRef(new Map<string, string>());
  const codeForShellAction = useCallback((shellId: string): string => {
    const item = ALL_ACTIONS_MAP.get(shellId);
    if (!item) return shellId;
    const reg = (tenantActions || []).find((a) => a.display_name === item.name);
    return reg?.action_code || shellId;
  }, [tenantActions]);
  const shellIdForCode = useCallback((code: string): string => {
    const reg = (tenantActions || []).find((a) => a.action_code === code);
    if (reg) {
      for (const [id, item] of ALL_ACTIONS_MAP) if (item.name === reg.display_name) return id;
    }
    return code;
  }, [tenantActions]);

  const pinsHydrated = useRef(false);
  useEffect(() => {
    if (pinsHydrated.current) return;
    pinsHydrated.current = true;
    let cancelled = false;
    (async () => {
      try {
        const [viewsRes, favRes] = await Promise.all([
          fetch('/api/platform/customization?kind=views').then((r) => r.json()),
          fetch('/api/platform/customization?kind=favorites').then((r) => r.json()),
        ]);
        if (cancelled) return;
        const views = (viewsRes.data || []) as { id: string; entity_type: string; filters: { domain?: string; screen?: string } | null }[];
        const screenViews = views.filter((v) => v.entity_type === 'screen' && v.filters?.domain && v.filters?.screen);
        if (screenViews.length) {
          bookmarkViewIds.current = new Map(screenViews.map((v) => [`${v.filters!.domain}:${v.filters!.screen}`, v.id]));
          setRailBookmarks(screenViews.map((v) => ({ domain: v.filters!.domain as DomainKey, screen: v.filters!.screen as string })));
        }
        const favs = (favRes.data || []) as { action_code: string }[];
        if (favs.length) setFavoriteIds(favs.map((f) => shellIdForCode(f.action_code)));
      } catch { /* offline: localStorage cache stands */ }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const persistBookmark = useCallback((domain: DomainKey, screen: string) => {
    void fetch('/api/platform/customization', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'views', entityType: 'screen', name: screen, filters: { domain, screen }, isShared: false }),
    }).then((r) => r.json()).then((j) => {
      const id = (j.data as { id?: string } | undefined)?.id;
      if (id) bookmarkViewIds.current.set(`${domain}:${screen}`, id);
    }).catch(() => {});
  }, []);
  const persistUnbookmark = useCallback((domain: DomainKey, screen: string) => {
    const id = bookmarkViewIds.current.get(`${domain}:${screen}`);
    if (!id) return;
    bookmarkViewIds.current.delete(`${domain}:${screen}`);
    void fetch(`/api/platform/customization?kind=views&id=${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(() => {});
  }, []);
  const handleFavoriteIdsChange = useCallback((next: string[]) => {
    const prev = favoriteIds;
    setFavoriteIds(next);
    for (const id of next) {
      if (!prev.includes(id)) {
        void fetch('/api/platform/customization', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ kind: 'favorites', actionCode: codeForShellAction(id), sortOrder: next.indexOf(id) }),
        }).catch(() => {});
      }
    }
    for (const id of prev) {
      if (!next.includes(id)) {
        void fetch('/api/platform/customization', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ kind: 'favorites', actionCode: codeForShellAction(id), remove: true }),
        }).catch(() => {});
      }
    }
  }, [favoriteIds, setFavoriteIds, codeForShellAction]);

  // Toast
  const [mailOpen, setMailOpen] = useState(false);
  const [toastMsg, setToastMsg] = useState<string>('');
  const [toastVisible, setToastVisible] = useState<boolean>(false);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    setToastVisible(true);
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = setTimeout(() => {
      setToastVisible(false);
    }, 1800);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (createFlyoutOpen || docEngineOpen || quickActionsDrawerOpen) {
      document.body.style.overflow = 'hidden';
    } else if (!recordDrawerOpen && !studioDrawerOpen && !peekOpen) {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [createFlyoutOpen, navigationHubOpen, docEngineOpen, quickActionsDrawerOpen, recordDrawerOpen, studioDrawerOpen, peekOpen]);

  useEffect(() => {
    const handleDocClick = (e: MouseEvent) => {
      void e;
    };
    document.addEventListener('click', handleDocClick);
    return () => document.removeEventListener('click', handleDocClick);
  }, []);

  // When the session opens a drawer (openStudio with a drawer, or a tool
  // inside the Studio), open the StudioDrawer overlay with that kind.
  // The overlay is the drawer host; the store is the single source.
  useEffect(() => {
    const drawerLabel: Record<DrawerId, string> = {
      upload: 'Upload',
      ai: 'AI',
      text: 'Text',
      images: 'Images',
      graphics: 'Graphics',
      colors: 'Colors',
      library: 'My library',
      templates: 'My templates',
      inspiration: 'Inspiration',
    };
    const unsub = useDesignCanvas.subscribe((state) => {
      if (state.openDrawer) {
        const label = drawerLabel[state.openDrawer];
        if (label && (!studioDrawerOpen || studioDrawerKind !== label)) {
          setStudioDrawerKind(label);
          setStudioDrawerOpen(true);
        }
      }
    });
    return () => unsub();
  }, [studioDrawerOpen, studioDrawerKind]);

  // When a top-bar category is clicked (sets supplierCategory in the store),
  // open the StudioDrawer with the Supplier inspector kind — only on the
  // CHANGE, never on an unrelated store update (that re-opened the drawer
  // after the user closed it).
  useEffect(() => {
    let lastKey: string | null = null;
    const unsub = useDesignCanvas.subscribe((state) => {
      const key = state.supplierCategory
        ? `${state.supplierCategory.category}/${state.supplierCategory.subcategory}`
        : null;
      if (key && key !== lastKey) {
        lastKey = key;
        setStudioDrawerKind('Supplier');
        setStudioDrawerOpen(true);
      }
      if (!key) lastKey = null;
    });
    return () => unsub();
  }, []);

  // When the Design Queue button is clicked on the canvas top bar,
  // open the StudioDrawer with the Queue kind.
  useEffect(() => {
    const handler = () => {
      setStudioDrawerKind('Queue');
      setStudioDrawerOpen(true);
    };
    window.addEventListener('open-studio-queue', handler);
    return () => window.removeEventListener('open-studio-queue', handler);
  }, []);

  // When a queued product is clicked in the queue drawer, switch the
  // drawer kind to 'Supplier' (variant drawer).
  useEffect(() => {
    const handler = (e: Event) => {
      const kind = (e as CustomEvent).detail as string;
      setStudioDrawerKind(kind);
    };
    window.addEventListener('switch-studio-kind', handler);
    return () => window.removeEventListener('switch-studio-kind', handler);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        const anyOverlayOpen =
          createFlyoutOpen ||
          navigationHubOpen ||
          quickActionsDrawerOpen ||
          favoritesFlyoutOpen ||
          docEngineOpen ||
          recordDrawerOpen ||
          studioDrawerOpen ||
          peekOpen;
        setCreateFlyoutOpen(false);
        setNavigationHubOpen(false);
        setQuickActionsDrawerOpen(false);
        setFavoritesFlyoutOpen(false);
        setDocEngineOpen(false);
        setRecordDrawerOpen(false);
        setStudioDrawerOpen(false);
        setPeekOpen(false);
        setPartyFormRole(null);
        setPaymentModalOpen(false);
        setProfileAction(null);
        closeSetupWizard();
        setCustomizeCreateOpen(false);
        setContractorModalOpen(false);
        setQuickTaskModalOpen(false);
        // Esc exits focus mode only when no overlay was open on top of it.
        if (!anyOverlayOpen) {
          setFocusMode(false);
        }
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCreateFlyoutOpen(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    closeSetupWizard,
    setContractorModalOpen,
    setCustomizeCreateOpen,
    setQuickTaskModalOpen,
    createFlyoutOpen,
    navigationHubOpen,
    quickActionsDrawerOpen,
    favoritesFlyoutOpen,
    docEngineOpen,
    recordDrawerOpen,
    studioDrawerOpen,
    peekOpen,
  ]);

  const openOrActivateTab = useCallback((domain: DomainKey, screenId: string) => {
    const nextTab = buildWorkspaceTab(domain, screenId, tenantDomains);
    const targetScreen = findScreenIn(tenantDomains, domain, nextTab.screenId);
    setActiveDomain(domain);
    setActiveScreen(nextTab.screenId);
    setOpenGroupsByDomain((prev) => {
      const current = prev[domain] || [];
      if (current.includes(targetScreen.group)) return prev;
      return {
        ...prev,
        [domain]: [...current, targetScreen.group],
      };
    });
    setOpenTabs((prev) => {
      if (prev.some((t) => t.key === nextTab.key)) return prev;
      return [...prev, nextTab];
    });
  }, [tenantDomains]);

  // Boot from URL — standalone page view: /?view=<domain>:<screen>&focus=1
  // One-time hydration-time init from window.location (server HTML always
  // boots the default screen, then the effect swaps in the requested view).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const view = params.get('view');
    const screenParam = params.get('screen');
    // Support ?screen=studio-men and ?screen=new-design for direct URLs
    if (screenParam && !view) {
      const isStudio = screenParam === 'new-design' || screenParam.startsWith('studio-');
      const d: DomainKey = isStudio ? 'design' : 'dashboard';
      openOrActivateTab(d, screenParam);
    }
    if (view) {
      const sep = view.indexOf(':');
      if (sep > 0) {
        const d = view.slice(0, sep) as DomainKey;
        const s = view.slice(sep + 1);
        // Design catalog paths are DYNAMIC (studio-<dept>--<sub>--<subsub>
        // built from STOREFRONT_NAV, three levels deep) — they're not in
        // the static SCREEN_DEFS, but ScreenContent routes any studio-* id
        // through catalogNodeFor. Accept them so deep catalog links
        // (and the standalone-page button on them) boot correctly
        // instead of silently falling back to the Dashboard.
        const isDesignCatalogPath = d === 'design' && s.startsWith('studio-');
        if (
          tenantDomains[d] &&
          (isDesignCatalogPath ||
            screensOf(tenantDomains[d]).some((scr) => scr.id === s && scr.type !== 'drawer'))
        ) {
          openOrActivateTab(d, s);
        }
      }
    }
    if (params.get('focus') === '1') {
      setFocusMode(true);
    }
  }, [openOrActivateTab]);

  const handleSelectDomain = useCallback(
    (domain: DomainKey) => {
      const existingInDomain = [...openTabs]
        .reverse()
        .find((t) => t.domain === domain);
      if (existingInDomain) {
        openOrActivateTab(domain, existingInDomain.screenId);
      } else {
        // First tabbable screen — drawer-type items open tool panels, not tabs.
        const all = screensOf(tenantDomains[domain]);
        const firstScreen = all.find((s) => s.type !== 'drawer') ?? all[0];
        openOrActivateTab(domain, firstScreen.id);
      }
    },
    [openTabs, openOrActivateTab, tenantDomains]
  );

  const handleSelectScreen = useCallback(
    (screenId: string) => {
      // Design Studio children are launchers: each calls openStudio with a
      // view or a drawer (unified contract §3). The StudioDrawer overlay
      // opens from the store's openDrawer (effect below).
      const studioViewByScreen: Record<string, StudioView> = {
        'new-design': 'design',
        'product-page': 'product',
        'design-preview': 'preview',
      };
      // Sidebar labels are the drawer-panel contract — every Design child
      // (Upload / Images / Graphics / Add text / AI / Shapes / Themes) and
      // the My library children resolve to a real panel kind. The panel
      // opens as the canvas LEFT DOCK (store-driven, race-free).
      const drawerKindByLabel: Record<string, string> = {
        Upload: 'Upload',
        Images: 'Images',
        Graphics: 'Graphics',
        'Add text': 'Text',
        AI: 'AI',
        Shapes: 'Shapes',
        Themes: 'Themes',
        Inspiration: 'Inspiration',
        'My library': 'My library',
        'My templates': 'My templates',
        Text: 'Text',
        Colors: 'Colors',
      };
      if (activeDomain === 'design' && studioViewByScreen[screenId]) {
        void useDesignCanvas
          .getState()
          .openStudio({ entry: 'topnav', view: studioViewByScreen[screenId] });
        openOrActivateTab(activeDomain, screenId);
        return;
      }
      // Drawer-type sidebar items (design studio tools) dock their panel on
      // the canvas. Set the store FIRST (survives the navigation), then land
      // on the design canvas — the dock opens with the right panel. No
      // openStudio call: tool browsing needs no product guard and must not
      // double-open the overlay drawer.
      const screen = screensOf(tenantDomains[activeDomain]).find((s) => s.id === screenId);
      if (screen?.type === 'drawer' && activeDomain === 'design') {
        const kind = drawerKindByLabel[screen.label];
        if (kind) useDesignCanvas.getState().setCanvasDock(kind);
        openOrActivateTab('design', 'new-design');
        return;
      }
      openOrActivateTab(activeDomain, screenId);
    },
    [activeDomain, openOrActivateTab, tenantDomains]
  );

  const handleSelectTab = useCallback(
    (tab: WorkspaceTab) => {
      openOrActivateTab(tab.domain, tab.screenId);
    },
    [openOrActivateTab]
  );

  const handleCloseTab = useCallback(
    (tabKey: string) => {
      const activeKey = `${activeDomain}:${activeScreen}`;
      const idx = openTabs.findIndex((t) => t.key === tabKey);
      if (idx === -1) return;

      const remaining = openTabs.filter((t) => t.key !== tabKey);
      if (remaining.length === 0) {
        const fallback =
          tabKey === 'dashboard:ops'
            ? buildWorkspaceTab('finance', 'accounting')
            : buildWorkspaceTab('dashboard', 'ops');
        setOpenTabs([fallback]);
        setActiveDomain(fallback.domain);
        setActiveScreen(fallback.screenId);
        return;
      }

      setOpenTabs(remaining);
      if (tabKey === activeKey) {
        const nextActive = remaining[Math.min(idx, remaining.length - 1)];
        setActiveDomain(nextActive.domain);
        setActiveScreen(nextActive.screenId);
      }
    },
    [activeDomain, activeScreen, openTabs]
  );

  /** Tab right-click: close every tab except the one right-clicked, and
   *  activate it. */
  const handleCloseOtherTabs = useCallback(
    (tabKey: string) => {
      const tab = openTabs.find((t) => t.key === tabKey);
      if (!tab) return;
      setOpenTabs([tab]);
      setActiveDomain(tab.domain);
      setActiveScreen(tab.screenId);
    },
    [openTabs]
  );

  /** Tab right-click: close all tabs, landing back on the dashboard. */
  const handleCloseAllTabs = useCallback(() => {
    const fallback = buildWorkspaceTab('dashboard', 'ops');
    setOpenTabs([fallback]);
    setActiveDomain(fallback.domain);
    setActiveScreen(fallback.screenId);
  }, []);

  const handleToggleGroup = useCallback(
    (groupName: string) => {
      setOpenGroupsByDomain((prev) => {
        const current = prev[activeDomain] || [];
        const exists = current.includes(groupName);
        const nextGroups = exists
          ? current.filter((g) => g !== groupName)
          : [...current, groupName];
        return {
          ...prev,
          [activeDomain]: nextGroups,
        };
      });
    },
    [activeDomain]
  );

  const openDocEngine = useCallback((type: DocumentType, id: string | null = null, prefillPartyId?: string | null) => {
    setDocTab('edit');
    setDocType(type);
    setDocId(id);
    setDocPartyId(prefillPartyId ?? null);
    setDocEngineOpen(true);
  }, []);
  /* §1.3 return_to: closing the engine returns to the origin surface,
     then the envelope is cleared for the next context. */
  const closeDocEngine = useCallback(() => {
    setDocEngineOpen(false);
    setDocId(null);
    const env = getEnvelope();
    if (env.returnTo) {
      const [d, s] = env.returnTo.split(':');
      if (tenantDomains[d as DomainKey] && s) openOrActivateTab(d as DomainKey, s);
    }
    clearEnvelope();
  }, [openOrActivateTab, tenantDomains]);

  const openRecordDrawer = useCallback((kind: string) => {
    setRecordKind(kind);
    setRecordInit(null);
    setRecordSessionKey((c) => c + 1);
    setRecordDrawerOpen(true);
  }, []);

  const handleCapCreate = useCallback(
    (label: string) => {
      if (label === 'Share issuance' || label === 'Option grant') {
        openRecordDrawer(label === 'Share issuance' ? 'Invoice' : 'Product');
      } else {
        showToast(`Cap Table → Create ${label}`);
      }
    },
    [openRecordDrawer, showToast]
  );

  /* ── The definitive Create routing (platform-component-map.md PART 3) ──
     Every create action from the flyout, quick actions, and screens routes
     through here. Labels normalize to canonical keys, then:
       - Document types → DocumentEngine with the correct config
       - Records → RecordDrawer with the correct drawer def
       - Workspaces/lists → real screen navigation
     No dead links, no toasts pretending to be features.
     `prefill` carries the party a document is being created FOR (profile
     page / row menu): the engine opens with that party already selected. */
  const handleCreate = useCallback(
    (rawLabel: string | DbAction, prefill?: { partyName?: string; partyId?: string; source?: string; email?: string | null }) => {
      setCreateFlyoutOpen(false);
      // The Create flyout passes the full registry action; every other
      // caller passes a label string. Both resolve through the same maps.
      const action = (typeof rawLabel === 'object' && rawLabel !== null ? rawLabel : null) as DbAction | null;
      const rawName = action?.display_name ?? (rawLabel as string);

      // ── Normalize: map all quick-action / create-registry labels to canonical keys ──
      const normalizeMap: Record<string, string> = {
        // Customers
        'Create invoice': 'Invoice',
        'Create estimate': 'Estimate',
        'Create sales receipt': 'Sales receipt',
        'Create statement': 'Statement',
        'Create payment link': 'Payment link',
        'Create recurring payment': 'Recurring payment',
        'Recurring sales receipt': 'Recurring sales receipt',
        'Record payment': 'Receive payment',
        'Get paid online': 'Receive payment',
        'Add customer': 'Add customer',
        // Profile TXN menu passes its own casing — normalize here so every
        // menu item lands on a real flow, never the fallback toast.
        'Payment': 'Receive payment',
        // Sales / orders module labels
        'Order': 'Sales order',
        'New transaction': 'Invoice',
        // Vendors
        'Record expense': 'Expense',
        'Create check': 'Check',
        'Create bill': 'Bill',
        'Pay bills': 'Pay bills',
        'Add vendor': 'Add vendor',
        'Print checks': 'Print checks',
        'Recurring bill': 'Recurring bill',
        'Upload multiple bills': 'Upload multiple bills',
        'Schedule online payment': 'Schedule online payment',
        'Create vendor credit': 'Vendor credit',
        // Team
        'Add employee': 'Add employee',
        'Add time entry': 'Time entry',
        // Books
        'Get Live Bookkeeping': 'Live bookkeeping',
        'Add bank deposit': 'Bank deposit',
        'Add product or service': 'Add product/service',
        'Create journal entry': 'Journal entry',
        // Tax
        'Create tax return': 'Tax return',
        'Bookkeeper tax review': 'Tax review',
        'Download tax summary': 'Download tax summary',
        // Inventory / Catalog / Support
        'Add inventory item': 'Add product/service',
        'Design Studio': 'Design',
        'Open Support Ticket': 'Ticket',
        'Publish Design': 'Publish design',
        'Create Social Post': 'Post',
      };
      const label = ciLookup(normalizeMap, rawName) || rawName;

      // ── Document types → Document Engine with the correct config ──
      const docTypeMap: Record<string, DocumentType> = {
        'Invoice': 'Invoice',
        'Estimate': 'Estimate',
        'Sales receipt': 'SalesReceipt',
        'Credit memo': 'CreditMemo',
        'Sales order': 'SalesOrder',
        'Bill': 'Bill',
        'Check': 'Check',
        'Expense': 'Expense',
        'Purchase order': 'PurchaseOrder',
        'Vendor credit': 'VendorCredit',
        'Journal entry': 'JournalEntry',
        'Return/RMA': 'RMA',
        'Void': 'Invoice', // Void opens the doc engine on the first voidable doc — screens pass ids
        // Inventory operations are booked as journal entries (double-entry
        // adjustments: shrinkage, bin transfers, count variances).
        'Stock adjustment': 'JournalEntry',
        'Adjustment': 'JournalEntry',
        'Transfer': 'JournalEntry',
        'Cycle count': 'JournalEntry',
        // Restock / reorder / receive all funnel into the PO engine.
        'Restock suggestions': 'PurchaseOrder',
        'Reorder POs': 'PurchaseOrder',
        'Receive items': 'PurchaseOrder',
      };

      // ── Payment: open the PaymentModal, NOT the DocumentEngine ──
      // When the user clicks "Payment" from a customer profile (or "Receive
      // payment" from a row menu), they're recording money received — not
      // creating an invoice or a sales receipt. The modal has amount,
      // payment method (cash/check/card/Stripe/ACH), apply-to-invoice,
      // deposit-to, and settlement status (settled vs pending for Stripe
      // payouts). It persists via the receive endpoint /
      // payment_transactions.
      if (label === 'Receive payment') {
        setPaymentPrefill({
          partyId: prefill?.partyId || undefined,
          partyName: prefill?.partyName || undefined,
          source: prefill?.source,
          email: prefill?.email ?? null,
        });
        setPaymentModalOpen(true);
        return;
      }

      const asDoc = ciLookup(docTypeMap, label);
      if (asDoc && label !== 'Void') {
        // §1.3 Context Envelope — creating from a party record prefills
        // the engine's party picker with the REAL record id (callers
        // pass Supabase ids). A name-only prefill resolves against
        // GET /api/parties; if it cannot be resolved the engine opens
        // unprefilled rather than inventing a placeholder party.
        if (prefill?.partyId) {
          openDocEngine(asDoc, null, prefill.partyId);
        } else if (prefill?.partyName) {
          const wanted = prefill.partyName.toLowerCase();
          fetchJson<{ data: { id: string; displayName?: string; name?: string }[] }>('/api/parties')
            .then(res => {
              const match = res.ok ? (res.data.data || []).find(x => (x.displayName || x.name || '').toLowerCase() === wanted) : undefined;
              openDocEngine(asDoc, null, match?.id ?? null);
            })
            .catch(() => openDocEngine(asDoc, null, null));
        } else {
          openDocEngine(asDoc, null, null);
        }
        return;
      }

      // ── Workspaces & lists → real screen navigation ──
      const navigateMap: Record<string, [DomainKey, string]> = {
        'Pay bills': ['finance', 'bill-payments'],
        'Schedule online payment': ['finance', 'bill-payments'],
        'Upload multiple bills': ['finance', 'bills'],
        'Recurring bill': ['finance', 'bills'],
        'Receive payment': ['finance', 'invoices'],
        'Payment link': ['finance', 'payment-links'],
        'Statement': ['finance', 'statements'],
        'Recurring payment': ['finance', 'invoices'],
        'Recurring sales receipt': ['finance', 'sales-transactions'],
        'Print checks': ['finance', 'bill-payments'],
        'Bank deposit': ['finance', 'accounting'],
        'Reconcile': ['finance', 'reconcile'],
        'Tax return': ['finance', 'tax-filing'],
        'Tax review': ['finance', 'tax-overview'],
        'Download tax summary': ['finance', 'tax-summary'],
        'Live bookkeeping': ['finance', 'accounting'],
        'Purchase orders': ['finance', 'purchase-orders'],
        // Business tax module actions → the real tax screens
        'Tax summary': ['finance', 'tax-summary'],
        'Estimated payment': ['finance', 'tax-filing'],
        'Tax payment': ['finance', 'tax-filing'],
        'File extension': ['finance', 'tax-filing'],
        // CRM Appointments — the create flyout lands on the calendar screen.
        'Appointment': ['contacts', 'appointments'],
      };
      const navTarget = ciLookup(navigateMap, label);
      if (navTarget) {
        openOrActivateTab(navTarget[0], navTarget[1]);
        return;
      }

      // ── Party creation — THE canonical Supabase drawer ──
      // Customer/Vendor/Supplier/Lead/Seller live in real Supabase tables
      // (crm_customers / acct_vendors / suppliers / crm_leads / sellers +
      // seller_self_serve_profiles): their create flows open the same
      // PartyFormDrawer every Contacts screen uses → POST /api/parties.
      // Contractors use the contractor modal.
      const partyKinds: Record<string, PartyRole> = {
        'Add customer': 'Customer',
        'Customer': 'Customer',
        'Add vendor': 'Vendor',
        'Vendor': 'Vendor',
        'Add supplier': 'Supplier',
        'Supplier': 'Supplier',
        'Add lead': 'Lead',
        'Lead': 'Lead',
        'Add contractor': 'Contractor',
        'Contractor': 'Contractor',
        'Party': 'Customer',
        'Add seller': 'Seller',
        'Seller': 'Seller',
      };
      const partyRole = ciLookup(partyKinds, label);
      if (partyRole) {
        if (partyRole === 'Contractor') {
          setContractorModalOpen(true);
        } else {
          // Seller is a contact type — same canonical drawer, same POST
          // /api/parties contract, rows land in the sellers table pair.
          setPartyFormRole(partyRole);
        }
        return;
      }
      if (label === 'Add employee') {
        setRecordKind('Party');
        setRecordRole('Contractor');
        setRecordSessionKey((c) => c + 1);
        setRecordDrawerOpen(true);
        return;
      }

      // ── Item / Account drawers ──
      if (label === 'Add product/service' || label === 'Product' || label === 'Add inventory item') {
        setRecordKind('Item');
        setRecordRole(null);
        setRecordInit(null);
        setRecordSessionKey((c) => c + 1);
        setRecordDrawerOpen(true);
        return;
      }
      if (label === 'Service' || label === 'Bundle') {
        // Same Item drawer with the type prefilled (ItemType enum).
        setRecordKind('Item');
        setRecordRole(null);
        setRecordInit({ type: label });
        setRecordSessionKey((c) => c + 1);
        setRecordDrawerOpen(true);
        return;
      }
      if (label === 'Add account' || label === 'Account') {
        setRecordKind('Account');
        setRecordRole(null);
        setRecordInit(null);
        setRecordSessionKey((c) => c + 1);
        setRecordDrawerOpen(true);
        return;
      }
      if (label === 'Category') {
        setRecordKind('Category');
        setRecordRole(null);
        setRecordInit(null);
        setRecordSessionKey((c) => c + 1);
        setRecordDrawerOpen(true);
        return;
      }

      // ── Task / Note / Time (§ Tasks module) ──
      if (label === 'Task' || label === 'Add note' || label === 'Time entry') {
        setQuickTaskModalOpen(true);
        return;
      }

      // ── Ticket (Support drawer) ──
      if (label === 'Ticket') {
        setRecordKind('Ticket');
        setRecordRole(null);
        setRecordInit(null);
        setRecordSessionKey((c) => c + 1);
        setRecordDrawerOpen(true);
        return;
      }

      // ── Studio & marketing surfaces (existing screens) ──
      const studioLabels = new Set(['Design', 'Collection', 'Publish design']);
      if (studioLabels.has(label)) {
        openOrActivateTab('design', 'new-design');
        return;
      }
      const marketingNav: Record<string, [DomainKey, string]> = {
        'Banner': ['marketing', 'mkt-banners'],
        'Popup': ['marketing', 'mkt-banners'],
        'Discount code': ['marketing', 'mkt-promotions'],
        'Campaign': ['marketing', 'mkt-campaigns'],
        'Post': ['marketing', 'mkt-create-content'],
        'Newsletter': ['marketing', 'mkt-newsletter'],
      };
      const mktTarget = marketingNav[label];
      if (mktTarget) {
        openOrActivateTab(mktTarget[0], mktTarget[1]);
        return;
      }

      // ── Fallback: if DRAWER_FIELDS has it, open drawer (canonical key) ──
      const drawerKey = Object.keys(DRAWER_FIELDS).find(k => ciKey(k) === ciKey(label));
      if (drawerKey) {
        openRecordDrawer(drawerKey);
        return;
      }

      // ── Registry resolution: the action knows its own table + route.
      //  A table with an insert path opens the generic create drawer
      //  directly; otherwise we open the screen the registry points at
      //  (matched by backing table, then id slug, then label). No
      //  create action ends in a toast pretending to be a feature.
      if (action) {
        const table = action.target_table ?? null;
        if (table && (TABLE_REGISTRY[table]?.writable || TABLE_POST_ROUTES[table])) {
          openGenericCreate(table, action.display_name);
          return;
        }
        const route = action.ui_route || '';
        const segs = route.split('/').filter(Boolean);
        if (segs.length > 0) {
          const domain = resolveDomainKey(segs[0]);
          const screens = tenantDomains[domain] ? screensOf(tenantDomains[domain]) : [];
          const slug = segs[segs.length - 1];
          const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
          const byTable = table ? screens.find((s) => (s as { backingTable?: string | null }).backingTable === table) : undefined;
          const byId = screens.find((s) => s.id === slug || s.id === `${domain}-${slug}` || s.id.endsWith(`--${slug}`) || s.id.endsWith(`-${slug}`));
          const byLabel = screens.find((s) => norm(s.label) === norm(slug) || (action.object_type ? norm(s.label) === norm(action.object_type) : false));
          const hit = byTable || byId || byLabel;
          if (hit) {
            openOrActivateTab(domain, hit.id);
            return;
          }
          if (screens.length > 0) {
            openOrActivateTab(domain, screens[0].id);
            return;
          }
        }
      }

      showToast(`No create flow for ${label} yet`);
    },
    [
      openDocEngine,
      openOrActivateTab,
      openRecordDrawer,
      openGenericCreate,
      tenantDomains,
      setContractorModalOpen,
      setQuickTaskModalOpen,
      showToast,
    ]
  );

  const handleRailAction = useCallback(
    (id: string) => {
      if (id === 'allapps') {
        // All apps → Enterprise Navigation Hub (routing), NOT create.
        setNavigationHubOpen(true);
      } else if (id === 'customize' || id === 'favorites') {
        // The star (favorites/bookmarks) pin toggles the favorites flyout.
        setFavoritesFlyoutOpen((prev) => !prev);
      } else if (id === 'reports') {
        // Reports is its own standalone, cross-module view — NOT tied to
        // accounting/finance. Broken down by every module inside the reports
        // domain.
        openOrActivateTab('reports', 'reports-overview');
      } else if (id === 'inbox') {
        // Mail is a QUICK ACTION (Kim, 2026-11-15): the rail icon
        // opens the compose overlay — pick a party, start from a
        // template, send. It is not a screen and not part of CRM.
        setMailOpen(true);
      } else if (id === 'tasks') {
        // Tasks & calendar → opens the Tasks & Projects page (full screen).
        openOrActivateTab('dashboard', 'tasks');
      } else if (id === 'home') {
        openOrActivateTab('dashboard', 'ops');
      } else {
        showToast(`Rail → ${id}`);
      }
    },
    [openOrActivateTab, showToast]
  );

  const handleUtilAction = useCallback(
    (id: string) => {
      if (id === 'settings') {
        openOrActivateTab('settings', 'ws-home');
        setCreateFlyoutOpen(false);
      } else {
        showToast(`Utility → ${id}`);
      }
    },
    [openOrActivateTab, showToast]
  );

  // ── Page-level view controls (below the tab bar, on every page) ──
  const handleOpenStandalone = useCallback(() => {
    window.open(`/?view=${activeDomain}:${activeScreen}&focus=1`, '_blank');
  }, [activeDomain, activeScreen]);

  const handleToggleFocus = useCallback(() => {
    setFocusMode((prev) => {
      const next = !prev;
      showToast(next ? 'Full screen — press Esc to exit' : 'Exited full screen');
      return next;
    });
  }, [showToast]);

  // ── Dual pin handlers (setters persist + notify via the stored-pref hook) ──
  const handlePinModeChange = useCallback((mode: PinMode) => {
    setPinMode(mode);
  }, [setPinMode]);

  const handleAddBookmark = useCallback((domain: DomainKey, screen: string) => {
    setRailBookmarks(prev =>
      prev.some((b) => b.domain === domain && b.screen === screen)
        ? prev
        : [...prev, { domain, screen }],
    );
    persistBookmark(domain, screen);
  }, [setRailBookmarks, persistBookmark]);

  const handleRemoveBookmark = useCallback((domain: DomainKey, screen: string) => {
    setRailBookmarks(prev => prev.filter((b) => !(b.domain === domain && b.screen === screen)));
    persistUnbookmark(domain, screen);
  }, [setRailBookmarks, persistUnbookmark]);

  const activeTabKey = `${activeDomain}:${activeScreen}`;

  return (
    <>
      <Header
        openTabs={openTabs}
        activeTabKey={activeTabKey}
        onSelectTab={handleSelectTab}
        onCloseTab={handleCloseTab}
        onCloseOtherTabs={(tab) => handleCloseOtherTabs(tab.key)}
        onCloseAllTabs={handleCloseAllTabs}
        onBookmarkTab={(tab) => {
          handleAddBookmark(tab.domain, tab.screenId);
        }}
        onOpenTabStandalone={(tab) => {
          window.open(`/?view=${tab.domain}:${tab.screenId}&focus=1`, '_blank');
        }}
        onOpenCreateFlyout={() => setCreateFlyoutOpen(true)}
        onOpenNavigationHub={() => setNavigationHubOpen(true)}
        onOpenSettings={(screenId) => openOrActivateTab('settings', screenId ?? 'ws-home')}
        viewMode={viewMode}
        onChangeViewMode={(mode) => {
          setViewMode(mode);
          showToast(`Switched to ${mode} view`);
        }}
        onToast={showToast}
        hideTabs={focusMode}
      />

      {!focusMode && (
        <MainRail
          activeDomain={activeDomain}
          onSelectDomain={handleSelectDomain}
          onOpenCreateFlyout={() => setCreateFlyoutOpen(true)}
          onRailAction={handleRailAction}
          onUtilAction={handleUtilAction}
          favoritesCount={favoriteIds.length}
          pinMode={pinMode}
          bookmarksCount={railBookmarks.length}
          favoritesOpen={favoritesFlyoutOpen}
          onToggleFavorites={() => setFavoritesFlyoutOpen((prev) => !prev)}
          inboxBadge={inboxUnread}
        />
      )}

      {!focusMode && activeDomain !== 'dashboard' && (
        <SideRail
          activeDomain={activeDomain}
          activeScreen={activeScreen}
          openGroups={openGroupsByDomain[activeDomain] || []}
          sideFilter={sideFilter}
          onSideFilterChange={setSideFilter}
          onToggleGroup={handleToggleGroup}
          onSelectScreen={handleSelectScreen}
          collapsed={sideRailCollapsed}
          onToggleCollapse={() => setSideRailCollapsed((prev) => !prev)}
          screenBadges={{ ...dashboardController.queueBadges, ...(liveQueueBadges || {}) }}
          domains={tenantDomains}
          onLaunchWizard={(category, subcategory) => {
            setWizardPrefill({ category, subcategory });
            openOrActivateTab('design', 'studio-wizard');
          }}
          onOpenWorkspace={() => openOrActivateTab('settings', 'ws-home')}
          onExportWorkspace={async () => {
            try {
              const res = await fetch('/api/platform/export');
              if (!res.ok) throw new Error('Export failed');
              const blob = await res.blob();
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `unleashe-export-${new Date().toISOString().slice(0, 10)}.json`;
              document.body.appendChild(a);
              a.click();
              a.remove();
              URL.revokeObjectURL(url);
              showToast('Workspace export downloaded');
            } catch {
              showToast('Workspace export failed');
            }
          }}
        />
      )}

      <ScreenContent
        openTabs={openTabs}
        activeTabKey={activeTabKey}
        domains={tenantDomains}
        dashboardController={dashboardController}
        onNavigate={openOrActivateTab}
        onCapCreate={handleCapCreate}
        onCreate={handleCreate}
        onCreateTable={openGenericCreate}
        listRefreshSignal={listRefreshSignal}
        onOpenCreateFlyout={() => setCreateFlyoutOpen(true)}
        onOpenDocument={openDocEngine}
        onOpenPeek={(row) => {
          setPeekRow(row);
          setPeekOpen(true);
        }}
        onToast={showToast}
        sideRailCollapsed={activeDomain === 'dashboard' ? true : sideRailCollapsed}
        focusMode={focusMode}
        onToggleFocus={handleToggleFocus}
        onOpenStandalone={handleOpenStandalone}
        wizardPrefill={wizardPrefill}
      />

      <GenericCreateDrawer
        open={genericCreate !== null}
        table={genericCreate?.table ?? null}
        title={genericCreate?.title ?? ''}
        screenKey={genericCreate?.screenKey}
        onClose={() => setGenericCreate(null)}
        onSaved={() => setListRefreshSignal((n) => n + 1)}
        onToast={showToast}
      />

      <DashboardOverlays controller={dashboardController} onToast={showToast} />

      <PeekDrawer
        open={peekOpen}
        row={peekRow}
        onClose={() => setPeekOpen(false)}
        onToast={showToast}
        onOpenFull={() => {
          setPeekOpen(false);
          // Open the real document in the engine when the row maps to
          // one: the row's id is probed against the Document Engine.
          const docId = peekRow && (peekRow.documentId || peekRow.id) ? String(peekRow.documentId || peekRow.id) : null;
          const guess = (peekRow?.docType as DocumentType) || 'Invoice';
          if (!docId) { showToast('This record has no document to open'); return; }
          fetchJson(`/api/v1/documents/${docId}?type=${guess}`)
            .then(res => {
              if (res.ok) openDocEngine(guess, docId);
              else showToast('This record does not map to a document');
            })
            .catch(() => showToast('This record does not map to a document'));
        }}
      />

      <RecordDrawer
        open={recordDrawerOpen}
        kind={recordKind}
        sessionKey={recordSessionKey}
        initialRoles={recordRole ? [recordRole] : undefined}
        record={recordInit}
        onClose={() => { setRecordDrawerOpen(false); setRecordRole(null); setRecordInit(null); }}
        onToast={showToast}
        onSave={async (values) => {
          /* Every record create lands in its real table via the API.
             A failed call reports the API's error — nothing is saved
             locally and no success is claimed. */
          const fail = (res: { error?: string }, what: string) => {
            showToast(res.error || `${what} could not be saved`);
            return false;
          };
          try {
            if (recordKind === 'Party') {
              const roles = ((values.roles as PartyRole[]) || (recordRole ? [recordRole] : []));
              if (!roles.length) { showToast('Select at least one role'); return false; }
              const name = String(values.name || '');
              const [firstName, ...rest] = name.split(' ');
              let lastError: string | undefined;
              let saved = 0;
              for (const role of roles) {
                const roleKey = role.toLowerCase();
                const base: Record<string, unknown> = {
                  role: roleKey,
                  name,
                  display: String(values.displayName || name),
                  email: String(values.email || '') || undefined,
                  phone: String(values.phone || '') || undefined,
                  address: String(values.address || '') || undefined,
                  city: String(values.city || '') || undefined,
                  state: String(values.state || '') || undefined,
                  zip: String(values.zip || '') || undefined,
                  country: String(values.country || 'United States'),
                  notes: String(values.notes || '') || undefined,
                };
                if (roleKey === 'customer') {
                  base.first_name = firstName || undefined;
                  base.last_name = rest.join(' ') || undefined;
                  base.company_name = name;
                }
                if (roleKey === 'vendor') {
                  const termsMatch = /\d+/.exec(String(values.terms || 'Net 30'));
                  base.terms = termsMatch ? Number(termsMatch[0]) : 30;
                  base.is1099 = Boolean(values.track1099);
                  base.tax_number = String(values.taxId || '') || undefined;
                  if (values.vendorDefaultAccount) base.default_expense_account_id = values.vendorDefaultAccount;
                }
                if (roleKey === 'lead') {
                  base.lead_source = String(values.leadSource || '') || undefined;
                  base.status = String(values.leadStatus || 'New');
                }
                if (roleKey === 'supplier') {
                  base.kind = 'company';
                }
                if (roleKey === 'seller') {
                  // Sellers are created through Seller onboarding, not the party drawer.
                  lastError = 'Sellers are created from the Sellers module';
                  continue;
                }
                if (roleKey === 'contractor') {
                  // Contractors are vendor records flagged 1099.
                  base.role = 'vendor';
                  base.is1099 = true;
                  base.tax_number = String(values.taxId || '') || undefined;
                }
                const res = await fetchJson('/api/parties', { method: 'POST', body: JSON.stringify(base) });
                if (!res.ok) lastError = (res as { error?: string }).error;
                else saved++;
              }
              if (!saved) { showToast(lastError || 'Party could not be saved'); return false; }
              showToast(`${name || 'Party'} added as ${roles.join(', ')}`);
              return true;
            }
            if (recordKind === 'Item') {
              const ftMap: Record<string, string> = { 'Stock': 'stocked', 'POD': 'pod', 'Supplier-fulfilled': 'supplier', 'Digital': 'digital' };
              const res = await fetchJson('/api/products', {
                method: 'POST',
                body: JSON.stringify({
                  name: String(values.name || ''),
                  description: String(values.description || '') || undefined,
                  status: 'draft',
                  fulfillment_type: ftMap[String(values.fulfillmentType || 'Stock')] || 'stocked',
                }),
              });
              if (!res.ok) return fail(res as { error?: string }, 'Product');
              showToast(`${String(values.name || 'Item')} added to catalog as a draft (SKU and pricing are set on the product)`);
              return true;
            }
            if (recordKind === 'Account') {
              const res = await fetchJson('/api/accounting/chart-of-accounts', {
                method: 'POST',
                body: JSON.stringify({
                  name: String(values.name || ''),
                  code: String(values.number || ''),
                  type: String(values.type || 'Expense'),
                  detail: String(values.detailType || '') || undefined,
                  description: String(values.description || '') || undefined,
                  openingBalance: Number(values.openingBalance || 0),
                }),
              });
              if (!res.ok) return fail(res as { error?: string }, 'Account');
              showToast(`Account ${String(values.name || '')} added to chart of accounts`);
              return true;
            }
            if (recordKind === 'Expense') {
              const amount = Number(values.amount || 0);
              const res = await fetchJson('/api/v1/documents', {
                method: 'POST',
                body: JSON.stringify({
                  type: 'Expense',
                  partyId: (values.payeeId as string) || undefined,
                  bankAccountId: (values.paidFrom as string) || undefined,
                  date: String(values.date || new Date().toISOString().slice(0, 10)),
                  subtotal: amount,
                  total: amount,
                  status: 'posted',
                  memo: String(values.memo || '') || undefined,
                  lines: [{ description: String(values.memo || 'Expense'), quantity: 1, unitPrice: amount, accountId: (values.category as string) || undefined }],
                }),
              });
              if (!res.ok) return fail(res as { error?: string }, 'Expense');
              showToast(`Expense of $${amount.toFixed(2)} recorded`);
              return true;
            }
            if (recordKind === 'Ticket') {
              const channelMap: Record<string, string> = { 'Email': 'email', 'Chat': 'chat', 'Social DM': 'social', 'Marketplace message': 'marketplace', 'Web form': 'web' };
              const priorityMap: Record<string, string> = { 'Low': 'low', 'Normal': 'normal', 'High': 'high', 'Urgent': 'urgent' };
              const res = await fetchJson('/api/v1/tickets', {
                method: 'POST',
                body: JSON.stringify({
                  subject: String(values.subject || ''),
                  source_channel: channelMap[String(values.channel || 'Web form')] || 'web',
                  requester_type: 'customer',
                  requester_customer_id: (values.requesterId as string) || undefined,
                  priority: priorityMap[String(values.priority || 'Normal')] || 'normal',
                  category: 'general',
                }),
              });
              if (!res.ok) return fail(res as { error?: string }, 'Ticket');
              showToast(`Ticket created: ${String(values.subject || '')}`);
              return true;
            }
            showToast(`No create endpoint exists for ${recordKind} yet — nothing was saved`);
            return false;
          } catch (e) {
            showToast(e instanceof Error ? e.message : 'Save failed');
            return false;
          }
        }}
      />

      {/* §1.2 Document page (full): the engine fills the viewport as its own
          surface — Edit/Email/Payor/PDF tabs live inside it. */}
      {docEngineOpen && (
        <div className="fixed inset-0 z-[200] bg-background flex flex-col">
          <DocumentEngine
            open={docEngineOpen}
            type={docType}
            documentId={docId}
            partyId={docPartyId}
            activeTab={docTab}
            onSelectTab={(t) => setDocTab(t as DocTabType)}
            onClose={closeDocEngine}
            onOpenDocument={(id) => { setDocId(id); setDocTab('edit'); }}
            onToast={showToast}
          />
        </div>
      )}

      {/* Payment modal — focused payment form (not a document engine).
          Opens from customer profile → New transaction → Payment, or
          row-menu → Receive payment. Records to payment_transactions
          and optionally marks an invoice Paid. */}
      <PaymentModal
        open={paymentModalOpen}
        prefill={paymentPrefill}
        onToast={showToast}
        onClose={() => { setPaymentModalOpen(false); setPaymentPrefill(null); }}
      />

      <CreateFlyout
        open={createFlyoutOpen}
        onClose={() => setCreateFlyoutOpen(false)}
        onSelectCreate={(action) => {
          // Registry create actions with a real home execute or navigate
          // to the surface that performs them — the binding travels with
          // the click instead of being dropped to a label.
          const code = typeof action === 'object' && action !== null ? (action.action_code ?? '') : '';
          if (code === 'create.invitation') {
            setCreateFlyoutOpen(false);
            try { sessionStorage.setItem('ws:open-invite', '1'); } catch { /* noop */ }
            openOrActivateTab('settings', 'ws-teammates');
            return;
          }
          if (code === 'create.out_of_office') {
            setCreateFlyoutOpen(false);
            setProfileAction('out-of-office');
            return;
          }
          if (code === 'create.notification_preference') {
            setCreateFlyoutOpen(false);
            setProfileAction('notification-preference');
            return;
          }
          // Registry create actions resolve by action_code — the
          // display label alone dropped most of them to the fallback
          // toast (the flyout "didn't work"). Tier 1: the canonical
          // create flows handleCreate already owns (doc engine, party
          // drawer, item/account drawers, modals). Tier 2: navigate
          // to the module screen whose own create performs the action
          // (targets verified against the shell + merged DB nav).
          const CREATE_LABEL_BY_CODE: Record<string, string> = {
            'create.invoice': 'Invoice',
            'create.estimate': 'Estimate',
            'create.bill': 'Bill',
            'create.check': 'Check',
            'create.expense': 'Expense',
            'create.credit_memo': 'Credit memo',
            'create.vendor_credit': 'Vendor credit',
            'create.journal_entry': 'Journal entry',
            'create.sales_receipt': 'Sales receipt',
            'create.purchase_order': 'Purchase order',
            'create.sales_order': 'Sales order',
            'create.receive_payment': 'Receive payment',
            'create.pay_bills': 'Pay bills',
            'create.statement': 'Statement',
            'create.payment_link': 'Payment link',
            'create.customer': 'Add customer',
            'create.vendor': 'Add vendor',
            'create.supplier': 'Add supplier',
            'create.contractor': 'Add contractor',
            'create.employee': 'Add employee',
            'create.product': 'Product',
            'create.product_service': 'Add product/service',
            'create.account': 'Add account',
            'create.category': 'Category',
            'create.task': 'Task',
            'create.note': 'Add note',
            'create.time_entry': 'Time entry',
            'create.ticket': 'Ticket',
            'create.design': 'Design',
            'create.return_rma': 'Return/RMA',
            'create.appointment': 'Appointment',
            'create.reconcile': 'Reconcile',
            'create.bank_deposit': 'Bank deposit',
            'create.post': 'Post',
            'create.inventory_count': 'Cycle count',
            'create.void': 'Void',
          };
          const CREATE_NAV_BY_CODE: Record<string, [DomainKey, string]> = {
            'create.deal': ['contacts', 'deals'],
            'create.pipeline': ['contacts', 'deals'],
            'create.lead_scoring_rule': ['contacts', 'leads'],
            'create.tracked_record': ['contacts', 'parties'],
            'create.record_event': ['contacts', 'parties'],
            'create.calendar_event': ['contacts', 'appointments'],
            'create.mailbox': ['settings', 'ws-mailboxes'],
            'create.banner': ['marketing', 'marketing-banners'],
            'create.popup': ['marketing', 'marketing-popups'],
            'create.discount_code': ['marketing', 'mkt-promotions'],
            'create.newsletter': ['marketing', 'mkt-newsletter'],
            'create.sequence': ['marketing', 'mkt-sequences'],
            'create.webform': ['marketing', 'mkt-webforms'],
            'create.campaign': ['marketing', 'mkt-campaigns'],
            'create.listing_category': ['catalog', 'catalog-listing--categories'],
            'create.collection': ['catalog', 'collection'],
            'create.custom_field': ['settings', 'settings-customization--custom-fields'],
            'create.picklist_value': ['settings', 'settings-customization--picklists'],
            'create.dashboard': ['reports', 'reports-dashboards'],
            'create.report': ['reports', 'reports-dashboards'],
            'create.settlement': ['finance', 'finance-banking--settlements'],
            'create.transfer': ['finance', 'finance-banking--transfers'],
            'create.payroll_run': ['finance', 'payroll'],
            'create.escalation_policy': ['support', 'support-on-call--escalation-policies'],
            'create.oncall_schedule': ['support', 'support-on-call--escalation-policies'],
            'create.oncall_override': ['support', 'support-on-call--escalation-policies'],
            'create.sales_tax_filing': ['finance', 'tax-overview'],
          };
          if (CREATE_LABEL_BY_CODE[code]) {
            handleCreate(CREATE_LABEL_BY_CODE[code]);
            return;
          }
          if (CREATE_NAV_BY_CODE[code]) {
            setCreateFlyoutOpen(false);
            openOrActivateTab(CREATE_NAV_BY_CODE[code][0], CREATE_NAV_BY_CODE[code][1]);
            return;
          }
          handleCreate(action);
        }}
      />

      {profileAction && (
        <ProfileActionModal kind={profileAction} onClose={() => setProfileAction(null)} />
      )}

      <NavigationHubFlyout
        open={navigationHubOpen}
        onClose={() => setNavigationHubOpen(false)}
        onNavigate={openOrActivateTab}
        onToast={showToast}
        onCreate={handleCreate}
      />

      <StudioDrawer
        open={studioDrawerOpen}
        kind={studioDrawerKind}
        onClose={() => {
          setStudioDrawerOpen(false);
          // Closing the overlay closes the session's drawer too.
          useDesignCanvas.getState().setDrawer(null);
        }}
        onToast={showToast}
        onNavigate={(screenId) => openOrActivateTab('design', screenId)}
      />

      {/* THE canonical party create — global Create flyout, quick actions,
          module headers. Same drawer every Contacts screen uses; writes to
          Supabase (POST /api/parties) and mirrors into platformStore so the
          document-engine pickers see the record immediately. */}
      <PartyFormDrawer
        open={!!partyFormRole}
        preselectRole={partyFormRole || undefined}
        onClose={() => setPartyFormRole(null)}
        onToast={showToast}
      />

      <QuickActionsDrawer
        open={quickActionsDrawerOpen}
        onClose={() => setQuickActionsDrawerOpen(false)}
        selectedActionIds={favoriteIds}
        onSelectedActionIdsChange={handleFavoriteIdsChange}
        onToast={showToast}
        onSelectAction={(actionName) => {
          handleCreate(actionName);
        }}
      />

      <FavoritesFlyout
        open={favoritesFlyoutOpen}
        pinMode={pinMode}
        onPinModeChange={handlePinModeChange}
        bookmarks={railBookmarks}
        activeDomain={activeDomain}
        activeScreen={activeScreen}
        onAddBookmark={handleAddBookmark}
        onRemoveBookmark={handleRemoveBookmark}
        onNavigateBookmark={openOrActivateTab}
        favoriteIds={favoriteIds}
        onClose={() => setFavoritesFlyoutOpen(false)}
        onSelectAction={(actionName) => {
          handleCreate(actionName);
        }}
        onOpenCustomize={() => {
          setFavoritesFlyoutOpen(false);
          setQuickActionsDrawerOpen(true);
        }}
        onToast={showToast}
      />

      {mailOpen && <MailQuickAction onClose={() => setMailOpen(false)} />}
        <Toast message={toastMsg} visible={toastVisible} />
    </>
  );
}
