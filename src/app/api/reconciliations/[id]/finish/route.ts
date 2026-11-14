import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/** POST /api/reconciliations/[id]/finish — finish a reconciliation.
 *  Wraps acct_reconciliation_mark RPC. Fallback: flip status to completed.
 *  Body: { difference?, note? } */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* no body ok */ }

  // 1. Try the RPC.
  const { data: rpcData, error: rpcErr } = await supabaseAdmin().rpc('acct_reconciliation_mark', {
    reconciliation_uuid: id,
    tenant_uuid: DEFAULT_TENANT_ID,
    action: 'finish',
  });
  if (!rpcErr && rpcData) {
    return NextResponse.json({ data: { finished: true, source: 'rpc' } });
  }

  // 2. Fallback: flip status to completed + finished_at.
  const { data: updated, error: updErr } = await supabaseAdmin()
    .from('acct_reconciliations')
    .update({
      status: 'completed',
      finished_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .select('id, status, finished_at')
    .single();
  if (updErr) {
    return NextResponse.json({ error: { code: 'INTERNAL', message: updErr.message } }, { status: 500 });
  }
  return NextResponse.json({ data: { finished: true, reconciliation: updated, source: 'fallback' } });
}
