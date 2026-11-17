import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/**
 * Sales-tax engine access (pack 5 — Sales Tax).
 *
 * The sanctioned calculation path is the database engine
 * `acct_calculate_tax` (registry action `tax.calculate`): jurisdiction
 * chain → nexus check → customer exemption → taxability rules → rates
 * from acct_tax_codes. App code never re-implements rate math; it
 * resolves the jurisdiction, calls the engine, and carries the
 * engine's numbers onto the document. Posting (acct_post_invoice /
 * the order books engine) re-runs the same engine and writes
 * acct_tax_transactions, so what checkout/invoice quotes is what the
 * subledger records.
 */

type Db = ReturnType<typeof supabaseAdmin>;

export interface TaxEngineLine {
  line_ref?: string;
  amount: number;
  quantity?: number;
  unit_price?: number;
  tax_category?: string;
  tax_code_id?: string;
  taxable?: boolean;
}

export interface TaxEngineRow {
  line_ref: string;
  jurisdiction_id: string | null;
  tax_code_id: string | null;
  rule_id: string | null;
  tax_category: string;
  gross_amount: number;
  taxable_amount: number;
  exempt_amount: number;
  rate: number;
  tax_amount: number;
  reason: string;
}

/** The tenant's default (first active) accounting entity. */
export async function getDefaultEntityId(db: Db): Promise<string | null> {
  const { data } = await db
    .from('acct_entities')
    .select('id')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('is_active', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}

/**
 * Resolve the jurisdiction a document is taxed in:
 * explicit jurisdiction → state-level jurisdiction for a US state
 * code → the tenant's configured default (acct_settings).
 */
export async function resolveTaxJurisdictionId(
  db: Db,
  opts: { jurisdictionId?: string | null; stateCode?: string | null },
): Promise<string | null> {
  if (opts.jurisdictionId) return opts.jurisdictionId;
  const state = (opts.stateCode || '').trim().toUpperCase();
  if (/^[A-Z]{2}$/.test(state)) {
    // A named ship-to state is authoritative: if the tenant has no
    // jurisdiction there, the document has no tax location (the
    // engine returns its exempt rows) — never silently tax it at the
    // default jurisdiction's rate.
    const { data } = await db
      .from('acct_tax_jurisdictions')
      .select('id')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .eq('state_code', state)
      .eq('level', 'state')
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();
    return data?.id ?? null;
  }
  const { data: settings } = await db
    .from('acct_settings')
    .select('default_tax_jurisdiction_id')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .limit(1)
    .maybeSingle();
  return settings?.default_tax_jurisdiction_id ?? null;
}

/** Call the engine. Returns its per-line × per-jurisdiction rows. */
export async function calculateSalesTax(
  db: Db,
  opts: {
    lines: TaxEngineLine[];
    jurisdictionId: string | null;
    customerId?: string | null;
    taxDate?: string;
    direction?: string;
  },
): Promise<{ rows: TaxEngineRow[]; taxTotal: number }> {
  const entityId = await getDefaultEntityId(db);
  const { data, error } = await db.rpc('acct_calculate_tax', {
    p_tenant_id: DEFAULT_TENANT_ID,
    p_entity_id: entityId,
    p_tax_date: opts.taxDate || new Date().toISOString().slice(0, 10),
    p_jurisdiction_id: opts.jurisdictionId,
    p_customer_id: opts.customerId ?? null,
    p_lines: opts.lines.map((l, i) => ({
      line_ref: l.line_ref ?? String(i + 1),
      amount: l.amount,
      quantity: l.quantity ?? 1,
      unit_price: l.unit_price ?? l.amount,
      tax_category: l.tax_category ?? 'general',
      ...(l.tax_code_id ? { tax_code_id: l.tax_code_id } : {}),
      ...(l.taxable !== undefined ? { taxable: l.taxable } : {}),
    })),
    p_direction: opts.direction || 'sale',
  });
  if (error) throw new Error(error.message);
  const rows = (data || []) as TaxEngineRow[];
  const taxTotal = Math.round(rows.reduce((s, r) => s + Number(r.tax_amount || 0), 0) * 100) / 100;
  return { rows, taxTotal };
}

/** Current sales-tax liability by jurisdiction (acct_sales_tax_liability). */
export async function getSalesTaxLiability(db: Db) {
  const entityId = await getDefaultEntityId(db);
  const { data, error } = await db.rpc('acct_sales_tax_liability', {
    p_tenant_id: DEFAULT_TENANT_ID,
    p_entity_id: entityId,
    p_start: '2000-01-01',
    p_end: new Date().toISOString().slice(0, 10),
  });
  if (error) throw new Error(error.message);
  const rows = (data || []) as Array<{
    jurisdiction_id: string;
    jurisdiction: string;
    gross_sales: number;
    taxable_sales: number;
    exempt_sales: number;
    tax_collected: number;
    tax_filed: number;
    tax_open: number;
  }>;
  const totalOpen = Math.round(rows.reduce((s, r) => s + Number(r.tax_open || 0), 0) * 100) / 100;
  return { rows, totalOpen };
}
