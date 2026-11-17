/**
 * renderJobAdapter.ts — the thin bridge between the render loop and the
 * unified craft_jobs queue (S600).
 *
 * CONTEXT
 *   The platform has two job surfaces:
 *     1. NEW   — `craft_jobs` + ds_enqueue_job/ds_claim_jobs/ds_finish_job
 *        (the schema-verified system, packages/db/src/rpc.ts wraps the RPCs).
 *     2. LEGACY — `design_renders` + claim_design_renders (the old system
 *        the renderWorker was built on).
 *
 *   This adapter makes the render loop speak craft_jobs while the
 *   design_renders table remains as the read-back surface for the review
 *   grid (/api/v1/renders GET, publish/preview/test-render routes,
 *   fulfillment.ts). Every enqueue/claim/finish goes through the craft_jobs
 *   RPCs; a "shadow" design_renders row is mirrored alongside so legacy
 *   consumers see the row update in real time without any change.
 *
 * MAPPING
 *   design_renders.kind ∈ {'mockup','print'} → craft_jobs.kind = 'mockup_render'
 *     (the only render-flavoured kind in the S600 enum). The original kind
 *     is preserved on `input.kind` so the worker dispatches correctly.
 *   design_renders.input_hash  → craft_jobs.idempotency_key (uuid/text; the
 *     hash is hex so it satisfies the text type) AND craft_jobs.subject_id
 *     is the design_id (uuid), subject_type='design'. The hash is also
 *     stored on input.inputHash so the worker reads it from the row's
 *     payload, not by re-joining design_renders.
 *   design_renders.row.id      → input.renderRowId (so finishRenderJob can
 *     mirror the result back into the legacy row).
 *
 * FAILURE / REQUEUE
 *   ds_finish_job(p_ok=false) already implements the requeue policy:
 *     attempts < max_attempts → status='queued', run_after=now+30s*2^attempts,
 *     attempts >= max_attempts → status='failed'. The adapter mirrors the
 *     resulting status back into the design_renders row (succeeded|failed).
 *
 * NO-NEW-RPC RULE
 *   The adapter does not invent RPCs. It calls ds_enqueue_job,
 *   ds_claim_jobs, ds_finish_job (and ds_reap_stale_jobs for recovery)
 *   via the typed wrappers in @platform/db/rpc. The one direct UPDATE on
 *   craft_jobs (requeueRenderJob for /api/v1/renders/:id/retry) is a
 *   service-role write against an active table — the S600 policy
 *   `craft_jobs` row permits it (`tenant_read` access mode, service-role
 *   writes).
 */
import { supabaseAdmin, DEFAULT_TENANT_ID } from './supabaseAdmin';
import { enqueueJob, claimJobs, finishJob } from '@platform/db/rpc';
import type { Result } from '@platform/db/rpc';
import type { ClaimedRenderJob, EnqueueResult, RenderJobInput, RenderJobOutput } from './designTypes';
export type { ClaimedRenderJob, EnqueueResult, RenderJob, RenderJobInput, RenderJobOutput } from './designTypes';

/** The craft_jobs.kind used for all render work (mockups + print files). */
export const RENDER_JOB_KIND = 'mockup_render';
/** Worker identity for ds_claim_jobs/ds_finish_job (must match between calls). */
export const RENDER_WORKER_NAME = 'render-worker-v1';

/**
 * Enqueue a render job through craft_jobs, optionally mirroring a shadow
 * design_renders row for legacy consumers. Idempotent on `inputHash` —
 * ds_enqueue_job's ON CONFLICT (tenant_id, idempotency_key) bumps
 * updated_at and returns the existing id; the shadow row insert likewise
 * races on the unique index and falls back to the existing row.
 */
export async function enqueueRenderJob(args: {
  designId: string;
  blankId: string | null;
  view: string;
  color: string;
  kind: 'mockup' | 'print';
  inputHash: string;
  rendererVersion: string;
  priority?: number;
  /** Mirror a design_renders row alongside (default true — backward compat). */
  mirrorToLegacyTable?: boolean;
}): Promise<Result<EnqueueResult>> {
  let renderRowId: string | null = null;

  if (args.mirrorToLegacyTable !== false) {
    // Shadow row so /api/v1/renders GET, publish/preview/test-render routes
    // and fulfillment.ts continue to see status without changes.
    const { data: shadow, error: shadowErr } = await supabaseAdmin()
      .from('design_renders')
      .insert({
        tenant_id: DEFAULT_TENANT_ID,
        design_id: args.designId,
        canonical_product_id: args.blankId,
        view_angle: args.view,
        color: args.color,
        kind: args.kind,
        input_hash: args.inputHash,
        renderer_version: args.rendererVersion,
        storage_path: null,
        status: 'queued',
      })
      .select('id')
      .single();
    if (shadowErr) {
      // Unique-index race — a concurrent enqueue won. Re-use the existing row.
      const { data: raced } = await supabaseAdmin()
        .from('design_renders')
        .select('id')
        .eq('tenant_id', DEFAULT_TENANT_ID)
        .eq('input_hash', args.inputHash)
        .eq('kind', args.kind)
        .eq('view_angle', args.view)
        .eq('color', args.color)
        .limit(1);
      if (raced?.[0]) renderRowId = (raced[0] as { id: string }).id;
    } else if (shadow) {
      renderRowId = shadow.id as string;
    }
  }

  const input: RenderJobInput = {
    designId: args.designId,
    blankId: args.blankId,
    view: args.view,
    color: args.color,
    kind: args.kind,
    inputHash: args.inputHash,
    rendererVersion: args.rendererVersion,
    renderRowId,
  };

  const res = await enqueueJob(supabaseAdmin(), {
    tenantId: DEFAULT_TENANT_ID,
    kind: RENDER_JOB_KIND,
    app: 'internal',
    input,
    subjectType: 'design',
    subject: args.designId,
    key: args.inputHash, // idempotency_key — hex sha256 satisfies text NOT NULL
    priority: args.priority ?? 100,
  });
  if (!res.ok) return res;
  return { ok: true, data: { jobId: res.data.job_id, renderRowId } };
}

/**
 * Reap stale running jobs (heartbeat lost) and claim a batch of queued
 * render jobs. ds_reap_stale_jobs is the analogue of the legacy
 * claim_design_renders recovery pass — crashed workers (heartbeat_at < now
 * − 5min, attempts < max_attempts) are returned to 'queued'. ds_claim_jobs
 * then claims up to `limit` rows with FOR UPDATE SKIP LOCKED and
 * attempts+1.
 *
 * Returns ClaimedRenderJob[] shaped as the worker's RenderRow expects.
 */
export async function claimRenderJobs(batchSize: number): Promise<{
  ok: true;
  data: ClaimedRenderJob[];
} | { ok: false; error: string }> {
  // Recovery pass — same role as claim_design_renders' internal recovery.
  // Best-effort; a failure here doesn't block the claim (ds_claim_jobs also
  // only selects status='queued', so a stuck running row just won't be
  // claimed this round).
  try {
    await supabaseAdmin().rpc('ds_reap_stale_jobs', { p_stale: '5 minutes' });
  } catch {
    // best-effort — ignore
  }

  const res = await claimJobs(supabaseAdmin(), {
    worker: RENDER_WORKER_NAME,
    kinds: [RENDER_JOB_KIND],
    limit: batchSize,
  });
  if (!res.ok) return res;
  const rows = (res.data ?? []) as Array<Record<string, unknown>>;
  const claimed: ClaimedRenderJob[] = [];
  for (const r of rows) {
    const input = (r.input ?? {}) as Partial<RenderJobInput> | null;
    if (!input || !input.designId || !input.view || !input.color || !input.inputHash) {
      // Malformed input — fail the job so the queue doesn't stall on it.
      await finishJob(supabaseAdmin(), {
        jobId: String(r.id),
        worker: RENDER_WORKER_NAME,
        ok: false,
        error: 'malformed input: missing designId/view/color/inputHash',
      }).catch(() => {});
      continue;
    }
    claimed.push({
      jobId: String(r.id),
      attempts: Number(r.attempts ?? 0),
      input: input as RenderJobInput,
    });
  }
  return { ok: true, data: claimed };
}

/**
 * Finish a render job — calls ds_finish_job (which sets status/output and
 * implements the requeue-on-failure policy) and mirrors the result back
 * into the shadow design_renders row when renderRowId is present.
 *
 * The `nextStatus` hint lets the caller tell the mirror how to record a
 * failure that ds_finish_job chose to requeue (attempts < max_attempts).
 * For a definitive failure (attempts >= max_attempts), pass 'failed'.
 */
export async function finishRenderJob(args: {
  jobId: string;
  ok: boolean;
  output?: RenderJobOutput | null;
  error?: string | null;
  renderRowId?: string | null;
  /** Mirror status: 'succeeded' | 'failed' | 'queued' (requeue). */
  mirrorStatus?: 'succeeded' | 'failed' | 'queued';
}): Promise<Result<true>> {
  const out = args.ok ? (args.output ?? null) : null;
  // finishJob's wrapper types error as optional string (not nullable). Pass
  // undefined when there's no error so the wrapper's `p.error ?? null`
  // translation to the DB's DEFAULT NULL is preserved.
  const finishRes = await finishJob(supabaseAdmin(), {
    jobId: args.jobId,
    worker: RENDER_WORKER_NAME,
    ok: args.ok,
    output: out ?? undefined,
    error: args.error ?? undefined,
  });
  // ds_finish_job raises 'job not running for this worker' if the row was
  // already closed or the worker mismatched. Don't fail the whole batch
  // for that — but propagate other errors.
  if (!finishRes.ok && !/job not running/i.test(finishRes.error)) {
    return finishRes;
  }

  if (args.renderRowId) {
    const mirrorStatus = args.mirrorStatus ?? (args.ok ? 'succeeded' : 'failed');
    const update: Record<string, unknown> = {
      status: mirrorStatus,
      storage_path: out?.storagePath ?? null,
      width: out?.width ?? null,
      height: out?.height ?? null,
      error: args.error ?? null,
      last_error: args.error ?? null,
      finished_at: mirrorStatus === 'succeeded' || mirrorStatus === 'failed'
        ? new Date().toISOString()
        : null,
      updated_at: new Date().toISOString(),
    };
    if (mirrorStatus === 'queued') update.claimed_at = null;
    await supabaseAdmin()
      .from('design_renders')
      .update(update)
      .eq('id', args.renderRowId);
  }
  return { ok: true, data: true };
}

/**
 * Re-queue a FAILED render job — used by POST /api/v1/renders/:id/retry.
 * Resets the craft_jobs row to 'queued' (status, claimed_by, claimed_at,
 * attempts=0, run_after=now, error=null) so ds_claim_jobs will pick it up
 * again. Also mirrors the reset into the shadow design_renders row.
 *
 * Why a direct UPDATE instead of a new RPC: ds_finish_job only handles the
 * close-of-claim path; there is no ds_requeue_job RPC by design (requeue
 * is the worker's responsibility on failure). The retry endpoint is the
 * user-driven equivalent — a direct service-role UPDATE against an active
 * table is permitted by the S600 policy.
 */
export async function requeueRenderJob(args: {
  jobId: string;
  renderRowId?: string | null;
}): Promise<Result<true>> {
  const reset: Record<string, unknown> = {
    status: 'queued',
    claimed_by: null,
    claimed_at: null,
    heartbeat_at: null,
    attempts: 0,
    run_after: new Date().toISOString(),
    error: null,
    finished_at: null,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabaseAdmin()
    .from('craft_jobs')
    .update(reset)
    .eq('id', args.jobId)
    .eq('kind', RENDER_JOB_KIND);
  if (error) return { ok: false, error: `craft_jobs requeue: ${error.message}` };

  if (args.renderRowId) {
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
      .eq('id', args.renderRowId);
  }
  return { ok: true, data: true };
}

/**
 * Resolve the craft_jobs.id for a render by its idempotency key (the
 * input_hash). Used by /api/v1/renders/:id/retry to find the job to
 * requeue when only the design_renders row is known.
 */
export async function findJobByInputHash(args: {
  inputHash: string;
  kind: 'mockup' | 'print';
  view: string;
  color: string;
}): Promise<string | null> {
  // craft_jobs.idempotency_key = input_hash (one row per hash, per the
  // UNIQUE(tenant_id, idempotency_key) constraint). The kind/view/color
  // filters are a defensive match against input.
  const { data } = await supabaseAdmin()
    .from('craft_jobs')
    .select('id,input')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('kind', RENDER_JOB_KIND)
    .eq('idempotency_key', args.inputHash)
    .limit(5);
  if (!data || data.length === 0) return null;
  for (const row of data) {
    const input = (row.input ?? {}) as Partial<RenderJobInput>;
    if (
      input &&
      input.kind === args.kind &&
      String(input.view ?? '').toUpperCase() === String(args.view).toUpperCase() &&
      String(input.color ?? '').toLowerCase() === String(args.color).toLowerCase()
    ) {
      return String(row.id);
    }
  }
  return data[0]?.id ? String(data[0].id) : null;
}

/**
 * Read-only queue depth counts for the render-worker routes' GET. Combines
 * craft_jobs (the live queue) and design_renders (the legacy surface) so
 * dashboards see a unified view during the migration.
 */
export async function renderQueueCounts(): Promise<{
  craftJobs: Record<string, number>;
  designRenders: Record<string, number>;
}> {
  const craftJobs: Record<string, number> = {
    queued: 0, running: 0, succeeded: 0, failed: 0, cancelled: 0,
  };
  const designRenders: Record<string, number> = {
    queued: 0, running: 0, succeeded: 0, failed: 0, stale: 0,
  };

  const [craftRes, renderRes] = await Promise.all([
    supabaseAdmin()
      .from('craft_jobs')
      .select('status')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .eq('kind', RENDER_JOB_KIND),
    supabaseAdmin()
      .from('design_renders')
      .select('status')
      .eq('tenant_id', DEFAULT_TENANT_ID),
  ]);

  if (craftRes.data) {
    for (const r of craftRes.data) {
      const s = String((r as { status?: unknown }).status ?? '');
      if (s in craftJobs) craftJobs[s]++;
    }
  }
  if (renderRes.data) {
    for (const r of renderRes.data) {
      const s = String((r as { status?: unknown }).status ?? '');
      if (s in designRenders) designRenders[s]++;
    }
  }
  return { craftJobs, designRenders };
}
