import { NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { tenantOperatorUserId } from '@/lib/platformServer';

export const dynamic = 'force-dynamic';

/**
 * POST /api/platform/actions — executes registered actions from
 * platform_quick_action_registry through their bound RPCs.
 *
 * Body: { action: '<action_code>', table?, id?, relatedType?, relatedId?,
 *         follow?, entityType?, entityId?, values?, fields?, purpose? }
 *
 * Supported bindings (actions.md):
 *   std.duplicate        → app_duplicate_record(table, id)
 *   std.delete           → app_delete_draft(table, id)
 *   std.archive          → app_archive_record(table, id, archive)
 *   record.follow        → platform_follow(tenant, related_type, related_id, follow)
 *   record.remind        → platform_set_reminder — guarded by
 *                          platform_is_tenant_member(auth.uid()), which a
 *                          service-role call can never pass; the route
 *                          performs the RPC's insert directly (same
 *                          precedent as /api/tasks/reminders).
 *   access.log           → platform_log_access(tenant, table, record, fields, action, purpose)
 *   custom_fields.set    → platform_set_custom_fields(tenant, entity_type, entity_id, values)
 */
const RPC_ACTIONS: Record<string, (db: ReturnType<typeof supabaseAdmin>, b: Record<string, unknown>) => Promise<unknown>> = {
  'std.duplicate': async (db, b) => {
    const { data, error } = await db.rpc('app_duplicate_record', { p_table: b.table, p_id: b.id });
    if (error) throw new Error(error.message);
    return data;
  },
  'std.delete': async (db, b) => {
    const { data, error } = await db.rpc('app_delete_draft', { p_table: b.table, p_id: b.id });
    if (error) throw new Error(error.message);
    return data;
  },
  'std.archive': async (db, b) => {
    const { data, error } = await db.rpc('app_archive_record', {
      p_table: b.table,
      p_id: b.id,
      p_archive: b.archive !== false,
    });
    if (error) throw new Error(error.message);
    return data;
  },
  /* platform_follow, platform_log_access and platform_set_custom_fields
     all guard on platform_is_tenant_member(auth.uid()) — unreachable via
     the service role — so these entries perform the RPCs' exact writes
     with the operator user id (the guarded-RPC precedent). */
  'record.follow': async (db, b) => {
    const userId = await tenantOperatorUserId();
    if (!userId) throw new Error('No operator user available');
    if (b.follow === false) {
      const { error } = await db.from('platform_record_followers').delete()
        .eq('tenant_id', DEFAULT_TENANT_ID).eq('user_id', userId)
        .eq('related_type', String(b.relatedType)).eq('related_id', String(b.relatedId));
      if (error) throw new Error(error.message);
      return { following: false };
    }
    const { error } = await db.from('platform_record_followers').insert({
      tenant_id: DEFAULT_TENANT_ID, user_id: userId,
      related_type: String(b.relatedType), related_id: String(b.relatedId),
    });
    if (error && !/duplicate|conflict/i.test(error.message)) throw new Error(error.message);
    return { following: true };
  },
  'access.log': async (db, b) => {
    const userId = await tenantOperatorUserId();
    if (!userId) throw new Error('No operator user available');
    const logAction = (b.logAction as string) || 'view';
    const purpose = (b.purpose as string) ?? null;
    if (logAction === 'break_glass' && !purpose?.trim()) throw new Error('break-glass access needs a reason');
    const { error } = await db.from('platform_sensitive_access_log').insert({
      tenant_id: DEFAULT_TENANT_ID, user_id: userId,
      table_name: String(b.table), record_id: String(b.id),
      fields: (b.fields as string[] | undefined) ?? null,
      action: logAction, purpose,
    });
    if (error) throw new Error(error.message);
    return { logged: true };
  },
  'custom_fields.set': async (db, b) => {
    const userId = await tenantOperatorUserId();
    const values = (b.values || {}) as Record<string, unknown>;
    const written: string[] = [];
    for (const [key, val] of Object.entries(values)) {
      const { data: field } = await db.from('platform_custom_fields')
        .select('id, field_type')
        .eq('tenant_id', DEFAULT_TENANT_ID).eq('entity_type', String(b.entityType))
        .eq('field_key', key).eq('is_active', true).maybeSingle();
      if (!field) throw new Error(`unknown custom field ${key} on ${String(b.entityType)}`);
      await db.from('platform_custom_field_values').delete().eq('field_id', field.id).eq('entity_id', String(b.entityId));
      if (val === null || val === undefined) continue;
      const text = typeof val === 'string' ? val : JSON.stringify(val);
      const row: Record<string, unknown> = {
        tenant_id: DEFAULT_TENANT_ID, field_id: field.id,
        entity_type: String(b.entityType), entity_id: String(b.entityId), updated_by: userId,
      };
      if (['text', 'long_text', 'select', 'email', 'phone', 'url', 'user', 'record'].includes(field.field_type)) row.value_text = text;
      else if (['number', 'currency', 'percent'].includes(field.field_type)) row.value_number = Number(val);
      else if (field.field_type === 'date') row.value_date = text;
      else if (field.field_type === 'datetime') row.value_ts = text;
      else if (field.field_type === 'checkbox' || field.field_type === 'boolean') row.value_bool = !!val;
      else row.value_json = val;
      const { error } = await db.from('platform_custom_field_values').insert(row);
      if (error) throw new Error(error.message);
      written.push(key);
    }
    return { written };
  },
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const action = String(body.action || '');
    const db = supabaseAdmin();

    if (action === 'record.remind') {
      // platform_set_reminder's exact effect: one platform_reminders row
      // for the operator user against the related record.
      const userId = await tenantOperatorUserId();
      if (!userId) throw new Error('No operator user available');
      const { data, error } = await db
        .from('platform_reminders')
        .insert({
          tenant_id: DEFAULT_TENANT_ID,
          user_id: userId,
          related_type: (body.relatedType as string) ?? null,
          related_id: (body.relatedId as string) ?? null,
          remind_at: (body.remindAt as string) || new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
          message: (body.message as string) || (body.title as string) || 'Reminder',
          url: (body.url as string) ?? null,
        })
        .select('id')
        .single();
      if (error) throw new Error(error.message);
      return NextResponse.json({ data: { reminderId: data.id } }, { status: 201 });
    }

    const run = RPC_ACTIONS[action];
    if (!run) {
      return NextResponse.json(
        { error: { code: 'UNKNOWN_ACTION', message: `Action ${action} is not executable here`, requestId: crypto.randomUUID() } },
        { status: 400 },
      );
    }
    const result = await run(db, body);
    return NextResponse.json({ data: result ?? { ok: true } });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: { code: 'ACTION_FAILED', message: e instanceof Error ? e.message : 'Action failed', requestId: crypto.randomUUID() } },
      { status: 500 },
    );
  }
}
