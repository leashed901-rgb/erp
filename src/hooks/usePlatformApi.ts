'use client';

import { useCallback, useEffect, useState } from 'react';
import { fetchJson } from './useCrmApi';

/**
 * Hooks for the Platform & Workspace module: registry action execution,
 * members/invitations/roles, modules/packs, customization, profile
 * records, and workspace identity/branding/KPIs.
 */

export interface CallResult<T = unknown> { ok: boolean; error?: string; data?: T }

async function call<T = unknown>(url: string, method: string, body?: unknown): Promise<CallResult<T>> {
  const res = await fetchJson(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) return { ok: false, error: typeof res.error === 'string' ? res.error : 'Request failed' };
  const payload = res.data as { data?: T } | null;
  return { ok: true, data: payload?.data ?? undefined };
}

/* ── Registry actions ─────────────────────────────────────────── */

export const platformActions = {
  execute: (body: Record<string, unknown>) => call('/api/platform/actions', 'POST', body),
  duplicate: (table: string, id: string) => call('/api/platform/actions', 'POST', { action: 'std.duplicate', table, id }),
  deleteDraft: (table: string, id: string) => call('/api/platform/actions', 'POST', { action: 'std.delete', table, id }),
  archive: (table: string, id: string, archive = true) => call('/api/platform/actions', 'POST', { action: 'std.archive', table, id, archive }),
  follow: (relatedType: string, relatedId: string, follow = true) => call('/api/platform/actions', 'POST', { action: 'record.follow', relatedType, relatedId, follow }),
  remind: (relatedType: string, relatedId: string, message?: string, remindAt?: string) => call('/api/platform/actions', 'POST', { action: 'record.remind', relatedType, relatedId, message, remindAt }),
  logAccess: (table: string, id: string, fields?: string[], purpose?: string) => call('/api/platform/actions', 'POST', { action: 'access.log', table, id, fields, purpose }),
  setCustomFields: (entityType: string, entityId: string, values: Record<string, unknown>) => call('/api/platform/actions', 'POST', { action: 'custom_fields.set', entityType, entityId, values }),
};

/* ── Members, invitations, roles ──────────────────────────────── */

export interface PlatformMember {
  id: string; userId: string; email: string; name: string; role: string;
  active: boolean; status: string; mfaEnabled: boolean;
  lastActiveAt: string | null; joinedAt: string;
  assignments: { id: string; role_code: string; title: string | null; scope_type: string; expires_at: string | null }[];
  prefs: Record<string, boolean>;
}
export interface PlatformInvitation { id: string; email: string; role: string; title: string | null; invitedAt: string; expiresAt: string | null }
export interface RoleCatalogEntry { code: string; label: string; plural: string; rank: number; role_kind: string; description: string | null }
export interface MembersData { members: PlatformMember[]; invitations: PlatformInvitation[]; roleCatalog: RoleCatalogEntry[]; roleAliases: { alias: string; role_code: string; title: string }[] }

export function useMembers() {
  const [data, setData] = useState<MembersData | null>(null);
  const [loaded, setLoaded] = useState(false);
  const refresh = useCallback(async () => {
    const res = await fetchJson('/api/platform/members');
    if (res.ok && res.data) setData((res.data as { data?: MembersData }).data ?? null);
    setLoaded(true);
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  return { data, loaded, refresh };
}

export const memberActions = {
  invite: (email: string, role: string) => call('/api/platform/members', 'POST', { action: 'create.invitation', email, role }),
  accept: (token: string, email?: string) => call('/api/platform/members', 'POST', { action: 'invitation.accept', token, email }),
  revokeInvitation: (invitationId: string) => call('/api/platform/members', 'POST', { action: 'invitation.revoke', invitationId }),
  assignRole: (userId: string, role: string, title?: string) => call('/api/platform/members', 'POST', { action: 'role.assign', userId, role, title }),
  revokeRole: (userId: string, role: string, reason?: string) => call('/api/platform/members', 'POST', { action: 'role.revoke', userId, role, reason }),
  remove: (membershipId: string) => call('/api/platform/members', 'POST', { action: 'member.remove', membershipId }),
  restore: (membershipId: string) => call('/api/platform/members', 'POST', { action: 'member.restore', membershipId }),
  setNotification: (userId: string, eventType: string, enabled: boolean) => call('/api/platform/members', 'POST', { action: 'member.notifications', userId, eventType, enabled }),
};

/* ── Modules & packs ──────────────────────────────────────────── */

export interface ModuleEntry { code: string; name: string; kind: string; description: string | null; dependsOn: string[]; enabled: boolean | null; enabledAt: string | null }
export interface PackEntry { code: string; name: string; kind: string; description: string | null; modules: string[]; version: string | null; itemCount: number; applied: boolean; appliedAt: string | null }
export interface ModulesData { modules: ModuleEntry[]; packs: PackEntry[] }

export function useModules() {
  const [data, setData] = useState<ModulesData | null>(null);
  const [loaded, setLoaded] = useState(false);
  const refresh = useCallback(async () => {
    const res = await fetchJson('/api/platform/modules');
    if (res.ok && res.data) setData((res.data as { data?: ModulesData }).data ?? null);
    setLoaded(true);
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  return { data, loaded, refresh };
}

export const moduleActions = {
  setEnabled: (module: string, enabled: boolean) => call('/api/platform/modules', 'POST', { action: 'module.enable', module, enabled }),
  applyPack: (pack: string) => call('/api/platform/modules', 'POST', { action: 'pack.apply', pack }),
};

/* ── Customization ────────────────────────────────────────────── */

export function useCustomization(kind: string) {
  const [data, setData] = useState<Record<string, unknown>[]>([]);
  const [loaded, setLoaded] = useState(false);
  const refresh = useCallback(async () => {
    const res = await fetchJson(`/api/platform/customization?kind=${encodeURIComponent(kind)}`);
    if (res.ok) { const rows = (res.data as { data?: unknown }).data; if (Array.isArray(rows)) setData(rows as Record<string, unknown>[]); }
    setLoaded(true);
  }, [kind]);
  useEffect(() => { void refresh(); }, [refresh]);
  return { data, loaded, refresh };
}

export const customizationActions = {
  create: (body: Record<string, unknown>) => call('/api/platform/customization', 'POST', body),
  remove: (kind: string, id: string) => call(`/api/platform/customization?kind=${encodeURIComponent(kind)}&id=${encodeURIComponent(id)}`, 'DELETE'),
};

/* ── Profile records (out of office, notification preferences) ── */

export function useProfile(kind: 'out-of-office' | 'notification-preferences') {
  const [data, setData] = useState<Record<string, unknown>[]>([]);
  const [loaded, setLoaded] = useState(false);
  const refresh = useCallback(async () => {
    const res = await fetchJson(`/api/platform/profile?kind=${kind}`);
    if (res.ok) { const rows = (res.data as { data?: unknown }).data; if (Array.isArray(rows)) setData(rows as Record<string, unknown>[]); }
    setLoaded(true);
  }, [kind]);
  useEffect(() => { void refresh(); }, [refresh]);
  return { data, loaded, refresh };
}

export const profileActions = {
  create: (body: Record<string, unknown>) => call('/api/platform/profile', 'POST', body),
  remove: (kind: string, id: string) => call(`/api/platform/profile?kind=${encodeURIComponent(kind)}&id=${encodeURIComponent(id)}`, 'DELETE'),
};

/* ── Workspace identity, branding, KPIs ───────────────────────── */

export interface WorkspaceInfo {
  name: string; slug: string; legalName: string; currency: string;
  fiscalYearStartMonth: number | null; timezone: string | null; planTier: string | null;
  branding: Record<string, string | null>;
  kpis: { activeMembers: number; modulesEnabled: number; packsApplied: number; auditEvents7d: number; customFields: number; savedViews: number };
}

export function useWorkspace() {
  const [data, setData] = useState<WorkspaceInfo | null>(null);
  const [loaded, setLoaded] = useState(false);
  const refresh = useCallback(async () => {
    const res = await fetchJson('/api/platform/workspace');
    if (res.ok && res.data) setData((res.data as { data?: WorkspaceInfo }).data ?? null);
    setLoaded(true);
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  return { data, loaded, refresh };
}

export const workspaceActions = {
  saveBranding: (patch: Record<string, unknown>) => call('/api/platform/workspace', 'PATCH', patch),
};
