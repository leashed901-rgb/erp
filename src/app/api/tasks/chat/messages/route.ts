import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { toChatMessage } from '@/lib/taskTypes';
import { tenantOperatorUserId } from '@/lib/supportServer';

/* Personal chat messages (doc 27) over platform_chat_messages. */
function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

export async function GET(req: NextRequest) {
  const threadId = req.nextUrl.searchParams.get('threadId');
  if (!threadId) return err('VALIDATION', 'threadId query param required', 400);
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('platform_chat_messages')
    .select('*')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('thread_id', threadId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
    .limit(300);
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: (data || []).map((r) => toChatMessage(r as Record<string, unknown>)) });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const threadId = typeof body.threadId === 'string' ? body.threadId : null;
  const text = typeof body.body === 'string' ? body.body.trim() : '';
  if (!threadId || !text) return err('VALIDATION', 'threadId and body are required', 400);
  const sb = supabaseAdmin();
  const userId = await tenantOperatorUserId();
  const { data, error } = await sb
    .from('platform_chat_messages')
    .insert({
      tenant_id: DEFAULT_TENANT_ID,
      thread_id: threadId,
      author_id: userId,
      body: text,
      attachments: [],
      mentions: [],
    })
    .select('*')
    .single();
  if (error) return err('INTERNAL', error.message, 500);
  await sb.from('platform_chat_threads').update({ last_message_at: new Date().toISOString() }).eq('tenant_id', DEFAULT_TENANT_ID).eq('id', threadId);
  return NextResponse.json({ data: toChatMessage(data as Record<string, unknown>) }, { status: 201 });
}
