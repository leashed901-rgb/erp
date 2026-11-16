import { NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/* Omnichannel channel threads (doc 26) over support_channel_threads —
   the external thread (email thread / DM thread) bound to each
   internal crm_conversations row. */
export async function GET() {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('support_channel_threads')
    .select('*')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .order('updated_at', { ascending: false })
    .limit(200);
  if (error) return NextResponse.json({ error: { code: 'INTERNAL', message: error.message, requestId: crypto.randomUUID() } }, { status: 500 });
  return NextResponse.json({
    data: (data || []).map((r) => {
      const row = r as Record<string, unknown>;
      return {
        id: String(row.id),
        channel: String(row.channel || ''),
        threadKey: String(row.thread_key || ''),
        conversationId: String(row.conversation_id || ''),
        updatedAt: String(row.updated_at || ''),
      };
    }),
  });
}
