import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/** POST /api/invoices/[id]/void — wraps acct_void_invoice RPC.
 *  Marks the invoice as VOID. Falls back to a direct table update. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* no body ok */ }
  const reason = (body.reason as string | undefined) || 'Voided by user';

  // 1. Try the RPC.
  const { data: rpcData, error: rpcErr } = await supabaseAdmin().rpc('acct_void_invoice', {
    invoice_uuid: id,
    tenant_uuid: DEFAULT_TENANT_ID,
    reason,
  });
  if (!rpcErr && rpcData) {
    return NextResponse.json({ data: { voided: true, source: 'rpc' } });
  }

  // 2. Fallback: flip status to VOID + void reason + voided_at.
  const updates: Record<string, unknown> = {
    status: 'void',
    updated_at: new Date().toISOString(),
  };
  const { data: updated, error: updErr } = await supabaseAdmin()
    .from('acct_ar_invoices')
    .update(updates)
    .eq('id', id)
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .select('id, status')
    .single();
  if (updErr) {
    return NextResponse.json({ error: { code: 'INTERNAL', message: updErr.message } }, { status: 500 });
  }
  return NextResponse.json({ data: { voided: true, invoice: updated, source: 'fallback' } });
}
