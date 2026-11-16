import { NextResponse, NextRequest } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

const UNITS = ['number', 'percent', 'ratio', 'days', 'months', 'currency'];

/**
 * KPI definitions (Batch I). GET — the definitions the engine
 * evaluates (acct_kpis auto-seeds the standard set when none exist).
 * POST — create (code + name + formula; the trigger validates the
 * formula). PATCH ?id= — edit. DELETE ?id=.
 */
export async function GET() {
  const { data, error } = await supabaseAdmin().from('acct_kpi_definitions').select('*').eq('tenant_id', DEFAULT_TENANT_ID).order('sort_order');
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({
    data: ((data ?? []) as Record<string, unknown>[]).map((d) => ({
      id: d.id,
      code: d.code,
      name: d.name,
      formula: d.formula,
      unit: d.unit,
      sortOrder: d.sort_order,
      isActive: d.is_active,
    })),
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const code = String(body.code || '').trim();
  const name = String(body.name || '').trim();
  const formula = String(body.formula || '').trim();
  const unit = String(body.unit || 'number');
  if (!code) return err('VALIDATION', 'code is required', 400);
  if (!name) return err('VALIDATION', 'name is required', 400);
  if (!formula) return err('VALIDATION', 'formula is required', 400);
  if (!UNITS.includes(unit)) return err('VALIDATION', `unit must be one of ${UNITS.join(', ')}`, 400);
  const { data, error } = await supabaseAdmin().from('acct_kpi_definitions').insert({
    tenant_id: DEFAULT_TENANT_ID,
    code,
    name,
    formula,
    unit,
    sort_order: Number(body.sortOrder || 0),
    is_active: body.isActive !== false,
  }).select().single();
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: { id: data.id, code: data.code, name: data.name, formula: data.formula, unit: data.unit, sortOrder: data.sort_order, isActive: data.is_active } }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return err('VALIDATION', 'id is required', 400);
  const body = await req.json().catch(() => ({}));
  const patch: Record<string, unknown> = {};
  if (body.name !== undefined) patch.name = String(body.name || '').trim();
  if (body.formula !== undefined) patch.formula = String(body.formula || '').trim();
  if (body.unit !== undefined) {
    if (!UNITS.includes(String(body.unit))) return err('VALIDATION', `unit must be one of ${UNITS.join(', ')}`, 400);
    patch.unit = String(body.unit);
  }
  if (body.sortOrder !== undefined) patch.sort_order = Number(body.sortOrder || 0);
  if (body.isActive !== undefined) patch.is_active = !!body.isActive;
  if (Object.keys(patch).length === 0) return err('VALIDATION', 'Nothing to update', 400);
  if (patch.name === '') return err('VALIDATION', 'name cannot be empty', 400);
  if (patch.formula === '') return err('VALIDATION', 'formula cannot be empty', 400);
  const { data, error } = await supabaseAdmin().from('acct_kpi_definitions').update(patch).eq('tenant_id', DEFAULT_TENANT_ID).eq('id', id).select().single();
  if (error || !data) return err('NOT_FOUND', 'KPI definition not found', 404);
  return NextResponse.json({ data: { id: data.id, code: data.code, name: data.name, formula: data.formula, unit: data.unit, isActive: data.is_active } });
}

export async function DELETE(req: NextRequest) {
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return err('VALIDATION', 'id is required', 400);
  const { error } = await supabaseAdmin().from('acct_kpi_definitions').delete().eq('tenant_id', DEFAULT_TENANT_ID).eq('id', id);
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: { deleted: true } });
}
