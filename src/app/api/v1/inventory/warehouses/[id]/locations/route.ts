import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

/** GET /api/v1/inventory/warehouses/[id]/locations — locations in a warehouse. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data, error } = await supabaseAdmin()
    .from('erp_warehouse_locations')
    .select('id,warehouse_id,code,name,location_type,aisle,rack,shelf,bin,is_pickable,is_receiving,is_shipping,is_returns,is_quarantine,is_active')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('warehouse_id', id)
    .order('code', { ascending: true });
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: data ?? [] });
}

/** POST /api/v1/inventory/warehouses/[id]/locations — add a bin/location. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return err('VALIDATION', 'Invalid JSON', 400);
  }
  const code = String(body.code || '').trim().toUpperCase();
  if (!code) return err('VALIDATION', 'code is required', 400);
  const { data: wh } = await supabaseAdmin()
    .from('erp_warehouses')
    .select('id')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('id', id)
    .maybeSingle();
  if (!wh) return err('NOT_FOUND', 'Warehouse not found', 404);
  const { data, error } = await supabaseAdmin()
    .from('erp_warehouse_locations')
    .insert({
      tenant_id: DEFAULT_TENANT_ID,
      warehouse_id: id,
      code,
      name: (body.name as string) || code,
      location_type: (body.location_type as string) || 'bin',
      aisle: (body.aisle as string) || null,
      rack: (body.rack as string) || null,
      shelf: (body.shelf as string) || null,
      bin: (body.bin as string) || null,
      is_pickable: body.is_pickable !== false,
      is_receiving: !!body.is_receiving,
      is_shipping: !!body.is_shipping,
      is_returns: !!body.is_returns,
      is_quarantine: !!body.is_quarantine,
      is_active: true,
    })
    .select('*')
    .single();
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data }, { status: 201 });
}
