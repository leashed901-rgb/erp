import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status = 400) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const asOf = sp.get('as_of') || new Date().toISOString().slice(0, 10);
    const denominator = sp.get('denominator') === 'allocated_only' ? 'allocated_only' : 'allocated_plus_pool';
    const { data, error } = await supabaseAdmin().rpc('cap_table', {
      p_tenant_id: DEFAULT_TENANT_ID,
      p_as_of: asOf,
    });
    if (error) return err('CAP_TABLE_FAILED', error.message);
    return NextResponse.json({ data: data ?? [], meta: { as_of: asOf, denominator } });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to derive cap table.';
    return err('CAP_TABLE_FAILED', message);
  }
}
