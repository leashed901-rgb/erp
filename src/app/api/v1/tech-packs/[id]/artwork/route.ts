import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { apiError } from '@/lib/podServer';

/**
 * POST /api/v1/tech-packs/:id/artwork — upsert one artwork placement
 * (insert when no id, update when id). DELETE ?id= removes one.
 * Tenant-scoped; the ds__tp_child_guard trigger locks writes once the
 * pack is approved/released.
 */
const FIELDS = [
  'asset_id', 'view', 'placement', 'technique', 'width_mm', 'height_mm',
  'offset_ref', 'offset_x_mm', 'offset_y_mm', 'colorway_id',
  'pantone_codes', 'stitch_count', 'notes', 'sort',
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
        .from('tech_pack_artwork')
        .update(row)
        .eq('tenant_id', DEFAULT_TENANT_ID)
        .eq('tech_pack_id', tpId)
        .eq('id', body.id)
        .select()
        .single();
    } else {
      query = supabaseAdmin()
        .from('tech_pack_artwork')
        .insert(row)
        .select()
        .single();
    }
    const { data, error } = await query;
    if (error) throw new Error(`tech-pack artwork: ${error.message}`);
    return NextResponse.json(data, { status: body?.id ? 200 : 201 });
  } catch (err) {
    return apiError(err instanceof Error ? err.message : 'Failed to save artwork placement.');
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
      .from('tech_pack_artwork')
      .delete()
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .eq('tech_pack_id', tpId)
      .eq('id', rowId);
    if (error) throw new Error(`tech-pack artwork delete: ${error.message}`);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiError(err instanceof Error ? err.message : 'Failed to delete artwork placement.');
  }
}
