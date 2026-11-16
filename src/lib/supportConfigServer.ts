import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/* Shared CRUD for the support config family (doc 26): queues, SLA
   policies, routing rules, automations, business hours, holidays,
   KB articles, canned replies. These tables share the platform's
   config shape (scope / locked_by_master / row_version). */

export function errRes(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

interface ResourceDef {
  table: string;
  orderBy: string;
  scoped: boolean;
  /** false for tables without the scope/locked_by_master config shape
      (support_kb_articles, support_oncall_schedules,
      support_escalation_policies). */
  configShape?: boolean;
  insertMap: (body: Record<string, unknown>) => Record<string, unknown> | { error: string };
  patchMap: (body: Record<string, unknown>) => Record<string, unknown>;
  mapper: (row: Record<string, unknown>) => unknown;
}

export function makeConfigHandlers(def: ResourceDef) {
  async function GET() {
    const sb = supabaseAdmin();
    let query = sb.from(def.table).select('*').order(def.orderBy, { ascending: true }).limit(300);
    if (def.scoped) query = query.eq('tenant_id', DEFAULT_TENANT_ID);
    const { data, error } = await query;
    if (error) return errRes('INTERNAL', error.message, 500);
    return NextResponse.json({ data: (data || []).map((r) => def.mapper(r as Record<string, unknown>)) });
  }

  async function POST(req: NextRequest) {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const mapped = def.insertMap(body);
    if ('error' in mapped) return errRes('VALIDATION', String(mapped.error), 400);
    const sb = supabaseAdmin();
    const insert: Record<string, unknown> = { ...mapped };
    if (def.scoped) {
      insert.tenant_id = DEFAULT_TENANT_ID;
      if (def.configShape !== false) {
        if (!('scope' in insert)) insert.scope = 'tenant';
        if (!('locked_by_master' in insert)) insert.locked_by_master = false;
      }
    }
    const { data, error } = await sb.from(def.table).insert(insert).select('*').single();
    if (error) return errRes('INTERNAL', error.message, 500);
    return NextResponse.json({ data: def.mapper(data as Record<string, unknown>) }, { status: 201 });
  }

  async function PATCH(req: NextRequest) {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const id = typeof body.id === 'string' ? body.id : null;
    if (!id) return errRes('VALIDATION', 'id is required', 400);
    const patch = def.patchMap(body);
    if (!Object.keys(patch).length) return errRes('VALIDATION', 'nothing to update', 400);
    const sb = supabaseAdmin();
    let query = sb.from(def.table).update(patch).eq('id', id);
    if (def.scoped) query = query.eq('tenant_id', DEFAULT_TENANT_ID);
    const { data, error } = await query.select('*').maybeSingle();
    if (error) return errRes('INTERNAL', error.message, 500);
    if (!data) return errRes('NOT_FOUND', 'Row not found', 404);
    return NextResponse.json({ data: def.mapper(data as Record<string, unknown>) });
  }

  async function DELETE(req: NextRequest) {
    const id = req.nextUrl.searchParams.get('id');
    if (!id) return errRes('VALIDATION', 'id query param required', 400);
    const sb = supabaseAdmin();
    let query = sb.from(def.table).delete().eq('id', id);
    if (def.scoped) query = query.eq('tenant_id', DEFAULT_TENANT_ID);
    const { error } = await query;
    if (error) return errRes('INTERNAL', error.message, 500);
    return NextResponse.json({ data: { id, deleted: true } });
  }

  return { GET, POST, PATCH, DELETE };
}
