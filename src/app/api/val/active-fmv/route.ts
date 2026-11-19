import { NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status = 400) {
  return NextResponse.json({ error: { code, message } }, { status });
}

/** GET /api/val/active-fmv — latest final 409A valuation (the FMV of record). */
export async function GET() {
  try {
    const { data, error } = await supabaseAdmin()
      .from('cap_valuations')
      .select('*')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .eq('status', 'final')
      .order('effective_date', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) return err('FMV_FAILED', error.message);
    if (!data) return NextResponse.json({ data: null });
    const row = data as Record<string, unknown>;
    return NextResponse.json({
      data: {
        valuation_id: String(row.id),
        fmv_per_share: Number(row.fmv_per_common_share),
        effective_date: String(row.effective_date),
        expires_on: String(row.expires_on),
        provider: (row.provider as string | null) ?? null,
        method: (row.method as string | null) ?? null,
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to load active FMV.';
    return err('FMV_FAILED', message);
  }
}
