import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { toReminder } from '@/lib/taskTypes';
import { tenantOperatorUserId } from '@/lib/supportServer';

/* Reminders (doc 27) over platform_reminders. Creation goes through
   the registry RPC platform_set_reminder (record.remind); dispatch
   itself is the platform's per-minute platform_dispatch_reminders
   job (postgres-only, outside the web app). */
function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

export async function GET() {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('platform_reminders')
    .select('*')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .order('remind_at', { ascending: true })
    .limit(200);
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: (data || []).map((r) => toReminder(r as Record<string, unknown>)) });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  const remindAt = typeof body.remindAt === 'string' ? body.remindAt : null;
  if (!message || !remindAt) return err('VALIDATION', 'message and remindAt are required', 400);
  const sb = supabaseAdmin();
  const { data, error } = await sb.rpc('platform_set_reminder', {
    p_tenant: DEFAULT_TENANT_ID,
    p_remind_at: remindAt,
    p_message: message,
    p_related_type: typeof body.relatedType === 'string' ? body.relatedType : null,
    p_related_id: typeof body.relatedId === 'string' ? body.relatedId : null,
    p_url: typeof body.url === 'string' ? body.url : null,
  });
  if (error && /not a member/i.test(error.message)) {
    /* platform_set_reminder requires auth.uid() to be a tenant
       member — a service-role call has no uid and can never pass.
       Perform the RPC's exact insert directly with the operator as
       the reminder's user (the guarded-RPC precedent). */
    const userId = await tenantOperatorUserId();
    if (!userId) return err('INTERNAL', 'No operator user for the reminder', 500);
    const { data: row, error: insErr } = await sb
      .from('platform_reminders')
      .insert({
        tenant_id: DEFAULT_TENANT_ID,
        user_id: userId,
        related_type: typeof body.relatedType === 'string' ? body.relatedType : null,
        related_id: typeof body.relatedId === 'string' ? body.relatedId : null,
        remind_at: remindAt,
        message,
        url: typeof body.url === 'string' ? body.url : null,
        status: 'pending',
      })
      .select('*')
      .single();
    if (insErr) return err('INTERNAL', insErr.message, 500);
    return NextResponse.json({ data: toReminder(row as Record<string, unknown>) }, { status: 201 });
  }
  if (error) return err('INTERNAL', error.message, 500);
  const row = Array.isArray(data) ? data[0] : data;
  if (row && typeof row === 'object') return NextResponse.json({ data: toReminder(row as Record<string, unknown>) }, { status: 201 });
  if (typeof row === 'string') {
    const { data: fetched } = await sb.from('platform_reminders').select('*').eq('tenant_id', DEFAULT_TENANT_ID).eq('id', row).maybeSingle();
    if (fetched) return NextResponse.json({ data: toReminder(fetched as Record<string, unknown>) }, { status: 201 });
  }
  /* The RPC may return void — fall back to the newest matching row. */
  const { data: latest } = await sb
    .from('platform_reminders')
    .select('*')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('message', message)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return NextResponse.json({ data: latest ? toReminder(latest as Record<string, unknown>) : { message } }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return err('VALIDATION', 'id query param required', 400);
  const sb = supabaseAdmin();
  const { error } = await sb.from('platform_reminders').delete().eq('tenant_id', DEFAULT_TENANT_ID).eq('id', id);
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: { id, deleted: true } });
}

export async function PATCH(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const id = typeof body.id === 'string' ? body.id : null;
  if (!id) return err('VALIDATION', 'id is required', 400);
  const userId = await tenantOperatorUserId();
  void userId;
  const sb = supabaseAdmin();
  const patch: Record<string, unknown> = {};
  if (typeof body.status === 'string') patch.status = body.status;
  if (!Object.keys(patch).length) return err('VALIDATION', 'nothing to update', 400);
  const { data, error } = await sb.from('platform_reminders').update(patch).eq('tenant_id', DEFAULT_TENANT_ID).eq('id', id).select('*').maybeSingle();
  if (error) return err('INTERNAL', error.message, 500);
  if (!data) return err('NOT_FOUND', 'Reminder not found', 404);
  return NextResponse.json({ data: toReminder(data as Record<string, unknown>) });
}
