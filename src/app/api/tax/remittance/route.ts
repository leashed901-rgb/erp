import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import type { MarketplaceRemittance } from '@/lib/taxTypes';

const err = (code: string, message: string, status: number) =>
  NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });

/** GET /api/tax/remittance — marketplace-collected tax remitted by the
 *  marketplace (excluded from the seller's own liability, doc 11). */
export async function GET() {
  const { data, error } = await supabaseAdmin()
    .from('seller_tax_remittance_filings')
    .select('*')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .order('period_start', { ascending: false })
    .limit(100);
  if (error) return err('INTERNAL', error.message, 500);
  const dtos: MarketplaceRemittance[] = (data || []).map((r) => ({
    id: r.id,
    jurisdiction: r.jurisdiction,
    periodStart: r.period_start,
    periodEnd: r.period_end,
    taxCollected: Number(r.tax_collected) || 0,
    amountRemitted: Number(r.amount_remitted) || 0,
    status: r.status,
    confirmationNumber: r.confirmation_number,
    filedAt: r.filed_at,
  }));
  return NextResponse.json({ data: dtos });
}

/** POST /api/tax/remittance — record a marketplace remittance filing
 *  (Sales Tax/Marketplace remittance page create). Body:
 *  { jurisdiction, periodStart, periodEnd, taxCollected,
 *    amountRemitted, status?, confirmationNumber?, filedAt?, notes? } */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return err('VALIDATION', 'Invalid JSON', 400); }
  if (!body.jurisdiction || !body.periodStart || !body.periodEnd) {
    return err('VALIDATION', 'jurisdiction, periodStart and periodEnd are required', 400);
  }
  const { data, error } = await supabaseAdmin()
    .from('seller_tax_remittance_filings')
    .insert({
      tenant_id: DEFAULT_TENANT_ID,
      jurisdiction: String(body.jurisdiction),
      period_start: String(body.periodStart),
      period_end: String(body.periodEnd),
      tax_collected: Number(body.taxCollected) || 0,
      amount_remitted: Number(body.amountRemitted) || 0,
      status: body.status ? String(body.status) : 'filed',
      confirmation_number: body.confirmationNumber ? String(body.confirmationNumber) : null,
      filed_at: body.filedAt ? String(body.filedAt) : new Date().toISOString().slice(0, 10),
      notes: body.notes ? String(body.notes) : null,
    })
    .select('*')
    .single();
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data }, { status: 201 });
}
