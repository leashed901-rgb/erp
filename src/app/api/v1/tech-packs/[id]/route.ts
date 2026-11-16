import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { apiError } from '@/lib/podServer';
import { loadTechPackSnapshot } from '@/lib/techPackSnapshot';

/**
 * GET /api/v1/tech-packs/:id — the full tech pack for the editor and
 * preview: snapshot (tech pack + design + size range + colorways + BOM +
 * measurements joined to ds_pom_library + construction + artwork) plus
 * revisions and season. Tenant-scoped.
 * PATCH /api/v1/tech-packs/:id — header fields while the pack is a draft
 * (title, style_number, season_id, size_range_id, base_size, notes).
 * The ds__tp_child_guard trigger locks edits once approved/released.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const snapshot = await loadTechPackSnapshot(id);
    if (!snapshot) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Tech pack not found.', requestId: crypto.randomUUID() } },
        { status: 404 },
      );
    }
    const tp = snapshot.tech_pack as { season_id?: string | null };
    const [{ data: revisions }, { data: season }] = await Promise.all([
      supabaseAdmin()
        .from('tech_pack_revisions')
        .select('id,revision,from_status,to_status,snapshot,change_summary,created_by,created_at')
        .eq('tenant_id', DEFAULT_TENANT_ID)
        .eq('tech_pack_id', id)
        .order('created_at', { ascending: false }),
      tp.season_id
        ? supabaseAdmin()
            .from('ds_seasons')
            .select('id,code,name,starts_on,ends_on,status')
            .eq('tenant_id', DEFAULT_TENANT_ID)
            .eq('id', tp.season_id)
            .single()
        : Promise.resolve({ data: null }),
    ]);
    return NextResponse.json({ ...snapshot, revisions: revisions ?? [], season: season ?? null });
  } catch (err) {
    return apiError(err instanceof Error ? err.message : 'Failed to load tech pack.');
  }
}

const HEADER_FIELDS = ['title', 'style_number', 'season_id', 'size_range_id', 'base_size', 'notes'] as const;

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const patch: Record<string, unknown> = {};
    for (const f of HEADER_FIELDS) {
      if (body?.[f] !== undefined) patch[f] = body[f] === '' ? null : body[f];
    }
    if (Object.keys(patch).length === 0) {
      return NextResponse.json(
        { error: { code: 'VALIDATION', message: 'Nothing to update.', requestId: crypto.randomUUID() } },
        { status: 400 },
      );
    }
    const { data: current, error: currentError } = await supabaseAdmin()
      .from('tech_packs')
      .select('id,status')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .eq('id', id)
      .single();
    if (currentError || !current) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Tech pack not found.', requestId: crypto.randomUUID() } },
        { status: 404 },
      );
    }
    if (current.status !== 'draft') {
      return NextResponse.json(
        {
          error: {
            code: 'LOCKED',
            message: `Tech pack is ${current.status} — header is locked.`,
            requestId: crypto.randomUUID(),
          },
        },
        { status: 409 },
      );
    }
    const { data, error } = await supabaseAdmin()
      .from('tech_packs')
      .update(patch)
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .eq('id', id)
      .select(
        'id,design_id,version_id,revision,style_number,title,season_id,size_range_id,base_size,status,notes,updated_at',
      )
      .single();
    if (error) throw new Error(`tech-packs update: ${error.message}`);
    return NextResponse.json(data);
  } catch (err) {
    return apiError(err instanceof Error ? err.message : 'Failed to update tech pack.');
  }
}
