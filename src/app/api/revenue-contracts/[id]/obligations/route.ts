import { NextResponse, NextRequest } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

const METHODS = ['point_in_time', 'straight_line', 'milestone', 'usage', 'percentage_complete', 'manual'];

/**
 * POST /api/revenue-contracts/[id]/obligations — add a performance
 * obligation to a contract (Batch H). Allocated prices across a
 * contract's obligations are what the transaction price splits into;
 * the route does not enforce the split totals — the engine has no
 * check for it either.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const code = String(body.code || '').trim();
  const method = String(body.method || '');
  const allocated = Number(body.allocatedPrice);
  if (!code) return err('VALIDATION', 'Obligation code is required', 400);
  if (!METHODS.includes(method)) return err('VALIDATION', `method must be one of ${METHODS.join(', ')}`, 400);
  if (!Number.isFinite(allocated) || allocated < 0) return err('VALIDATION', 'Allocated price must be zero or more', 400);
  const { data: contract } = await supabaseAdmin().from('acct_revenue_contracts').select('id').eq('tenant_id', DEFAULT_TENANT_ID).eq('id', id).single();
  if (!contract) return err('NOT_FOUND', 'Revenue contract not found', 404);
  const { data, error } = await supabaseAdmin().from('acct_revenue_performance_obligations').insert({
    contract_id: id,
    obligation_code: code,
    // description is NOT NULL in the engine — default to the code.
    description: body.description ? String(body.description) : code,
    // standalone_price is NOT NULL in the engine — default to the
    // allocated price when only one price is known.
    standalone_price: body.standalonePrice != null ? Number(body.standalonePrice) : allocated,
    allocated_price: allocated,
    recognition_method: method,
    recognition_start: body.start || null,
    recognition_end: body.end || null,
    deferred_revenue_account_id: body.deferredAccountId || null,
    revenue_account_id: body.revenueAccountId || null,
  }).select('id').single();
  if (error) return err('DB_ERROR', error.message, 400);
  return NextResponse.json({ data: { id: (data as Record<string, unknown>).id } }, { status: 201 });
}
