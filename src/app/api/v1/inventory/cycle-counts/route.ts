import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { resolveOrCreateSku } from '@/lib/erpStock';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

/** GET /api/v1/inventory/cycle-counts — count sessions with line rollups. */
export async function GET(req: NextRequest) {
  const status = new URL(req.url).searchParams.get('status');
  let query = supabaseAdmin()
    .from('erp_inventory_count_sessions')
    .select('id,count_number,warehouse_id,location_id,count_type,status,scheduled_for,started_at,submitted_at,approved_at,posted_at,created_at')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .order('created_at', { ascending: false })
    .limit(100);
  if (status && status !== 'all') query = query.eq('status', status);
  const { data, error } = await query;
  if (error) return err('INTERNAL', error.message, 500);
  const rows = data ?? [];
  const whIds = [...new Set(rows.map((r) => r.warehouse_id))];
  const { data: whs } = await supabaseAdmin().from('erp_warehouses').select('id,name').in('id', whIds.length ? whIds : ['00000000-0000-0000-0000-000000000000']);
  const whById = new Map(((whs ?? []) as { id: string; name: string }[]).map((w) => [w.id, w.name]));
  const sIds = rows.map((r) => r.id);
  const { data: lines } = await supabaseAdmin()
    .from('erp_inventory_count_lines')
    .select('count_session_id,expected_quantity,counted_quantity')
    .in('count_session_id', sIds.length ? sIds : ['00000000-0000-0000-0000-000000000000']);
  const rollup = new Map<string, { lines: number; counted: number; variance: number }>();
  for (const l of (lines ?? []) as { count_session_id: string; expected_quantity: number; counted_quantity: number | null }[]) {
    const r = rollup.get(l.count_session_id) ?? { lines: 0, counted: 0, variance: 0 };
    r.lines += 1;
    if (l.counted_quantity != null) {
      r.counted += 1;
      r.variance += Number(l.counted_quantity) - Number(l.expected_quantity ?? 0);
    }
    rollup.set(l.count_session_id, r);
  }
  return NextResponse.json({
    data: rows.map((r) => ({
      ...r,
      warehouse: whById.get(r.warehouse_id) ?? null,
      ...(rollup.get(r.id) ?? { lines: 0, counted: 0, variance: 0 }),
    })),
  });
}

/**
 * POST /api/v1/inventory/cycle-counts — start a cycle count (doc 16,
 * registry `inventory.cycle_count` → `erp_inventory_count_sessions`).
 * Body: { warehouse_id, location_id?, lines: [{ variant_id, expected_quantity? }] }.
 * Expected quantities default to the ledger on-hand for the SKU in that
 * warehouse. Session number comes from the platform sequence.
 */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return err('VALIDATION', 'Invalid JSON', 400);
  }
  const warehouseId = String(body.warehouse_id || '');
  const lines = (body.lines as { variant_id?: string; sku_id?: string; expected_quantity?: number }[] | undefined) ?? [];
  if (!warehouseId) return err('VALIDATION', 'warehouse_id is required', 400);
  if (lines.length === 0) return err('VALIDATION', 'Add at least one SKU to count', 400);
  try {
    const { data: wh } = await supabaseAdmin()
      .from('erp_warehouses')
      .select('id')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .eq('id', warehouseId)
      .maybeSingle();
    if (!wh) return err('NOT_FOUND', 'Warehouse not found', 404);
    // Default location for the count lines.
    let locationId = (body.location_id as string) || null;
    if (!locationId) {
      const { data: loc } = await supabaseAdmin()
        .from('erp_warehouse_locations')
        .select('id')
        .eq('tenant_id', DEFAULT_TENANT_ID)
        .eq('warehouse_id', warehouseId)
        .eq('is_active', true)
        .order('code', { ascending: true })
        .limit(1)
        .maybeSingle();
      locationId = loc?.id ?? null;
    }
    if (!locationId) return err('VALIDATION', 'Warehouse has no locations — add one first', 400);

    const { data: countNumber, error: numErr } = await supabaseAdmin().rpc('erp_next_document_number', {
      p_tenant_id: DEFAULT_TENANT_ID,
      p_document_type: 'count',
    });
    if (numErr) return err('INTERNAL', numErr.message, 500);

    const { data: session, error: sErr } = await supabaseAdmin()
      .from('erp_inventory_count_sessions')
      .insert({
        tenant_id: DEFAULT_TENANT_ID,
        count_number: countNumber,
        warehouse_id: warehouseId,
        location_id: locationId,
        count_type: (body.count_type as string) || 'cycle',
        status: 'draft',
        scheduled_for: (body.scheduled_for as string) || null,
      })
      .select('*')
      .single();
    if (sErr) return err('INTERNAL', sErr.message, 500);

    const inserts = [];
    for (const l of lines) {
      let skuId = l.sku_id;
      if (!skuId && l.variant_id) skuId = (await resolveOrCreateSku(String(l.variant_id))).id;
      if (!skuId) return err('VALIDATION', 'Each line needs a variant_id or sku_id', 400);
      let expected = l.expected_quantity;
      if (expected == null) {
        const { data: lv } = await supabaseAdmin()
          .from('erp_stock_levels')
          .select('on_hand')
          .eq('tenant_id', DEFAULT_TENANT_ID)
          .eq('sku_id', skuId)
          .eq('warehouse_id', warehouseId);
        expected = (lv ?? []).reduce((s, r) => s + Number(r.on_hand ?? 0), 0);
      }
      const { data: skuRow } = await supabaseAdmin()
        .from('erp_product_skus')
        .select('standard_cost')
        .eq('id', skuId)
        .single();
      inserts.push({
        tenant_id: DEFAULT_TENANT_ID,
        count_session_id: session.id,
        sku_id: skuId,
        location_id: locationId,
        expected_quantity: expected,
        unit_cost: Number(skuRow?.standard_cost ?? 0),
      });
    }
    const { data: inserted, error: lErr } = await supabaseAdmin()
      .from('erp_inventory_count_lines')
      .insert(inserts)
      .select('*');
    if (lErr) {
      await supabaseAdmin().from('erp_inventory_count_sessions').delete().eq('id', session.id);
      return err('INTERNAL', lErr.message, 500);
    }
    return NextResponse.json({ data: { ...session, lines: inserted ?? [] } }, { status: 201 });
  } catch (e) {
    return err('INTERNAL', e instanceof Error ? e.message : 'Cycle count failed', 500);
  }
}
