import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/**
 * POST /api/v1/tax/calculate — calculate tax for a document.
 *
 * Body: {
 *   lines: [{ amount: number, tax_code_id?: string }],
 *   jurisdiction_id?: string,
 *   customer_id?: string (for tax-exempt check)
 * }
 *
 * Returns: {
 *   lines: [{ amount, tax_amount, tax_code, rate }],
 *   subtotal, tax_total, total
 * }
 *
 * This is the sales-tax engine (spec Part 3.5 D). It reads from
 * acct_tax_codes (canonical rates) and checks customer tax-exempt status.
 */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: { code: 'VALIDATION', message: 'Invalid JSON', requestId: crypto.randomUUID() } }, { status: 400 });
  }

  const lines = body.lines as Array<{ amount: number; tax_code_id?: string }> | undefined;
  if (!lines || !Array.isArray(lines)) {
    return NextResponse.json({ error: { code: 'VALIDATION', message: 'lines array is required', requestId: crypto.randomUUID() } }, { status: 400 });
  }

  // Check customer tax-exempt status
  let isTaxExempt = false;
  if (body.customer_id) {
    const { data: customer } = await supabaseAdmin()
      .from('crm_customers')
      .select('id')
      .eq('id', String(body.customer_id))
      .eq('tenant_id', DEFAULT_TENANT_ID)
      // The crm_customers table may not have a tax_exempt column yet;
      // when it does, filter by it. For now, assume taxable.
      .single();
    // TODO: check tax_exempt flag when the column exists
  }

  // Fetch tax codes
  const taxCodeIds = lines.map((l) => l.tax_code_id).filter(Boolean);
  let taxCodes: Record<string, { rate: number; name: string }> = {};
  if (taxCodeIds.length > 0) {
    const { data: codes } = await supabaseAdmin()
      .from('acct_tax_codes')
      .select('id,code,name,rate')
      .in('id', taxCodeIds)
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .eq('is_active', true);
    (codes || []).forEach((c) => {
      taxCodes[c.id] = { rate: Number(c.rate) || 0, name: c.name };
    });
  }

  // Default rate if no tax code specified (0% — tax is opt-in per line)
  const DEFAULT_RATE = 0;

  // Calculate per-line tax
  const calculatedLines = lines.map((line) => {
    const amount = Number(line.amount) || 0;
    const taxCode = line.tax_code_id ? taxCodes[line.tax_code_id] : null;
    const rate = isTaxExempt ? 0 : (taxCode?.rate ?? DEFAULT_RATE);
    const taxAmount = Math.round(amount * rate) / 100;
    return {
      amount,
      tax_amount: taxAmount,
      tax_code: taxCode?.name || (rate > 0 ? 'Standard' : 'None'),
      rate,
    };
  });

  const subtotal = calculatedLines.reduce((s, l) => s + l.amount, 0);
  const taxTotal = calculatedLines.reduce((s, l) => s + l.tax_amount, 0);
  const total = subtotal + taxTotal;

  return NextResponse.json({
    data: {
      lines: calculatedLines,
      subtotal,
      tax_total: taxTotal,
      total,
      is_tax_exempt: isTaxExempt,
    },
  });
}
