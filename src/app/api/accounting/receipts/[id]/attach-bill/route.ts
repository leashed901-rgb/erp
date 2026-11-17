import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/* Attach a receipt to an existing bill: the bill's source document
   becomes this inbox row (acct_ap_bills.inbox_id) and the receipt is
   marked processed. A bill that already has a source receipt 409s. */

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const billId = typeof body.billId === 'string' ? body.billId : '';
  if (!billId) return err('VALIDATION', 'billId is required', 400);
  const sb = supabaseAdmin();
  const { data: bill } = await sb
    .from('acct_ap_bills')
    .select('id, inbox_id, status')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('id', billId)
    .maybeSingle();
  if (!bill) return err('NOT_FOUND', 'Bill not found', 404);
  const b = bill as { inbox_id: string | null; status: string };
  if (b.status === 'void') return err('CONFLICT', 'Bill is void', 409);
  if (b.inbox_id && b.inbox_id !== id) return err('CONFLICT', 'Bill already has a source receipt', 409);
  const { error: billErr } = await sb.from('acct_ap_bills').update({ inbox_id: id }).eq('tenant_id', DEFAULT_TENANT_ID).eq('id', billId);
  if (billErr) return err('INTERNAL', billErr.message, 500);
  const { error: inboxErr } = await sb.from('acct_document_inbox').update({ status: 'processed' }).eq('tenant_id', DEFAULT_TENANT_ID).eq('id', id);
  if (inboxErr) return err('INTERNAL', inboxErr.message, 500);
  return NextResponse.json({ data: { id, billId, attached: true } });
}
