import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { apiError } from '@/lib/podServer';

/**
 * /api/v1/designs/:id/versions — the design version ledger.
 * The existing PATCH /api/v1/designs/:id only writes canvas_state; it never
 * creates a design_versions row and never sets current_version_id, which is
 * why a design saved on the Konva canvas cannot be turned into a tech pack
 * (ds_create_tech_pack requires a version). This route is the versioning
 * path: every save writes a version row and points the design at it.
 *
 * GET  ?id= — list versions (newest first) or one version's canvas_state.
 * POST { canvas_state, message?, source_app? } — insert the next version
 *      (version_no = max + 1), set designs.current_version_id, and mirror
 *      the state into designs.canvas_state.freehand for the canvas to reopen.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: designId } = await params;
    const versionId = new URL(req.url).searchParams.get('id');
    if (versionId) {
      const { data, error } = await supabaseAdmin()
        .from('design_versions')
        .select('id,design_id,version_no,label,canvas_state,source_app,sha256,message,is_locked,created_by,created_at')
        .eq('tenant_id', DEFAULT_TENANT_ID)
        .eq('design_id', designId)
        .eq('id', versionId)
        .single();
      if (error || !data) {
        return NextResponse.json(
          { error: { code: 'NOT_FOUND', message: 'Version not found.', requestId: crypto.randomUUID() } },
          { status: 404 },
        );
      }
      return NextResponse.json({ version: data });
    }
    const { data, error } = await supabaseAdmin()
      .from('design_versions')
      .select('id,version_no,label,source_app,sha256,message,is_locked,created_by,created_at')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .eq('design_id', designId)
      .order('version_no', { ascending: false })
      .limit(20);
    if (error) throw new Error(`design_versions: ${error.message}`);
    return NextResponse.json({ versions: data ?? [] });
  } catch (err) {
    return apiError(err instanceof Error ? err.message : 'Failed to list design versions.');
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: designId } = await params;
    const body = await req.json().catch(() => ({}));
    const canvasState = body?.canvas_state;
    if (!canvasState || typeof canvasState !== 'object') {
      return apiError('canvas_state is required.', 400);
    }
    const { data: design, error: designError } = await supabaseAdmin()
      .from('designs')
      .select('id,canvas_state')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .eq('id', designId)
      .single();
    if (designError || !design) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Design not found.', requestId: crypto.randomUUID() } },
        { status: 404 },
      );
    }
    const { data: latest } = await supabaseAdmin()
      .from('design_versions')
      .select('version_no')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .eq('design_id', designId)
      .order('version_no', { ascending: false })
      .limit(1)
      .maybeSingle();
    const versionNo = (latest?.version_no ?? 0) + 1;
    const sha256 = createHash('sha256').update(JSON.stringify(canvasState)).digest('hex');
    const sourceApp = String(body?.source_app ?? 'freehand');
    const { data: version, error: insertError } = await supabaseAdmin()
      .from('design_versions')
      .insert({
        tenant_id: DEFAULT_TENANT_ID,
        design_id: designId,
        version_no: versionNo,
        label: `v${versionNo}`,
        canvas_state: canvasState,
        source_app: sourceApp,
        sha256,
        message: typeof body?.message === 'string' ? body.message : null,
        is_locked: false,
      })
      .select('id,version_no,sha256,created_at')
      .single();
    if (insertError) throw new Error(`design_versions insert: ${insertError.message}`);
    const mergedCanvasState = {
      ...((design.canvas_state ?? {}) as Record<string, unknown>),
      freehand: canvasState,
    };
    const { error: updateError } = await supabaseAdmin()
      .from('designs')
      .update({ current_version_id: version.id, canvas_state: mergedCanvasState, updated_at: new Date().toISOString() })
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .eq('id', designId);
    if (updateError) throw new Error(`designs update: ${updateError.message}`);
    return NextResponse.json(
      { version_id: version.id, version_no: versionNo, sha256, created_at: version.created_at },
      { status: 201 },
    );
  } catch (err) {
    return apiError(err instanceof Error ? err.message : 'Failed to save design version.');
  }
}
