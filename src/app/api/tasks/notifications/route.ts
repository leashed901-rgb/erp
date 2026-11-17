import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { toNotification } from '@/lib/taskTypes';

/* Personal inbox (doc 27) over user_notifications. */
function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

export async function GET() {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('user_notifications')
    .select('*')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: (data || []).map((r) => toNotification(r as Record<string, unknown>)) });
}

export async function PATCH(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const sb = supabaseAdmin();
  if (body.all === true) {
    const { error } = await sb
      .from('user_notifications')
      .update({ is_read: true })
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .eq('is_read', false);
    if (error) return err('INTERNAL', error.message, 500);
    return NextResponse.json({ data: { all: true, markedRead: true } });
  }
  const id = typeof body.id === 'string' ? body.id : null;
  if (!id) return err('VALIDATION', 'id is required', 400);
  const { data, error } = await sb
    .from('user_notifications')
    .update({ is_read: body.isRead !== false })
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('id', id)
    .select('*')
    .maybeSingle();
  if (error) return err('INTERNAL', error.message, 500);
  if (!data) return err('NOT_FOUND', 'Notification not found', 404);
  return NextResponse.json({ data: toNotification(data as Record<string, unknown>) });
}
