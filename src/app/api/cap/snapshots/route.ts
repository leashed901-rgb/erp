import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status = 400) {
  return NextResponse.json({ error: { code, message } }, { status });
}

const REASONS = ['valuation', 'grant', 'financing', 'board', 'audit', 'manual'];

/** POST /api/cap/snapshots — cap_take_snapshot RPC (frozen cap table + event-chain anchor). */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const reason = String(body.reason ?? 'manual');
    if (!REASONS.includes(reason)) return err('VALIDATION', `reason must be one of: ${REASONS.join(', ')}`);
    const asOf = String(body.as_of_date ?? body.as_of ?? new Date().toISOString().slice(0, 10));
    const { data, error } = await supabaseAdmin().rpc('cap_take_snapshot', {
      p_tenant_id: DEFAULT_TENANT_ID,
      p_as_of: asOf,
      p_reason: reason,
    });
    if (error) return err('SNAPSHOT_FAILED', error.message);
    const { data: row } = await supabaseAdmin().from('cap_table_snapshots').select('*').eq('id', data).single();
    return NextResponse.json({ data: row ?? { id: data } }, { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to freeze snapshot.';
    return err('SNAPSHOT_FAILED', message);
  }
}
