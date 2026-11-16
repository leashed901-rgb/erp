import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import type {
  CapGrant,
  CapSecurityClass,
  DerivedCapTableResult,
  ValAllocation,
  ValApproach,
  ValComp,
  ValDlom,
  ValInputs,
} from '@/lib/equityTypes';

const num = (v: unknown, fallback = 0): number => {
  const n = typeof v === 'number' ? v : Number(v ?? fallback);
  return Number.isFinite(n) ? n : fallback;
};

type Row = Record<string, unknown>;

function asObj(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

/**
 * Loads a 409A request's workbench from the live val_* and cap_* tables and adapts
 * it to the pure valuation engines' input shapes. The engines are math, not
 * data — they run on whatever the database holds.
 */
export async function loadValWorkbench(requestId: string) {
  const sb = supabaseAdmin();
  const tenant = DEFAULT_TENANT_ID;

  const { data: req, error: reqErr } = await sb.from('val_requests').select('*').eq('id', requestId).single();
  if (reqErr || !req) throw new Error('Valuation request not found.');

  const [
    inputsRes,
    compsRes,
    approachesRes,
    classesRes,
    grantsRes,
    poolsRes,
    convertiblesRes,
    stakeholdersRes,
    tableRes,
    allocationRes,
    dlomRes,
  ] = await Promise.all([
    sb.from('val_inputs').select('*').eq('request_id', requestId).maybeSingle(),
    sb.from('val_comps').select('*').eq('request_id', requestId).order('comp_name'),
    sb.from('val_approaches').select('*').eq('request_id', requestId).order('method'),
    sb.from('cap_share_classes').select('*').eq('tenant_id', tenant).order('seniority'),
    sb.from('cap_option_grants').select('*').eq('tenant_id', tenant).order('granted_on'),
    sb.from('cap_option_pools').select('*').eq('tenant_id', tenant).order('created_at'),
    sb.from('cap_convertibles').select('*').eq('tenant_id', tenant).eq('status', 'outstanding'),
    sb.from('cap_stakeholders').select('id,name,stakeholder_type').eq('tenant_id', tenant),
    sb.rpc('cap_table', { p_tenant_id: tenant, p_as_of: String((req as Row).valuation_date) }),
    sb.from('val_allocations').select('*').eq('request_id', requestId).maybeSingle(),
    sb.from('val_dlom').select('*').eq('request_id', requestId).maybeSingle(),
  ]);
  for (const [name, res] of [
    ['val_inputs', inputsRes],
    ['val_comps', compsRes],
    ['val_approaches', approachesRes],
    ['cap_share_classes', classesRes],
    ['cap_option_grants', grantsRes],
    ['cap_option_pools', poolsRes],
    ['cap_convertibles', convertiblesRes],
    ['cap_stakeholders', stakeholdersRes],
    ['cap_table', tableRes],
    ['val_allocations', allocationRes],
    ['val_dlom', dlomRes],
  ] as const) {
    const err = (res as { error?: { message: string } | null }).error;
    if (err) throw new Error(`${name}: ${err.message}`);
  }

  const inputRow = (inputsRes.data ?? {}) as Row;
  const proj = asObj(inputRow.projections);
  const inputs: ValInputs = {
    request_id: requestId,
    cash: num(inputRow.cash),
    debt: num(inputRow.debt),
    adjusted_book_assets: num(proj.adjusted_book_assets),
    total_liabilities: num(proj.total_liabilities),
    ltm_revenue: num(proj.ltm_revenue),
    ntm_revenue: num(proj.ntm_revenue),
    ltm_ebitda: num(proj.ltm_ebitda),
    historical_financials: Array.isArray(inputRow.historical_financials) ? (inputRow.historical_financials as ValInputs['historical_financials']) : [],
    projected_fcfs: Array.isArray(proj.projected_fcfs) ? (proj.projected_fcfs as ValInputs['projected_fcfs']) : [],
    dcf_risk_free_rate: num(proj.dcf_risk_free_rate, 0.043),
    dcf_erp: num(proj.dcf_erp, 0.055),
    dcf_size_premium: num(proj.dcf_size_premium, 0),
    dcf_company_specific_risk: num(proj.dcf_company_specific_risk, 0),
    dcf_terminal_method: proj.dcf_terminal_method === 'exit_multiple' ? 'exit_multiple' : 'gordon_growth',
    dcf_terminal_growth: num(proj.dcf_terminal_growth, 0.035),
    dcf_exit_ev_rev_multiple: num(proj.dcf_exit_ev_rev_multiple, 4.2),
    guideline_size_growth_adj_pct: num(proj.guideline_size_growth_adj_pct, 0),
    backsolve_class_id: (proj.backsolve_class_id as string | null) ?? null,
    no_cic_90d: proj.no_cic_90d !== undefined ? Boolean(proj.no_cic_90d) : true,
    no_ipo_180d: proj.no_ipo_180d !== undefined ? Boolean(proj.no_ipo_180d) : true,
    industry_notes: String(proj.industry_notes ?? inputRow.projections_assumptions ?? ''),
  };

  const comps: ValComp[] = ((compsRes.data ?? []) as Row[]).map((c) => ({
    id: String(c.id),
    request_id: requestId,
    ticker: String(c.ticker ?? ''),
    name: String(c.comp_name ?? ''),
    ev_rev_multiple: num(c.ev_revenue_multiple),
    ev_ebitda_multiple: c.ev_ebitda_multiple == null ? null : num(c.ev_ebitda_multiple),
    volatility: num(c.volatility, 0.65),
    beta: num(c.beta, 1.35),
    source: String(c.source ?? ''),
    as_of: String(c.as_of ?? ''),
  }));

  const approaches: ValApproach[] = ((approachesRes.data ?? []) as Row[]).map((a) => ({
    id: String(a.id),
    request_id: requestId,
    method: String(a.method) as ValApproach['method'],
    enterprise_value_result: num(a.enterprise_value ?? a.equity_value),
    weight_pct: num(a.weight_pct),
    rationale: String(a.rationale ?? ''),
    inputs_jsonb: asObj(a.inputs),
    rejected: Boolean(a.rejected),
  }));

  const classes: CapSecurityClass[] = ((classesRes.data ?? []) as Row[]).map((c) => ({
    id: String(c.id),
    company_id: String(c.entity_id ?? ''),
    name: String(c.name),
    class_type: String(c.class_type) as 'common' | 'preferred',
    authorized_shares: num(c.authorized_shares),
    seniority_rank: num(c.seniority),
    liquidation_preference_multiple: num(c.liquidation_multiple, 1),
    par_value: num(c.par_value, 0.0001),
    conversion_ratio: num(c.conversion_ratio, 1),
    participating: Boolean(c.participating),
    participation_cap_multiple: c.participation_cap_multiple == null ? null : num(c.participation_cap_multiple),
    dividend_rate: num(c.dividend_rate),
    voting_rights: num(c.votes_per_share) > 0,
    price_per_share_original: num(c.original_issue_price, 0.0001),
    has_put_call_redemption: Boolean(c.has_put_or_call),
  }));

  const grants: CapGrant[] = ((grantsRes.data ?? []) as Row[]).map((g) => ({
    id: String(g.id),
    security_id: '',
    stakeholder_id: String(g.stakeholder_id),
    plan_id: String(g.pool_id),
    grant_date: String(g.granted_on),
    quantity: num(g.shares),
    exercise_price: num(g.exercise_price),
    fmv_at_grant: 0,
    val_report_id: String(g.val_report_id ?? ''),
    snapshot_id: '',
    vesting_schedule_id: String(g.vesting_schedule_id ?? ''),
    expiry_date: String(g.expires_on ?? ''),
    iso_nso: String(g.grant_type ?? 'iso').toUpperCase() as CapGrant['iso_nso'],
    early_exercise: Boolean(g.early_exercise),
    due_date_83b: null,
    filed_at_83b: null,
  }));

  const holderName = new Map(((stakeholdersRes.data ?? []) as Row[]).map((s) => [String(s.id), String(s.name)]));
  const holderType = new Map(((stakeholdersRes.data ?? []) as Row[]).map((s) => [String(s.id), String(s.stakeholder_type ?? 'other')]));
  const tableRows = (tableRes.data ?? []) as Row[];
  const classById = new Map(classes.map((c) => [c.id, c]));

  const totalBasic = tableRows.reduce((s, r) => s + num(r.issued_shares), 0);
  const totalOptions = tableRows.reduce((s, r) => s + num(r.options_outstanding), 0);
  const totalFd = tableRows.reduce((s, r) => s + num(r.fully_diluted), 0);
  const pools = (poolsRes.data ?? []) as Row[];
  const poolAvailable = pools.reduce((s, p) => {
    const granted = ((grantsRes.data ?? []) as Row[])
      .filter((g) => String(g.pool_id) === String(p.id))
      .reduce((t, g) => t + num(g.shares) - num(g.cancelled_shares), 0);
    return s + Math.max(0, num(p.authorized_shares) - granted);
  }, 0);

  const derived: DerivedCapTableResult = {
    as_of_date: String((req as Row).valuation_date),
    denominator_method: 'allocated_plus_pool',
    total_basic_shares: totalBasic,
    total_options_outstanding: totalOptions,
    total_warrants: 0,
    total_pool_available: poolAvailable,
    total_fd_shares: totalFd,
    rows: tableRows
      .filter((r) => r.stakeholder_id)
      .map((r) => ({
        stakeholder_id: String(r.stakeholder_id),
        stakeholder_name: String(r.holder_name),
        stakeholder_type: (holderType.get(String(r.stakeholder_id)) ?? 'other') as DerivedCapTableResult['rows'][number]['stakeholder_type'],
        class_id: String(classes.find((c) => c.name === String(r.share_class))?.id ?? ''),
        class_name: String(r.share_class),
        issued_shares: num(r.issued_shares),
        as_converted_common: num(r.issued_shares),
        options_granted: num(r.options_outstanding),
        options_vested: num(r.options_vested),
        options_unvested: Math.max(0, num(r.options_outstanding) - num(r.options_vested)),
        warrants: 0,
        total_fd_shares: num(r.fully_diluted),
        basic_pct: num(r.pct_outstanding),
        fd_pct: num(r.pct_fully_diluted),
        invested_capital: 0,
      })),
    class_summaries: classes.map((c) => {
      const rowsFor = tableRows.filter((r) => String(r.share_class) === c.name);
      const issued = rowsFor.reduce((s, r) => s + num(r.issued_shares), 0);
      const opts = rowsFor.reduce((s, r) => s + num(r.options_outstanding), 0);
      const poolUnalloc = tableRows
        .filter((r) => String(r.holder_kind) === 'unallocated_pool' && String(r.share_class) === c.name)
        .reduce((s, r) => s + num(r.fully_diluted), 0);
      return {
        class_id: c.id,
        class_name: c.name,
        class_type: c.class_type,
        seniority_rank: c.seniority_rank,
        authorized_shares: c.authorized_shares,
        issued_shares: issued,
        as_converted_shares: issued,
        fd_shares: issued + opts + poolUnalloc,
        liquidation_preference_total: issued * num(c.liquidation_preference_multiple) * num(c.price_per_share_original),
        basic_pct: totalBasic > 0 ? (issued / totalBasic) * 100 : 0,
        fd_pct: totalFd > 0 ? ((issued + opts + poolUnalloc) / totalFd) * 100 : 0,
      };
    }),
    convertibles: ((convertiblesRes.data ?? []) as Row[]).map((c) => ({
      security_id: String(c.id),
      certificate_code: String(c.id).slice(0, 8),
      stakeholder_name: holderName.get(String(c.stakeholder_id)) ?? '',
      kind: String(c.instrument) === 'convertible_note' ? 'convertible_note' : 'safe',
      issue_date: String(c.issued_on),
      principal_amount: num(c.principal),
      valuation_cap: c.valuation_cap == null ? null : num(c.valuation_cap),
      discount_pct: c.discount_rate == null ? null : num(c.discount_rate) * 100,
      interest_rate: c.interest_rate == null ? null : num(c.interest_rate),
    })),
    plans: pools.map((p) => {
      const granted = ((grantsRes.data ?? []) as Row[])
        .filter((g) => String(g.pool_id) === String(p.id))
        .reduce((t, g) => t + num(g.shares) - num(g.cancelled_shares), 0);
      const exercised = ((grantsRes.data ?? []) as Row[])
        .filter((g) => String(g.pool_id) === String(p.id))
        .reduce((t, g) => t + num(g.exercised_shares), 0);
      return {
        plan_id: String(p.id),
        plan_name: String(p.name),
        total_reserved: num(p.authorized_shares),
        active_options_outstanding: granted,
        exercised_from_plan: exercised,
        shares_available: Math.max(0, num(p.authorized_shares) - granted),
      };
    }),
  };

  return {
    request: req as Row,
    inputs,
    comps,
    approaches,
    classes,
    grants,
    derived,
    allocation: (allocationRes.data ?? null) as Row | null,
    dlom: (dlomRes.data ?? null) as Row | null,
    classById,
  };
}

export async function saveAllocation(requestId: string, alloc: ValAllocation) {
  const sb = supabaseAdmin();
  const row = {
    tenant_id: DEFAULT_TENANT_ID,
    request_id: requestId,
    method: alloc.method,
    breakpoints: alloc.breakpoints ?? [],
    scenarios: alloc.pwerm_scenarios ?? [],
    volatility: alloc.volatility,
    time_to_liquidity_yrs: alloc.time_to_liquidity_yrs,
    risk_free_rate: alloc.risk_free_rate,
    dividend_yield: alloc.dividend_yield,
    equity_value_in: alloc.equity_value_in,
    per_class_value: alloc.per_class_value ?? [],
    // Marketable per-share common = pre-DLOM per-share; DLOM is applied after.
    common_per_share_marketable: alloc.common_per_share_pre_dlom,
  };
  const { data, error } = await sb
    .from('val_allocations')
    .upsert(row, { onConflict: 'request_id' })
    .select()
    .single();
  if (error) throw new Error(`val_allocations: ${error.message}`);
  return data;
}

export async function saveDlom(requestId: string, dlom: ValDlom) {
  const sb = supabaseAdmin();
  const pct = num((dlom as unknown as Record<string, unknown>).dlom_pct, num(dlom.inputs_jsonb?.finnerty_dlom_pct));
  const row = {
    tenant_id: DEFAULT_TENANT_ID,
    request_id: requestId,
    model: dlom.model,
    dlom_pct: pct,
    inputs: dlom.inputs_jsonb ?? {},
    rationale: (dlom as unknown as Record<string, unknown>).rationale ?? null,
  };
  const { data, error } = await sb.from('val_dlom').upsert(row, { onConflict: 'request_id' }).select().single();
  if (error) throw new Error(`val_dlom: ${error.message}`);
  return data;
}
