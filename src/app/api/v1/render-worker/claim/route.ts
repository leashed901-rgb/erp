import { NextRequest, NextResponse } from 'next/server';
import { apiError } from '@/lib/podServer';
import { processRenderQueue } from '@/lib/renderWorker';
import { renderQueueCounts } from '@/lib/renderJobAdapter';

/**
 * POST /api/v1/render-worker/claim — the render worker's entry point.
 * Claims a batch of queued craft_jobs rows (kind='mockup_render') via
 * ds_claim_jobs (FOR UPDATE SKIP LOCKED; stuck rows > 5 min are recovered
 * by ds_reap_stale_jobs called by the adapter), composites each with
 * sharp, uploads real files to storage, and marks the corresponding
 * craft_jobs + shadow design_renders rows succeeded with storage_path.
 * One bad row never fails the batch.
 * Body: { batchSize?: number } (default 5, max 20).
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as { batchSize?: unknown };
    const batchSize =
      typeof body.batchSize === 'number'
        ? Math.min(20, Math.max(1, Math.floor(body.batchSize)))
        : 5;
    const result = await processRenderQueue(batchSize);
    return NextResponse.json(result);
  } catch (err) {
    return apiError(err instanceof Error ? err.message : 'Render worker failed.');
  }
}

/**
 * GET /api/v1/render-worker/claim — queue depths, for the review grid.
 * Reports both craft_jobs (the live queue) and design_renders (the legacy
 * read-back surface) so dashboards stay consistent during the migration.
 */
export async function GET() {
  try {
    const { craftJobs, designRenders } = await renderQueueCounts();
    return NextResponse.json({ counts: craftJobs, designRenders });
  } catch (err) {
    return apiError(err instanceof Error ? err.message : 'Failed to read render queue.');
  }
}
