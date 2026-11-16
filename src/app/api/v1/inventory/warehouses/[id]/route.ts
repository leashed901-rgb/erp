import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

/**
 * DELETE /api/v1/inventory/warehouses/[id] — delete a warehouse. Refused
 * while any stock sits in it (on-hand must be zero — move it out or adjust
 * it to zero first). The movement ledger keeps the warehouse id, so history
 * is preserved even after the warehouse row is gone.
 */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data: levels } = await supabaseAdmin()
    .from('erp_stock_levels')
    .select('on_hand')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('warehouse_id', id);
  const onHand = (levels ?? []).reduce((s, l) => s + Number(l.on_hand ?? 0), 0);
  if (onHand !== 0) {
    return err('VALIDATION', `Warehouse still holds ${onHand} units on hand — move or adjust stock out first`, 400);
  }
  // Transfers, count sessions and replenishment rules all FK-reference
  // the warehouse — refuse with a clear message instead of a 500.
  const [{ data: transfers }, { data: sessions }, { data: rules }] = await Promise.all([
    supabaseAdmin().from('erp_inventory_transfers').select('id').eq('tenant_id', DEFAULT_TENANT_ID).or(`from_warehouse_id.eq.${id},to_warehouse_id.eq.${id}`).limit(1),
    supabaseAdmin().from('erp_inventory_count_sessions').select('id').eq('tenant_id', DEFAULT_TENANT_ID).eq('warehouse_id', id).limit(1),
    supabaseAdmin().from('erp_replenishment_rules').select('id').eq('tenant_id', DEFAULT_TENANT_ID).eq('warehouse_id', id).limit(1),
  ]);
  if (transfers?.length) {
    return err('VALIDATION', 'Warehouse has transfer history — deactivate it instead of deleting it', 400);
  }
  if (sessions?.length) {
    return err('VALIDATION', 'Warehouse has cycle-count sessions — delete those first, or deactivate the warehouse instead', 400);
  }
  if (rules?.length) {
    return err('VALIDATION', 'Warehouse has replenishment rules — delete those first, or deactivate the warehouse instead', 400);
  }
  const { error: locErr } = await supabaseAdmin()
    .from('erp_warehouse_locations')
    .delete()
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('warehouse_id', id);
  if (locErr) return err('INTERNAL', locErr.message, 500);
  const { error } = await supabaseAdmin()
    .from('erp_warehouses')
    .delete()
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('id', id);
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: { id, deleted: true } });
}

/** PATCH /api/v1/inventory/warehouses/[id] — rename / activate / deactivate. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return err('VALIDATION', 'Invalid JSON', 400);
  }
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.name !== undefined) updates.name = String(body.name).trim();
  if (body.is_active !== undefined) updates.is_active = !!body.is_active;
  if (body.city !== undefined) updates.city = body.city;
  if (body.state !== undefined) updates.state = body.state;
  const { data, error } = await supabaseAdmin()
    .from('erp_warehouses')
    .update(updates)
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('id', id)
    .select('*')
    .single();
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data });
}
