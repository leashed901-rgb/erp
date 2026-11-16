import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/**
 * POST /api/crm/conversations/[id]/read — mark every inbound message
 * on the thread read (the inbox does this when a thread is opened).
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await supabaseAdmin()
    .from('crm_messages')
    .update({ read_at: new Date().toISOString() })
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('conversation_id', id)
    .eq('direction', 'inbound')
    .is('read_at', null);
  if (error) {
    return NextResponse.json(
      { error: { code: 'INTERNAL', message: error.message, requestId: crypto.randomUUID() } },
      { status: 500 },
    );
  }
  return NextResponse.json({ data: { id, marked_read: true } });
}
