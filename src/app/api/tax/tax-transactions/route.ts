import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import type { TaxTransaction } from '@/lib/taxTypes';

const err = (code: string, message: string, status: number) =>
  NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });

/** GET /api/tax/tax-transactions — per-document-line tax records (doc 11). */
export async function GET(req: NextRequest) {
  const sp = new URL(req.url).searchParams;
  let q = supabaseAdmin()
    .from('acct_tax_transactions')
    .select('*')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .order('tax_date', { ascending: false })
    .limit(200);
  if (sp.get('direction')) q = q.eq('direction', sp.get('direction')!);
  if (sp.get('jurisdictionId')) q = q.eq('jurisdiction_id', sp.get('jurisdictionId')!);
  if (sp.get('from')) q = q.gte('tax_date', sp.get('from')!);
  if (sp.get('to')) q = q.lte('tax_date', sp.get('to')!);
  const { data, error } = await q;
  if (error) return err('INTERNAL', error.message, 500);
  const dtos: TaxTransaction[] = (data || []).map((r) => ({
    id: r.id,
    taxDate: r.tax_date,
    direction: r.direction,
    sourceDocType: r.source_doc_type,
    jurisdictionId: r.jurisdiction_id,
    taxCategory: r.tax_category,
    grossAmount: Number(r.gross_amount) || 0,
    taxableAmount: Number(r.taxable_amount) || 0,
    exemptAmount: Number(r.exempt_amount) || 0,
    rate: (Number(r.rate) || 0) * 100, // stored as a fraction; UI displays %
    taxAmount: Number(r.tax_amount) || 0,
    filingId: r.filing_id,
  }));
  return NextResponse.json({ data: dtos });
}
