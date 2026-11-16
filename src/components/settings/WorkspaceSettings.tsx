'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { exportToCsv } from '@/lib/csvExport';
import {
  BRANDS,
  CAPS,
  MOD,
  PEOPLE,
  ROLES,
  RoleDef,
  blankRole,
  cloneRoles,
  countRole,
  diffRoleCount,
  grantedCount,
  hasPermission,
  peopleInRole,
  Person,
} from '@/data/settingsAccess';
import { DomainKey, DOMAINS, findScreen, screensOf } from '@/data/shellData';
import { ROLES_STORAGE_KEY } from '@/data/settingsAccess';
import { useStoredJson } from '@/hooks/useStoredPref';
import {
  useMembers,
  memberActions,
  useWorkspace,
  workspaceActions,
  type PlatformMember,
} from '@/hooks/usePlatformApi';
import styles from './WorkspaceSettings.module.css';

/* Stored-roles validators for the hydration-safe pref hook. */
function isValidRoleMap(v: unknown): boolean {
  return (
    typeof v === 'object' && v !== null &&
    Object.values(v).every(
      (r) => typeof r === 'object' && r !== null && Array.isArray((r as RoleDef).g)
    )
  );
}
function ensureAdminPresent(roles: Record<string, RoleDef>): Record<string, RoleDef> {
  if (roles.Admin) return roles;
  return { ...roles, Admin: cloneRoles(ROLES).Admin };
}

interface WorkspaceSettingsProps {
  screenId: string;
  onGotoScreen: (screenId: string) => void;
  onToast: (msg: string) => void;
}

const BREADCRUMB = 'Settings / Workspace';

function statusTagClass(st: Person['st']): string {
  if (st === 'Active') return `${styles.tag} ${styles.tagOk}`;
  if (st === 'Invited') return `${styles.tag} ${styles.tagWarn}`;
  return `${styles.tag} ${styles.tagBad}`;
}

function rolesOf(p: Person): string {
  return Object.entries(p.r)
    .map(([brand, role]) => {
      const ext = ROLES[role]?.ext;
      return `<span class="${styles.roleChip} ${ext ? styles.roleChipExt : ''}">${brand}: ${role}</span>`;
    })
    .join(' ');
}

/* ──────────────────────────── HOME ──────────────────────────── */
/* Workspace settings sections live in tenant_settings via the
   existing /api/v1/settings route (the Design Studio pattern):
   GET merges the stored section over these defaults; every change
   PATCHes the whole section back. */
type SectionSaveState = 'idle' | 'saving' | 'saved' | 'error';

function SaveStateNote({ state }: { state: SectionSaveState }) {
  if (state === 'idle') return null;
  return (
    <p
      className={styles.subtitle}
      role="status"
      style={{ color: state === 'error' ? '#b3261e' : '#2e7d32', marginTop: 4 }}
    >
      {state === 'saving' ? 'Saving…' : state === 'saved' ? 'Saved' : 'Could not save — the change is on this screen only.'}
    </p>
  );
}

function useWorkspaceSection<T extends Record<string, unknown>>(
  section: string,
  defaults: T,
): [T, (patch: Partial<T>) => void, SectionSaveState] {
  const [values, setValues] = useState<T>(defaults);
  const [saveState, setSaveState] = useState<SectionSaveState>('idle');
  useEffect(() => {
    let live = true;
    fetch(`/api/v1/settings?section=${encodeURIComponent(section)}`)
      .then((r) => r.json())
      .then((j: { data?: Record<string, unknown> }) => {
        if (live && j.data) setValues((prev) => ({ ...prev, ...j.data } as T));
      })
      .catch(() => {});
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section]);
  const save = (patch: Partial<T>) => {
    const next = { ...values, ...patch } as T;
    setValues(next);
    setSaveState('saving');
    void fetch('/api/v1/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ section, data: next }),
    })
      .then((r) => { if (!r.ok) throw new Error('save failed'); setSaveState('saved'); })
      .catch(() => setSaveState('error'));
  };
  return [values, save, saveState];
}

function HomeView({ onGotoScreen }: { onGotoScreen: (id: string) => void }) {
  // kpis.md stat bar — every tile a real count from its named source
  // (GET /api/platform/workspace). Tiles whose backing list has no
  // screen in the shell yet render as plain tiles, not doors.
  const { data: ws } = useWorkspace();
  const kpis = ws?.kpis;
  const tiles: { label: string; value: number | null; go?: string }[] = [
    { label: 'Active members', value: kpis?.activeMembers ?? null, go: 'ws-teammates' },
    { label: 'Modules enabled', value: kpis?.modulesEnabled ?? null },
    { label: 'Packs applied', value: kpis?.packsApplied ?? null },
    { label: 'Audit events (7d)', value: kpis?.auditEvents7d ?? null, go: 'ws-activity' },
    { label: 'Custom fields', value: kpis?.customFields ?? null },
    { label: 'Saved views', value: kpis?.savedViews ?? null },
  ];
  // Cards exactly as unsaid-settings-access.html V.home — icon square is a bold
  // letter on the purple tile (.ic: 36px, radius 8, bg #e8def8, ink #4a148c).
  const cards: { key: string; title: string; sub: string; go: string }[] = [
    { key: 'T', title: 'Teammates', sub: 'Manage or invite teammates and see who has access to what.', go: 'ws-teammates' },
    { key: 'R', title: 'Roles and permissions', sub: 'Build roles from 64 permissions, set data access, and test who can do what.', go: 'ws-roles' },
    { key: 'E', title: 'External access', sub: 'Partners, your accountant, and board members, with end dates.', go: 'ws-external' },
    { key: 'A', title: 'Approvals and limits', sub: 'Set dollar limits and require a second person for risky actions.', go: 'ws-approvals' },
    { key: 'O', title: 'Workspace owners', sub: 'Choose who receives security and billing announcements.', go: 'ws-owners' },
    { key: 'B', title: 'Brands', sub: 'Run several businesses from one login with separate access.', go: 'ws-brands' },
    { key: 'S', title: 'Security', sub: 'Two-step sign-in, SSO, sessions, IP rules, and impersonation.', go: 'ws-security' },
    { key: 'L', title: 'Activity log', sub: 'Every sign-in, access change, export, and approval.', go: 'ws-activity' },
  ];
  return (
    <div>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.breadcrumb}>
            <span>{BREADCRUMB}</span>
          </div>
          <h1 className={styles.title}>Workspace</h1>
          <p className={styles.subtitle}>The access area of Settings. Other groups are unchanged.</p>
        </div>
      </div>
      <div className={styles.homeGrid}>
        {cards.map((c) => (
          <button
            key={c.key}
            type="button"
            className={styles.homeCard}
            data-go={c.go}
            onClick={() => onGotoScreen(c.go)}
          >
            <span className={styles.homeCardIcon}>{c.key}</span>
            <span>
              <h4 className={styles.homeCardTitle}>{c.title}</h4>
              <span className={styles.homeCardSub}>{c.sub}</span>
            </span>
          </button>
        ))}
      </div>
      <div className={styles.homeGrid} style={{ marginTop: 16 }}>
        {tiles.map((t) => (
          t.go ? (
            <button key={t.label} type="button" className={styles.homeCard} onClick={() => onGotoScreen(t.go!)}>
              <span>
                <h4 className={styles.homeCardTitle}>{t.value === null ? '—' : t.value}</h4>
                <span className={styles.homeCardSub}>{t.label}</span>
              </span>
            </button>
          ) : (
            <div key={t.label} className={styles.homeCard}>
              <span>
                <h4 className={styles.homeCardTitle}>{t.value === null ? '—' : t.value}</h4>
                <span className={styles.homeCardSub}>{t.label}</span>
              </span>
            </div>
          )
        ))}
      </div>
      <p className={styles.note}>Counts are live from the workspace tables. Modules, packs, custom fields, and saved views are managed through their registry actions.</p>
    </div>
  );
}

/* ──────────────────────────── TEAMMATES ──────────────────────────── */
const TEAMMATE_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'invited', label: 'Invited' },
  { id: 'susp', label: 'Suspended' },
  { id: 'ext', label: 'External' },
  { id: 'no2fa', label: 'No two-step' },
] as const;

function TeammatesView({ onToast }: { onToast: (m: string) => void }) {
  // Real workspace people: tenant_memberships + pending
  // platform_member_invitations, via /api/platform/members. Inviting a
  // teammate runs the same pattern as the contractor invite — a form,
  // a row, and a queued email (platform_outbox) — through the registry
  // action create.invitation → platform_invite_member.
  const { data, loaded, refresh } = useMembers();
  const { data: ws } = useWorkspace();
  const [filter, setFilter] = useState<string>('all');
  const [brand, setBrand] = useState<string>('All brands');
  const [sel, setSel] = useState<Record<number, boolean>>({});
  const [showInvite, setShowInvite] = useState(false);
  const [bulkRole, setBulkRole] = useState<string>('');
  const [actionMsg, setActionMsg] = useState<{ text: string; error: boolean } | null>(null);

  useEffect(() => {
    try {
      if (sessionStorage.getItem('ws:open-invite') === '1') {
        sessionStorage.removeItem('ws:open-invite');
        setShowInvite(true);
      }
    } catch { /* sessionStorage unavailable */ }
  }, []);

  const brandName = ws?.name || 'Unsaid';
  const catalog = useMemo(() => new Map((data?.roleCatalog || []).map((r) => [r.code, r])), [data]);
  const roleLabel = (code: string) => catalog.get(code)?.label || code;

  interface Row { person: Person; kind: 'member' | 'invitation'; id: string; userId?: string; roleCode: string }
  const allRows: Row[] = useMemo(() => {
    if (!data) return [];
    const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString() : '—');
    const members: Row[] = data.members.map((m: PlatformMember) => ({
      person: {
        n: m.name,
        e: m.email,
        r: { [brandName]: m.assignments[0]?.title || roleLabel(m.assignments[0]?.role_code || m.role) },
        st: m.active ? 'Active' : 'Suspended',
        l: fmt(m.lastActiveAt || m.joinedAt),
        tf: m.mfaEnabled,
      },
      kind: 'member', id: m.id, userId: m.userId, roleCode: m.role,
    }));
    const invites: Row[] = data.invitations.map((i) => ({
      person: {
        n: i.email,
        e: i.email,
        r: { [brandName]: i.title || roleLabel(i.role) },
        st: 'Invited',
        l: fmt(i.invitedAt),
        tf: false,
      },
      kind: 'invitation', id: i.id, roleCode: i.role,
    }));
    return [...members, ...invites];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, brandName]);

  const rows = useMemo(() => {
    return allRows.filter(({ person: p, roleCode }) => {
      if (brand !== 'All brands' && !p.r[brand]) return false;
      const isExt = catalog.get(roleCode)?.role_kind === 'external';
      if (filter === 'all') return true;
      if (filter === 'invited') return p.st === 'Invited';
      if (filter === 'susp') return p.st === 'Suspended';
      if (filter === 'ext') return isExt;
      if (filter === 'no2fa') return !p.tf;
      return true;
    });
  }, [allRows, filter, brand, catalog]);

  const selectedRows = rows.filter((_, i) => sel[i]);
  const selectedCount = selectedRows.length;

  const toggleSel = (i: number) =>
    setSel((prev) => ({ ...prev, [i]: !prev[i] }));

  const bulkChangeRole = async () => {
    if (!bulkRole) { setActionMsg({ text: 'Choose a role first', error: true }); return; }
    const targets = selectedRows.filter((r) => r.kind === 'member' && r.userId);
    let ok = 0;
    for (const r of targets) {
      const res = await memberActions.assignRole(r.userId!, bulkRole);
      if (res.ok) ok += 1;
    }
    setSel({});
    await refresh();
    setActionMsg(ok ? { text: `Role changed for ${ok} ${ok === 1 ? 'person' : 'people'}`, error: false } : { text: 'Role change failed', error: true });
  };
  const bulkSuspend = async () => {
    const targets = selectedRows.filter((r) => r.kind === 'member');
    let ok = 0;
    for (const r of targets) {
      const res = await memberActions.remove(r.id);
      if (res.ok) ok += 1;
    }
    setSel({});
    await refresh();
    setActionMsg(ok ? { text: `Suspended ${ok} ${ok === 1 ? 'person' : 'people'} — access revoked`, error: false } : { text: 'Suspend failed', error: true });
  };
  const bulkResend = async () => {
    const targets = selectedRows.filter((r) => r.kind === 'invitation');
    let ok = 0;
    for (const r of targets) {
      const res = await memberActions.invite(r.person.e, r.roleCode);
      if (res.ok) ok += 1;
    }
    setSel({});
    await refresh();
    setActionMsg(ok ? { text: `Invite resent to ${ok} ${ok === 1 ? 'person' : 'people'}`, error: false } : { text: 'Resend failed', error: true });
  };

  return (
    <div>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.breadcrumb}><span>{BREADCRUMB}</span></div>
          <h1 className={styles.title}>Teammates</h1>
          <p className={styles.subtitle}>
            {loaded ? `${allRows.length} people. ` : ''}A person can hold a different role in each brand.
          </p>
        </div>
        <div className={styles.headerRight}>
          <select
            className={styles.switchSelect}
            value={brand}
            onChange={(e) => setBrand(e.target.value)}
            aria-label="Brand filter"
          >
            <option>All brands</option>
            <option>{brandName}</option>
          </select>
          <button
            type="button"
            className={`${styles.btn} ${styles.btnPrimary}`}
            onClick={() => setShowInvite(true)}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>person_add</span>
            Invite teammates
          </button>
        </div>
      </div>

      <div className={styles.filterRow}>
        {TEAMMATE_FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            className={`${styles.filterChip} ${filter === f.id ? styles.filterChipActive : ''}`}
            onClick={() => setFilter(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className={styles.card}>
        {actionMsg && (
        <p role="status" style={{ color: actionMsg.error ? '#b3261e' : '#2e7d32', fontSize: 13, margin: '0 0 10px' }}>
          {actionMsg.text}
        </p>
      )}
      {selectedCount > 0 && (
          <div className={styles.bulkBar}>
            <span className={styles.bulkBarText}>{selectedCount} selected</span>
            <select
              className={styles.switchSelect}
              value={bulkRole}
              onChange={(e) => setBulkRole(e.target.value)}
              aria-label="Role for change"
            >
              <option value="">Role…</option>
              {(data?.roleCatalog || []).map((r) => (
                <option key={r.code} value={r.code}>{r.label}</option>
              ))}
            </select>
            <button
              type="button"
              className={`${styles.btn} ${styles.btnSm} ${styles.btnPrimary}`}
              onClick={() => void bulkChangeRole()}
            >
              Change role
            </button>
            <button
              type="button"
              className={`${styles.btn} ${styles.btnSm}`}
              onClick={() => void bulkSuspend()}
            >
              Suspend
            </button>
            <button
              type="button"
              className={`${styles.btn} ${styles.btnSm}`}
              onClick={() => void bulkResend()}
            >
              Resend invite
            </button>
            <span className={styles.bulkBarMuted}>
              This will change access for {selectedCount} people.
            </span>
          </div>
        )}
        <table className={styles.table}>
          <thead>
            <tr>
              <th style={{ width: 30 }}></th>
              <th>Name</th>
              <th>Role by brand</th>
              <th>Status</th>
              <th>Last active</th>
              <th>Two-step</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ person: p }, i) => {
              return (
                <tr key={`${p.e}-${i}`}>
                  <td>
                    <input
                      type="checkbox"
                      checked={!!sel[i]}
                      onChange={() => toggleSel(i)}
                      aria-label={`Select ${p.n}`}
                    />
                  </td>
                  <td>
                    <div className={styles.cellName}>
                      <span className={styles.avatar}>{p.n[0]}</span>
                      <span className={styles.cellNameMain}>
                        <span className={styles.cellNameText}>{p.n}</span>
                        <span className={styles.cellSub}>{p.e}</span>
                      </span>
                    </div>
                  </td>
                  <td>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {Object.entries(p.r).map(([b, r]) => {
                        const ext = catalog.get(selectedRowsRoleCode(rows, i))?.role_kind === 'external';
                        return (
                          <span
                            key={b}
                            className={`${styles.roleChip} ${ext ? styles.roleChipExt : ''}`}
                          >
                            {b}: {r}
                          </span>
                        );
                      })}
                      {p.end && (
                        <span className={`${styles.tag} ${styles.tagWarn}`}>Ends {p.end}</span>
                      )}
                    </div>
                  </td>
                  <td>
                    <span className={statusTagClass(p.st)}>{p.st}</span>
                  </td>
                  <td>{p.l}</td>
                  <td>
                    {p.tf ? (
                      <span className={`${styles.tag} ${styles.tagOk}`}>On</span>
                    ) : (
                      <span className={`${styles.tag} ${styles.tagWarn}`}>Off</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className={styles.emptyText}>
                  {loaded ? 'No teammates match this filter.' : 'Loading…'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showInvite && (
        <InviteTeammateModal
          roles={data?.roleCatalog || []}
          onClose={() => setShowInvite(false)}
          onDone={async () => { await refresh(); }}
          onToast={onToast}
        />
      )}
    </div>
  );
}

function selectedRowsRoleCode(rows: { roleCode: string }[], i: number): string {
  return rows[i]?.roleCode || '';
}

/* Team invitation — the contractor-invite pattern (form → row → queued
   email) bound to the registry action create.invitation. The invite
   token is shown once so the inviter can share the link directly; the
   invitation email itself is queued on platform_outbox by the action. */
function InviteTeammateModal({
  roles,
  onClose,
  onDone,
  onToast,
}: {
  roles: { code: string; label: string }[];
  onClose: () => void;
  onDone: () => Promise<void>;
  onToast: (m: string) => void;
}) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('staff');
  const [busy, setBusy] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const valid = /.+@.+\..+/.test(email.trim());
  const submit = async () => {
    setBusy(true);
    const res = await memberActions.invite(email.trim(), role);
    setBusy(false);
    if (!res.ok) { setError(res.error || 'Invite failed'); return; }
    const t = (res.data as { token?: string } | undefined)?.token;
    setToken(t || '');
    await onDone();
  };
  return (
    <div className={styles.scrim} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h3 className={styles.modalTitle}>Invite teammate</h3>
        <p className={styles.modalSub}>
          They appear as Invited until they accept. Accepting creates exactly one membership.
        </p>
        {token === null ? (
          <>
            <div className={styles.formField}>
              <label className={styles.formLabel} htmlFor="inv-email">Email</label>
              <input
                id="inv-email"
                type="email"
                className={styles.formInput}
                placeholder="teammate@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoFocus
              />
            </div>
            <div className={styles.formField}>
              <label className={styles.formLabel} htmlFor="inv-role">Role</label>
              <select
                id="inv-role"
                className={styles.formInput}
                value={role}
                onChange={(e) => setRole(e.target.value)}
              >
                {roles.map((r) => (
                  <option key={r.code} value={r.code}>{r.label}</option>
                ))}
              </select>
            </div>
            {error && (
              <p role="alert" style={{ color: '#b3261e', fontSize: 13, margin: '0 0 10px' }}>{error}</p>
            )}
            <div className={styles.modalActions}>
              <button type="button" className={styles.btn} onClick={onClose}>Cancel</button>
              <button
                type="button"
                className={`${styles.btn} ${styles.btnPrimary}`}
                disabled={!valid || busy}
                onClick={() => void submit()}
              >
                Send invite
              </button>
            </div>
          </>
        ) : (
          <>
            <p className={styles.modalSub}>
              Invitation created for {email.trim()} and the email is queued. Share this accept token with them directly if needed — it is shown only once:
            </p>
            <div className={styles.formField}>
              <input type="text" className={styles.formInput} readOnly value={token} aria-label="Invite token" />
            </div>
            <div className={styles.modalActions}>
              <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={onClose}>Done</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ──────────────────────────── ROLES ──────────────────────────── */
type RoleTab = 'perm' | 'data' | 'mem' | 'cmp';

// New-role modal form.
function NewRoleModal({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (name: string, description: string) => void;
}) {
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const trimmed = name.trim();
  return (
    <div className={styles.scrim} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h3 className={styles.modalTitle}>New role</h3>
        <p className={styles.modalSub}>
          Create a custom role. Start with no permissions, then grant only what the job needs.
        </p>
        <div className={styles.formField}>
          <label className={styles.formLabel} htmlFor="nr-name">Role name</label>
          <input
            id="nr-name"
            type="text"
            className={styles.formInput}
            placeholder="e.g. Fulfillment Lead"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </div>
        <div className={styles.formField}>
          <label className={styles.formLabel} htmlFor="nr-desc">Description</label>
          <textarea
            id="nr-desc"
            className={styles.formTextarea}
            placeholder="What does this role do?"
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
          />
        </div>
        <div className={styles.modalActions}>
          <button type="button" className={styles.btn} onClick={onClose}>Cancel</button>
          <button
            type="button"
            className={`${styles.btn} ${styles.btnPrimary}`}
            disabled={!trimmed}
            onClick={() => onCreate(trimmed, desc.trim())}
          >
            Create role
          </button>
        </div>
      </div>
    </div>
  );
}

function RolesView({ onToast }: { onToast: (m: string) => void }) {
  // ── Mutable role state, persisted to localStorage ──
  // Hydration-safe read via useSyncExternalStore: SSR + hydration render use
  // the ROLES default; the stored copy streams in right after hydration.
  const [savedRoles, setSavedRoles] = useStoredJson<Record<string, RoleDef>>(
    ROLES_STORAGE_KEY,
    cloneRoles(ROLES),
    isValidRoleMap,
    ensureAdminPresent,
  );
  const [workingRoles, setWorkingRoles] = useState<Record<string, RoleDef>>(() =>
    cloneRoles(ROLES)
  );

  // Adopt the stored snapshot into the working copy exactly once per saved
  // identity — the documented "adjust state when a prop changes" pattern
  // (setState during render), not an effect.
  const [lastAdopted, setLastAdopted] = useState<Record<string, RoleDef> | null>(null);
  if (lastAdopted !== savedRoles) {
    setLastAdopted(savedRoles);
    setWorkingRoles(cloneRoles(savedRoles));
  }
  const [role, setRole] = useState<string>('Designer');
  const [tab, setTab] = useState<RoleTab>('perm');
  const [pq, setPq] = useState<string>('');
  const [showNewRole, setShowNewRole] = useState(false);

  // Derive the effective selected role — if the selected role was deleted,
  // fall back to Admin. (Derived inline, not via useEffect, to avoid
  // cascading renders.)
  const effectiveRole = workingRoles[role] ? role : 'Admin';
  const def: RoleDef = workingRoles[effectiveRole] ?? workingRoles.Admin;
  const granted = useMemo(() => {
    const total = CAPS.filter((c) => hasPermissionIn(workingRoles, effectiveRole, c.m, c.c)).length;
    const sensitive = CAPS.filter(
      (c) => c.sensitive && hasPermissionIn(workingRoles, effectiveRole, c.m, c.c)
    ).length;
    return { total, sensitive };
  }, [workingRoles, effectiveRole]);
  const { data: membersData } = useMembers();
  const codeForRole = (name: string): string | null => {
    const alias = (membersData?.roleAliases || []).find((a) => a.alias === name);
    if (alias) return alias.role_code;
    const byLabel = (membersData?.roleCatalog || []).find((r) => r.label === name);
    if (byLabel) return byLabel.code;
    const lower = name.toLowerCase().replace(/\s+/g, '_');
    return (membersData?.roleCatalog || []).some((r) => r.code === lower) ? lower : null;
  };
  const apiPeopleInRole = (name: string): Person[] => {
    const code = codeForRole(name);
    if (!code || !membersData) return [];
    return membersData.members
      .filter((m) => m.active && (m.role === code || m.assignments.some((a) => a.role_code === code)))
      .map((m) => ({
        n: m.name, e: m.email,
        r: { Unsaid: m.assignments.find((a) => a.role_code === code)?.title || name },
        st: 'Active' as const, l: '—', tf: m.mfaEnabled,
      }));
  };
  const apiCountRole = (name: string): number => apiPeopleInRole(name).length;
  const roleCount = apiCountRole(effectiveRole);
  const members = apiPeopleInRole(effectiveRole);
  const unsavedCount = diffRoleCount(workingRoles, savedRoles);

  const filteredCaps = useMemo(() => {
    const q = pq.toLowerCase().trim();
    if (!q) return CAPS;
    return CAPS.filter((c) => c.label.toLowerCase().includes(q));
  }, [pq]);

  const capsByModule = useMemo(() => {
    const map = new Map<number, typeof CAPS>();
    filteredCaps.forEach((c) => {
      const arr = map.get(c.m) ?? [];
      arr.push(c);
      map.set(c.m, arr);
    });
    return map;
  }, [filteredCaps]);

  // ── Mutations ──
  const togglePermission = (roleName: string, mi: number, ci: number) => {
    setWorkingRoles((prev) => {
      const r = prev[roleName];
      if (!r || r.lock) return prev;
      const g = [...r.g];
      const bits = g[mi] ?? '';
      const padded = bits.padEnd(MOD[mi].caps.length, '0');
      const next = padded.split('');
      next[ci] = next[ci] === '1' ? '0' : '1';
      g[mi] = next.join('');
      return { ...prev, [roleName]: { ...r, g } };
    });
  };

  // The matrix persists to the platform's tenant_settings section
  // 'workspace_roles' (the same store as every other workspace
  // section); localStorage remains the offline cache underneath.
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [roleMsg, setRoleMsg] = useState<string | null>(null);
  const rolesAdopted = useRef(false);
  useEffect(() => {
    if (rolesAdopted.current) return;
    rolesAdopted.current = true;
    let live = true;
    fetch('/api/v1/settings?section=workspace_roles')
      .then((r) => r.json())
      .then((j: { data?: { roles?: Record<string, RoleDef> } }) => {
        if (live && j.data?.roles && isValidRoleMap(j.data.roles)) {
          setSavedRoles(ensureAdminPresent(j.data.roles));
        }
      })
      .catch(() => {});
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSave = () => {
    const snapshot = cloneRoles(workingRoles);
    setSavedRoles(snapshot);
    setSaveMsg('Saving…');
    void fetch('/api/v1/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ section: 'workspace_roles', data: { roles: snapshot } }),
    })
      .then((r) => {
        if (!r.ok) throw new Error('save failed');
        setSaveMsg('Changes saved. Access updated for affected teammates.');
      })
      .catch(() => setSaveMsg('Could not save to the workspace — changes are on this device only.'));
  };

  const handleDiscard = () => {
    setWorkingRoles(cloneRoles(savedRoles));
    setSaveMsg(null);
  };

  const handleCreateRole = (name: string, description: string) => {
    if (workingRoles[name]) {
      setRoleMsg('A role with that name already exists.');
      return;
    }
    setWorkingRoles((prev) => ({
      ...prev,
      [name]: blankRole(description),
    }));
    setShowNewRole(false);
    setRole(name);
    setTab('perm');
    setRoleMsg(null);
  };

  const handleDuplicate = () => {
    const src = workingRoles[effectiveRole];
    if (!src) return;
    let name = `${effectiveRole} (copy)`;
    let i = 2;
    while (workingRoles[name]) {
      name = `${effectiveRole} (copy ${i})`;
      i += 1;
    }
    setWorkingRoles((prev) => ({
      ...prev,
      [name]: {
        ...src,
        g: [...src.g],
        lock: false,
        d: src.d,
      },
    }));
    setRole(name);
  };

  const handleDelete = () => {
    if (def.lock || roleCount > 0) return;
    const target = effectiveRole;
    setWorkingRoles((prev) => {
      const next = { ...prev };
      delete next[target];
      return next;
    });
  };

  return (
    <div>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.breadcrumb}><span>{BREADCRUMB}</span></div>
          <h1 className={styles.title}>Roles and permissions</h1>
          <p className={styles.subtitle}>
            Build roles from {CAPS.length} permissions, set data access, and test who can do what.
          </p>
        </div>
        <div className={styles.headerRight}>
          <button
            type="button"
            className={`${styles.btn} ${styles.btnPrimary}`}
            onClick={() => setShowNewRole(true)}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add</span>
            New role
          </button>
        </div>
      </div>

      <div className={styles.rolesLayout}>
        <div className={styles.rolesList}>
          {Object.keys(workingRoles).map((k) => (
            <button
              key={k}
              type="button"
              className={`${styles.rolesListBtn} ${effectiveRole === k ? styles.rolesListBtnActive : ''}`}
              onClick={() => setRole(k)}
            >
              <span>{k}</span>
              <span className={styles.rolesListBtnCount}>{apiCountRole(k)}</span>
            </button>
          ))}
        </div>

        <div>
          <div className={styles.rolesHeader}>
            <h3 className={styles.rolesHeaderTitle}>{effectiveRole}</h3>
            {def.ext && <span className={`${styles.tag} ${styles.tagWarn}`}>External</span>}
            {def.lock && <span className={`${styles.tag} ${styles.tagMuted}`}>Locked</span>}
            <span style={{ flex: 1 }} />
            <button
              type="button"
              className={`${styles.btn} ${styles.btnSm}`}
              onClick={handleDuplicate}
            >
              Duplicate
            </button>
            <button
              type="button"
              className={`${styles.btn} ${styles.btnSm} ${styles.btnDanger}`}
              disabled={def.lock || roleCount > 0}
              onClick={handleDelete}
            >
              Delete
            </button>
          </div>
          <p className={styles.sectionSub}>
            {def.d}
            {roleCount > 0 ? ` ${roleCount} people use it, so it can’t be deleted.` : ''}
          </p>

          <div className={styles.rolesTabs}>
            {(
              [
                ['perm', 'Permissions'],
                ['data', 'Data access'],
                ['mem', `Members (${roleCount})`],
                ['cmp', 'Compare'],
              ] as [RoleTab, string][]
            ).map(([t, label]) => (
              <button
                key={t}
                type="button"
                className={`${styles.rolesTab} ${tab === t ? styles.rolesTabActive : ''}`}
                onClick={() => setTab(t)}
              >
                {label}
              </button>
            ))}
          </div>

          {tab === 'perm' && (
            <div>
              {def.lock && (
                <div className={styles.locked}>
                  Admin is locked so the workspace can never lose its last full-access role.
                </div>
              )}
              <div className={styles.permTopRow}>
                <input
                  type="text"
                  className={styles.permFilterInput}
                  placeholder="Filter permissions"
                  value={pq}
                  onChange={(e) => setPq(e.target.value)}
                  aria-label="Filter permissions"
                />
                <span className={styles.tag}>{granted.total} of {CAPS.length} granted</span>
                <span className={`${styles.tag} ${styles.tagWarn}`}>{granted.sensitive} sensitive</span>
                <span style={{ flex: 1 }} />
                <span className={styles.sectionSub} style={{ margin: 0 }}>
                  Edit or approve automatically includes View.
                </span>
              </div>
              <div className={styles.permModules}>
                {MOD.map((m, mi) => {
                  const caps = capsByModule.get(mi);
                  if (!caps || caps.length === 0) return null;
                  const grantedInMod = caps.filter((c) =>
                    hasPermissionIn(workingRoles, role, c.m, c.c)
                  ).length;
                  return (
                    <div key={m.name} className={styles.permModule}>
                      <div className={styles.permModuleHeader}>
                        <span className={styles.permModuleName}>{m.name}</span>
                        <span className={styles.permModuleCount}>
                          {grantedInMod} / {caps.length}
                        </span>
                      </div>
                      <div className={styles.permList}>
                        {caps.map((c) => {
                          const on = hasPermissionIn(workingRoles, role, c.m, c.c);
                          return (
                            <div key={`${c.m}-${c.c}`} className={styles.permRow}>
                              <span className={styles.permRowLabel}>
                                {c.sensitive && <span className={styles.permSensitiveDot} />}
                                {c.label}
                              </span>
                              <button
                                type="button"
                                className={`${styles.permToggle} ${on ? styles.permToggleOn : ''}`}
                                aria-pressed={on}
                                aria-label={`${on ? 'Revoke' : 'Grant'} ${c.label}`}
                                disabled={def.lock}
                                onClick={() => togglePermission(effectiveRole, c.m, c.c)}
                              >
                                <span className={styles.permToggleKnob} />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
                {filteredCaps.length === 0 && (
                  <div className={styles.emptyText}>No permissions match “{pq}”.</div>
                )}
              </div>
            </div>
          )}

          {tab === 'data' && (
            <div className={styles.kvList}>
              <div className={styles.kvRow}>
                <span className={styles.kvLabel}>Data scope</span>
                <span className={styles.kvValue}>
                  {def.sc === 'all' ? 'All records' : 'Own records only'}
                </span>
              </div>
              <div className={styles.kvRow}>
                <span className={styles.kvLabel}>Cost visibility</span>
                <span className={styles.kvValue}>{def.cost}</span>
              </div>
              <div className={styles.kvRow}>
                <span className={styles.kvLabel}>PII visibility</span>
                <span className={styles.kvValue}>{def.pii}</span>
              </div>
              <div className={styles.kvRow}>
                <span className={styles.kvLabel}>Bank / tax visibility</span>
                <span className={styles.kvValue}>{def.bank}</span>
              </div>
              <div className={styles.kvRow}>
                <span className={styles.kvLabel}>Aggregate only</span>
                <span className={styles.kvValue}>{def.agg ? 'Yes — no drill-down' : 'No'}</span>
              </div>
              <div className={styles.kvRow}>
                <span className={styles.kvLabel}>Bulk action limit</span>
                <span className={styles.kvValue}>{def.bulk}</span>
              </div>
            </div>
          )}

          {tab === 'mem' && (
            <div className={styles.card}>
              {members.length === 0 ? (
                <div className={styles.emptyText}>No one holds this role yet.</div>
              ) : (
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Brand</th>
                      <th>Status</th>
                      <th>Last active</th>
                      <th>Two-step</th>
                    </tr>
                  </thead>
                  <tbody>
                    {members.flatMap((p) =>
                      Object.entries(p.r)
                        .filter(([, r]) => r === effectiveRole)
                        .map(([b]) => (
                          <tr key={`${p.e}-${b}`}>
                            <td>
                              <div className={styles.cellName}>
                                <span className={styles.avatar}>{p.n[0]}</span>
                                <span className={styles.cellNameMain}>
                                  <span className={styles.cellNameText}>{p.n}</span>
                                  <span className={styles.cellSub}>{p.e}</span>
                                </span>
                              </div>
                            </td>
                            <td>{b}</td>
                            <td><span className={statusTagClass(p.st)}>{p.st}</span></td>
                            <td>{p.l}</td>
                            <td>
                              {p.tf ? (
                                <span className={`${styles.tag} ${styles.tagOk}`}>On</span>
                              ) : (
                                <span className={`${styles.tag} ${styles.tagWarn}`}>Off</span>
                              )}
                            </td>
                          </tr>
                        ))
                    )}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {tab === 'cmp' && (
            <div className={styles.card}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Role</th>
                    <th>People</th>
                    <th>Granted</th>
                    <th>Sensitive</th>
                    <th>Data scope</th>
                    <th>Bulk limit</th>
                    <th>External</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(workingRoles).map(([k, r]) => {
                    const g = countGranted(workingRoles, k);
                    return (
                      <tr key={k} style={k === effectiveRole ? { backgroundColor: '#faf9fc' } : undefined}>
                        <td><strong>{k}</strong></td>
                        <td>{apiCountRole(k)}</td>
                        <td>{g.total}</td>
                        <td>{g.sensitive}</td>
                        <td>{r.sc === 'all' ? 'All' : 'Own'}</td>
                        <td>{r.bulk}</td>
                        <td>{r.ext ? <span className={`${styles.tag} ${styles.tagWarn}`}>Yes</span> : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {roleMsg && (
        <p role="alert" style={{ color: '#b3261e', fontSize: 13, margin: '0 0 10px' }}>{roleMsg}</p>
      )}
      {saveMsg && unsavedCount === 0 && (
        <div className={styles.saveBar}>
          <span className={styles.saveBarText}>{saveMsg}</span>
        </div>
      )}

      {/* Unsaved-changes save bar */}
      {unsavedCount > 0 && (
        <div className={styles.saveBar}>
          <span className={styles.saveBarText}>
            {unsavedCount} unsaved change{unsavedCount === 1 ? '' : 's'} · affects{' '}
            {roleCount} people in {effectiveRole}
          </span>
          <button
            type="button"
            className={`${styles.saveBarBtn} ${styles.saveBarBtnGhost}`}
            onClick={handleDiscard}
          >
            Discard
          </button>
          <button
            type="button"
            className={`${styles.saveBarBtn} ${styles.saveBarBtnPrimary}`}
            onClick={handleSave}
          >
            Review and save
          </button>
        </div>
      )}

      {showNewRole && (
        <NewRoleModal
          onClose={() => setShowNewRole(false)}
          onCreate={handleCreateRole}
        />
      )}
    </div>
  );
}

// Local permission check that uses the mutable working copy.
function hasPermissionIn(
  roles: Record<string, RoleDef>,
  roleName: string,
  mi: number,
  ci: number
): boolean {
  const r = roles[roleName];
  if (!r) return false;
  const bits = r.g[mi] ?? '';
  return bits.charAt(ci) === '1';
}

function countGranted(
  roles: Record<string, RoleDef>,
  roleName: string
): { total: number; sensitive: number } {
  let total = 0;
  let sensitive = 0;
  CAPS.forEach((c) => {
    if (hasPermissionIn(roles, roleName, c.m, c.c)) {
      total += 1;
      if (c.sensitive) sensitive += 1;
    }
  });
  return { total, sensitive };
}

/* ──────────────────────────── EXTERNAL ──────────────────────────── */
function ExternalView() {
  // External people = members holding a role whose catalog kind is
  // 'external' (partners, accountants, board). Access ends = the
  // earliest expiring role assignment; two-step from the membership.
  const { data: membersData } = useMembers();
  const [extSettings, saveExtSettings, extSaveState] = useWorkspaceSection(
    'workspace_external',
    { require_two_step_external: true, email_before_access_ends: true },
  );
  const [links, setLinks] = useState<{ id: string; provider: string; email: string; display_name: string | null; entity_type: string; last_used_at: string }[]>([]);
  useEffect(() => {
    let live = true;
    fetch('/api/platform/customization?kind=portal-links')
      .then((r) => r.json())
      .then((j) => { if (live) setLinks((j.data as typeof links) || []); })
      .catch(() => {});
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const catalogByCode = new Map((membersData?.roleCatalog || []).map((r) => [r.code, r]));
  const externalPeople = (membersData?.members || []).filter((m) => {
    if (!m.active) return false;
    if (catalogByCode.get(m.role)?.role_kind === 'external') return true;
    return m.assignments.some((a) => catalogByCode.get(a.role_code)?.role_kind === 'external');
  });
  const require2fa = extSettings.require_two_step_external !== false;
  const emailEnd = extSettings.email_before_access_ends !== false;

  return (
    <div>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.breadcrumb}><span>{BREADCRUMB}</span></div>
          <h1 className={styles.title}>External access</h1>
          <p className={styles.subtitle}>
            People outside your team. Every external role has an end date and requires two-step sign-in.
          </p>
          <SaveStateNote state={extSaveState} />
        </div>
      </div>

      <div className={styles.card} style={{ marginBottom: 16 }}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Name</th>
              <th>Role</th>
              <th>Status</th>
              <th>Access ends</th>
              <th>Two-step</th>
            </tr>
          </thead>
          <tbody>
            {externalPeople.length === 0 && (
              <tr>
                <td colSpan={5} className={styles.emptyText}>
                  No external members yet. External roles (partner, accountant, board) appear here when assigned in Teammates.
                </td>
              </tr>
            )}
            {externalPeople.map((m) => {
              const ends = m.assignments
                .map((a) => a.expires_at)
                .filter((x): x is string => !!x)
                .sort()[0];
              const roleLabels = Array.from(new Set([
                catalogByCode.get(m.role)?.label || m.role,
                ...m.assignments.map((a) => a.title || catalogByCode.get(a.role_code)?.label || a.role_code),
              ]));
              return (
                <tr key={m.id}>
                  <td>
                    <div className={styles.cellName}>
                      <span className={styles.avatar}>{m.name[0]}</span>
                      <span className={styles.cellNameMain}>
                        <span className={styles.cellNameText}>{m.name}</span>
                        <span className={styles.cellSub}>{m.email}</span>
                      </span>
                    </div>
                  </td>
                  <td>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {roleLabels.map((r) => (
                        <span key={r} className={`${styles.roleChip} ${styles.roleChipExt}`}>{r}</span>
                      ))}
                    </div>
                  </td>
                  <td><span className={statusTagClass(m.active ? 'Active' : 'Suspended')}>{m.active ? 'Active' : 'Suspended'}</span></td>
                  <td>{ends ? new Date(ends).toLocaleDateString() : '—'}</td>
                  <td>
                    {m.mfaEnabled ? (
                      <span className={`${styles.tag} ${styles.tagOk}`}>On</span>
                    ) : (
                      <span className={`${styles.tag} ${styles.tagWarn}`}>Off</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className={styles.card} style={{ marginBottom: 16 }}>
        <h3 className={styles.sectionTitle}>Linked external accounts</h3>
        {links.length === 0 && (
          <p className={styles.emptyText}>No external accounts linked to this workspace yet.</p>
        )}
        {links.length > 0 && (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Provider</th>
                <th>Account</th>
                <th>Linked to</th>
                <th>Last used</th>
              </tr>
            </thead>
            <tbody>
              {links.map((l) => (
                <tr key={l.id}>
                  <td>{l.provider}</td>
                  <td>
                    <span className={styles.cellNameText}>{l.display_name || l.email}</span>
                    {l.display_name && <span className={styles.cellSub}> {l.email}</span>}
                  </td>
                  <td>{l.entity_type.replace(/_/g, ' ')}</td>
                  <td>{l.last_used_at ? new Date(l.last_used_at).toLocaleDateString() : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className={styles.card}>
        <div className={styles.switchRow}>
          <span className={styles.switchText}>
            <span className={styles.switchTitle}>Require two-step for all external roles</span>
            <span className={styles.switchSub}>Recommended. Applies to partners, accountants, and board members.</span>
          </span>
          <span className={styles.switchControl}>
            <button
              type="button"
              className={`${styles.permToggle} ${require2fa ? styles.permToggleOn : ''}`}
              aria-pressed={require2fa}
              aria-label="Require two-step for all external roles"
              onClick={() => saveExtSettings({ require_two_step_external: !require2fa })}
            >
              <span className={styles.permToggleKnob} />
            </button>
          </span>
        </div>
        <div className={styles.switchRow}>
          <span className={styles.switchText}>
            <span className={styles.switchTitle}>Email me 7 days before external access ends</span>
          </span>
          <span className={styles.switchControl}>
            <button
              type="button"
              className={`${styles.permToggle} ${emailEnd ? styles.permToggleOn : ''}`}
              aria-pressed={emailEnd}
              aria-label="Email me before external access ends"
              onClick={() => saveExtSettings({ email_before_access_ends: !emailEnd })}
            >
              <span className={styles.permToggleKnob} />
            </button>
          </span>
        </div>
      </div>
    </div>
  );
}

/* ──────────────────────────── APPROVALS ──────────────────────────── */
function ApprovalsView({ onToast }: { onToast: (m: string) => void }) {
  const [approvalSettings, saveApprovalSettings, approvalSaveState] = useWorkspaceSection(
    'workspace_approvals',
    { creator_cannot_approve: true },
  );
  const creatorCannotApprove = approvalSettings.creator_cannot_approve !== false;
  return (
    <div>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.breadcrumb}><span>{BREADCRUMB}</span></div>
          <h1 className={styles.title}>Approvals and limits</h1>
          <p className={styles.subtitle}>
            Set dollar limits and require a second person for risky actions.
          </p>
          <SaveStateNote state={approvalSaveState} />
        </div>
      </div>

      <div className={styles.card} style={{ marginBottom: 16 }}>
        <div className={styles.switchRow}>
          <span className={styles.switchText}>
            <span className={styles.switchTitle}>Creator cannot approve own bills</span>
            <span className={styles.switchSub}>Requires a second person to approve any bill or payment the creator made.</span>
          </span>
          <span className={styles.switchControl}>
            <button
              type="button"
              className={`${styles.permToggle} ${creatorCannotApprove ? styles.permToggleOn : ''}`}
              aria-pressed={creatorCannotApprove}
              aria-label="Creator cannot approve own bills"
              onClick={() => saveApprovalSettings({ creator_cannot_approve: !creatorCannotApprove })}
            >
              <span className={styles.permToggleKnob} />
            </button>
          </span>
        </div>
      </div>

      <div className={styles.card}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Role</th>
              <th>Bulk action limit</th>
              <th>Bill approval</th>
              <th>Refund limit</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(ROLES).map(([k, r]) => (
              <tr key={k}>
                <td><strong>{k}</strong></td>
                <td>{r.bulk}</td>
                <td>{r.ext || r.lock ? 'Auto' : 'Required'}</td>
                <td>{r.bulk === 'No limit' ? 'No limit' : r.bulk}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ──────────────────────────── OWNERS ──────────────────────────── */
function OwnersView() {
  // Owners = active members holding the owner role (membership role or
  // an active assignment). The three switches are that owner's email
  // notification preferences (platform_notification_preferences):
  // security_alert / billing_notice / service_announcement. No stored
  // row means the owner receives them (the default this page states).
  const { data: membersData, refresh } = useMembers();
  const owners = (membersData?.members || []).filter(
    (m) => m.active && (m.role === 'owner' || m.assignments.some((a) => a.role_code === 'owner')),
  );
  const EVENTS: { key: string; event: string; label: string }[] = [
    { key: 'sec', event: 'security_alert', label: 'Security' },
    { key: 'bill', event: 'billing_notice', label: 'Billing' },
    { key: 'svc', event: 'service_announcement', label: 'Service' },
  ];
  const toggle = async (userId: string, event: string, enabled: boolean) => {
    await memberActions.setNotification(userId, event, enabled);
    await refresh();
  };
  return (
    <div>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.breadcrumb}><span>{BREADCRUMB}</span></div>
          <h1 className={styles.title}>Workspace owners</h1>
          <p className={styles.subtitle}>
            Owners receive security alerts, billing notices, and service announcements. Keep at least two.
          </p>
        </div>
      </div>
      <div className={styles.card}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Owner</th>
              <th>Security</th>
              <th>Billing</th>
              <th>Service</th>
            </tr>
          </thead>
          <tbody>
            {owners.length === 0 && (
              <tr>
                <td colSpan={4} className={styles.emptyText}>
                  No owners assigned yet. Assign the Owner role in Teammates and they will appear here.
                </td>
              </tr>
            )}
            {owners.map((o) => (
              <tr key={o.id}>
                <td>
                  <div className={styles.cellName}>
                    <span className={styles.avatar}>{o.name[0]}</span>
                    <span className={styles.cellNameMain}>
                      <span className={styles.cellNameText}>{o.name}</span>
                      <span className={styles.cellSub}>{o.email}</span>
                    </span>
                  </div>
                </td>
                {EVENTS.map((e) => (
                  <td key={e.key}>
                    <input
                      type="checkbox"
                      checked={o.prefs[e.event] ?? true}
                      aria-label={`${e.label} notifications for ${o.name}`}
                      onChange={(ev) => void toggle(o.userId, e.event, ev.target.checked)}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className={styles.sectionSub} style={{ marginTop: 12 }}>
        Only an owner can delete the workspace or remove another owner.
      </p>
    </div>
  );
}

/* ──────────────────────────── BRANDS ──────────────────────────── */
function BrandsView({ onToast }: { onToast: (m: string) => void }) {
  const [brandMsg, setBrandMsg] = useState<string | null>(null);
  // Branding lives on the tenants row (SHIP-IT step 2): name, logos,
  // colors, font, support contacts. Saving PATCHes /api/platform/
  // workspace and the storefront/documents read the same columns.
  const { data: ws, refresh } = useWorkspace();
  const [form, setForm] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!ws) return;
    setForm({
      name: ws.name || '',
      logoUrl: ws.branding.logoUrl || '',
      primaryColor: ws.branding.primaryColor || '',
      secondaryColor: ws.branding.secondaryColor || '',
      accentColor: ws.branding.accentColor || '',
      brandFont: ws.branding.brandFont || '',
      supportEmail: ws.branding.supportEmail || '',
      websiteUrl: ws.branding.websiteUrl || '',
    });
  }, [ws]);
  const set = (k: string, v: string) => setForm((prev) => ({ ...prev, [k]: v }));
  const save = async () => {
    const res = await workspaceActions.saveBranding(form);
    if (res.ok) { setBrandMsg('Branding saved'); await refresh(); }
    else setBrandMsg(res.error || 'Could not save branding');
  };
  const fields: { key: string; label: string; placeholder?: string }[] = [
    { key: 'name', label: 'Brand name' },
    { key: 'logoUrl', label: 'Logo URL' },
    { key: 'primaryColor', label: 'Primary color', placeholder: '#…' },
    { key: 'secondaryColor', label: 'Secondary color', placeholder: '#…' },
    { key: 'accentColor', label: 'Accent color', placeholder: '#…' },
    { key: 'brandFont', label: 'Brand font' },
    { key: 'supportEmail', label: 'Support email' },
    { key: 'websiteUrl', label: 'Website URL' },
  ];
  return (
    <div>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.breadcrumb}><span>{BREADCRUMB}</span></div>
          <h1 className={styles.title}>Brands</h1>
          <p className={styles.subtitle}>
            Run several businesses from one login with separate access.
          </p>
          {brandMsg && (
            <p role="status" style={{ fontSize: 13, marginTop: 4, color: brandMsg === 'Branding saved' ? '#2e7d32' : '#b3261e' }}>
              {brandMsg}
            </p>
          )}
        </div>
        <div className={styles.headerRight}>
          <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => void save()}>
            Save branding
          </button>
        </div>
      </div>
      <div className={styles.card}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Brand</th>
              <th>People</th>
              <th>Default role</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><strong>{ws?.name || '—'}</strong></td>
              <td>{ws ? ws.kpis.activeMembers : '—'}</td>
              <td>Team Member</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className={styles.card} style={{ marginTop: 16 }}>
        {fields.map((f) => (
          <div key={f.key} className={styles.formField}>
            <label className={styles.formLabel} htmlFor={`brand-${f.key}`}>{f.label}</label>
            <input
              id={`brand-${f.key}`}
              type="text"
              className={styles.formInput}
              placeholder={f.placeholder || ''}
              value={form[f.key] || ''}
              onChange={(e) => set(f.key, e.target.value)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

/* ──────────────────────────── SECURITY ──────────────────────────── */
function SecurityView({ onToast }: { onToast: (m: string) => void }) {
  const [sec, saveSec, secSaveState] = useWorkspaceSection<Record<string, string | boolean>>(
    'workspace_security',
    {
      require_two_step: 'Everyone',
      sso_saml: false,
      session_length: '8 hours',
      restrict_ip: false,
      trusted_devices: true,
      alert_new_country: true,
      impersonation: 'Admins only',
      api_tokens: '90 days',
    },
  );
  const rows: { slug: string; title: string; sub: string; kind: 'select' | 'check'; options?: string[] }[] = [
    { slug: 'require_two_step', title: 'Require two-step sign-in', sub: 'Admins and external roles always. Everyone else is a choice.', kind: 'select', options: ['Everyone', 'Admins and external', 'Admins only'] },
    { slug: 'sso_saml', title: 'Single sign-on (SAML)', sub: 'Sign in with your company identity provider.', kind: 'check' },
    { slug: 'session_length', title: 'Session length', sub: 'Sign out after this long without activity.', kind: 'select', options: ['8 hours', '24 hours', '7 days'] },
    { slug: 'restrict_ip', title: 'Restrict sign-in by IP address', sub: 'Allow only your office or VPN ranges.', kind: 'check' },
    { slug: 'trusted_devices', title: 'Trusted devices', sub: 'Ask for two-step again on a new device.', kind: 'check' },
    { slug: 'alert_new_country', title: 'Alert owners on new-country sign-in', sub: 'Email workspace owners.', kind: 'check' },
    { slug: 'impersonation', title: 'Impersonating a customer', sub: 'Requires a reason, lasts 30 minutes, and is logged. Never allowed on payment screens.', kind: 'select', options: ['Admins only', 'Admins and Support leads', 'Off'] },
    { slug: 'api_tokens', title: 'API tokens', sub: 'Tokens are scoped to a role and expire.', kind: 'select', options: ['90 days', '30 days', 'Never expire'] },
  ];
  return (
    <div>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.breadcrumb}><span>{BREADCRUMB}</span></div>
          <h1 className={styles.title}>Security</h1>
          <p className={styles.subtitle}>
            Two-step sign-in, SSO, sessions, IP rules, and impersonation.
          </p>
          <SaveStateNote state={secSaveState} />
        </div>
      </div>
      <div className={styles.card}>
        {rows.map((r) => (
          <div key={r.slug} className={styles.switchRow}>
            <span className={styles.switchText}>
              <span className={styles.switchTitle}>{r.title}</span>
              <span className={styles.switchSub}>{r.sub}</span>
            </span>
            <span className={styles.switchControl}>
              {r.kind === 'select' ? (
                <select
                  className={styles.switchSelect}
                  value={String(sec[r.slug] ?? r.options?.[0] ?? '')}
                  aria-label={r.title}
                  onChange={(e) => saveSec({ [r.slug]: e.target.value })}
                >
                  {(r.options ?? []).map((opt) => (
                    <option key={opt}>{opt}</option>
                  ))}
                </select>
              ) : (
                <button
                  type="button"
                  className={`${styles.permToggle} ${sec[r.slug] ? styles.permToggleOn : ''}`}
                  aria-pressed={!!sec[r.slug]}
                  aria-label={r.title}
                  onClick={() => saveSec({ [r.slug]: !sec[r.slug] })}
                >
                  <span className={styles.permToggleKnob} />
                </button>
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ──────────────────────────── ACTIVITY ──────────────────────────── */
const ACTIVITY_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'insert', label: 'Created' },
  { id: 'update', label: 'Updated' },
  { id: 'delete', label: 'Deleted' },
] as const;

interface AuditRow {
  id: string;
  who: string;
  what: string;
  kind: string;
  when: string;
  where: string;
}

function ActivityView({ onToast }: { onToast: (m: string) => void }) {
  const [filter, setFilter] = useState<string>('all');
  const [events, setEvents] = useState<AuditRow[]>([]);
  useEffect(() => {
    let live = true;
    fetch('/api/platform/audit-events?limit=300')
      .then((r) => r.json())
      .then((j: { data?: AuditRow[] }) => { if (live) setEvents(j.data || []); })
      .catch(() => {});
    return () => { live = false; };
  }, []);
  const rows = events.filter((e) => filter === 'all' || e.kind === filter);
  const fmtWhen = (iso: string) => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };
  return (
    <div>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.breadcrumb}><span>{BREADCRUMB}</span></div>
          <h1 className={styles.title}>Activity log</h1>
          <p className={styles.subtitle}>Every create, update, and delete recorded across the workspace.</p>
        </div>
        <div className={styles.headerRight}>
          <button
            type="button"
            className={`${styles.btn} ${styles.btnPrimary}`}
            onClick={() => {
              exportToCsv(
                rows as unknown as Record<string, unknown>[],
                [
                  { key: 'who', label: 'Who' },
                  { key: 'what', label: 'What' },
                  { key: 'when', label: 'When' },
                  { key: 'where', label: 'Where' },
                ],
                'activity-log',
              );
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>download</span>
            Export CSV
          </button>
        </div>
      </div>
      <div className={styles.filterRow}>
        {ACTIVITY_FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            className={`${styles.filterChip} ${filter === f.id ? styles.filterChipActive : ''}`}
            onClick={() => setFilter(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>
      <div className={styles.card}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Who</th>
              <th>What</th>
              <th>When</th>
              <th>Where</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => (
              <tr key={e.id}>
                <td><strong>{e.who}</strong></td>
                <td>{e.what}</td>
                <td>{fmtWhen(e.when)}</td>
                <td>{e.where}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className={styles.emptyText}>No events match this filter.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ──────────────────────────── MULTILINGUAL ──────────────────────────── */
function MultilingualView({ onToast }: { onToast: (m: string) => void }) {
  const [langSettings, saveLangSettings, langSaveState] = useWorkspaceSection<{ active: Record<string, boolean> }>(
    'workspace_languages',
    { active: { en: true, es: true, fr: false, de: false } },
  );
  const langs = [
    { code: 'en', label: 'English (US)', default: true },
    { code: 'es', label: 'Spanish (Latin America)', default: false },
    { code: 'fr', label: 'French (France)', default: false },
    { code: 'de', label: 'German', default: false },
  ];
  const isActive = (code: string) => langSettings.active?.[code] === true;
  return (
    <div>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.breadcrumb}><span>{BREADCRUMB}</span></div>
          <h1 className={styles.title}>Multilingual</h1>
          <p className={styles.subtitle}>
            Languages teammates and customers can use. Translations are per-brand.
          </p>
          <SaveStateNote state={langSaveState} />
        </div>
      </div>
      <div className={styles.card}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Language</th>
              <th>Code</th>
              <th>Default</th>
              <th>Active</th>
            </tr>
          </thead>
          <tbody>
            {langs.map((l) => (
              <tr key={l.code}>
                <td><strong>{l.label}</strong></td>
                <td>{l.code}</td>
                <td>{l.default ? <span className={`${styles.tag} ${styles.tagOk}`}>Default</span> : '—'}</td>
                <td>
                  <button
                    type="button"
                    className={`${styles.permToggle} ${isActive(l.code) ? styles.permToggleOn : ''}`}
                    aria-pressed={isActive(l.code)}
                    aria-label={`Toggle ${l.label}`}
                    onClick={() => saveLangSettings({ active: { ...langSettings.active, [l.code]: !isActive(l.code) } })}
                  >
                    <span className={styles.permToggleKnob} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ──────────────────────────── OFFICE HOURS ──────────────────────────── */
function HoursView() {
  const [hours, setHours] = useState<{ name: string; timezone: string; schedule: Record<string, string[]> } | null>(null);
  useEffect(() => {
    let live = true;
    fetch('/api/support/business-hours')
      .then((r) => r.json())
      .then((j: { data?: { name: string; timezone: string; schedule: Record<string, string[]>; isDefault?: boolean }[] }) => {
        if (!live) return;
        const rows = j.data || [];
        setHours(rows.find((r) => r.isDefault) || rows[0] || null);
      })
      .catch(() => {});
    return () => { live = false; };
  }, []);
  const days: { key: string; label: string }[] = [
    { key: 'mon', label: 'Mon' }, { key: 'tue', label: 'Tue' }, { key: 'wed', label: 'Wed' },
    { key: 'thu', label: 'Thu' }, { key: 'fri', label: 'Fri' }, { key: 'sat', label: 'Sat' }, { key: 'sun', label: 'Sun' },
  ];
  return (
    <div>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.breadcrumb}><span>{BREADCRUMB}</span></div>
          <h1 className={styles.title}>Office hours</h1>
          <p className={styles.subtitle}>
            When teammates are expected to be available. Drives routing and out-of-office replies.
          </p>
        </div>
      </div>
      <div className={styles.card}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Day</th>
              <th>Open</th>
              <th>Close</th>
              <th>Timezone</th>
            </tr>
          </thead>
          <tbody>
            {days.map((d) => {
              const slot = hours?.schedule?.[d.key];
              return slot && slot.length >= 2 ? (
                <tr key={d.key}>
                  <td><strong>{d.label}</strong></td>
                  <td>{slot[0]}</td>
                  <td>{slot[1]}</td>
                  <td>{hours?.timezone || '—'}</td>
                </tr>
              ) : (
                <tr key={d.key}>
                  <td><strong>{d.label}</strong></td>
                  <td colSpan={3} style={{ color: '#5a6355' }}>Closed</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ──────────────────────────── GENERAL ──────────────────────────── */
function GeneralView() {
  const [ws, setWs] = useState<{ name: string; currency: string; fiscalYearStartMonth: number | null; timezone: string | null; region: string | null } | null>(null);
  useEffect(() => {
    let live = true;
    fetch('/api/platform/workspace')
      .then((r) => r.json())
      .then((j: { data?: typeof ws }) => { if (live && j.data) setWs(j.data); })
      .catch(() => {});
    return () => { live = false; };
  }, []);
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const rows: [string, string][] = [
    ['Workspace name', ws?.name || '…'],
    ['Region', ws?.region || '—'],
    ['Default brand', ws?.name || '…'],
    ['Timezone', ws?.timezone || '—'],
    ['Currency', ws ? (ws.currency === 'USD' ? 'USD ($)' : ws.currency) : '…'],
    ['Fiscal year start', ws?.fiscalYearStartMonth ? months[ws.fiscalYearStartMonth - 1] : '—'],
  ];
  return (
    <div>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.breadcrumb}><span>{BREADCRUMB}</span></div>
          <h1 className={styles.title}>General</h1>
          <p className={styles.subtitle}>Workspace name, region, and defaults.</p>
        </div>
      </div>
      <div className={styles.kvList}>
        {rows.map(([label, value]) => (
          <div key={label} className={styles.kvRow}>
            <span className={styles.kvLabel}>{label}</span>
            <span className={styles.kvValue}>{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ──────────────────────────── MAILBOXES ──────────────────────────── */
/* Mailbox connect (CRM pack): the /api/crm/mailboxes routes shipped
   with no consuming screen. Per the IA, mailbox connect lives in
   Settings — this view lists platform_mailboxes, connects a mailbox
   (POST) and disconnects/reconnects one (PATCH status). The inbox
   and the mail quick action read the same table. */
interface MailboxRow { id: string; email_address: string; provider: string; status: string; sync_mode: string | null; created_at: string }
function MailboxesView({ onToast }: { onToast: (m: string) => void }) {
  const [rows, setRows] = useState<MailboxRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [email, setEmail] = useState('');
  const [provider, setProvider] = useState('gmail');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const r = await fetch('/api/crm/mailboxes');
      const j = await r.json();
      setRows((j.data as MailboxRow[]) || []);
    } catch { setRows([]); }
    setLoaded(true);
  };
  useEffect(() => { load(); }, []);

  async function connect() {
    if (!email.includes('@')) { onToast('Enter a valid email address'); return; }
    setBusy(true);
    try {
      const r = await fetch('/api/crm/mailboxes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email_address: email.trim(), provider }) });
      const j = await r.json();
      if (!r.ok) { onToast(j.error?.message || 'Could not connect the mailbox'); return; }
      setEmail('');
      await load();
      onToast('Mailbox connected');
    } finally { setBusy(false); }
  }

  async function setStatus(row: MailboxRow, status: 'active' | 'disconnected') {
    setBusy(true);
    try {
      const r = await fetch(`/api/crm/mailboxes/${row.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
      const j = await r.json();
      if (!r.ok) { onToast(j.error?.message || 'Could not update the mailbox'); return; }
      await load();
      onToast(status === 'active' ? 'Mailbox reconnected' : 'Mailbox disconnected');
    } finally { setBusy(false); }
  }

  return (
    <div>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.breadcrumb}><span>{BREADCRUMB}</span></div>
          <h1 className={styles.title}>Mailboxes</h1>
          <p className={styles.subtitle}>
            Connected mailboxes power the inbox and sending from a party. Connect one here; compose from the mail quick action.
          </p>
        </div>
      </div>
      <div className={styles.card}>
        {!loaded ? (
          <p style={{ color: '#5a6355' }}>Loading…</p>
        ) : rows.length === 0 ? (
          <p style={{ color: '#5a6355' }}>No mailboxes connected yet.</p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr><th>Email</th><th>Provider</th><th>Sync</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td><strong>{row.email_address}</strong></td>
                  <td>{row.provider}</td>
                  <td>{row.sync_mode || '—'}</td>
                  <td>{row.status}</td>
                  <td>
                    {row.status === 'active' ? (
                      <button className={`${styles.btn} ${styles.btnSm}`} disabled={busy} onClick={() => setStatus(row, 'disconnected')}>Disconnect</button>
                    ) : (
                      <button className={`${styles.btn} ${styles.btnSm}`} disabled={busy} onClick={() => setStatus(row, 'active')}>Reconnect</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
          <input
            type="email"
            placeholder="mailbox@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{ height: 36, padding: '0 10px', border: '1px solid #d4d9d0', borderRadius: 6, minWidth: 240 }}
          />
          <select value={provider} onChange={(e) => setProvider(e.target.value)} style={{ height: 36, border: '1px solid #d4d9d0', borderRadius: 6 }} aria-label="Provider">
            <option value="gmail">Gmail</option>
            <option value="outlook">Outlook</option>
            <option value="imap">IMAP</option>
            <option value="resend_inbound">Resend inbound</option>
          </select>
          <button className={`${styles.btn} ${styles.btnPrimary}`} disabled={busy || !email.includes('@')} onClick={connect}>Connect mailbox</button>
        </div>
      </div>
    </div>
  );
}

/* ──────────────────────────── RENDERER ──────────────────────────── */
const WS_SCREEN_IDS = new Set<string>([
  'ws-home',
  'settings-overview',
  'ws-general',
  'ws-teammates',
  'ws-roles',
  'ws-external',
  'ws-approvals',
  'ws-owners',
  'ws-hours',
  'ws-brands',
  'ws-security',
  'ws-activity',
  'ws-multilingual',
  'ws-mailboxes',
]);

export { WS_SCREEN_IDS };

export default function WorkspaceSettings({
  screenId,
  onGotoScreen,
  onToast,
}: WorkspaceSettingsProps) {
  let body: React.ReactNode;
  switch (screenId) {
    case 'ws-home':
    case 'settings-overview':
      body = <HomeView onGotoScreen={onGotoScreen} />;
      break;
    case 'ws-teammates':
      body = <TeammatesView onToast={onToast} />;
      break;
    case 'ws-roles':
      body = <RolesView onToast={onToast} />;
      break;
    case 'ws-external':
      body = <ExternalView />;
      break;
    case 'ws-approvals':
      body = <ApprovalsView onToast={onToast} />;
      break;
    case 'ws-owners':
      body = <OwnersView />;
      break;
    case 'ws-brands':
      body = <BrandsView onToast={onToast} />;
      break;
    case 'ws-security':
      body = <SecurityView onToast={onToast} />;
      break;
    case 'ws-activity':
      body = <ActivityView onToast={onToast} />;
      break;
    case 'ws-multilingual':
      body = <MultilingualView onToast={onToast} />;
      break;
    case 'ws-hours':
      body = <HoursView />;
      break;
    case 'ws-general':
      body = <GeneralView />;
      break;
    case 'ws-mailboxes':
      body = <MailboxesView onToast={onToast} />;
      break;
    default:
      body = <HomeView onGotoScreen={onGotoScreen} />;
  }
  return <div className={styles.container}>{body}</div>;
}
