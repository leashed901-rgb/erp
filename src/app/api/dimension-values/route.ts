import { NextResponse, NextRequest } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

/**
 * Dimension values (Batch I). GET ?dimensionId= — values for one
 * dimension (or all, capped at 500). POST — add a value (code + name;
 * parentValueId for hierarchies). DELETE ?id= — remove a value, refused
 * when it is a parent of another value.
 */
export async function GET(req: NextRequest) {
  const dimensionId = new URL(req.url).searchParams.get('dimensionId');
  let query = supabaseAdmin().from('acct_dimension_values').select('*').eq('tenant_id', DEFAULT_TENANT_ID).order('code').limit(500);
  if (dimensionId) query = query.eq('dimension_id', dimensionId);
  const { data, error } = await query;
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({
    data: ((data ?? []) as Record<string, unknown>[]).map((v) => ({
      id: v.id,
      dimensionId: v.dimension_id,
      code: v.code,
      name: v.name,
      parentValueId: v.parent_value_id,
      isActive: v.is_active,
    })),
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const dimensionId = String(body.dimensionId || '');
  const code = String(body.code || '').trim();
  const name = String(body.name || '').trim();
  const parentValueId = body.parentValueId ? String(body.parentValueId) : null;
  if (!dimensionId) return err('VALIDATION', 'dimensionId is required', 400);
  if (!code) return err('VALIDATION', 'code is required', 400);
  if (!name) return err('VALIDATION', 'name is required', 400);
  const sb = supabaseAdmin();
  const { data: dim } = await sb.from('acct_dimensions').select('id').eq('tenant_id', DEFAULT_TENANT_ID).eq('id', dimensionId).single();
  if (!dim) return err('VALIDATION', 'Unknown dimension', 400);
  if (parentValueId) {
    const { data: parent } = await sb.from('acct_dimension_values').select('id').eq('tenant_id', DEFAULT_TENANT_ID).eq('id', parentValueId).eq('dimension_id', dimensionId).single();
    if (!parent) return err('VALIDATION', 'Parent value must belong to the same dimension', 400);
  }
  const { data, error } = await sb.from('acct_dimension_values').insert({
    tenant_id: DEFAULT_TENANT_ID,
    dimension_id: dimensionId,
    code,
    name,
    parent_value_id: parentValueId,
    is_active: body.isActive !== false,
  }).select().single();
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: { id: data.id, dimensionId: data.dimension_id, code: data.code, name: data.name, parentValueId: data.parent_value_id, isActive: data.is_active } }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return err('VALIDATION', 'id is required', 400);
  const sb = supabaseAdmin();
  const { count } = await sb.from('acct_dimension_values').select('id', { count: 'exact', head: true }).eq('tenant_id', DEFAULT_TENANT_ID).eq('parent_value_id', id);
  if ((count || 0) > 0) return err('VALIDATION', `Value is the parent of ${count} other value(s) — reassign them first`, 400);
  const { error } = await sb.from('acct_dimension_values').delete().eq('tenant_id', DEFAULT_TENANT_ID).eq('id', id);
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: { deleted: true } });
}
