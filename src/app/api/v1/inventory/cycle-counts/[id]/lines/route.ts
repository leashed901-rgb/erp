import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

/**
 * POST /api/v1/inventory/cycle-counts/[id]/lines — record counted quantities.
 * Body: { lines: [{ line_id, counted_quantity }] }. Variance is computed
 * here (counted − expected) since no trigger maintains it. Sets the session
 * to 'counting' on first count.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return err('VALIDATION', 'Invalid JSON', 400);
  }
  const lines = (body.lines as { line_id?: string; counted_quantity?: number }[] | undefined) ?? [];
  if (lines.length === 0) return err('VALIDATION', 'lines is required', 400);
  const { data: session } = await supabaseAdmin()
    .from('erp_inventory_count_sessions')
    .select('id,status')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('id', id)
    .maybeSingle();
  if (!session) return err('NOT_FOUND', 'Count session not found', 404);
  if (session.status === 'posted') return err('VALIDATION', 'A posted count cannot be changed', 400);
  const updated = [];
  for (const l of lines) {
    if (!l.line_id || l.counted_quantity == null) continue;
    const { data: line } = await supabaseAdmin()
      .from('erp_inventory_count_lines')
      .select('expected_quantity,unit_cost')
      .eq('id', l.line_id)
      .eq('count_session_id', id)
      .maybeSingle();
    if (!line) continue;
    const counted = Number(l.counted_quantity);
    const variance = counted - Number(line.expected_quantity ?? 0);
    const { data, error } = await supabaseAdmin()
      .from('erp_inventory_count_lines')
      .update({
        counted_quantity: counted,
        variance_quantity: variance,
        variance_value: Math.round(variance * Number(line.unit_cost ?? 0) * 100) / 100,
        counted_at: new Date().toISOString(),
      })
      .eq('id', l.line_id)
      .select('*')
      .single();
    if (error) return err('INTERNAL', error.message, 500);
    updated.push(data);
  }
  if (session.status === 'draft') {
    await supabaseAdmin()
      .from('erp_inventory_count_sessions')
      .update({ status: 'counting', started_at: new Date().toISOString() })
      .eq('id', id);
  }
  return NextResponse.json({ data: updated });
}
