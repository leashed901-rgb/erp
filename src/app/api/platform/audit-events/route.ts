import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/* Workspace activity log (Settings → Workspace → Activity) over
   platform_audit_events — the platform's change trail: every insert,
   update and delete recorded for the tenant — merged with the
   workspace-action records (invitations, memberships, roles, module
   toggles, packs) that live on their own tables; see the merge note
   in GET. Actor labels are null for system writes, so those rows
   read 'System'; "where" is the table the change hit. */

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

interface AuditRow { id: string; who: string; what: string; kind: string; when: string; where: string }

export async function GET(req: NextRequest) {
  const limit = Math.min(500, Math.max(1, Number(new URL(req.url).searchParams.get('limit')) || 200));
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('platform_audit_events')
    .select('id, occurred_at, actor_label, action, object_table, object_ref, summary')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .order('occurred_at', { ascending: false })
    .limit(limit);
  if (error) return err('INTERNAL', error.message, 500);

  /* platform_audit_events is fed only by the accounting trail
     (source_table = acct_audit_log). Workspace actions — invitations,
     memberships, role assignments, module toggles, pack applications —
     are recorded on their own tables with actor + timestamp, so the
     audit list merges those rows in; without them the USER-GUIDE row
     "audit list shows the toggle/invite you just performed" can never
     pass. */
  const ws: AuditRow[] = [];
  const push = (id: string, what: string, kind: string, when: string | null, where: string) => {
    if (when) ws.push({ id, who: 'System', what, kind, when, where });
  };
  const [invs, mems, roleRows, modRows, packRows] = await Promise.all([
    sb.from('platform_member_invitations').select('id, email, role, status, created_at, accepted_at').eq('tenant_id', DEFAULT_TENANT_ID).order('created_at', { ascending: false }).limit(50),
    sb.from('tenant_memberships').select('id, invited_email, role, status, created_at, updated_at').eq('tenant_id', DEFAULT_TENANT_ID).order('updated_at', { ascending: false }).limit(50),
    sb.from('platform_member_roles').select('id, role_code, title, status, assigned_at, revoked_at').eq('tenant_id', DEFAULT_TENANT_ID).order('assigned_at', { ascending: false }).limit(50),
    sb.from('platform_tenant_modules').select('module_code, enabled, enabled_at').eq('tenant_id', DEFAULT_TENANT_ID).order('enabled_at', { ascending: false }).limit(50),
    sb.from('platform_tenant_packs').select('pack_code, applied_at').eq('tenant_id', DEFAULT_TENANT_ID).order('applied_at', { ascending: false }).limit(50),
  ]);
  for (const i of invs.data || []) {
    push(`inv-${i.id}`, `Invitation sent — ${i.email} as ${i.role}`, 'insert', i.created_at, 'platform_member_invitations');
    if (i.accepted_at) push(`inv-acc-${i.id}`, `Invitation accepted — ${i.email}`, 'update', i.accepted_at, 'platform_member_invitations');
  }
  for (const m of mems.data || []) {
    if (m.status === 'removed') push(`mem-rem-${m.id}`, `Member removed — ${m.invited_email || 'member'}`, 'delete', m.updated_at, 'tenant_memberships');
  }
  for (const r of roleRows.data || []) {
    push(`role-${r.id}`, `Role assigned — ${r.title || r.role_code}`, 'insert', r.assigned_at, 'platform_member_roles');
    if (r.revoked_at) push(`role-rev-${r.id}`, `Role revoked — ${r.title || r.role_code}`, 'delete', r.revoked_at, 'platform_member_roles');
  }
  for (const m of modRows.data || []) {
    push(`mod-${m.module_code}-${m.enabled_at}`, `Module ${m.enabled ? 'enabled' : 'disabled'} — ${m.module_code}`, 'update', m.enabled_at, 'platform_tenant_modules');
  }
  for (const p of packRows.data || []) {
    push(`pack-${p.pack_code}-${p.applied_at}`, `Pack applied — ${p.pack_code}`, 'insert', p.applied_at, 'platform_tenant_packs');
  }

  const rows = (data || []).map((r) => {
    const row = r as { id: string; occurred_at: string; actor_label: string | null; action: string; object_table: string; object_ref: string | null; summary: string | null };
    const action = String(row.action || '').toUpperCase();
    const kind = action === 'INSERT' ? 'insert' : action === 'UPDATE' ? 'update' : action === 'DELETE' ? 'delete' : 'other';
    const table = String(row.object_table || '');
    const prettyTable = table.replace(/^(acct_|crm_|erp_|platform_|commerce_|support_|social_|cms_|ad_)/, '').replace(/_/g, ' ');
    return {
      id: row.id,
      who: row.actor_label || 'System',
      what: row.summary || `${action.charAt(0)}${action.slice(1).toLowerCase()} — ${prettyTable}${row.object_ref ? ` ${row.object_ref}` : ''}`,
      kind,
      when: row.occurred_at,
      where: table || '—',
    };
  });
  const merged = [...rows, ...ws]
    .sort((a, b) => new Date(b.when).getTime() - new Date(a.when).getTime())
    .slice(0, limit);
  return NextResponse.json({ data: merged });
}
