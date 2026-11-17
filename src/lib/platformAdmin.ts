import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { tenantOperatorUserId } from '@/lib/supportServer';

/**
 * Platform-admin (operator scope) data layer.
 *
 * This is the Unleashe operator layer — above every tenant. It reads
 * platform-scope tables (tenants, platform_jobs, platform_modules,
 * platform_audit_events, platform_admins, platform_account_subscriptions)
 * and never a tenant's business data. Unknown values stay unknown:
 * a missing member count or billing state renders as such, never as 0.
 */

export interface AdminTenant {
  id: string;
  name: string;
  slug: string | null;
  business_type: string | null;
  lifecycle: string;
  plan_label: string | null;
  billing_status: string;
  member_count: number | null;
  last_activity_at: string | null;
  owner: { display: string | null; email: string | null; pending_invitation: boolean } | null;
  attention_flags: string[];
  created_at: string;
}

const LIFECYCLES = ['requested', 'provisioning', 'provisioning_failed', 'active', 'suspended', 'closing', 'archived'];

function lifecycleOf(status: string | null, isActive: boolean | null): string {
  const s = (status || '').toLowerCase();
  if (LIFECYCLES.includes(s)) return s;
  if (s === 'provisioning-failed') return 'provisioning_failed';
  if (isActive === false) return 'suspended';
  return s || 'active';
}

export async function listAdminTenants(): Promise<AdminTenant[]> {
  const db = supabaseAdmin();
  const [{ data: tenants }, { data: memberships }, { data: invitations }, { data: audit }] = await Promise.all([
    db.from('tenants').select('id, name, slug, type, tenant_kind, status, is_active, plan_tier, subscription_status, support_email, created_at').order('created_at', { ascending: false }),
    db.from('tenant_memberships').select('tenant_id'),
    db.from('platform_member_invitations').select('tenant_id, email, role, status'),
    db.from('platform_audit_events').select('tenant_id, occurred_at').order('occurred_at', { ascending: false }).limit(5000),
  ]);

  const memberCounts = new Map<string, number>();
  for (const m of memberships || []) memberCounts.set(m.tenant_id, (memberCounts.get(m.tenant_id) || 0) + 1);

  const lastActivity = new Map<string, string>();
  for (const a of audit || []) {
    if (a.tenant_id && !lastActivity.has(a.tenant_id)) lastActivity.set(a.tenant_id, a.occurred_at);
  }

  const ownerByTenant = new Map<string, { display: string | null; email: string | null; pending_invitation: boolean }>();
  for (const inv of invitations || []) {
    const st = (inv.status || '').toLowerCase();
    const pending = st === 'pending' || st === 'sent' || st === 'invited';
    if ((inv.role || '').toLowerCase().includes('owner') || pending) {
      if (!ownerByTenant.has(inv.tenant_id)) {
        ownerByTenant.set(inv.tenant_id, { display: null, email: inv.email, pending_invitation: pending });
      }
    }
  }

  return (tenants || []).map((t) => {
    const lifecycle = lifecycleOf(t.status, t.is_active);
    const billing = (t.subscription_status || 'unknown').toLowerCase();
    const flags: string[] = [];
    if (lifecycle === 'provisioning_failed') flags.push('provisioning_failed');
    if (billing === 'past_due') flags.push('past_due');
    if (lifecycle === 'suspended') flags.push('suspended');
    const owner = ownerByTenant.get(t.id) || (t.support_email ? { display: null, email: t.support_email, pending_invitation: false } : null);
    if (owner?.pending_invitation) flags.push('pending_owner_invitation');
    const mc = memberCounts.get(t.id) || 0;
    return {
      id: t.id,
      name: t.name,
      slug: t.slug,
      business_type: t.tenant_kind || t.type || null,
      lifecycle,
      plan_label: t.plan_tier,
      billing_status: billing,
      // The membership table is the only member source; where it holds no
      // rows the count is unknown, not zero.
      member_count: mc > 0 ? mc : null,
      last_activity_at: lastActivity.get(t.id) || null,
      owner,
      attention_flags: flags,
      created_at: t.created_at,
    };
  });
}

export async function adminOverview() {
  const db = supabaseAdmin();
  const tenants = await listAdminTenants();
  const [{ data: failedJobs }, { data: subs }] = await Promise.all([
    db.from('platform_jobs').select('id, job_type, status, last_error, tenant_id, created_at').eq('status', 'failed').order('created_at', { ascending: false }).limit(10),
    db.from('platform_account_subscriptions').select('status'),
  ]);
  const subPastDue = (subs || []).filter((s) => (s.status || '').toLowerCase() === 'past_due').length;
  return {
    tenants,
    counts: {
      active: tenants.filter((t) => t.lifecycle === 'active').length,
      suspended: tenants.filter((t) => t.lifecycle === 'suspended').length,
      provisioning_failed: tenants.filter((t) => t.lifecycle === 'provisioning_failed').length,
      pending_owner_invitations: tenants.filter((t) => t.attention_flags.includes('pending_owner_invitation')).length,
      past_due: tenants.filter((t) => t.billing_status === 'past_due').length + subPastDue,
      billing_unknown: tenants.filter((t) => t.billing_status === 'unknown').length,
      total: tenants.length,
    },
    // No platform support-request endpoint exists yet; the design renders
    // this as unknown rather than zero.
    pending_support_requests: null as number | null,
    provisioning_failures: failedJobs || [],
  };
}

export async function listProvisioningJobs() {
  const db = supabaseAdmin();
  const { data } = await db
    .from('platform_jobs')
    .select('id, tenant_id, queue, job_type, status, attempts, max_attempts, last_error, run_at, started_at, finished_at, created_at')
    .order('created_at', { ascending: false })
    .limit(100);
  return data || [];
}

export async function listEntitlements(tenantId: string) {
  const db = supabaseAdmin();
  const [{ data: modules }, { data: tenantModules }, { data: packs }] = await Promise.all([
    db.from('platform_modules').select('code, name, depends_on').order('name'),
    db.from('platform_tenant_modules').select('module_code, enabled').eq('tenant_id', tenantId),
    db.from('platform_tenant_packs').select('pack_code, enabled').eq('tenant_id', tenantId),
  ]);
  const state = new Map((tenantModules || []).map((r) => [r.module_code, r.enabled]));
  return {
    modules: (modules || []).map((m) => ({ code: m.code, name: m.name, depends_on: m.depends_on || [], enabled: state.get(m.code) ?? false, assigned: state.has(m.code) })),
    packs: packs || [],
  };
}

/** platform_enable_module semantics for an explicit tenant (operator scope). */
export async function setModuleEnabledForTenant(tenantId: string, moduleCode: string, enabled: boolean): Promise<{ changed: string[] }> {
  const db = supabaseAdmin();
  const { data: mod } = await db.from('platform_modules').select('code, name, depends_on').eq('code', moduleCode).maybeSingle();
  if (!mod) throw new Error(`Unknown module ${moduleCode}`);
  const changed: string[] = [];
  if (enabled) {
    for (const dep of (mod.depends_on as string[] | null) || []) {
      const { data: tm } = await db.from('platform_tenant_modules').select('enabled').eq('tenant_id', tenantId).eq('module_code', dep).maybeSingle();
      if (!tm?.enabled) changed.push(...(await setModuleEnabledForTenant(tenantId, dep, true)).changed);
    }
  } else {
    const { data: all } = await db.from('platform_modules').select('code, name, depends_on');
    const blocking = (all || []).filter((x) => ((x.depends_on as string[]) || []).includes(moduleCode));
    if (blocking.length) {
      const { data: enabledRows } = await db
        .from('platform_tenant_modules')
        .select('module_code')
        .eq('tenant_id', tenantId)
        .eq('enabled', true)
        .in('module_code', blocking.map((b) => b.code));
      if (enabledRows && enabledRows.length) {
        const names = blocking.filter((b) => enabledRows.some((r) => r.module_code === b.code)).map((b) => b.name);
        throw new Error(`Turn off ${names.join(', ')} first (they need ${mod.name})`);
      }
    }
  }
  const operatorId = await tenantOperatorUserId();
  const { error } = await db.from('platform_tenant_modules').upsert(
    { tenant_id: tenantId, module_code: moduleCode, enabled, enabled_by: operatorId, enabled_at: new Date().toISOString() },
    { onConflict: 'tenant_id,module_code' },
  );
  if (error) throw new Error(error.message);
  changed.push(moduleCode);
  return { changed };
}

export async function listBilling() {
  const db = supabaseAdmin();
  const [{ data: subs }, tenants] = await Promise.all([
    db.from('platform_account_subscriptions').select('id, tenant_id, account_email, user_type, status, stripe_customer_id, stripe_subscription_id, current_period_end, created_at').order('created_at', { ascending: false }).limit(100),
    listAdminTenants(),
  ]);
  return { subscriptions: subs || [], tenants };
}

export async function listAudit(limit = 100) {
  const db = supabaseAdmin();
  const { data } = await db
    .from('platform_audit_events')
    .select('id, occurred_at, tenant_id, actor_label, action, object_table, object_ref, summary')
    .order('occurred_at', { ascending: false })
    .limit(limit);
  return data || [];
}

export async function listStaff() {
  const db = supabaseAdmin();
  const { data } = await db.from('platform_admins').select('user_id, granted_by, granted_at, expires_at, reason, tenant_id').order('granted_at', { ascending: false });
  const operatorId = await tenantOperatorUserId().catch(() => null);
  return { grants: data || [], current_operator_id: operatorId };
}

export async function listIdentities() {
  const db = supabaseAdmin();
  const { data, error } = await db.auth.admin.listUsers({ page: 1, perPage: 100 });
  if (error) throw new Error(error.message);
  return (data?.users || []).map((u) => ({
    id: u.id,
    email: u.email || null,
    name: (u.user_metadata?.full_name as string) || (u.user_metadata?.name as string) || null,
    created_at: u.created_at,
    last_sign_in_at: u.last_sign_in_at || null,
    confirmed: !!u.email_confirmed_at,
  }));
}
