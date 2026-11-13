import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/** GET /api/v1/inventory/[itemId]/history — stock movement history for an item.
 *  Reads erp_inventory_movements. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ itemId: string }> }) {
  const { itemId } = await params;
  const { data, error } = await supabaseAdmin()
    .from('erp_inventory_movements')
    .select('*')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('item_id', itemId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) return NextResponse.json({ error: { code: 'INTERNAL', message: error.message, requestId: crypto.randomUUID() } }, { status: 500 });
  return NextResponse.json({ data });
}
