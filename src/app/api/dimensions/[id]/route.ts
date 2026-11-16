import { NextResponse, NextRequest } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

/**
 * GET /api/dimensions/[id] — one dimension + its values (Batch I).
 * PATCH — rename / change data_type / required / active. DELETE — only
 * when no values and no account rules reference it (the FKs would
 * refuse anyway; this reports the reason instead of a raw 500).
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = supabaseAdmin();
  const [{ data: dim, error: dErr }, { data: values, error: vErr }] = await Promise.all([
    sb.from('acct_dimensions').select('*').eq('tenant_id', DEFAULT_TENANT_ID).eq('id', id).single(),
    sb.from('acct_dimension_values').select('*').eq('tenant_id', DEFAULT_TENANT_ID).eq('dimension_id', id).order('code'),
  ]);
  if (dErr || !dim) return err('NOT_FOUND', 'Dimension not found', 404);
  if (vErr) return err('INTERNAL', vErr.message, 500);
  return NextResponse.json({
    data: {
      id: dim.id,
      code: dim.code,
      name: dim.name,
      dataType: dim.data_type,
      isRequired: dim.is_required,
      isActive: dim.is_active,
      values: ((values ?? []) as Record<string, unknown>[]).map((v) => ({
        id: v.id,
        dimensionId: v.dimension_id,
        code: v.code,
        name: v.name,
        parentValueId: v.parent_value_id,
        isActive: v.is_active,
      })),
    },
  });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const patch: Record<string, unknown> = {};
  if (body.name !== undefined) patch.name = String(body.name || '').trim();
  if (body.dataType !== undefined) patch.data_type = String(body.dataType || '').trim();
  if (body.isRequired !== undefined) patch.is_required = !!body.isRequired;
  if (body.isActive !== undefined) patch.is_active = !!body.isActive;
  if (Object.keys(patch).length === 0) return err('VALIDATION', 'Nothing to update', 400);
  if (patch.name === '') return err('VALIDATION', 'name cannot be empty', 400);
  const { data, error } = await supabaseAdmin().from('acct_dimensions').update(patch).eq('tenant_id', DEFAULT_TENANT_ID).eq('id', id).select().single();
  if (error || !data) return err('NOT_FOUND', 'Dimension not found', 404);
  return NextResponse.json({ data: { id: data.id, code: data.code, name: data.name, dataType: data.data_type, isRequired: data.is_required, isActive: data.is_active } });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = supabaseAdmin();
  const [{ count: valueCount }, { count: ruleCount }] = await Promise.all([
    sb.from('acct_dimension_values').select('id', { count: 'exact', head: true }).eq('tenant_id', DEFAULT_TENANT_ID).eq('dimension_id', id),
    sb.from('acct_account_dimension_rules').select('id', { count: 'exact', head: true }).eq('tenant_id', DEFAULT_TENANT_ID).eq('dimension_id', id),
  ]);
  if ((valueCount || 0) > 0) return err('VALIDATION', `Dimension still has ${valueCount} value(s) — delete them first`, 400);
  if ((ruleCount || 0) > 0) return err('VALIDATION', `Dimension is referenced by ${ruleCount} account rule(s) — delete them first`, 400);
  const { error } = await sb.from('acct_dimensions').delete().eq('tenant_id', DEFAULT_TENANT_ID).eq('id', id);
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: { deleted: true } });
}
