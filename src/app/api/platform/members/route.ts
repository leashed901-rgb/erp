import { NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { inviteMember, acceptInvitation, tenantOperatorUserId } from '@/lib/platformServer';

export const dynamic = 'force-dynamic';

function fail(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

/**
 * GET /api/platform/members — the workspace's people, from the tables the
 * spec binds to Settings/Workspace/Teammates and Roles:
 * tenant_memberships + platform_member_invitations (pending) +
 * platform_member_roles (assignments) + platform_roles (catalog) +
 * platform_role_aliases.
 */
export async function GET() {
  try {
    const db = supabaseAdmin();
    const [mem, inv, roles, catalog, aliases, users, prefs] = await Promise.all([
      db.from('tenant_memberships').select('id, user_id, role, active, status, mfa_enabled, invited_email, last_active_at, created_at').eq('tenant_id', DEFAULT_TENANT_ID).order('created_at'),
      db.from('platform_member_invitations').select('id, email, role, status, title, created_at, expires_at').eq('tenant_id', DEFAULT_TENANT_ID).eq('status', 'pending').order('created_at', { ascending: false }),
      db.from('platform_member_roles').select('id, user_id, role_code, title, scope_type, status, assigned_at, expires_at').eq('tenant_id', DEFAULT_TENANT_ID).eq('status', 'active').order('assigned_at', { ascending: false }),
      db.from('platform_roles').select('code, label, plural, rank, role_kind, description, sort_order').order('sort_order'),
      db.from('platform_role_aliases').select('alias, role_code, title, source').order('alias'),
      db.auth.admin.listUsers({ page: 1, perPage: 200 }),
      db.from('platform_notification_preferences').select('user_id, event_type, enabled').eq('tenant_id', DEFAULT_TENANT_ID).eq('channel', 'email'),
    ]);
    const userById = new Map((users.data?.users || []).map((u) => [u.id, u]));
    const members = (mem.data || []).map((m) => {
      const u = userById.get(m.user_id);
      return {
        id: m.id,
        userId: m.user_id,
        email: u?.email || m.invited_email || '—',
        name: (u?.user_metadata?.name as string) || (u?.user_metadata?.full_name as string) || u?.email || m.invited_email || 'Member',
        role: m.role,
        active: m.active !== false,
        status: m.status || (m.active === false ? 'removed' : 'active'),
        mfaEnabled: !!m.mfa_enabled,
        lastActiveAt: m.last_active_at,
        joinedAt: m.created_at,
        assignments: (roles.data || []).filter((r) => r.user_id === m.user_id),
        prefs: Object.fromEntries(
          (prefs.data || []).filter((pr) => pr.user_id === m.user_id).map((pr) => [pr.event_type, !!pr.enabled]),
        ) as Record<string, boolean>,
      };
    });
    return NextResponse.json({
      data: {
        members,
        invitations: (inv.data || []).map((i) => ({
          id: i.id, email: i.email, role: i.role, title: i.title, invitedAt: i.created_at, expiresAt: i.expires_at,
        })),
        roleCatalog: catalog.data || [],
        roleAliases: aliases.data || [],
      },
    });
  } catch (e: unknown) {
    return fail('INTERNAL', e instanceof Error ? e.message : 'Failed', 500);
  }
}

/**
 * POST /api/platform/members — registry actions for the workspace:
 *   { action: 'create.invitation', email, role }      → platform_invite_member
 *   { action: 'invitation.accept', token, email? }    → platform_accept_invitation
 *   { action: 'invitation.revoke', invitationId }     → platform_revoke_invitation
 *   { action: 'role.assign', userId, role, title? }   → platform_assign_role
 *   { action: 'role.revoke', userId, role, reason? }  → platform_revoke_role
 *   { action: 'member.remove', membershipId }         → membership deactivated
 *   { action: 'member.restore', membershipId }        → membership reactivated
 *
 * invite/accept are replicated in lib/platformServer (their RPCs guard on
 * auth.uid(), which service-role calls do not have); assign/revoke call
 * the RPCs directly.
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const action = String(body.action || '');
    const db = supabaseAdmin();

    if (action === 'create.invitation') {
      const result = await inviteMember(String(body.email || ''), String(body.role || 'staff'));
      // The token is returned once so the inviter can share the link; only
      // its hash is stored, exactly as the RPC behaves.
      return NextResponse.json({ data: result }, { status: 201 });
    }

    if (action === 'invitation.accept') {
      const token = String(body.token || '');
      if (!token) return fail('VALIDATION', 'token is required', 400);
      let userId = typeof body.userId === 'string' ? body.userId : '';
      if (!userId && typeof body.email === 'string') {
        const { data: users } = await db.auth.admin.listUsers({ page: 1, perPage: 200 });
        const found = (users?.users || []).find((u) => (u.email || '').toLowerCase() === (body.email as string).toLowerCase());
        if (found) userId = found.id;
      }
      if (!userId) return fail('VALIDATION', 'No auth user matches this invitation yet', 400);
      const result = await acceptInvitation(token, userId);
      return NextResponse.json({ data: result }, { status: 201 });
    }

    if (action === 'invitation.revoke') {
      const { error } = await db.rpc('platform_revoke_invitation', { p_invitation: body.invitationId });
      if (error) return fail('RPC_FAILED', error.message, 500);
      return NextResponse.json({ data: { ok: true } });
    }

    if (action === 'role.assign') {
      const operatorId = await tenantOperatorUserId();
      const { data, error } = await db.rpc('platform_assign_role', {
        p_tenant: DEFAULT_TENANT_ID,
        p_user: body.userId,
        p_role: body.role,
        p_title: (body.title as string) ?? null,
        p_assigned_by: operatorId,
      });
      if (error) return fail('RPC_FAILED', error.message, 500);
      return NextResponse.json({ data: data ?? { ok: true } }, { status: 201 });
    }

    if (action === 'role.revoke') {
      const operatorId = await tenantOperatorUserId();
      const { data, error } = await db.rpc('platform_revoke_role', {
        p_tenant: DEFAULT_TENANT_ID,
        p_user: body.userId,
        p_role: body.role,
        p_reason: (body.reason as string) || 'revoked by admin',
        p_revoked_by: operatorId,
      });
      if (error) return fail('RPC_FAILED', error.message, 500);
      return NextResponse.json({ data: data ?? { ok: true } });
    }

    if (action === 'member.notifications') {
      // Owner notification switches (Workspace owners view): one
      // platform_notification_preferences row per event + channel.
      const userId = String(body.userId || '');
      const eventType = String(body.eventType || '');
      if (!userId || !eventType) return fail('VALIDATION', 'userId and eventType are required', 400);
      const { error } = await db.from('platform_notification_preferences').upsert(
        { tenant_id: DEFAULT_TENANT_ID, user_id: userId, event_type: eventType, channel: 'email', enabled: !!body.enabled },
        { onConflict: 'tenant_id,user_id,event_type,channel' },
      );
      if (error) return fail('WRITE_FAILED', error.message, 500);
      return NextResponse.json({ data: { ok: true } });
    }

    if (action === 'member.remove' || action === 'member.restore') {
      const active = action === 'member.restore';
      const { data, error } = await db
        .from('tenant_memberships')
        .update({ active, status: active ? 'active' : 'removed', updated_at: new Date().toISOString() })
        .eq('tenant_id', DEFAULT_TENANT_ID)
        .eq('id', String(body.membershipId || ''))
        .select('id, active, status')
        .single();
      if (error || !data) return fail('NOT_FOUND', error?.message || 'Membership not found', 404);
      if (!active) {
        // Removing a member also ends their role assignments.
        await db
          .from('platform_member_roles')
          .update({ status: 'revoked', revoked_at: new Date().toISOString(), revoke_reason: 'member removed' })
          .eq('tenant_id', DEFAULT_TENANT_ID)
          .eq('user_id', (await db.from('tenant_memberships').select('user_id').eq('id', data.id).single()).data?.user_id || '')
          .eq('status', 'active');
      }
      return NextResponse.json({ data });
    }

    return fail('UNKNOWN_ACTION', `Action ${action} is not handled here`, 400);
  } catch (e: unknown) {
    return fail('ACTION_FAILED', e instanceof Error ? e.message : 'Action failed', 500);
  }
}
