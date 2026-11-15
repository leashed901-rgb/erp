import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/** POST /api/invoices/[id]/post — wraps acct_post_invoice RPC.
 *  Posts a draft invoice (DRAFT → OPEN), making it billable. */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // 1. Try the RPC.
  const { data: rpcData, error: rpcErr } = await supabaseAdmin().rpc('acct_post_invoice', {
    invoice_uuid: id,
    tenant_uuid: DEFAULT_TENANT_ID,
  });
  if (!rpcErr && rpcData) {
    return NextResponse.json({ data: { posted: true, source: 'rpc' } });
  }

  // 2. Fallback: flip status DRAFT → open. Only update `status` + `updated_at`
  //  (posted_at may not exist on this schema).
  const updates: Record<string, unknown> = {
    status: 'open',
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
  return NextResponse.json({ data: { posted: true, invoice: updated, source: 'fallback' } });
}
