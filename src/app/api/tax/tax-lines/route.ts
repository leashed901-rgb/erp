import { NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { TAX_LINE_MAP } from '@/lib/taxLineMap';
import type { TaxLineOption } from '@/lib/taxTypes';

/** GET /api/tax/tax-lines — the mapping picker's options (canonical labels,
 *  with DB ids where acct_tax_lines rows already exist). */
export async function GET() {
  const sb = supabaseAdmin();
  const { data: rows } = await sb
    .from('acct_tax_lines')
    .select('id,form,line,label')
    .eq('is_active', true);
  const byLabel = new Map((rows || []).map((r) => [r.label, r]));
  const data: TaxLineOption[] = Object.entries(TAX_LINE_MAP).map(([label, v]) => {
    const row = byLabel.get(label);
    return { id: row?.id || '', form: row?.form || v.form, line: row?.line || v.line, label };
  });
  // Any extra DB rows not in the canonical map are still valid options.
  (rows || []).forEach((r) => {
    if (!TAX_LINE_MAP[r.label]) data.push({ id: r.id, form: r.form, line: r.line, label: r.label });
  });
  return NextResponse.json({ data });
}
