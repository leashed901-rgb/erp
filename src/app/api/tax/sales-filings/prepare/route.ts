import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

const err = (code: string, message: string, status: number) =>
  NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });

/**
 * POST /api/tax/sales-filings/prepare — registry action
 * create.sales_tax_filing → acct_prepare_sales_tax_filing.
 * Body: { jurisdictionId, periodStart, periodEnd, dueDate?, adjustments? }
 */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return err('VALIDATION', 'Invalid JSON', 400); }
  if (!body.jurisdictionId || !body.periodStart || !body.periodEnd) {
    return err('VALIDATION', 'jurisdictionId, periodStart and periodEnd are required', 400);
  }
  const sb = supabaseAdmin();
  const { data: entity } = await sb.from('acct_entities').select('id').eq('tenant_id', DEFAULT_TENANT_ID).eq('is_active', true).limit(1).maybeSingle();
  const { data, error } = await sb.rpc('acct_prepare_sales_tax_filing', {
    p_tenant_id: DEFAULT_TENANT_ID,
    p_entity_id: entity?.id || null,
    p_jurisdiction_id: String(body.jurisdictionId),
    p_start: String(body.periodStart),
    p_end: String(body.periodEnd),
    p_due_date: body.dueDate ? String(body.dueDate) : null,
    p_adjustments: Number(body.adjustments) || 0,
  });
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data }, { status: 201 });
}
