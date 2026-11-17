import { NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { tenantOperatorUserId } from '@/lib/platformServer';

export const dynamic = 'force-dynamic';

function fail(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

/**
 * Profile-level platform records for the signed-in operator:
 *   create.out_of_office           → platform_out_of_office
 *   create.notification_preference → platform_notification_preferences
 * These are registry create actions (actions.md), not pages — they live
 * on the member's profile and are exercised from the Create menu.
 *
 * GET  ?kind=out-of-office|notification-preferences
 * POST { kind, ... } / DELETE ?kind=&id=
 */
export async function GET(req: Request) {
  try {
    const kind = new URL(req.url).searchParams.get('kind') || 'out-of-office';
    const db = supabaseAdmin();
    const userId = await tenantOperatorUserId();
    if (kind === 'out-of-office') {
      const { data } = await db
        .from('platform_out_of_office')
        .select('id, starts_at, ends_at, delegate_user_id, applies_to, message, created_at')
        .eq('tenant_id', DEFAULT_TENANT_ID)
        .eq('user_id', userId || '')
        .order('starts_at', { ascending: false });
      return NextResponse.json({ data: data || [] });
    }
    if (kind === 'notification-preferences') {
      const { data } = await db
        .from('platform_notification_preferences')
        .select('id, event_type, channel, enabled, digest, quiet_start, quiet_end, timezone')
        .eq('tenant_id', DEFAULT_TENANT_ID)
        .eq('user_id', userId || '')
        .order('event_type');
      return NextResponse.json({ data: data || [] });
    }
    return fail('VALIDATION', `Unknown kind ${kind}`, 400);
  } catch (e: unknown) {
    return fail('INTERNAL', e instanceof Error ? e.message : 'Failed', 500);
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const kind = String(body.kind || '');
    const db = supabaseAdmin();
    const userId = await tenantOperatorUserId();
    if (!userId) return fail('INTERNAL', 'No operator user', 500);

    if (kind === 'out-of-office') {
      const { data, error } = await db.from('platform_out_of_office').insert({
        tenant_id: DEFAULT_TENANT_ID,
        user_id: userId,
        starts_at: String(body.startsAt || ''),
        ends_at: String(body.endsAt || ''),
        delegate_user_id: (body.delegateUserId as string) ?? null,
        applies_to: Array.isArray(body.appliesTo) ? body.appliesTo : ['all'],
        message: (body.message as string) ?? null,
      }).select('id').single();
      if (error) return fail('INSERT_FAILED', error.message, 500);
      return NextResponse.json({ data }, { status: 201 });
    }
    if (kind === 'notification-preferences') {
      const row = {
        tenant_id: DEFAULT_TENANT_ID,
        user_id: userId,
        event_type: String(body.eventType || ''),
        channel: String(body.channel || 'email'),
        enabled: body.enabled !== false,
        digest: (body.digest as string) ?? null,
        quiet_start: (body.quietStart as string) ?? null,
        quiet_end: (body.quietEnd as string) ?? null,
        timezone: (body.timezone as string) ?? null,
      };
      const { data, error } = body.id
        ? await db.from('platform_notification_preferences').update({ ...row, updated_at: new Date().toISOString() }).eq('id', String(body.id)).select('id').single()
        : await db.from('platform_notification_preferences').insert(row).select('id').single();
      if (error) return fail('WRITE_FAILED', error.message, 500);
      return NextResponse.json({ data }, { status: body.id ? 200 : 201 });
    }
    return fail('VALIDATION', `Unknown kind ${kind}`, 400);
  } catch (e: unknown) {
    return fail('INTERNAL', e instanceof Error ? e.message : 'Failed', 500);
  }
}

export async function DELETE(req: Request) {
  try {
    const url = new URL(req.url);
    const kind = url.searchParams.get('kind') || '';
    const id = url.searchParams.get('id') || '';
    const table = { 'out-of-office': 'platform_out_of_office', 'notification-preferences': 'platform_notification_preferences' }[kind];
    if (!table || !id) return fail('VALIDATION', 'kind and id are required', 400);
    const { error } = await supabaseAdmin().from(table).delete().eq('id', id);
    if (error) return fail('DELETE_FAILED', error.message, 500);
    return NextResponse.json({ data: { ok: true } });
  } catch (e: unknown) {
    return fail('INTERNAL', e instanceof Error ? e.message : 'Failed', 500);
  }
}
