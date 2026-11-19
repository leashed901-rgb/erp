import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { calculateSalesTax, resolveTaxJurisdictionId, type TaxEngineLine } from '@/lib/taxEngine';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

/**
 * POST /api/v1/tax/calculate — registry action `tax.calculate`.
 *
 * Runs the sales-tax engine `acct_calculate_tax` (pack 5): jurisdiction
 * chain, nexus, customer exemptions, taxability rules and rates all
 * come from the engine — this route does no rate math of its own.
 *
 * Body: {
 *   lines: [{ amount, quantity?, unit_price?, tax_category?, tax_code_id?, taxable?, line_ref? }],
 *   jurisdiction_id?,        — explicit jurisdiction
 *   ship_to_state?,          — or a US state code to resolve it from
 *   customer_id?,            — for exemption-certificate checks
 *   tax_date?, direction?    — defaults: today, 'sale'
 * }
 *
 * Returns: { lines: [per-line rollup], detail: [engine rows per
 * jurisdiction], subtotal, tax_total, total, jurisdiction_id,
 * is_tax_exempt }
 *
 * No jurisdiction_id and no ship_to_state: a line that carries a
 * tax_code_id resolves the code's jurisdiction first, so a code-only
 * call still prices through the engine; otherwise the engine returns
 * one zero row per line with reason 'No tax location on document'.
 */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return err('VALIDATION', 'Invalid JSON', 400); }

  const lines = body.lines as TaxEngineLine[] | undefined;
  if (!lines || !Array.isArray(lines) || lines.length === 0) {
    return err('VALIDATION', 'lines array is required', 400);
  }

  const db = supabaseAdmin();
  try {
    // No explicit jurisdiction and no ship-to state: resolve the first
    // line's tax code's jurisdiction, so a code-only call still prices
    // through the engine instead of returning 'No tax location'.
    let codeJurisdictionId: string | null = null;
    if (!body.jurisdiction_id && !body.ship_to_state) {
      const firstCode = lines.map((l) => l.tax_code_id).find(Boolean);
      if (firstCode) {
        const { data: code } = await db.from('acct_tax_codes')
          .select('jurisdiction_id').eq('id', String(firstCode)).maybeSingle();
        codeJurisdictionId = code?.jurisdiction_id ?? null;
      }
    }
    const jurisdictionId = body.jurisdiction_id || body.ship_to_state || codeJurisdictionId
      ? await resolveTaxJurisdictionId(db, {
          jurisdictionId: body.jurisdiction_id ? String(body.jurisdiction_id) : codeJurisdictionId,
          stateCode: body.ship_to_state ? String(body.ship_to_state) : null,
        })
      // No jurisdiction, no ship-to state, no code: do NOT fall back to
      // the tenant's default jurisdiction (resolveTaxJurisdictionId
      // would) — the engine returns 'No tax location on document' and
      // $0, which is this route's documented contract. A silent default
      // would tax a location-less preview at the home rate.
      : null;
    const { rows, taxTotal } = await calculateSalesTax(db, {
      lines,
      jurisdictionId,
      customerId: body.customer_id ? String(body.customer_id) : null,
      taxDate: body.tax_date ? String(body.tax_date) : undefined,
      direction: body.direction ? String(body.direction) : undefined,
    });

    // Per-line rollup across the jurisdiction chain.
    // Code names for the display tax_code per line (module 5): the
    // priced row's code name, 'Standard' when the engine priced at a
    // rate with no code, 'None' when nothing priced.
    const codeIds = [...new Set(rows.map((r) => r.tax_code_id).filter(Boolean))];
    const codeNames: Record<string, string> = {};
    if (codeIds.length) {
      const { data: codes } = await db.from('acct_tax_codes').select('id, name').in('id', codeIds);
      for (const c of codes || []) codeNames[c.id] = c.name;
    }
    const byRef = new Map<string, { line_ref: string; amount: number; taxable_amount: number; exempt_amount: number; tax_amount: number; rate: number; reason: string; tax_code_id: string | null }>();
    for (const r of rows) {
      const cur = byRef.get(r.line_ref) || { line_ref: r.line_ref, amount: 0, taxable_amount: 0, exempt_amount: 0, tax_amount: 0, rate: 0, reason: r.reason, tax_code_id: null };
      cur.amount += Number(r.gross_amount || 0);
      cur.taxable_amount += Number(r.taxable_amount || 0);
      cur.exempt_amount += Number(r.exempt_amount || 0);
      cur.tax_amount += Number(r.tax_amount || 0);
      if (r.tax_code_id && (Number(r.tax_amount) > 0 || !cur.tax_code_id)) cur.tax_code_id = r.tax_code_id;
      if (r.reason && r.reason !== 'Standard rate') cur.reason = r.reason;
      byRef.set(r.line_ref, cur);
    }
    const lineRollup = [...byRef.values()].map((l) => ({
      ...l,
      tax_amount: Math.round(l.tax_amount * 100) / 100,
      rate: l.amount > 0 ? Math.round((l.tax_amount / l.amount) * 10000) / 10000 : 0,
      tax_code: (l.tax_code_id ? codeNames[l.tax_code_id] : null)
        || (l.tax_amount > 0 ? 'Standard' : 'None'),
    }));

    const subtotal = Math.round(lines.reduce((s, l) => s + (Number(l.amount) || 0), 0) * 100) / 100;
    return NextResponse.json({
      data: {
        lines: lineRollup,
        detail: rows,
        subtotal,
        tax_total: taxTotal,
        total: Math.round((subtotal + taxTotal) * 100) / 100,
        jurisdiction_id: jurisdictionId,
        is_tax_exempt: rows.some((r) => r.reason === 'Customer exemption certificate'),
      },
    });
  } catch (e) {
    return err('INTERNAL', e instanceof Error ? e.message : 'Tax calculation failed', 500);
  }
}
