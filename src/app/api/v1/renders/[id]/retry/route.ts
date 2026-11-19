import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { apiError } from '@/lib/podServer';
import { requeueRenderJob, findJobByInputHash } from '@/lib/renderJobAdapter';

/**
 * POST /api/v1/renders/:id/retry — re-queue a FAILED render.
 * Only failed rows can be retried (409 otherwise). The shadow
 * design_renders row is reset to 'queued' and the underlying craft_jobs
 * row (resolved by input_hash) is reset via the adapter's requeueRenderJob
 * so ds_claim_jobs picks it up again. Attempts are reset to 0 — a manual
 * retry is a fresh start (not a worker-side requeue with the backoff).
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { data: row, error } = await supabaseAdmin()
      .from('design_renders')
      .select('id,input_hash,kind,view_angle,color,status,attempts')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .eq('id', id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: `No render ${id}.`, requestId: crypto.randomUUID() } },
        { status: 404 },
      );
    }
    if (row.status !== 'failed') {
      return NextResponse.json(
        {
          error: {
            code: 'NOT_FAILED',
            message: `Render ${id} is ${row.status}, not failed — only failed renders can be retried.`,
            requestId: crypto.randomUUID(),
          },
        },
        { status: 409 },
      );
    }

    // Resolve the craft_jobs.id by idempotency_key (input_hash) and reset
    // both surfaces. If the job can't be found (e.g. enqueued before this
    // adapter landed), only the shadow design_renders row is reset.
    const jobId = await findJobByInputHash({
      inputHash: String(row.input_hash),
      kind: row.kind as 'mockup' | 'print',
      view: String(row.view_angle),
      color: String(row.color),
    });
    if (jobId) {
      const rq = await requeueRenderJob({ jobId, renderRowId: id });
      if (!rq.ok) throw new Error(rq.error);
    } else {
      // No craft_jobs row — just reset the legacy shadow row.
      await supabaseAdmin()
        .from('design_renders')
        .update({
          status: 'queued',
          error: null,
          last_error: null,
          claimed_at: null,
          finished_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq('tenant_id', DEFAULT_TENANT_ID)
        .eq('id', id);
    }

    const { data, error: updErr } = await supabaseAdmin()
      .from('design_renders')
      .select('id,design_id,view_angle,color,kind,status,attempts')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .eq('id', id)
      .single();
    if (updErr) throw new Error(updErr.message);
    return NextResponse.json({ render: data });
  } catch (err) {
    return apiError(err instanceof Error ? err.message : 'Failed to retry render.');
  }
}
