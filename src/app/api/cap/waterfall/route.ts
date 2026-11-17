import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status = 400) {
  return NextResponse.json({ error: { code, message } }, { status });
}

/** POST /api/cap/waterfall — cap_liquidation_waterfall RPC (proceeds allocation). */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const exitValue = Number(body.exit_value ?? body.gross_proceeds ?? 0);
    if (!Number.isFinite(exitValue) || exitValue < 0) return err('VALIDATION', 'exit_value must be >= 0.');
    const { data, error } = await supabaseAdmin().rpc('cap_liquidation_waterfall', {
      p_tenant_id: DEFAULT_TENANT_ID,
      p_exit_value: exitValue,
      p_as_of: String(body.as_of ?? new Date().toISOString().slice(0, 10)),
    });
    if (error) return err('WATERFALL_FAILED', error.message);
    return NextResponse.json({ data: data ?? [] });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to calculate waterfall.';
    return err('WATERFALL_FAILED', message);
  }
}
