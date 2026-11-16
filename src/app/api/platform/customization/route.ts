import { NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { tenantOperatorUserId } from '@/lib/platformServer';

export const dynamic = 'force-dynamic';

function fail(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

/**
 * Customization & platform configuration surfaces (Settings/Customization,
 * Settings/System lists in pages.md). These are configuration tables with
 * registered create actions in the registry:
 *   create.custom_field    → platform_custom_fields
 *   create.picklist_value  → platform_picklist_values
 * plus terminology (platform_terminology), saved views
 * (platform_saved_views), Create-menu favorites
 * (platform_create_favorites), feature flags (platform_feature_flags),
 * quick links (platform_quick_links), data classes
 * (platform_data_classes), the sensitive access log
 * (platform_sensitive_access_log), backups (platform_backups), and
 * mailboxes (platform_mailboxes).
 *
 * GET ?kind=fields|picklists|terminology|views|favorites|flags|links|
 *           classes|access-log|backups|mailboxes
 * POST { kind, ...fields } / DELETE ?kind=&id=
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const kind = url.searchParams.get('kind') || 'fields';
    const db = supabaseAdmin();
    const t = DEFAULT_TENANT_ID;
    switch (kind) {
      case 'fields': {
        const { data } = await db.from('platform_custom_fields').select('id, entity_type, field_key, label, field_type, options, is_required, is_active, sort_order, help_text').eq('tenant_id', t).order('entity_type').order('sort_order');
        return NextResponse.json({ data: data || [] });
      }
      case 'portal-links': {
        // Settings/Workspace/External access backing table.
        const { data } = await db.from('portal_account_links')
          .select('id, provider, email, display_name, entity_type, last_used_at, created_at')
          .eq('tenant_id', t).order('created_at', { ascending: false });
        return NextResponse.json({ data: data || [] });
      }
      case 'values': {
        // Custom-field values for one record (the right-drawer section):
        // field definitions for the entity type + this record's values.
        const entityType = url.searchParams.get('entityType') || '';
        const entityId = url.searchParams.get('entityId') || '';
        const { data: defs } = await db.from('platform_custom_fields')
          .select('id, field_key, label, field_type, options, is_required, help_text')
          .eq('tenant_id', t).eq('entity_type', entityType).eq('is_active', true).order('sort_order');
        if (!defs || !defs.length) return NextResponse.json({ data: [] });
        const { data: vals } = await db.from('platform_custom_field_values')
          .select('field_id, value_text, value_number, value_date, value_ts, value_bool, value_json')
          .eq('tenant_id', t).eq('entity_id', entityId).in('field_id', defs.map((d) => d.id));
        const byField = new Map((vals || []).map((v) => [v.field_id, v]));
        return NextResponse.json({
          data: defs.map((d) => {
            const v = byField.get(d.id);
            const value = v ? (v.value_text ?? v.value_number ?? v.value_date ?? v.value_ts ?? v.value_bool ?? v.value_json ?? null) : null;
            return { fieldId: d.id, key: d.field_key, label: d.label, type: d.field_type, options: d.options, required: d.is_required, helpText: d.help_text, value };
          }),
        });
      }
      case 'picklists': {
        // Picklist values ship globally (tenant_id NULL, often pack-scoped)
        // plus any tenant-specific rows.
        const { data } = await db.from('platform_picklist_values').select('id, list_code, value, label, sort_order, is_active, pack_code').or(`tenant_id.eq.${t},tenant_id.is.null`).order('list_code').order('sort_order');
        return NextResponse.json({ data: data || [] });
      }
      case 'terminology': {
        const { data } = await db.from('platform_terminology').select('id, term_key, singular, plural, updated_at').eq('tenant_id', t).order('term_key');
        return NextResponse.json({ data: data || [] });
      }
      case 'views': {
        const { data } = await db.from('platform_saved_views').select('id, entity_type, name, filters, columns, sort, is_shared, created_at').eq('tenant_id', t).order('created_at', { ascending: false });
        return NextResponse.json({ data: data || [] });
      }
      case 'favorites': {
        const userId = await tenantOperatorUserId();
        const { data } = await db.from('platform_create_favorites').select('action_code, sort_order').eq('user_id', userId || '').order('sort_order');
        return NextResponse.json({ data: data || [] });
      }
      case 'flags': {
        const { data } = await db.from('platform_feature_flags').select('id, flag_key, description, audience, enabled, updated_at').eq('tenant_id', t).order('flag_key');
        return NextResponse.json({ data: data || [] });
      }
      case 'links': {
        const { data } = await db.from('platform_quick_links').select('id, label, url, icon, sort_order, opens_new_tab, is_active').eq('tenant_id', t).order('sort_order');
        return NextResponse.json({ data: data || [] });
      }
      case 'classes': {
        const { data } = await db.from('platform_data_classes').select('table_name, column_name, data_class, mask, notes').order('table_name').order('column_name');
        return NextResponse.json({ data: data || [] });
      }
      case 'access-log': {
        const { data } = await db.from('platform_sensitive_access_log').select('id, user_id, table_name, record_id, fields, action, purpose, accessed_at').eq('tenant_id', t).order('accessed_at', { ascending: false }).limit(200);
        return NextResponse.json({ data: data || [] });
      }
      case 'backups': {
        const { data } = await db.from('platform_backups').select('id, backup_type, scope, status, size_bytes, started_at, completed_at, expires_at').eq('tenant_id', t).order('created_at', { ascending: false });
        return NextResponse.json({ data: data || [] });
      }
      case 'mailboxes': {
        const { data } = await db.from('platform_mailboxes').select('id, email_address, provider, sync_mode, status, last_synced_at').eq('tenant_id', t).order('email_address');
        return NextResponse.json({ data: data || [] });
      }
      default:
        return fail('VALIDATION', `Unknown kind ${kind}`, 400);
    }
  } catch (e: unknown) {
    return fail('INTERNAL', e instanceof Error ? e.message : 'Failed', 500);
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const kind = String(body.kind || '');
    const db = supabaseAdmin();
    const t = DEFAULT_TENANT_ID;

    if (kind === 'fields') {
      const { data, error } = await db.from('platform_custom_fields').insert({
        tenant_id: t,
        entity_type: String(body.entityType || ''),
        field_key: String(body.fieldKey || ''),
        label: String(body.label || ''),
        field_type: String(body.fieldType || 'text'),
        options: body.options ?? [],
        is_required: !!body.isRequired,
        help_text: (body.helpText as string) ?? null,
        is_active: true,
      }).select('id').single();
      if (error) return fail('INSERT_FAILED', error.message, 500);
      return NextResponse.json({ data }, { status: 201 });
    }
    if (kind === 'picklists') {
      const { data, error } = await db.from('platform_picklist_values').insert({
        tenant_id: t,
        list_code: String(body.listCode || ''),
        value: String(body.value || ''),
        label: String(body.label || body.value || ''),
        sort_order: Number(body.sortOrder || 0),
        is_active: true,
      }).select('id').single();
      if (error) return fail('INSERT_FAILED', error.message, 500);
      return NextResponse.json({ data }, { status: 201 });
    }
    if (kind === 'terminology') {
      const row = {
        tenant_id: t,
        term_key: String(body.termKey || ''),
        singular: String(body.singular || ''),
        plural: String(body.plural || ''),
        updated_at: new Date().toISOString(),
      };
      const { data, error } = body.id
        ? await db.from('platform_terminology').update(row).eq('id', String(body.id)).select('id').single()
        : await db.from('platform_terminology').insert(row).select('id').single();
      if (error) return fail('WRITE_FAILED', error.message, 500);
      return NextResponse.json({ data }, { status: body.id ? 200 : 201 });
    }
    if (kind === 'views') {
      const userId = await tenantOperatorUserId();
      const { data, error } = await db.from('platform_saved_views').insert({
        tenant_id: t,
        user_id: userId,
        entity_type: String(body.entityType || ''),
        name: String(body.name || ''),
        filters: body.filters ?? {},
        columns: body.columns ?? [],
        sort: body.sort ?? {},
        is_shared: !!body.isShared,
      }).select('id').single();
      if (error) return fail('INSERT_FAILED', error.message, 500);
      return NextResponse.json({ data }, { status: 201 });
    }
    if (kind === 'favorites') {
      const userId = await tenantOperatorUserId();
      if (!userId) return fail('INTERNAL', 'No operator user', 500);
      if (body.remove) {
        await db.from('platform_create_favorites').delete().eq('user_id', userId).eq('action_code', String(body.actionCode || ''));
        return NextResponse.json({ data: { ok: true } });
      }
      const { error } = await db.from('platform_create_favorites').upsert(
        { user_id: userId, action_code: String(body.actionCode || ''), sort_order: Number(body.sortOrder || 0) },
        { onConflict: 'user_id,action_code' },
      );
      if (error) return fail('WRITE_FAILED', error.message, 500);
      return NextResponse.json({ data: { ok: true } }, { status: 201 });
    }
    if (kind === 'flags') {
      if (body.id) {
        const { error } = await db.from('platform_feature_flags').update({ enabled: !!body.enabled, updated_at: new Date().toISOString() }).eq('tenant_id', t).eq('id', String(body.id));
        if (error) return fail('WRITE_FAILED', error.message, 500);
        return NextResponse.json({ data: { ok: true } });
      }
      const { data, error } = await db.from('platform_feature_flags').insert({
        tenant_id: t,
        flag_key: String(body.flagKey || ''),
        description: (body.description as string) ?? null,
        audience: String(body.audience || 'all'),
        enabled: !!body.enabled,
      }).select('id').single();
      if (error) return fail('INSERT_FAILED', error.message, 500);
      return NextResponse.json({ data }, { status: 201 });
    }
    if (kind === 'links') {
      const { data, error } = await db.from('platform_quick_links').insert({
        tenant_id: t,
        label: String(body.label || ''),
        url: String(body.url || ''),
        icon: (body.icon as string) ?? null,
        sort_order: Number(body.sortOrder || 0),
        opens_new_tab: body.opensNewTab !== false,
        is_active: true,
      }).select('id').single();
      if (error) return fail('INSERT_FAILED', error.message, 500);
      return NextResponse.json({ data }, { status: 201 });
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
    if (!id) return fail('VALIDATION', 'id is required', 400);
    const db = supabaseAdmin();
    const table = { fields: 'platform_custom_fields', picklists: 'platform_picklist_values', terminology: 'platform_terminology', views: 'platform_saved_views', flags: 'platform_feature_flags', links: 'platform_quick_links' }[kind];
    if (!table) return fail('VALIDATION', `Kind ${kind} cannot be deleted here`, 400);
    const { error } = await db.from(table).delete().eq('id', id);
    if (error) return fail('DELETE_FAILED', error.message, 500);
    return NextResponse.json({ data: { ok: true } });
  } catch (e: unknown) {
    return fail('INTERNAL', e instanceof Error ? e.message : 'Failed', 500);
  }
}
