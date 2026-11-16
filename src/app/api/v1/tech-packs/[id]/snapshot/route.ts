import { NextRequest, NextResponse } from 'next/server';
import { apiError } from '@/lib/podServer';
import { loadTechPackSnapshot } from '@/lib/techPackSnapshot';

/**
 * GET /api/v1/tech-packs/:id/snapshot — the render snapshot for the preview
 * and PDF export, assembled from direct tenant-scoped reads (same shape
 * as ds_tech_pack_snapshot; the RPC is not callable from the app's
 * service-role routes). Read-only; writes nothing.
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
    return NextResponse.json(snapshot);
  } catch (err) {
    return apiError(err instanceof Error ? err.message : 'Failed to snapshot tech pack.');
  }
}
