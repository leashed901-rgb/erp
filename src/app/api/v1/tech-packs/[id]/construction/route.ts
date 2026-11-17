import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { apiError } from '@/lib/podServer';

/**
 * POST /api/v1/tech-packs/:id/construction — upsert one construction
 * operation (insert when no id, update when id). DELETE ?id= removes one.
 * Tenant-scoped; the ds__tp_child_guard trigger locks writes once the
 * pack is approved/released.
 */
const FIELDS = [
  'area', 'operation', 'stitch_type', 'spi', 'seam_allowance_mm',
  'notes', 'image_asset_id', 'sort',
] as const;

async function ownTechPack(id: string) {
  const { data } = await supabaseAdmin()
    .from('tech_packs')
    .select('id')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('id', id)
    .single();
  return Boolean(data);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: tpId } = await params;
    if (!(await ownTechPack(tpId))) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Tech pack not found.', requestId: crypto.randomUUID() } },
        { status: 404 },
      );
    }
    const body = await req.json();
    const row: Record<string, unknown> = { tenant_id: DEFAULT_TENANT_ID, tech_pack_id: tpId };
    for (const f of FIELDS) if (body?.[f] !== undefined) row[f] = body[f];
    let query;
    if (body?.id) {
      query = supabaseAdmin()
        .from('tech_pack_construction')
        .update(row)
        .eq('tenant_id', DEFAULT_TENANT_ID)
        .eq('tech_pack_id', tpId)
        .eq('id', body.id)
        .select()
        .single();
    } else {
      query = supabaseAdmin()
        .from('tech_pack_construction')
        .insert(row)
        .select()
        .single();
    }
    const { data, error } = await query;
    if (error) throw new Error(`tech-pack construction: ${error.message}`);
    return NextResponse.json(data, { status: body?.id ? 200 : 201 });
  } catch (err) {
    return apiError(err instanceof Error ? err.message : 'Failed to save construction operation.');
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: tpId } = await params;
    const rowId = new URL(req.url).searchParams.get('id');
    if (!rowId) {
      return NextResponse.json(
        { error: { code: 'VALIDATION', message: 'id is required.', requestId: crypto.randomUUID() } },
        { status: 400 },
      );
    }
    const { error } = await supabaseAdmin()
      .from('tech_pack_construction')
      .delete()
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .eq('tech_pack_id', tpId)
      .eq('id', rowId);
    if (error) throw new Error(`tech-pack construction delete: ${error.message}`);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiError(err instanceof Error ? err.message : 'Failed to delete construction operation.');
  }
}
