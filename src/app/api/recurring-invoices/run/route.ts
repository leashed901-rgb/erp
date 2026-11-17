import { NextResponse, NextRequest } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

/**
 * POST /api/recurring-invoices/run — run the engine's recurring
 * invoice runner (Batch I). acct_run_recurring_invoices creates draft
 * AR invoices for every 'active' schedule whose next_run_date is on
 * or before asOf, posts them, and advances the schedule. Returns the
 * number of invoices created.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const asOf = String(body.asOf || '').slice(0, 10) || new Date().toISOString().slice(0, 10);
  const { data, error } = await supabaseAdmin().rpc('acct_run_recurring_invoices', { p_as_of: asOf, p_tenant_id: DEFAULT_TENANT_ID });
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: { asOf, invoicesCreated: data ?? 0 } });
}
