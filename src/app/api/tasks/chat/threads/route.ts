import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { toChatThread } from '@/lib/taskTypes';
import { tenantOperatorUserId } from '@/lib/supportServer';

/* Personal chat threads (doc 27) over platform_chat_threads +
   platform_chat_members. */
function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

export async function GET() {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('platform_chat_threads')
    .select('*')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .limit(100);
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: (data || []).map((r) => toChatThread(r as Record<string, unknown>)) });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const sb = supabaseAdmin();
  const userId = await tenantOperatorUserId();
  const { data, error } = await sb
    .from('platform_chat_threads')
    .insert({
      tenant_id: DEFAULT_TENANT_ID,
      kind: typeof body.kind === 'string' ? body.kind : 'group',
      title: typeof body.title === 'string' ? body.title : null,
      related_type: typeof body.relatedType === 'string' ? body.relatedType : null,
      related_id: typeof body.relatedId === 'string' ? body.relatedId : null,
      created_by: userId,
    })
    .select('*')
    .single();
  if (error) return err('INTERNAL', error.message, 500);
  const thread = data as Record<string, unknown>;
  if (userId) {
    await sb.from('platform_chat_members').insert({
      tenant_id: DEFAULT_TENANT_ID,
      thread_id: thread.id,
      user_id: userId,
      role: 'owner',
    });
  }
  return NextResponse.json({ data: toChatThread(thread) }, { status: 201 });
}
