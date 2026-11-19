import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status = 400) {
  return NextResponse.json({ error: { code, message } }, { status });
}

/**
 * POST /api/val/requests — val_open_request RPC: snapshots the cap table,
 * opens the request, seeds val_inputs, and runs the safe-harbor gate check.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const valuationDate = String(body.valuation_date ?? '');
    if (!valuationDate) return err('VALIDATION', 'valuation_date is required.');
    const method = String(body.method ?? 'independent_appraisal');
    if (!['independent_appraisal', 'illiquid_startup', 'formula', 'other'].includes(method)) {
      return err('VALIDATION', 'method must be independent_appraisal, illiquid_startup, formula, or other.');
    }
    const purpose = String(body.purpose ?? 'option_grant_fmv');
    if (!['option_grant_fmv', 'rsa_purchase_price', 'financial_reporting_asc718', 'other'].includes(purpose)) {
      return err('VALIDATION', 'purpose must be option_grant_fmv, rsa_purchase_price, financial_reporting_asc718, or other.');
    }
    const { data, error } = await supabaseAdmin().rpc('val_open_request', {
      p_tenant_id: DEFAULT_TENANT_ID,
      p_valuation_date: valuationDate,
      p_method: method,
      p_entity_id: body.entity_id ?? null,
      p_qualified_individual_id: body.qualified_individual_id ?? null,
      p_provider_name: body.provider_name ?? null,
      p_purpose: purpose,
    });
    if (error) return err('REQUEST_FAILED', error.message);
    const { data: row } = await supabaseAdmin().from('val_requests').select('*').eq('id', data).single();
    return NextResponse.json({ data: row ?? { id: data } }, { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to create 409A valuation request.';
    return err('REQUEST_FAILED', message);
  }
}
