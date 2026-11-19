import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

/**
 * POST /api/v1/returns/[id]/receive — receive return items with inspection
 * (doc 17, registry `rma.receive` → `erp_receive_return`).
 * Body: { lines?: [{ return_line_id, quantity, disposition }], refund?,
 *         warehouse_id? }. Disposition per line: 'restock' (stock moves back
 * into the warehouse), 'damage' / 'scrap' (no stock movement). With refund
 * (default true) the RPC refunds the received lines through
 * `erp_refund_order` and writes `erp_return_refunds`. The old version only
 * flipped the RMA status to 'received' — no restock, no refund, no
 * inspection — and required the RMA to already be approved, which this RPC
 * enforces itself. Returns { restocked, refunded } plus the updated RMA.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return err('VALIDATION', 'Invalid JSON', 400);
  }
  const { data: result, error } = await supabaseAdmin().rpc('erp_receive_return', {
    p_rma_id: id,
    p_lines: (body.lines as unknown) ?? null,
    p_refund: body.refund !== false,
    p_warehouse_id: (body.warehouse_id as string) || null,
  });
  if (error) return err('INTERNAL', error.message, 500);
  const { data } = await supabaseAdmin()
    .from('erp_return_authorizations')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .single();
  return NextResponse.json({ data, result, message: 'Return received' });
}
