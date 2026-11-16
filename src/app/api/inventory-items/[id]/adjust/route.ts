import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

/**
 * POST /api/inventory-items/[id]/adjust — post a stock adjustment
 * through the engine (Batch F). Body: { qtyChange, reason, unitCost?,
 * offsetAccountId? }. The engine writes the move (+ cost layer on a
 * receipt, FIFO draws on an issue) and the balancing journal; a reason
 * is required by the engine. Returns the move id + the live on-hand
 * (sum of moves) after the adjustment.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return err('VALIDATION', 'Invalid JSON', 400);
  }
  const qtyChange = Number(body.qtyChange);
  const reason = String(body.reason || '').trim();
  if (!Number.isFinite(qtyChange) || qtyChange === 0) {
    return err('VALIDATION', 'qtyChange must be a non-zero number', 400);
  }
  if (!reason) return err('VALIDATION', 'A reason is required for inventory adjustments', 400);
  const { data: item } = await supabaseAdmin()
    .from('acct_items')
    .select('id,item_type')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('id', id)
    .maybeSingle();
  if (!item) return err('NOT_FOUND', 'Item not found', 404);
  if ((item as { item_type: string }).item_type !== 'inventory') {
    return err('VALIDATION', 'Only inventory items carry stock', 400);
  }
  const { data: moveId, error } = await supabaseAdmin().rpc('acct_inventory_adjust', {
    p_item_id: id,
    p_qty_change: qtyChange,
    p_date: new Date().toISOString().slice(0, 10),
    p_reason: reason,
    p_unit_cost: body.unitCost != null ? Number(body.unitCost) : null,
    p_offset_account_id: (body.offsetAccountId as string) || null,
    p_reference: (body.reference as string) || null,
    p_move_type: 'adjustment',
  });
  if (error) return err('VALIDATION', error.message, 400);
  const { data: moves } = await supabaseAdmin()
    .from('acct_inventory_moves')
    .select('quantity')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('item_id', id);
  const onHand = ((moves ?? []) as { quantity: number }[]).reduce((s, m) => s + Number(m.quantity), 0);
  return NextResponse.json({ data: { moveId, onHand } }, { status: 201 });
}
