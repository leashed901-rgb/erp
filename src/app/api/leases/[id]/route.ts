import { NextResponse, NextRequest } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

/**
 * GET /api/leases/[id] — one lease with its payments (Batch H).
 * PATCH — status only (draft | active | expired | terminated |
 * renewed | cancelled). Amounts on a lease are set at creation;
 * nothing here rewrites the ROU asset or liability.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { data: l, error } = await supabaseAdmin().from('acct_leases').select('*').eq('tenant_id', DEFAULT_TENANT_ID).eq('id', id).single();
  if (error || !l) return err('NOT_FOUND', 'Lease not found', 404);
  const row = l as Record<string, unknown>;
  const { data: payments } = await supabaseAdmin().from('acct_lease_payments').select('*').eq('lease_id', id).order('payment_date', { ascending: false });
  return NextResponse.json({
    data: {
      id: row.id,
      leaseNumber: row.lease_number,
      counterparty: row.counterparty_name,
      commencement: row.commencement_date,
      end: row.end_date,
      currency: row.currency,
      paymentFrequency: row.payment_frequency,
      initialDirectCost: Number(row.initial_direct_cost || 0),
      incentive: Number(row.lease_incentive || 0),
      discountRate: Number(row.discount_rate || 0),
      rouAsset: Number(row.right_of_use_asset || 0),
      liability: Number(row.lease_liability || 0),
      status: row.status,
      payments: ((payments ?? []) as Record<string, unknown>[]).map((p) => ({
        id: p.id,
        paymentDate: p.payment_date,
        amount: Number(p.amount || 0),
        principal: Number(p.principal || 0),
        interest: Number(p.interest || 0),
        journalId: p.journal_id,
        status: p.status,
      })),
    },
  });
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const status = String(body.status || '');
  if (!['draft', 'active', 'expired', 'terminated', 'renewed', 'cancelled'].includes(status)) {
    return err('VALIDATION', 'status must be draft, active, expired, terminated, renewed, or cancelled', 400);
  }
  const { error } = await supabaseAdmin().from('acct_leases').update({ status }).eq('tenant_id', DEFAULT_TENANT_ID).eq('id', id);
  if (error) return err('DB_ERROR', error.message, 400);
  return NextResponse.json({ data: { id, status } });
}
