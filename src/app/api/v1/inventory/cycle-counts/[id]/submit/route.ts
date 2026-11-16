import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

/**
 * POST /api/v1/inventory/cycle-counts/[id]/submit — mark a count submitted
 * (status draft/counting → submitted) once every line has a counted quantity.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data: session } = await supabaseAdmin()
    .from('erp_inventory_count_sessions')
    .select('id,status')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('id', id)
    .maybeSingle();
  if (!session) return err('NOT_FOUND', 'Count session not found', 404);
  if (!['draft', 'counting'].includes(session.status)) {
    return err('VALIDATION', `Count is ${session.status} — only a draft/counting session can be submitted`, 400);
  }
  const { data: uncounted, error: uErr } = await supabaseAdmin()
    .from('erp_inventory_count_lines')
    .select('id')
    .eq('count_session_id', id)
    .is('counted_quantity', null)
    .limit(1);
  if (uErr) return err('INTERNAL', uErr.message, 500);
  if ((uncounted ?? []).length > 0) {
    return err('VALIDATION', 'Every line needs a counted quantity before submit', 400);
  }
  const { data: negative, error: nErr } = await supabaseAdmin()
    .from('erp_inventory_count_lines')
    .select('id,counted_quantity')
    .eq('count_session_id', id)
    .lt('counted_quantity', 0)
    .limit(1);
  if (nErr) return err('INTERNAL', nErr.message, 500);
  if ((negative ?? []).length > 0) {
    return err('VALIDATION', 'Counted quantities cannot be below zero', 400);
  }
  const { data, error } = await supabaseAdmin()
    .from('erp_inventory_count_sessions')
    .update({ status: 'submitted', submitted_at: new Date().toISOString() })
    .eq('id', id)
    .select('*')
    .single();
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data });
}
