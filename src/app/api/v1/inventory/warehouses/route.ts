import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

/**
 * GET /api/v1/inventory/warehouses — warehouses with their locations and
 * current on-hand per warehouse. The tenant starts with none — every stock
 * RPC (`erp_adjust_stock` et al.) raises "Set up a warehouse first" until
 * one exists, so this list is the prerequisite the Inventory screen shows.
 */
export async function GET() {
  const { data, error } = await supabaseAdmin()
    .from('erp_warehouses')
    .select('id,code,name,warehouse_type,city,state,is_active,created_at')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .order('created_at', { ascending: true });
  if (error) return err('INTERNAL', error.message, 500);
  const rows = data ?? [];
  const whIds = rows.map((w) => w.id);
  const { data: locs } = await supabaseAdmin()
    .from('erp_warehouse_locations')
    .select('id,warehouse_id,code,name,location_type,is_receiving,is_pickable,is_active')
    .in('warehouse_id', whIds.length ? whIds : ['00000000-0000-0000-0000-000000000000'])
    .order('code', { ascending: true });
  const { data: levels } = await supabaseAdmin()
    .from('erp_stock_levels')
    .select('warehouse_id,on_hand')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .in('warehouse_id', whIds.length ? whIds : ['00000000-0000-0000-0000-000000000000']);
  const onHandByWh = new Map<string, number>();
  for (const l of (levels ?? []) as { warehouse_id: string; on_hand: number }[]) {
    onHandByWh.set(l.warehouse_id, (onHandByWh.get(l.warehouse_id) ?? 0) + Number(l.on_hand ?? 0));
  }
  const locsByWh = new Map<string, unknown[]>();
  for (const l of (locs ?? []) as { warehouse_id: string }[]) {
    const arr = locsByWh.get(l.warehouse_id) ?? [];
    arr.push(l);
    locsByWh.set(l.warehouse_id, arr);
  }
  return NextResponse.json({
    data: rows.map((w) => ({
      ...w,
      on_hand: onHandByWh.get(w.id) ?? 0,
      locations: locsByWh.get(w.id) ?? [],
    })),
  });
}

/**
 * POST /api/v1/inventory/warehouses — create a warehouse. A default
 * receiving/pickable location is created with it: the ERP default-location
 * lookup (`erp__default_location`) needs at least one location before any
 * stock can be adjusted or received into the warehouse.
 */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return err('VALIDATION', 'Invalid JSON', 400);
  }
  const name = String(body.name || '').trim();
  const code = String(body.code || '').trim().toUpperCase();
  if (!name) return err('VALIDATION', 'name is required', 400);
  if (!code) return err('VALIDATION', 'code is required', 400);
  const { data: dupe } = await supabaseAdmin()
    .from('erp_warehouses')
    .select('id')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('code', code)
    .maybeSingle();
  if (dupe) return err('VALIDATION', `Warehouse code "${code}" already exists`, 400);
  const { data, error } = await supabaseAdmin()
    .from('erp_warehouses')
    .insert({
      tenant_id: DEFAULT_TENANT_ID,
      code,
      name,
      warehouse_type: (body.warehouse_type as string) || 'warehouse',
      address_line1: (body.address_line1 as string) || null,
      city: (body.city as string) || null,
      state: (body.state as string) || null,
      postal_code: (body.postal_code as string) || null,
      country_code: (body.country_code as string) || 'US',
      timezone: (body.timezone as string) || 'America/Chicago',
      is_active: true,
    })
    .select('*')
    .single();
  if (error) return err('INTERNAL', error.message, 500);
  // Default location — without one, erp__default_location returns null and
  // adjustments/receipts cannot place stock.
  const { error: locErr } = await supabaseAdmin().from('erp_warehouse_locations').insert({
    tenant_id: DEFAULT_TENANT_ID,
    warehouse_id: data.id,
    code: 'DEFAULT',
    name: 'Default location',
    location_type: 'bin',
    is_receiving: true,
    is_pickable: true,
    is_active: true,
  });
  if (locErr) return err('INTERNAL', `Warehouse created but default location failed: ${locErr.message}`, 500);
  return NextResponse.json({ data }, { status: 201 });
}
