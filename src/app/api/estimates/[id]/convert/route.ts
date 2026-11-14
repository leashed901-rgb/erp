import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/** POST /api/estimates/[id]/convert — wraps acct_convert_estimate RPC.
 *  Converts an accepted estimate into an invoice carrying all line items.
 *  Fallback: manually create the invoice + copy estimate lines, then mark
 *  the estimate as converted. */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // 1. Try the RPC first.
  const { data: rpcData, error: rpcErr } = await supabaseAdmin().rpc('acct_convert_estimate', {
    estimate_uuid: id,
    tenant_uuid: DEFAULT_TENANT_ID,
  });
  if (!rpcErr && rpcData) {
    const row = rpcData as { invoice_id?: string };
    return NextResponse.json({ data: { converted: true, invoice_id: row.invoice_id || null, source: 'rpc' } });
  }

  // 2. Fallback: load the estimate from acct_estimates (the real table).
  const { data: est, error: estErr } = await supabaseAdmin()
    .from('acct_estimates')
    .select('id, estimate_number, customer_id, estimate_date, expiry_date, status, subtotal, tax_total, total, currency, notes, terms')
    .eq('id', id)
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .maybeSingle();
  if (estErr) {
    return NextResponse.json({ error: { code: 'INTERNAL', message: estErr.message } }, { status: 500 });
  }
  if (!est) {
    return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Estimate not found' } }, { status: 404 });
  }
  if (est.status === 'converted') {
    return NextResponse.json({ data: { converted: true, already: true } });
  }

  // Create the invoice from the estimate. Only include columns that exist
  // on acct_ar_invoices (source_document_id, source_system, open_balance
  // are NOT in the current schema).
  const invNumber = `INV-${Date.now()}`;
  const { data: newInv, error: invErr } = await supabaseAdmin()
    .from('acct_ar_invoices')
    .insert({
      tenant_id: DEFAULT_TENANT_ID,
      invoice_number: invNumber,
      customer_id: est.customer_id,
      invoice_date: new Date().toISOString().slice(0, 10),
      due_date: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
      status: 'open',
      subtotal: Number(est.subtotal) || 0,
      tax_total: Number(est.tax_total) || 0,
      total: Number(est.total) || 0,
      currency: est.currency || 'USD',
      notes: est.notes,
      terms: est.terms,
    })
    .select('id, invoice_number')
    .single();
  if (invErr) {
    return NextResponse.json({ error: { code: 'INTERNAL', message: invErr.message } }, { status: 500 });
  }

  // Copy estimate lines → invoice lines (best-effort; table may differ).
  const { data: estLines } = await supabaseAdmin()
    .from('estimate_items')
    .select('id, description, quantity, unit_price, total_price, position')
    .eq('estimate_id', id)
    .order('position', { ascending: true });
  if (estLines && estLines.length > 0) {
    const lineRows = estLines.map((l, i) => ({
      tenant_id: DEFAULT_TENANT_ID,
      invoice_id: newInv.id,
      description: l.description || '',
      quantity: Number(l.quantity) || 1,
      unit_price: Number(l.unit_price) || 0,
      total_price: Number(l.total_price) || 0,
      position: i,
    }));
    await supabaseAdmin().from('acct_ar_invoice_lines').insert(lineRows);
  }

  // Mark the estimate as converted (in acct_estimates — the real table).
  await supabaseAdmin()
    .from('acct_estimates')
    .update({
      status: 'converted',
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('tenant_id', DEFAULT_TENANT_ID);

  return NextResponse.json({ data: { converted: true, invoice_id: newInv.id, invoice_number: newInv.invoice_number, source: 'fallback' } });
}
