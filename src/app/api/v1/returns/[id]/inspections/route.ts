import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

/**
 * GET /api/v1/returns/[id]/inspections — inspection records for an RMA
 * (`erp_return_inspections`: condition + disposition per line).
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data, error } = await supabaseAdmin()
    .from('erp_return_inspections')
    .select('*')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('rma_id', id)
    .order('inspected_at', { ascending: false });
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: data ?? [] });
}

/**
 * POST /api/v1/returns/[id]/inspections — record an inspection.
 * Body: { return_line_id, condition_code?, disposition?, notes? }.
 * Disposition: 'restock' | 'damage' | 'scrap' | 'repair' — the receive step
 * uses the line disposition to decide whether stock moves back in.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return err('VALIDATION', 'Invalid JSON', 400);
  }
  const lineId = String(body.return_line_id || '');
  if (!lineId) return err('VALIDATION', 'return_line_id is required', 400);
  const { data: line } = await supabaseAdmin()
    .from('erp_return_lines')
    .select('id')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('id', lineId)
    .eq('rma_id', id)
    .maybeSingle();
  if (!line) return err('NOT_FOUND', 'Return line not found on this RMA', 404);
  const disposition = (body.disposition as string) || null;
  if (disposition && !['restock', 'damage', 'scrap', 'repair'].includes(disposition)) {
    return err('VALIDATION', 'disposition must be restock, damage, scrap or repair', 400);
  }
  const { data, error } = await supabaseAdmin()
    .from('erp_return_inspections')
    .insert({
      tenant_id: DEFAULT_TENANT_ID,
      rma_id: id,
      return_line_id: lineId,
      condition_code: (body.condition_code as string) || null,
      disposition,
      notes: (body.notes as string) || null,
    })
    .select('*')
    .single();
  if (error) return err('INTERNAL', error.message, 500);
  // An inspection disposition updates the line so receive() restocks (or
  // doesn't) exactly what was inspected.
  if (disposition) {
    await supabaseAdmin().from('erp_return_lines').update({ disposition }).eq('id', lineId);
  }
  return NextResponse.json({ data }, { status: 201 });
}
