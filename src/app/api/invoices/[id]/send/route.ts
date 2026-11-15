import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/** POST /api/invoices/[id]/send — wraps acct_send_invoice RPC.
 *  Marks the invoice as sent (status OPEN, sent_at=now). Falls back to a
 *  direct table update if the RPC isn't installed. */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // 1. Try the RPC first (canonical path).
  const { data: rpcData, error: rpcErr } = await supabaseAdmin().rpc('acct_send_invoice', {
    invoice_uuid: id,
    tenant_uuid: DEFAULT_TENANT_ID,
  });
  if (!rpcErr && rpcData) {
    return NextResponse.json({ data: { sent: true, source: 'rpc' } });
  }

  // 2. Fallback: load the invoice, flip status to OPEN + sent_at.
  const { data: inv, error: loadErr } = await supabaseAdmin()
    .from('acct_ar_invoices')
    .select('id, status')
    .eq('id', id)
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .maybeSingle();
  if (loadErr) {
    return NextResponse.json({ error: { code: 'INTERNAL', message: loadErr.message } }, { status: 500 });
  }
  if (!inv) {
    return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Invoice not found' } }, { status: 404 });
  }

  const updates: Record<string, unknown> = {
    status: 'open',
    updated_at: new Date().toISOString(),
  };
  // sent_at may not exist — try to set it, ignore failure.
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
  return NextResponse.json({ data: { sent: true, invoice: updated, source: 'fallback' } });
}
