import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/** GET /api/crm/lead-score-bands — list score bands (hot/warm/cold thresholds). */
export async function GET() {
  const { data, error } = await supabaseAdmin()
    .from('crm_lead_score_bands')
    .select('*')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .order('min_score', { ascending: true });
  if (error) {
    const code = (error as { code?: string }).code;
    if (code === '42P01' || code === 'PGRST205' || code === 'PGRST200') {
      return NextResponse.json({ data: [], schema_pending: true });
    }
    return NextResponse.json({ error: { code: 'INTERNAL', message: error.message, requestId: crypto.randomUUID() } }, { status: 500 });
  }
  return NextResponse.json({ data });
}

/** POST /api/crm/lead-score-bands — create or upsert a band.
 *  Body: { label, min_score, max_score, color? } */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: { code: 'VALIDATION', message: 'Invalid JSON body', requestId: crypto.randomUUID() } }, { status: 400 });
  }
  if (!body.label || body.min_score == null) {
    return NextResponse.json({ error: { code: 'VALIDATION', message: 'label and min_score are required', requestId: crypto.randomUUID() } }, { status: 400 });
  }
  const insert: Record<string, unknown> = {
    tenant_id: DEFAULT_TENANT_ID,
    label: String(body.label),
    min_score: Number(body.min_score),
    max_score: Number(body.max_score) || 100,
  };
  if (body.color) insert.color = String(body.color);
  const { data, error } = await supabaseAdmin()
    .from('crm_lead_score_bands')
    .insert(insert)
    .select('*')
    .single();
  if (error) {
    return NextResponse.json({ error: { code: 'INTERNAL', message: error.message, requestId: crypto.randomUUID() } }, { status: 500 });
  }
  return NextResponse.json({ data }, { status: 201 });
}
