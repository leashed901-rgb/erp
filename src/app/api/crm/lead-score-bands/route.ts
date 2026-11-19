import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/**
 * GET /api/crm/lead-score-bands — the tenant's hot/warm thresholds
 * (crm_lead_score_bands holds ONE row per tenant: score >= hot_min is
 * hot, >= warm_min is warm, below is cold). data is null when the
 * tenant has not set bands yet.
 */
export async function GET() {
  const { data, error } = await supabaseAdmin()
    .from('crm_lead_score_bands')
    .select('*')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .maybeSingle();
  if (error) {
    return NextResponse.json(
      { error: { code: 'INTERNAL', message: error.message, requestId: crypto.randomUUID() } },
      { status: 500 },
    );
  }
  return NextResponse.json({ data });
}

/**
 * PATCH /api/crm/lead-score-bands — set the thresholds (upsert on the
 * tenant singleton). Body: { hot_min, warm_min }.
 */
export async function PATCH(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'Invalid JSON body', requestId: crypto.randomUUID() } },
      { status: 400 },
    );
  }
  const hot = Number(body.hot_min);
  const warm = Number(body.warm_min);
  if (Number.isNaN(hot) || Number.isNaN(warm)) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'hot_min and warm_min are required numbers', requestId: crypto.randomUUID() } },
      { status: 400 },
    );
  }
  if (hot <= warm) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'hot_min must be greater than warm_min', requestId: crypto.randomUUID() } },
      { status: 400 },
    );
  }
  const { data, error } = await supabaseAdmin()
    .from('crm_lead_score_bands')
    .upsert(
      { tenant_id: DEFAULT_TENANT_ID, hot_min: hot, warm_min: warm },
      { onConflict: 'tenant_id' },
    )
    .select('*')
    .single();
  if (error) {
    return NextResponse.json(
      { error: { code: 'INTERNAL', message: error.message, requestId: crypto.randomUUID() } },
      { status: 500 },
    );
  }
  return NextResponse.json({ data });
}
