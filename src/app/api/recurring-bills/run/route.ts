import { NextResponse, NextRequest } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

/**
 * POST /api/recurring-bills/run — run the engine's recurring bill
 * runner (Batch I). acct_run_recurring_bills creates AP bills for
 * every active schedule whose next_run_date is on or before asOf
 * (auto_post bills are posted by the engine) and advances the
 * schedule. Returns the number of bills created.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const asOf = String(body.asOf || '').slice(0, 10) || new Date().toISOString().slice(0, 10);
  const { data, error } = await supabaseAdmin().rpc('acct_run_recurring_bills', { p_as_of: asOf, p_tenant_id: DEFAULT_TENANT_ID });
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: { asOf, billsCreated: data ?? 0 } });
}
