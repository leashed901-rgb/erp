import { NextResponse, NextRequest } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

/**
 * GET /api/debt — acct_debt_instruments with live GL balances
 * (acct_debt_balance reads the balance of the instrument's bank
 * account). POST — create an instrument. There is no engine create
 * RPC for debt, so this is a direct insert. APR is a FRACTION
 * (0.07 = 7%/yr — the CHECK refuses >= 1); credit_limit is required
 * for credit_card / line_of_credit kinds.
 */
const KINDS = ['credit_card', 'line_of_credit', 'term_loan', 'sba_loan', 'equipment_loan', 'mortgage', 'merchant_cash_advance', 'other'];
const FREQUENCIES = ['weekly', 'biweekly', 'monthly', 'quarterly', 'annual'];

export async function GET() {
  const { data, error } = await supabaseAdmin().from('acct_debt_instruments').select('*').eq('tenant_id', DEFAULT_TENANT_ID).order('name');
  if (error) return err('INTERNAL', error.message, 500);
  const rows = (data ?? []) as Record<string, unknown>[];
  const bankIds = [...new Set(rows.map((d) => d.bank_account_id as string).filter(Boolean))];
  const vendorIds = [...new Set(rows.map((d) => d.lender_vendor_id as string).filter(Boolean))];
  const [{ data: banks }, { data: vendors }] = await Promise.all([
    bankIds.length ? supabaseAdmin().from('acct_bank_accounts').select('id, name').in('id', bankIds) : Promise.resolve({ data: [] }),
    vendorIds.length ? supabaseAdmin().from('acct_vendors').select('id, legal_name, display_name').in('id', vendorIds) : Promise.resolve({ data: [] }),
  ]);
  const bankById = new Map(((banks ?? []) as Record<string, unknown>[]).map((b) => [b.id, b.name]));
  const vendorById = new Map(((vendors ?? []) as Record<string, unknown>[]).map((v) => [v.id, v.legal_name || v.display_name]));
  const out = [];
  for (const d of rows) {
    const { data: bal } = await supabaseAdmin().rpc('acct_debt_balance', { p_debt_id: d.id });
    out.push({
      id: d.id,
      kind: d.kind,
      name: d.name,
      lenderVendorId: d.lender_vendor_id,
      lenderName: vendorById.get(d.lender_vendor_id as string) ?? null,
      bankAccountId: d.bank_account_id,
      bankAccountName: bankById.get(d.bank_account_id as string) ?? null,
      apr: Number(d.apr || 0),
      termMonths: d.term_months,
      startDate: d.start_date,
      firstPaymentDate: d.first_payment_date,
      paymentFrequency: d.payment_frequency,
      paymentAmount: d.payment_amount == null ? null : Number(d.payment_amount),
      paymentDay: d.payment_day,
      originalPrincipal: d.original_principal == null ? null : Number(d.original_principal),
      creditLimit: d.credit_limit == null ? null : Number(d.credit_limit),
      status: d.status,
      balance: Number(bal || 0),
      notes: d.notes,
    });
  }
  return NextResponse.json({ data: out });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const kind = String(body.kind || '');
  const name = String(body.name || '').trim();
  const apr = Number(body.apr);
  if (!KINDS.includes(kind)) return err('VALIDATION', `kind must be one of ${KINDS.join(', ')}`, 400);
  if (!name) return err('VALIDATION', 'Name is required', 400);
  if (!body.bankAccountId) return err('VALIDATION', 'Bank account is required (the instrument books against it)', 400);
  if (!Number.isFinite(apr) || apr < 0 || apr >= 1) return err('VALIDATION', 'APR is a fraction (0.07 = 7%) and must be below 1', 400);
  if ((kind === 'credit_card' || kind === 'line_of_credit') && body.creditLimit == null) {
    return err('VALIDATION', 'Credit limit is required for credit cards and lines of credit', 400);
  }
  if (body.paymentFrequency && !FREQUENCIES.includes(String(body.paymentFrequency))) {
    return err('VALIDATION', `paymentFrequency must be one of ${FREQUENCIES.join(', ')}`, 400);
  }
  const { data: ent } = await supabaseAdmin().rpc('acct_default_entity', { p_tenant_id: DEFAULT_TENANT_ID });
  const { data, error } = await supabaseAdmin().from('acct_debt_instruments').insert({
    tenant_id: DEFAULT_TENANT_ID,
    entity_id: ent,
    kind,
    name,
    lender_vendor_id: body.lenderVendorId || null,
    bank_account_id: body.bankAccountId,
    interest_expense_account_id: body.interestExpenseAccountId || null,
    fees_account_id: body.feesAccountId || null,
    original_principal: body.originalPrincipal != null ? Number(body.originalPrincipal) : null,
    credit_limit: body.creditLimit != null ? Number(body.creditLimit) : null,
    apr,
    term_months: body.termMonths != null ? Number(body.termMonths) : null,
    start_date: body.startDate || null,
    first_payment_date: body.firstPaymentDate || null,
    payment_frequency: body.paymentFrequency || null,
    payment_amount: body.paymentAmount != null ? Number(body.paymentAmount) : null,
    payment_day: body.paymentDay != null ? Number(body.paymentDay) : null,
    autopay_from_bank_account_id: body.autopayFromBankAccountId || null,
    status: 'active',
    notes: body.notes ? String(body.notes) : null,
    metadata: {},
  }).select('id').single();
  if (error) return err('DB_ERROR', error.message, 400);
  return NextResponse.json({ data: { id: (data as Record<string, unknown>).id } }, { status: 201 });
}
