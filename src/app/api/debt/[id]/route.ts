import { NextResponse, NextRequest } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

/**
 * GET /api/debt/[id] — one instrument with its amortization schedule
 * and live balance (Batch H).
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { data: d, error } = await supabaseAdmin().from('acct_debt_instruments').select('*').eq('tenant_id', DEFAULT_TENANT_ID).eq('id', id).single();
  if (error || !d) return err('NOT_FOUND', 'Debt instrument not found', 404);
  const row = d as Record<string, unknown>;
  const [{ data: schedule }, { data: bal }, { data: bank }] = await Promise.all([
    supabaseAdmin().from('acct_debt_schedule').select('*').eq('tenant_id', DEFAULT_TENANT_ID).eq('debt_id', id).order('installment_no'),
    supabaseAdmin().rpc('acct_debt_balance', { p_debt_id: id }),
    supabaseAdmin().from('acct_bank_accounts').select('id, name').eq('id', row.bank_account_id as string).single(),
  ]);
  const bankRow = (bank ?? {}) as Record<string, unknown>;
  let vendorRow: Record<string, unknown> | null = null;
  if (row.lender_vendor_id) {
    const { data: v } = await supabaseAdmin().from('acct_vendors').select('id, legal_name, display_name').eq('id', row.lender_vendor_id as string).single();
    vendorRow = (v ?? null) as Record<string, unknown> | null;
  }
  return NextResponse.json({
    data: {
      id: row.id,
      kind: row.kind,
      name: row.name,
      lenderVendorId: row.lender_vendor_id,
      lenderName: vendorRow ? String(vendorRow.legal_name || vendorRow.display_name || '') : null,
      bankAccountId: row.bank_account_id,
      bankAccountName: bankRow.name ? String(bankRow.name) : null,
      apr: Number(row.apr || 0),
      termMonths: row.term_months,
      startDate: row.start_date,
      firstPaymentDate: row.first_payment_date,
      paymentFrequency: row.payment_frequency,
      paymentAmount: row.payment_amount == null ? null : Number(row.payment_amount),
      paymentDay: row.payment_day,
      originalPrincipal: row.original_principal == null ? null : Number(row.original_principal),
      creditLimit: row.credit_limit == null ? null : Number(row.credit_limit),
      status: row.status,
      balance: Number(bal || 0),
      notes: row.notes,
      schedule: ((schedule ?? []) as Record<string, unknown>[]).map((s) => ({
        id: s.id,
        installmentNo: s.installment_no,
        dueDate: s.due_date,
        payment: Number(s.payment || 0),
        principal: Number(s.principal || 0),
        interest: Number(s.interest || 0),
        balanceAfter: Number(s.balance_after || 0),
        status: s.status,
        paidOn: s.paid_on,
        paidJournalId: s.paid_journal_id,
      })),
    },
  });
}
