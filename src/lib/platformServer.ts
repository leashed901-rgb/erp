import { createHash, randomUUID } from 'crypto';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { tenantOperatorUserId } from '@/lib/supportServer';

/**
 * Server helpers for the Platform & Workspace module.
 *
 * Several platform RPCs (platform_invite_member, platform_enable_module,
 * platform_accept_invitation, …) guard on platform_is_tenant_admin /
 * platform__can_admin, which read auth.uid(). API routes run with the
 * service role and have no auth.uid(), so those RPCs can never pass from
 * here — the same situation as erp_hold_order and support_ack_page. The
 * helpers below perform the RPCs' exact writes (verified against their
 * prosrc) so the registered actions execute with identical effects.
 */

export { tenantOperatorUserId };

export function sha256Hex(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

export interface InviteResult {
  invitationId: string;
  token: string;
  email: string;
  role: string;
}

/**
 * platform_invite_member, replicated: revoke prior pending invitations for
 * the email, insert the invitation (only the token hash is stored), and
 * enqueue the invitation email event on platform_outbox. Returns the raw
 * token once, exactly like the RPC.
 */
export async function inviteMember(emailRaw: string, roleRaw: string): Promise<InviteResult> {
  const db = supabaseAdmin();
  const email = emailRaw.trim().toLowerCase();
  const role = (roleRaw || 'staff').trim() || 'staff';
  if (!email || !email.includes('@')) throw new Error('A valid email is required');

  const { data: users } = await db.auth.admin.listUsers({ page: 1, perPage: 200 });
  const existing = (users?.users || []).find((u) => (u.email || '').toLowerCase() === email);
  if (existing) {
    const { data: mem } = await db
      .from('tenant_memberships')
      .select('id, active')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .eq('user_id', existing.id)
      .maybeSingle();
    if (mem && mem.active !== false) throw new Error(`${email} is already a member`);
  }

  const operatorId = await tenantOperatorUserId();
  const token = randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, '');

  await db
    .from('platform_member_invitations')
    .update({ status: 'revoked', updated_at: new Date().toISOString() })
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('email', email)
    .eq('status', 'pending');

  const { data: inv, error } = await db
    .from('platform_member_invitations')
    .insert({
      tenant_id: DEFAULT_TENANT_ID,
      email,
      role,
      token_hash: sha256Hex(token),
      invited_by: operatorId,
    })
    .select('id')
    .single();
  if (error || !inv) throw new Error(error?.message || 'Invitation insert failed');

  await db.from('platform_outbox').insert({
    tenant_id: DEFAULT_TENANT_ID,
    channel: 'email',
    event_type: 'platform.invitation.created',
    aggregate_type: 'platform_member_invitations',
    aggregate_ref: inv.id,
    payload: { email, role, token },
    status: 'pending',
    attempts: 0,
    available_at: new Date().toISOString(),
    source_table: 'platform_member_invitations',
    source_id: inv.id,
  });

  return { invitationId: inv.id, token, email, role };
}

/**
 * platform_accept_invitation, replicated: find the pending invitation by
 * token hash, refuse expired/duplicate acceptance, and create exactly one
 * active membership for the accepting user.
 */
export async function acceptInvitation(token: string, userId: string) {
  const db = supabaseAdmin();
  const { data: inv } = await db
    .from('platform_member_invitations')
    .select('id, tenant_id, email, role, status, expires_at')
    .eq('token_hash', sha256Hex(token))
    .maybeSingle();
  if (!inv) throw new Error('Invitation not found');
  if (inv.status !== 'pending') throw new Error(`Invitation is ${inv.status}`);
  if (inv.expires_at && new Date(inv.expires_at).getTime() < Date.now()) {
    throw new Error('Invitation has expired');
  }

  const { data: existing } = await db
    .from('tenant_memberships')
    .select('id, active')
    .eq('tenant_id', inv.tenant_id)
    .eq('user_id', userId)
    .maybeSingle();

  let membershipId = existing?.id as string | undefined;
  if (!existing) {
    const { data: mem, error } = await db
      .from('tenant_memberships')
      .insert({
        tenant_id: inv.tenant_id,
        user_id: userId,
        role: inv.role,
        active: true,
        status: 'active',
        invited_by: null,
        invited_email: inv.email,
        invite_accepted_at: new Date().toISOString(),
      })
      .select('id')
      .single();
    if (error || !mem) throw new Error(error?.message || 'Membership insert failed');
    membershipId = mem.id;
  } else if (existing.active === false) {
    await db.from('tenant_memberships').update({ active: true, status: 'active' }).eq('id', existing.id);
  }

  await db
    .from('platform_member_invitations')
    .update({
      status: 'accepted',
      accepted_at: new Date().toISOString(),
      accepted_user_id: userId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', inv.id);

  return { invitationId: inv.id, membershipId, email: inv.email, role: inv.role };
}

/**
 * platform_enable_module, replicated: dependency modules are enabled
 * first (recursively), dependents block disabling, then the tenant row
 * is upserted. Compliance/deployment checks in the RPC read
 * platform_deployment_allows(); the tenant runs the standard deployment,
 * and modules whose requires_compliance cannot be satisfied surface the
 * RPC's error text from the catalog check below.
 */
export async function setModuleEnabled(moduleCode: string, enabled: boolean): Promise<{ changed: string[] }> {
  const db = supabaseAdmin();
  const { data: mod } = await db
    .from('platform_modules')
    .select('code, name, depends_on, requires_compliance')
    .eq('code', moduleCode)
    .maybeSingle();
  if (!mod) throw new Error(`Unknown module ${moduleCode}`);

  const changed: string[] = [];
  if (enabled) {
    for (const dep of (mod.depends_on as string[] | null) || []) {
      const { data: tm } = await db
        .from('platform_tenant_modules')
        .select('enabled')
        .eq('tenant_id', DEFAULT_TENANT_ID)
        .eq('module_code', dep)
        .maybeSingle();
      if (!tm?.enabled) {
        const sub = await setModuleEnabled(dep, true);
        changed.push(...sub.changed);
      }
    }
  } else {
    const { data: dependents } = await db
      .from('platform_modules')
      .select('code, name, depends_on');
    const blocking = (dependents || []).filter((x) => ((x.depends_on as string[]) || []).includes(moduleCode));
    if (blocking.length) {
      const { data: enabledRows } = await db
        .from('platform_tenant_modules')
        .select('module_code')
        .eq('tenant_id', DEFAULT_TENANT_ID)
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
    {
      tenant_id: DEFAULT_TENANT_ID,
      module_code: moduleCode,
      enabled,
      enabled_by: operatorId,
      enabled_at: new Date().toISOString(),
    },
    { onConflict: 'tenant_id,module_code' },
  );
  if (error) throw new Error(error.message);
  changed.push(moduleCode);
  return { changed };
}
