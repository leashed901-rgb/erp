import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/** POST /api/invoices/[id]/mark-paid — wraps acct_mark_invoice_paid RPC.
 *  Marks the invoice as PAID + paid_at + zeros the open balance.
 *  Body: { amount?, method?, reference? } */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* no body ok */ }

  // 1. Try the RPC.
  const { data: rpcData, error: rpcErr } = await supabaseAdmin().rpc('acct_mark_invoice_paid', {
    invoice_uuid: id,
    tenant_uuid: DEFAULT_TENANT_ID,
    amount: body.amount != null ? Number(body.amount) : null,
    method: (body.method as string | undefined) || null,
    reference: (body.reference as string | undefined) || null,
  });
  if (!rpcErr && rpcData) {
    return NextResponse.json({ data: { paid: true, source: 'rpc' } });
  }

  // 2. Fallback: load the invoice to get total, then flip status + zero balance.
  const { data: inv, error: loadErr } = await supabaseAdmin()
    .from('acct_ar_invoices')
    .select('id, status, total, open_balance')
    .eq('id', id)
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .maybeSingle();
  if (loadErr) {
    return NextResponse.json({ error: { code: 'INTERNAL', message: loadErr.message } }, { status: 500 });
  }
  if (!inv) {
    return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Invoice not found' } }, { status: 404 });
  }

  const total = Number(inv.total) || 0;
  const { data: updated, error: updErr } = await supabaseAdmin()
    .from('acct_ar_invoices')
    .update({
      status: 'paid',
      amount_paid: total,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .select('id, status, amount_paid')
    .single();
  if (updErr) {
    return NextResponse.json({ error: { code: 'INTERNAL', message: updErr.message } }, { status: 500 });
  }
  return NextResponse.json({ data: { paid: true, invoice: updated, source: 'fallback' } });
}
