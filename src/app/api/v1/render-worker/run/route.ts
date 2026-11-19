import { NextRequest, NextResponse } from 'next/server';
import { apiError } from '@/lib/podServer';
import { processRenderQueue } from '@/lib/renderWorker';
import { renderQueueCounts } from '@/lib/renderJobAdapter';

/**
 * POST /api/v1/render-worker/run — the render worker's run entry point.
 * Claims a batch of queued craft_jobs rows (kind='mockup_render') via
 * ds_claim_jobs (FOR UPDATE SKIP LOCKED; stuck rows > 5 min are recovered
 * by ds_reap_stale_jobs called by the adapter) and renders each. One bad
 * row never fails the batch.
 * Body: { limit?: number } (default 5, max 20).
 *
 * Serve intent (the actual serving is the platform/CDN's job): outputs
 * are hash-addressed and immutable —
 * Cache-Control: public, max-age=31536000, immutable.
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as { limit?: unknown };
    const limit =
      typeof body.limit === 'number'
        ? Math.min(20, Math.max(1, Math.floor(body.limit)))
        : 5;
    const result = await processRenderQueue(limit);
    return NextResponse.json({
      ...result,
      serve: {
        cacheControl: 'public, max-age=31536000, immutable',
        note: 'Outputs are hash-addressed under /r/{input_hash}/…; serving is the platform/CDN job.',
      },
    });
  } catch (err) {
    return apiError(err instanceof Error ? err.message : 'Render worker failed.');
  }
}

/**
 * GET /api/v1/render-worker/run — queue depths, for the review grid.
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
