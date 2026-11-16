import { NextResponse, NextRequest } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

/**
 * POST /api/leases/[id]/payments — record a lease payment (Batch H).
 * There is no engine RPC for lease payments, so the route does what
 * the flow requires with the existing posting primitive: Dr lease
 * liability (principal) + Dr interest expense (interest) / Cr bank.
 * The liability and interest accounts are supplied by the caller —
 * the engine assigns no lease-liability role account, so no account
 * is guessed. Principal + interest must equal the amount. The
 * payment row carries the journal id.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const date = String(body.paymentDate || '').slice(0, 10);
  const amount = Number(body.amount);
  const principal = Number(body.principal);
  const interest = Number(body.interest);
  if (!date) return err('VALIDATION', 'Payment date is required', 400);
  if (!Number.isFinite(amount) || amount <= 0) return err('VALIDATION', 'Amount must be positive', 400);
  if (!Number.isFinite(principal) || principal < 0 || !Number.isFinite(interest) || interest < 0) {
    return err('VALIDATION', 'Principal and interest must be zero or more', 400);
  }
  if (Math.abs(principal + interest - amount) > 0.005) {
    return err('VALIDATION', 'Principal + interest must equal the payment amount', 400);
  }
  if (!body.fromBankAccountId) return err('VALIDATION', 'Paying bank account is required', 400);
  if (!body.liabilityAccountId) return err('VALIDATION', 'Lease liability account is required', 400);
  if (interest > 0 && !body.interestAccountId) return err('VALIDATION', 'Interest expense account is required when interest is greater than zero', 400);
  const { data: lease, error: leaseErr } = await supabaseAdmin().from('acct_leases').select('id, tenant_id, entity_id, lease_number, counterparty_name').eq('tenant_id', DEFAULT_TENANT_ID).eq('id', id).single();
  if (leaseErr || !lease) return err('NOT_FOUND', 'Lease not found', 404);
  const l = lease as Record<string, unknown>;
  const { data: bank, error: bankErr } = await supabaseAdmin().from('acct_bank_accounts').select('gl_account_id').eq('id', body.fromBankAccountId).single();
  if (bankErr || !bank) return err('VALIDATION', 'Bank account not found', 400);
  const lines: Record<string, unknown>[] = [
    { account_id: body.liabilityAccountId, debit: principal, description: `Lease payment ${l.lease_number} — principal` },
  ];
  if (interest > 0) {
    lines.push({ account_id: body.interestAccountId, debit: interest, description: `Lease payment ${l.lease_number} — interest` });
  }
  lines.push({ account_id: (bank as Record<string, unknown>).gl_account_id, credit: amount, description: `Lease payment ${l.lease_number}` });
  const { data: je, error: jeErr } = await supabaseAdmin().rpc('acct_post_entry', {
    p_tenant_id: DEFAULT_TENANT_ID,
    p_entity_id: l.entity_id,
    p_entry_date: date,
    p_lines: lines,
    p_source: 'lease',
    p_reference: String(l.lease_number),
    p_memo: `Lease payment ${l.lease_number} — ${l.counterparty_name}`,
    p_idempotency_key: `lease-pay-${id}-${date}-${amount}`,
    p_source_doc_type: 'lease',
    p_source_doc_id: id,
  });
  if (jeErr) return err('RPC_FAILED', jeErr.message, 400);
  const { data, error } = await supabaseAdmin().from('acct_lease_payments').insert({
    lease_id: id,
    payment_date: date,
    amount,
    principal,
    interest,
    journal_id: je,
    status: 'paid',
  }).select('id').single();
  if (error) return err('DB_ERROR', error.message, 400);
  return NextResponse.json({ data: { id: (data as Record<string, unknown>).id, journalId: je } }, { status: 201 });
}
