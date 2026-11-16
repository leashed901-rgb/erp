import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { TAX_LINE_MAP } from '@/lib/taxLineMap';

const err = (code: string, message: string, status: number) =>
  NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });

/**
 * PATCH /api/tax/account-mapping — persist a chart-of-accounts tax mapping.
 * Body: { accountId, taxLineLabel } — find-or-creates the acct_tax_lines
 * reference row and sets acct_chart_of_accounts.tax_line_id.
 * { accountId, taxLineLabel: null } clears the mapping.
 * { accountId, flagged?, excluded? } toggles review flags in metadata.
 */
export async function PATCH(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return err('VALIDATION', 'Invalid JSON', 400); }
  const accountId = String(body.accountId || '');
  if (!accountId) return err('VALIDATION', 'accountId is required', 400);
  const sb = supabaseAdmin();

  const { data: acct, error: acctErr } = await sb
    .from('acct_chart_of_accounts')
    .select('id,metadata')
    .eq('id', accountId)
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .single();
  if (acctErr || !acct) return err('NOT_FOUND', 'Account not found', 404);

  const patch: Record<string, unknown> = {};
  const meta = { ...((acct.metadata || {}) as Record<string, unknown>) };

  if ('taxLineLabel' in body) {
    const label = body.taxLineLabel as string | null;
    if (label === null || label === '') {
      patch.tax_line_id = null;
    } else {
      const known = TAX_LINE_MAP[label];
      if (!known) return err('VALIDATION', `Unknown tax line: ${label}`, 400);
      let { data: line } = await sb
        .from('acct_tax_lines')
        .select('id')
        .eq('form', known.form)
        .eq('label', label)
        .limit(1)
        .maybeSingle();
      if (!line) {
        const { data: created, error: createErr } = await sb
          .from('acct_tax_lines')
          .insert({ tenant_id: DEFAULT_TENANT_ID, form: known.form, line: known.line, label, is_active: true })
          .select('id')
          .single();
        if (createErr) return err('INTERNAL', createErr.message, 500);
        line = created;
      }
      patch.tax_line_id = line.id;
    }
  }
  if ('flagged' in body) meta.tax_flagged = Boolean(body.flagged);
  if ('excluded' in body) meta.tax_excluded = Boolean(body.excluded);
  patch.metadata = meta;

  const { data, error } = await sb
    .from('acct_chart_of_accounts')
    .update(patch)
    .eq('id', accountId)
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .select('id,tax_line_id,metadata')
    .single();
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data });
}
