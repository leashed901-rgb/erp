import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { apiError } from '@/lib/podServer';

/**
 * GET /api/v1/tech-packs — the tenant's tech packs (tenant-scoped).
 * POST /api/v1/tech-packs — create from a design. Replicates
 * ds_create_tech_pack rule-for-rule (the RPC's membership assert needs a
 * signed-in user session, which the app's service-role API routes never
 * have): the design needs a saved version, no draft/in_review revision may
 * be open, and a new revision copies the previous revision's BOM and
 * measurements. Body: { designId, title?, versionId?, sizeRangeId?, baseSize? }
 */
export async function GET(req: NextRequest) {
  try {
    const params = new URL(req.url).searchParams;
    const status = params.get('status');
    const designId = params.get('designId');
    const limit = Math.min(Math.max(parseInt(params.get('limit') ?? '50', 10) || 50, 1), 100);
    let query = supabaseAdmin()
      .from('tech_packs')
      .select(
        'id,design_id,version_id,revision,style_number,title,season_id,size_range_id,base_size,status,supersedes_id,approved_by,approved_at,released_at,created_by,created_at,updated_at',
      )
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .order('updated_at', { ascending: false })
      .limit(limit);
    if (status) query = query.eq('status', status);
    if (designId) query = query.eq('design_id', designId);
    const { data, error } = await query;
    if (error) throw new Error(`tech-packs: ${error.message}`);
    return NextResponse.json({ items: data ?? [], nextCursor: null });
  } catch (err) {
    return apiError(err instanceof Error ? err.message : 'Failed to list tech packs.');
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const designId = String(body?.designId ?? '').trim();
    if (!designId) {
      return NextResponse.json(
        { error: { code: 'VALIDATION', message: 'designId is required.', requestId: crypto.randomUUID() } },
        { status: 400 },
      );
    }
    const { data: design, error: designError } = await supabaseAdmin()
      .from('designs')
      .select('id,tenant_id,name,style_number,current_version_id,season_id')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .eq('id', designId)
      .is('deleted_at', null)
      .single();
    if (designError || !design) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Design not found.', requestId: crypto.randomUUID() } },
        { status: 404 },
      );
    }
    const versionId = body?.versionId ?? design.current_version_id;
    if (!versionId) {
      return NextResponse.json(
        { error: { code: 'VALIDATION', message: 'Save a design version first.', requestId: crypto.randomUUID() } },
        { status: 422 },
      );
    }
    const { data: version, error: versionError } = await supabaseAdmin()
      .from('design_versions')
      .select('id')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .eq('id', versionId as string)
      .eq('design_id', designId)
      .single();
    if (versionError || !version) {
      return NextResponse.json(
        { error: { code: 'VALIDATION', message: 'Version does not belong to this design.', requestId: crypto.randomUUID() } },
        { status: 422 },
      );
    }
    const { data: prev } = await supabaseAdmin()
      .from('tech_packs')
      .select('id,revision,title,size_range_id,base_size,status')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .eq('design_id', designId)
      .order('revision', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (prev && ['draft', 'in_review'].includes(prev.status as string)) {
      return NextResponse.json(
        {
          error: {
            code: 'CONFLICT',
            message: `Revision ${prev.revision} is still ${prev.status}; finish or archive it first.`,
            requestId: crypto.randomUUID(),
          },
        },
        { status: 409 },
      );
    }
    const { data: row, error } = await supabaseAdmin()
      .from('tech_packs')
      .insert({
        tenant_id: DEFAULT_TENANT_ID,
        design_id: designId,
        version_id: versionId,
        revision: (prev?.revision ?? 0) + 1,
        style_number: design.style_number,
        title: body?.title ?? prev?.title ?? design.name,
        season_id: design.season_id,
        size_range_id: body?.sizeRangeId ?? prev?.size_range_id ?? null,
        base_size: body?.baseSize ?? prev?.base_size ?? null,
        supersedes_id: prev?.id ?? null,
      })
      .select(
        'id,design_id,version_id,revision,style_number,title,season_id,size_range_id,base_size,status,created_at,updated_at',
      )
      .single();
    if (error) throw new Error(`tech-packs create: ${error.message}`);
    if (prev) {
      const [{ data: prevBom }, { data: prevMeasurements }] = await Promise.all([
        supabaseAdmin()
          .from('tech_pack_bom_lines')
          .select('material_id,kind,placement,description,quantity,uom,colorway_id,vendor_id,unit_cost,supplier_note,sort')
          .eq('tenant_id', DEFAULT_TENANT_ID)
          .eq('tech_pack_id', prev.id as string),
        supabaseAdmin()
          .from('tech_pack_measurements')
          .select('pom_id,size_label,value,tol_plus,tol_minus')
          .eq('tenant_id', DEFAULT_TENANT_ID)
          .eq('tech_pack_id', prev.id as string),
      ]);
      if ((prevBom ?? []).length > 0) {
        await supabaseAdmin()
          .from('tech_pack_bom_lines')
          .insert(
            (prevBom as Record<string, unknown>[]).map((b) => ({
              ...b,
              tenant_id: DEFAULT_TENANT_ID,
              tech_pack_id: row.id,
            })),
          );
      }
      if ((prevMeasurements ?? []).length > 0) {
        await supabaseAdmin()
          .from('tech_pack_measurements')
          .insert(
            (prevMeasurements as Record<string, unknown>[]).map((m) => ({
              ...m,
              tenant_id: DEFAULT_TENANT_ID,
              tech_pack_id: row.id,
            })),
          );
      }
    }
    return NextResponse.json(row, { status: 201 });
  } catch (err) {
    return apiError(err instanceof Error ? err.message : 'Failed to create tech pack.');
  }
}
