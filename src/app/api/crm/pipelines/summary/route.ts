import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/**
 * GET /api/crm/pipelines/summary?pipeline_id=xxx — the pipeline
 * summary report: per-stage rollup from the crm_v_pipeline_summary
 * view (deal counts, amounts, weighted amounts, rotting deals),
 * in pipeline + stage order.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const pipelineId = searchParams.get('pipeline_id');
  let query = supabaseAdmin()
    .from('crm_v_pipeline_summary')
    .select('*')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .order('pipeline', { ascending: true })
    .order('sort_order', { ascending: true });
  if (pipelineId) query = query.eq('pipeline_id', pipelineId);
  const { data, error } = await query;
  if (error) {
    return NextResponse.json(
      { error: { code: 'INTERNAL', message: error.message, requestId: crypto.randomUUID() } },
      { status: 500 },
    );
  }
  return NextResponse.json({ data });
}
