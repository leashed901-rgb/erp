import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/** POST /api/v1/documents/[id]/pay?type=bill
 *  Pays a bill.
 *  - With bank_account_id: the real flow — acct_pay_bills creates the
 *    acct_ap_payments row + posts the AP/cash journal (and enforces
 *    open/partially_paid status, approval, and amount <= open balance).
 *    Body: { amount?, bank_account_id, payment_date?, method?,
 *    starting_check_no?, print_later?, memo? }
 *  - Without it (BillsScreen's one-click pay): the legacy status flip —
 *    status 'paid', amount_paid set. Kept for compatibility. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { searchParams } = new URL(req.url);
  // BillsScreen calls with ?type=Bill; normalize like approve/post do.
  const type = (searchParams.get('type') || '').toLowerCase();
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch {}

  if (type === 'bill') {
    if (body.bank_account_id) {
      const amount = body.amount != null ? Number(body.amount) : undefined;
      const { data, error } = await supabaseAdmin().rpc('acct_pay_bills', {
        p_bank_account_id: String(body.bank_account_id),
        p_payment_date: String(body.payment_date ?? new Date().toISOString().slice(0, 10)),
        p_items: [{ bill_id: id, ...(amount !== undefined ? { amount } : {}) }],
        p_method: String(body.method ?? 'check'),
        p_starting_check_no: body.starting_check_no != null ? Number(body.starting_check_no) : null,
        p_print_later: Boolean(body.print_later),
        p_memo: body.memo != null ? String(body.memo) : null,
      });
      if (error) return NextResponse.json({ error: { code: 'PAY_FAILED', message: error.message, requestId: crypto.randomUUID() } }, { status: 400 });
      const row = Array.isArray(data) && data.length > 0 ? data[0] : null;
      return NextResponse.json({ data: row ?? { bill_id: id }, message: 'Bill paid' });
    }
    // Update bill status (open_balance is GENERATED ALWAYS AS
    // (total - amount_paid - amount_credited) — never written directly).
    const { data, error } = await supabaseAdmin().from('acct_ap_bills').update({
      status: 'paid',
      amount_paid: body.amount || null,
      updated_at: new Date().toISOString(),
    }).eq('id', id).eq('tenant_id', DEFAULT_TENANT_ID).select('*').single();
    if (error) return NextResponse.json({ error: { code: 'INTERNAL', message: error.message, requestId: crypto.randomUUID() } }, { status: 500 });
    return NextResponse.json({ data, message: 'Bill paid' });
  }

  return NextResponse.json({ error: { code: 'VALIDATION', message: 'Unsupported type for pay', requestId: crypto.randomUUID() } }, { status: 400 });
}
