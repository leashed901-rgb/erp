import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import type {
  ReceiptApplication, CreditMemoApplication, PaymentApplication,
  VendorCreditApplication, AvailableCredit, CollectionsCase,
} from '@/lib/arApLinkTypes';

const err = (code: string, message: string, status: number) =>
  NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });

/**
 * GET /api/v1/documents/[id]/applications?type=Invoice|Bill — the money
 * trail behind one document, from the link tables no screen read before:
 *  - Invoice: receipt applications (what paid it) + credit-memo
 *    applications (what credited it) + open collections cases, plus the
 *    customer's posted credit memos still available to apply.
 *  - Bill: payment applications (which check paid how much) + vendor
 *    credit applications, plus the vendor's credits still available.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const type = (req.nextUrl.searchParams.get('type') || 'Invoice').toLowerCase();
  const sb = supabaseAdmin();

  if (type === 'bill') {
    const { data: bill } = await sb.from('acct_ap_bills').select('id,vendor_id').eq('id', id).eq('tenant_id', DEFAULT_TENANT_ID).maybeSingle();
    if (!bill) return err('NOT_FOUND', 'Bill not found', 404);
    const [{ data: payApps }, { data: creditApps }, { data: credits }] = await Promise.all([
      sb.from('acct_ap_payment_applications').select('*').eq('bill_id', id).order('created_at', { ascending: false }),
      sb.from('acct_ap_vendor_credit_applications').select('*').eq('bill_id', id).order('applied_on', { ascending: false }),
      sb.from('acct_ap_vendor_credits').select('id,credit_number,credit_date,total,applied_amount,remaining,status').eq('vendor_id', bill.vendor_id).eq('tenant_id', DEFAULT_TENANT_ID).order('credit_date', { ascending: false }),
    ]);
    const paymentIds = [...new Set((payApps || []).map((a) => a.payment_id))];
    const payments = new Map<string, { check_number: string | null; payment_date: string | null }>();
    if (paymentIds.length) {
      const { data: rows } = await sb.from('acct_ap_payments').select('id,check_number,payment_date').in('id', paymentIds);
      (rows || []).forEach((r) => payments.set(r.id, r));
    }
    const creditIds = [...new Set((creditApps || []).map((a) => a.credit_id))];
    const creditNums = new Map<string, { credit_number: string; credit_date: string }>();
    if (creditIds.length) {
      const { data: rows } = await sb.from('acct_ap_vendor_credits').select('id,credit_number,credit_date').in('id', creditIds);
      (rows || []).forEach((r) => creditNums.set(r.id, r));
    }
    const paymentApplications: PaymentApplication[] = (payApps || []).map((a) => ({
      id: String(a.id),
      paymentId: String(a.payment_id),
      checkNumber: payments.get(a.payment_id)?.check_number ?? null,
      paymentDate: payments.get(a.payment_id)?.payment_date ?? null,
      billId: String(a.bill_id),
      appliedAmount: Number(a.applied_amount || 0),
    }));
    const vendorCreditApplications: VendorCreditApplication[] = (creditApps || []).map((a) => ({
      id: String(a.id),
      creditId: String(a.credit_id),
      creditNumber: creditNums.get(a.credit_id)?.credit_number || '',
      creditDate: creditNums.get(a.credit_id)?.credit_date || '',
      billId: String(a.bill_id),
      amount: Number(a.amount || 0),
      appliedOn: String(a.applied_on || ''),
    }));
    const availableCredits: AvailableCredit[] = (credits || [])
      .filter((c) => Number(c.remaining ?? (Number(c.total || 0) - Number(c.applied_amount || 0))) > 0)
      .map((c) => ({
        id: String(c.id),
        number: String(c.credit_number || ''),
        date: String(c.credit_date || ''),
        total: Number(c.total || 0),
        appliedAmount: Number(c.applied_amount || 0),
        remaining: Number(c.remaining ?? (Number(c.total || 0) - Number(c.applied_amount || 0))),
      }));
    return NextResponse.json({ data: { paymentApplications, vendorCreditApplications, availableCredits } });
  }

  const { data: inv } = await sb.from('acct_ar_invoices').select('id,customer_id,invoice_number').eq('id', id).eq('tenant_id', DEFAULT_TENANT_ID).maybeSingle();
  if (!inv) return err('NOT_FOUND', 'Invoice not found', 404);
  const [{ data: receiptApps }, { data: memoApps }, { data: cases }, { data: memos }] = await Promise.all([
    sb.from('acct_ar_receipt_applications').select('*').eq('invoice_id', id).order('created_at', { ascending: false }),
    sb.from('acct_credit_memo_applications').select('*').eq('invoice_id', id).order('applied_on', { ascending: false }),
    sb.from('acct_ar_collections_cases').select('*').eq('invoice_id', id).order('created_at', { ascending: false }),
    sb.from('acct_ar_credit_memos').select('id,memo_number,memo_date,total,applied_amount,status').eq('customer_id', inv.customer_id).eq('tenant_id', DEFAULT_TENANT_ID).order('memo_date', { ascending: false }),
  ]);
  const receiptIds = [...new Set((receiptApps || []).map((a) => a.receipt_id))];
  const receipts = new Map<string, { receipt_number: string; receipt_date: string }>();
  if (receiptIds.length) {
    const { data: rows } = await sb.from('acct_ar_receipts').select('id,receipt_number,receipt_date').in('id', receiptIds);
    (rows || []).forEach((r) => receipts.set(r.id, r));
  }
  const memoIds = [...new Set((memoApps || []).map((a) => a.credit_memo_id))];
  const memoNums = new Map<string, { memo_number: string; memo_date: string }>();
  if (memoIds.length) {
    const { data: rows } = await sb.from('acct_ar_credit_memos').select('id,memo_number,memo_date').in('id', memoIds);
    (rows || []).forEach((r) => memoNums.set(r.id, r));
  }
  const receiptApplications: ReceiptApplication[] = (receiptApps || []).map((a) => ({
    id: String(a.id),
    receiptId: String(a.receipt_id),
    receiptNumber: receipts.get(a.receipt_id)?.receipt_number || '',
    receiptDate: receipts.get(a.receipt_id)?.receipt_date || '',
    invoiceId: String(a.invoice_id),
    appliedAmount: Number(a.applied_amount || 0),
    asDeposit: Boolean(a.as_deposit),
  }));
  const creditMemoApplications: CreditMemoApplication[] = (memoApps || []).map((a) => ({
    id: String(a.id),
    creditMemoId: String(a.credit_memo_id),
    memoNumber: memoNums.get(a.credit_memo_id)?.memo_number || '',
    memoDate: memoNums.get(a.credit_memo_id)?.memo_date || '',
    invoiceId: String(a.invoice_id),
    amount: Number(a.amount || 0),
    appliedOn: String(a.applied_on || ''),
    reversedAt: (a.reversed_at as string) || null,
  }));
  const collectionsCases: CollectionsCase[] = (cases || []).map((c) => ({
    id: String(c.id),
    customerId: String(c.customer_id),
    customerName: '',
    invoiceId: (c.invoice_id as string) || null,
    invoiceNumber: (c.invoice_id as string) ? String(inv.invoice_number || '') : null,
    priority: String(c.priority || ''),
    status: String(c.status || ''),
    assignedTo: (c.assigned_to as string) || null,
    nextActionAt: (c.next_action_at as string) || null,
    disputeAmount: Number(c.dispute_amount || 0),
    reason: (c.reason as string) || null,
    notes: (c.notes as string) || null,
  }));
  const availableCredits: AvailableCredit[] = (memos || [])
    .filter((m) => m.status === 'posted' && (Number(m.total || 0) - Number(m.applied_amount || 0)) > 0)
    .map((m) => ({
      id: String(m.id),
      number: String(m.memo_number || ''),
      date: String(m.memo_date || ''),
      total: Number(m.total || 0),
      appliedAmount: Number(m.applied_amount || 0),
      remaining: Number(m.total || 0) - Number(m.applied_amount || 0),
    }));
  return NextResponse.json({ data: { receiptApplications, creditMemoApplications, collectionsCases, availableCredits } });
}
