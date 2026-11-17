import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { apiError } from '@/lib/podServer';

/**
 * GET /api/v1/designs/:id/renders — the Design Preview mockup pipeline:
 * the design's render-queue position (design_queue, claimed by a render
 * worker), its recent design_renders rows, and the active
 * product_canvas_templates row for its blank (the print zone), if one
 * exists. No worker is running yet, so rows stay queued until one claims
 * them — the screen says so instead of faking a render.
 * POST { view?, color? } — enqueue a mockup render (design_queue row +
 *   design_renders row, status 'queued').
 * POST { action: 'retry', renderId } — re-queue a failed render.
 * POST { action: 'generate3d' } — queue a turntable render (craft_jobs
 *   kind 'mockup_render').
 */
const RENDERER_VERSION = 'konva-v2.4.1';

async function ownDesign(id: string) {
  const { data } = await supabaseAdmin()
    .from('designs')
    .select('id,supplier_catalog_product_id,canvas_state')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('id', id)
    .single();
  return data as { id: string; supplier_catalog_product_id: string | null; canvas_state: unknown } | null;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const design = await ownDesign(id);
    if (!design) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Design not found.', requestId: crypto.randomUUID() } },
        { status: 404 },
      );
    }
    const [queueRes, rendersRes, templateRes] = await Promise.all([
      supabaseAdmin()
        .from('design_queue')
        .select('id,design_id,position,status,created_at')
        .eq('tenant_id', DEFAULT_TENANT_ID)
        .eq('status', 'queued')
        .order('position', { ascending: true }),
      supabaseAdmin()
        .from('design_renders')
        .select('id,design_id,kind,view_angle,color,input_hash,renderer_version,storage_path,status,attempts,created_at,finished_at,error,last_error')
        .eq('tenant_id', DEFAULT_TENANT_ID)
        .eq('design_id', id)
        .order('created_at', { ascending: false })
        .limit(8),
      design.supplier_catalog_product_id
        ? supabaseAdmin()
            .from('product_canvas_templates')
            .select('id,view_angle,print_zone_x,print_zone_y,print_zone_width,print_zone_height,normalized_x,normalized_y,normalized_width,normalized_height,physical_width_inches,physical_height_inches,renderer_version')
            .eq('canonical_product_id', design.supplier_catalog_product_id)
            .eq('is_active', true)
            .order('created_at', { ascending: false })
            .limit(1)
        : Promise.resolve({ data: [] }),
    ]);
    for (const r of [queueRes, rendersRes]) if (r.error) throw new Error(r.error.message);
    const queued = (queueRes.data ?? []) as Array<Record<string, unknown>>;
    const mine = queued.find((q) => q.design_id === id);
    const queuePosition = mine ? queued.findIndex((q) => q.id === mine.id) + 1 : null;
    return NextResponse.json({
      designId: id,
      queuePosition,
      queue: queued.filter((q) => q.design_id === id),
      renders: rendersRes.data ?? [],
      template: (templateRes.data ?? [])[0] ?? null,
    });
  } catch (err) {
    return apiError(err instanceof Error ? err.message : 'Failed to load renders.');
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const design = await ownDesign(id);
    if (!design) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Design not found.', requestId: crypto.randomUUID() } },
        { status: 404 },
      );
    }
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const action = String(body?.action ?? 'enqueue');

    if (action === 'retry') {
      const renderId = String(body?.renderId ?? '');
      if (!renderId) return apiError('renderId is required.', 400);
      const { data: row } = await supabaseAdmin()
        .from('design_renders')
        .select('id,status,attempts')
        .eq('tenant_id', DEFAULT_TENANT_ID)
        .eq('design_id', id)
        .eq('id', renderId)
        .single();
      if (!row) {
        return NextResponse.json(
          { error: { code: 'NOT_FOUND', message: 'Render not found.', requestId: crypto.randomUUID() } },
          { status: 404 },
        );
      }
      if (row.status !== 'failed') return apiError('Only a failed render can be retried.', 409);
      const { data, error } = await supabaseAdmin()
        .from('design_renders')
        .update({ status: 'queued', attempts: (row.attempts as number) + 1, last_error: null, error: null })
        .eq('tenant_id', DEFAULT_TENANT_ID)
        .eq('id', renderId)
        .select()
        .single();
      if (error) throw new Error(`render retry: ${error.message}`);
      return NextResponse.json(data, { status: 200 });
    }

    if (action === 'generate3d') {
      const { data, error } = await supabaseAdmin()
        .from('craft_jobs')
        .insert({
          tenant_id: DEFAULT_TENANT_ID,
          kind: 'mockup_render',
          app: 'design-studio',
          status: 'queued',
          priority: 5,
          max_attempts: 3,
          subject_type: 'design',
          subject_id: id,
          input: { kind: 'turntable_render', design_id: id, view: String(body?.view ?? 'front') },
          idempotency_key: `turntable:${id}:${Date.now()}`,
        })
        .select()
        .single();
      if (error) throw new Error(`3d render queue: ${error.message}`);
      return NextResponse.json(data, { status: 201 });
    }

    // Default: enqueue a mockup render.
    const view = String(body?.view ?? 'front');
    const color = String(body?.color ?? '');
    const hash = createHash('sha256')
      .update(JSON.stringify({ designId: id, view, color, canvas: design.canvas_state ?? null }))
      .digest('hex')
      .slice(0, 16);
    // One queued slot per design (design_queue_one_queued_uq). A second
    // Re-render while the first is still queued must NOT insert a
    // duplicate — it refreshes the queued render's input hash so the
    // worker renders the current canvas, and returns the existing slot.
    const { data: existingQueue } = await supabaseAdmin()
      .from('design_queue')
      .select('id,position')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .eq('design_id', id)
      .eq('status', 'queued')
      .order('position', { ascending: true })
      .limit(1)
      .single();
    if (existingQueue) {
      const { data: queuedRender } = await supabaseAdmin()
        .from('design_renders')
        .select('*')
        .eq('tenant_id', DEFAULT_TENANT_ID)
        .eq('design_id', id)
        .eq('status', 'queued')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      if (queuedRender) {
        const { data: updated } = await supabaseAdmin()
          .from('design_renders')
          .update({ input_hash: hash, view_angle: view, color: color || null, renderer_version: RENDERER_VERSION })
          .eq('id', queuedRender.id)
          .select()
          .single();
        return NextResponse.json(
          { ...(updated ?? queuedRender), queuePosition: existingQueue.position, alreadyQueued: true },
          { status: 200 },
        );
      }
      return NextResponse.json(
        { queuePosition: existingQueue.position, alreadyQueued: true },
        { status: 200 },
      );
    }
    const { data: maxRow } = await supabaseAdmin()
      .from('design_queue')
      .select('position')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .eq('status', 'queued')
      .order('position', { ascending: false })
      .limit(1)
      .single();
    const position = ((maxRow?.position as number | undefined) ?? 0) + 1;
    const { error: queueErr } = await supabaseAdmin().from('design_queue').insert({
      tenant_id: DEFAULT_TENANT_ID,
      design_id: id,
      supplier_catalog_product_id: design.supplier_catalog_product_id,
      position,
      status: 'queued',
    });
    if (queueErr) throw new Error(`render queue: ${queueErr.message}`);
    const { data, error } = await supabaseAdmin()
      .from('design_renders')
      .insert({
        tenant_id: DEFAULT_TENANT_ID,
        design_id: id,
        kind: 'mockup',
        view_angle: view,
        color: color || null,
        input_hash: hash,
        renderer_version: RENDERER_VERSION,
        status: 'queued',
        attempts: 0,
      })
      .select()
      .single();
    if (error) throw new Error(`render enqueue: ${error.message}`);
    return NextResponse.json({ ...data, queuePosition: position }, { status: 201 });
  } catch (err) {
    return apiError(err instanceof Error ? err.message : 'Failed to queue render.');
  }
}
