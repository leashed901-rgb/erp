import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

/**
 * POST /api/auto-reversals/run — run due auto-reversals (Batch G).
 * The engine reverses every scheduled entry whose reverse_on is on or
 * before asOf (default today), marks unpostable ones failed/cancelled
 * with the reason, and returns how many it reversed. Safe to call
 * repeatedly — already-reversed rows are not due again.
 */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const asOf = String(body.asOf || new Date().toISOString().slice(0, 10));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) {
    return err('VALIDATION', 'asOf must be YYYY-MM-DD', 400);
  }
  const { data, error } = await supabaseAdmin().rpc('acct_run_auto_reversals', {
    p_tenant_id: DEFAULT_TENANT_ID,
    p_as_of: asOf,
  });
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: { reversed: data } });
}
