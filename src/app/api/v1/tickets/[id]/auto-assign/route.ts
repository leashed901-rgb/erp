import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/** POST /api/v1/tickets/[id]/auto-assign — the registry action
 *  ticket.auto_assign, bound to the support_auto_assign RPC. */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = supabaseAdmin();
  const { error } = await sb.rpc('support_auto_assign', { p_ticket: id });
  if (error) {
    return NextResponse.json({ error: { code: 'INTERNAL', message: error.message, requestId: crypto.randomUUID() } }, { status: 500 });
  }
  const { data } = await sb.from('support_tickets').select('*').eq('tenant_id', DEFAULT_TENANT_ID).eq('id', id).maybeSingle();
  if (!data) return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Ticket not found', requestId: crypto.randomUUID() } }, { status: 404 });
  return NextResponse.json({ data });
}
