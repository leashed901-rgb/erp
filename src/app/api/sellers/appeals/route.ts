import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/**
 * GET /api/sellers/appeals — every appeal, newest first, with the linked
 * violation's type/severity/status joined in JS (small tables — a map lookup
 * beats a nested Supabase select and keeps the row shape flat for the UI).
 */
export async function GET() {
  const sb = supabaseAdmin();

  const [appealsRes, violationsRes] = await Promise.all([
    sb.from('seller_appeals')
      .select('*')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .order('created_at', { ascending: false }),
    sb.from('seller_violations')
      .select('id, violation_type, severity, status')
      .eq('tenant_id', DEFAULT_TENANT_ID),
  ]);

  if (appealsRes.error) {
    return NextResponse.json({ error: { code: 'INTERNAL', message: appealsRes.error.message, requestId: crypto.randomUUID() } }, { status: 500 });
  }
  if (violationsRes.error) {
    return NextResponse.json({ error: { code: 'INTERNAL', message: violationsRes.error.message, requestId: crypto.randomUUID() } }, { status: 500 });
  }

  const violationById = new Map((violationsRes.data || []).map(v => [v.id, v]));
  const data = (appealsRes.data || []).map(a => {
    const v = violationById.get(a.violation_id);
    return {
      ...a,
      violation_type: v?.violation_type ?? null,
      violation_severity: v?.severity ?? null,
      violation_status: v?.status ?? null,
    };
  });

  return NextResponse.json({ data });
}

/**
 * POST /api/sellers/appeals — a seller files an appeal against a
 * violation. This POST did not exist (GET-only route), so the appeal
 * path dead-ended at 405 even though the decision PATCH was built.
 * Body: { violation_id, seller_id?, appeal_text (or reason),
 *   evidence_urls?, appeal_type? } — new appeals start 'pending'.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: { code: 'VALIDATION', message: 'JSON body required', requestId: crypto.randomUUID() } }, { status: 400 });
  }
  const violationId = typeof body.violation_id === 'string' ? body.violation_id : null;
  if (!violationId) {
    return NextResponse.json({ error: { code: 'VALIDATION', message: 'violation_id is required', requestId: crypto.randomUUID() } }, { status: 400 });
  }
  const sb = supabaseAdmin();
  const { data: violation } = await sb
    .from('seller_violations')
    .select('id, seller_id')
    .eq('id', violationId)
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .maybeSingle();
  if (!violation) {
    return NextResponse.json({ error: { code: 'NOT_FOUND', message: `No violation with id ${violationId}`, requestId: crypto.randomUUID() } }, { status: 404 });
  }
  const appealText = typeof body.appeal_text === 'string' ? body.appeal_text : typeof body.reason === 'string' ? body.reason : null;
  const { data, error } = await sb
    .from('seller_appeals')
    .insert({
      tenant_id: DEFAULT_TENANT_ID,
      violation_id: violationId,
      seller_id: typeof body.seller_id === 'string' ? body.seller_id : (violation.seller_id as string | null),
      status: 'pending',
      appeal_text: appealText,
      evidence_urls: Array.isArray(body.evidence_urls) ? body.evidence_urls : null,
      appeal_type: typeof body.appeal_type === 'string' ? body.appeal_type : null,
    })
    .select('*')
    .single();
  if (error) {
    return NextResponse.json({ error: { code: 'INTERNAL', message: error.message, requestId: crypto.randomUUID() } }, { status: 500 });
  }
  return NextResponse.json({ data }, { status: 201 });
}
