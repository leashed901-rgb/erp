import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

/** POST /api/v1/inbox/[id]/attach — attaches the receipt's file to an
 *  EXISTING bill (body: { bill_id }). Re-points the inbox row's attachment
 *  to the bill and marks the row processed (out of the review queue).
 *  This is distinct from create-bill, which builds a NEW bill from the row. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: { code: 'VALIDATION', message: 'Invalid JSON', requestId: crypto.randomUUID() } }, { status: 400 });
  }
  const billId = body.bill_id as string | undefined;
  if (!billId) {
    return NextResponse.json({ error: { code: 'VALIDATION', message: 'bill_id is required', requestId: crypto.randomUUID() } }, { status: 400 });
  }
  const { data: row, error: rowErr } = await supabaseAdmin()
    .from('acct_document_inbox')
    .select('id, attachment_id')
    .eq('id', id)
    .single();
  if (rowErr || !row) {
    return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Inbox row not found', requestId: crypto.randomUUID() } }, { status: 404 });
  }
  const { data: bill } = await supabaseAdmin()
    .from('acct_ap_bills')
    .select('id, bill_number')
    .eq('id', billId)
    .single();
  if (!bill) {
    return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Bill not found', requestId: crypto.randomUUID() } }, { status: 404 });
  }
  if (row.attachment_id) {
    await supabaseAdmin()
      .from('acct_attachments')
      .update({ entity_type: 'acct_ap_bills', entity_id: billId })
      .eq('id', row.attachment_id as string);
  }
  const { data, error } = await supabaseAdmin()
    .from('acct_document_inbox')
    .update({ status: 'processed', updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('*')
    .single();
  if (error) {
    return NextResponse.json({ error: { code: 'INTERNAL', message: error.message, requestId: crypto.randomUUID() } }, { status: 500 });
  }
  return NextResponse.json({ data: { ...data, attached_bill_number: (bill as Record<string, unknown>).bill_number } });
}
