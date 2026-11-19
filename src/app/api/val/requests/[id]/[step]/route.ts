import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { loadValWorkbench, saveAllocation, saveDlom } from '@/lib/valEngine';
import {
  evaluateValuationApproaches,
  runAllocationVariant,
  runDlomCalculation,
} from '@/lib/valuation409aEngine';

function err(code: string, message: string, status = 400) {
  return NextResponse.json({ error: { code, message } }, { status });
}

const APPROACH_METHODS = ['asset', 'dcf', 'market_guideline', 'market_transaction', 'backsolve'];

export async function PUT(req: NextRequest, context: { params: Promise<{ id: string; step: string }> }) {
  try {
    const { id, step } = await context.params;
    const body = await req.json();
    const sb = supabaseAdmin();

    const { data: request, error: reqErr } = await sb.from('val_requests').select('*').eq('id', id).single();
    if (reqErr || !request) return err('NOT_FOUND', 'Valuation request not found.', 404);
    if (String((request as Record<string, unknown>).status) === 'adopted') {
      return err('IMMUTABLE', 'Adopted valuation runs are immutable.');
    }

    if (step === 'inputs') {
      // projected_fcfs is a FinancialPeriod[] ({period, revenue, ebitda,
      // fcf}) — the DCF engine reads .fcf/.revenue per period. A bare
      // number array stores cleanly here but silently yields null EVs
      // three steps later, so reject it at the door.
      if (body.projected_fcfs !== undefined) {
        const ok = Array.isArray(body.projected_fcfs) && body.projected_fcfs.every(
          (p: unknown) => p !== null && typeof p === 'object' && Number.isFinite(Number((p as Record<string, unknown>).fcf)),
        );
        if (!ok) return err('VALIDATION', 'projected_fcfs must be an array of {period, revenue, ebitda, fcf} objects with a numeric fcf per period.');
      }
      // Columns that exist on val_inputs; every other engine field rides in
      // the projections jsonb (documented convention — the table has no DCF
      // columns of its own).
      const { data: existing } = await sb.from('val_inputs').select('*').eq('request_id', id).maybeSingle();
      const existingProj =
        existing && typeof (existing as Record<string, unknown>).projections === 'object'
          ? ((existing as Record<string, unknown>).projections as Record<string, unknown>)
          : {};
      const projectionKeys = [
        'adjusted_book_assets', 'total_liabilities', 'ltm_revenue', 'ntm_revenue', 'ltm_ebitda',
        'projected_fcfs', 'dcf_risk_free_rate', 'dcf_erp', 'dcf_size_premium',
        'dcf_company_specific_risk', 'dcf_terminal_method', 'dcf_terminal_growth',
        'dcf_exit_ev_rev_multiple', 'guideline_size_growth_adj_pct', 'backsolve_class_id',
        'no_cic_90d', 'no_ipo_180d', 'industry_notes',
      ] as const;
      const nextProj: Record<string, unknown> = { ...existingProj };
      for (const k of projectionKeys) if (body[k] !== undefined) nextProj[k] = body[k];
      const row = {
        tenant_id: DEFAULT_TENANT_ID,
        request_id: id,
        cash: body.cash != null ? Number(body.cash) : Number((existing as Record<string, unknown> | null)?.cash ?? 0),
        debt: body.debt != null ? Number(body.debt) : Number((existing as Record<string, unknown> | null)?.debt ?? 0),
        historical_financials: body.historical_financials ?? (existing as Record<string, unknown> | null)?.historical_financials ?? [],
        projections: nextProj,
        projections_assumptions: body.projections_assumptions ?? (existing as Record<string, unknown> | null)?.projections_assumptions ?? null,
        recent_transactions: body.recent_transactions ?? (existing as Record<string, unknown> | null)?.recent_transactions ?? [],
        material_events: body.material_events ?? (existing as Record<string, unknown> | null)?.material_events ?? [],
      };
      const { error: upErr } = await sb.from('val_inputs').upsert(row, { onConflict: 'request_id' });
      if (upErr) return err('INPUTS_FAILED', upErr.message);
      const { data: gate, error: gateErr } = await sb.rpc('val_safe_harbor_check', { p_request_id: id });
      if (gateErr) return err('GATE_FAILED', gateErr.message);
      const eligible = Boolean((gate as Record<string, unknown> | null)?.passes);
      const { error: stErr } = await sb
        .from('val_requests')
        .update({ gate_check: gate, status: eligible ? 'drafting' : 'ineligible' })
        .eq('id', id);
      if (stErr) return err('STATUS_FAILED', stErr.message);
      return NextResponse.json({ data: { request_id: id, gate_check: gate, status: eligible ? 'drafting' : 'ineligible' } });
    }

    if (step === 'comps') {
      const comps = Array.isArray(body.comps) ? body.comps : [];
      const { error: delErr } = await sb.from('val_comps').delete().eq('request_id', id);
      if (delErr) return err('COMPS_FAILED', delErr.message);
      if (comps.length > 0) {
        const rows = comps.map((c: Record<string, unknown>) => ({
          tenant_id: DEFAULT_TENANT_ID,
          request_id: id,
          comp_name: String(c.comp_name ?? c.name ?? ''),
          ticker: c.ticker ? String(c.ticker) : null,
          ev_revenue_multiple: c.ev_revenue_multiple != null ? Number(c.ev_revenue_multiple) : c.ev_rev_multiple != null ? Number(c.ev_rev_multiple) : null,
          ev_ebitda_multiple: c.ev_ebitda_multiple != null ? Number(c.ev_ebitda_multiple) : null,
          volatility: c.volatility != null ? Number(c.volatility) : null,
          beta: c.beta != null ? Number(c.beta) : null,
          source: c.source ? String(c.source) : null,
          as_of: c.as_of ? String(c.as_of) : null,
        }));
        const { error: insErr } = await sb.from('val_comps').insert(rows);
        if (insErr) return err('COMPS_FAILED', insErr.message);
      }
      return NextResponse.json({ data: { request_id: id, comps: comps.length } });
    }

    if (step === 'approaches') {
      const weights = Array.isArray(body.approaches) ? body.approaches : [];
      const activeSum = weights.filter((w: Record<string, unknown>) => !w.rejected).reduce((s: number, w: Record<string, unknown>) => s + Number(w.weight_pct || 0), 0);
      if (Math.abs(activeSum - 100) > 0.5) {
        return err('VALIDATION', `Active valuation approach weights must sum to 100% (currently ${activeSum}%).`);
      }
      for (const w of weights as Record<string, unknown>[]) {
        if (!APPROACH_METHODS.includes(String(w.method))) return err('VALIDATION', `approach method must be one of: ${APPROACH_METHODS.join(', ')}`);
      }
      // The engine always evaluates asset, DCF, market-guideline AND
      // backsolve, giving backsolve a 50% default weight when the caller
      // doesn't mention it — which made stored weights sum to 150% and
      // val_draft_report refuse to draft. Pass all four engine methods
      // explicitly: anything the caller didn't weight is rejected at 0%,
      // so the stored rows always sum to the caller's 100%.
      // market_transaction is validated above but the engine cannot
      // evaluate it — reject it outright instead of silently dropping it.
      if (weights.some((w: Record<string, unknown>) => String(w.method) === 'market_transaction')) {
        return err('VALIDATION', 'market_transaction cannot be evaluated by the valuation engine; use asset, dcf, market_guideline, or backsolve.');
      }
      const ENGINE_METHODS = ['asset', 'dcf', 'market_guideline', 'backsolve'] as const;
      const expanded = ENGINE_METHODS.map((m) => {
        const w = (weights as Record<string, unknown>[]).find((x) => String(x.method) === m);
        return w ?? { method: m, weight_pct: 0, rejected: true, rationale: 'Not relied on.' };
      });
      const ttl = Number(body.time_to_liquidity_yrs ?? 3.5);
      const wb = await loadValWorkbench(id);
      const evalRes = evaluateValuationApproaches({
        requestId: id,
        inputs: wb.inputs,
        comps: wb.comps,
        existingApproaches: expanded.map((w) => ({
          id: '',
          request_id: id,
          method: String(w.method) as never,
          enterprise_value_result: 0,
          weight_pct: Number(w.weight_pct || 0),
          rationale: String(w.rationale ?? ''),
          inputs_jsonb: {},
          rejected: Boolean(w.rejected),
        })),
        classes: wb.classes,
        grants: wb.grants,
        derivedCapTable: wb.derived,
        timeToLiquidityYrs: ttl,
      });
      const { error: delErr } = await sb.from('val_approaches').delete().eq('request_id', id);
      if (delErr) return err('APPROACHES_FAILED', delErr.message);
      const rows = evalRes.approaches.map((a) => ({
        tenant_id: DEFAULT_TENANT_ID,
        request_id: id,
        method: a.method,
        enterprise_value: a.enterprise_value_result,
        equity_value: null,
        weight_pct: a.weight_pct,
        rejected: a.rejected,
        rationale: a.rationale,
        inputs: a.inputs_jsonb ?? {},
      }));
      const { error: insErr } = await sb.from('val_approaches').insert(rows);
      if (insErr) return err('APPROACHES_FAILED', insErr.message);
      const { data: gate } = await sb.rpc('val_safe_harbor_check', { p_request_id: id });
      const eligible = Boolean((gate as Record<string, unknown> | null)?.passes);
      await sb.from('val_requests').update({ status: eligible ? 'drafting' : 'ineligible' }).eq('id', id);
      return NextResponse.json({
        data: {
          request_id: id,
          approaches: evalRes.approaches,
          concluded_ev: evalRes.concluded_ev,
          concluded_equity_value: evalRes.concluded_equity_value,
          median_volatility: evalRes.median_volatility,
          median_beta: evalRes.median_beta,
        },
      });
    }

    return NextResponse.json({ error: { code: 'UNSUPPORTED', message: `Unsupported PUT step: ${step}` } }, { status: 400 });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Valuation step update failed.';
    return err('STEP_FAILED', message);
  }
}

export async function POST(req: NextRequest, context: { params: Promise<{ id: string; step: string }> }) {
  try {
    const { id, step } = await context.params;
    const body = await req.json().catch(() => ({}));
    const sb = supabaseAdmin();

    if (step === 'run-allocation') {
      const wb = await loadValWorkbench(id);
      const ttl = Number(body.time_to_liquidity_yrs ?? 3.5);
      const evalRes = evaluateValuationApproaches({
        requestId: id,
        inputs: wb.inputs,
        comps: wb.comps,
        existingApproaches: wb.approaches,
        classes: wb.classes,
        grants: wb.grants,
        derivedCapTable: wb.derived,
        timeToLiquidityYrs: ttl,
      });
      const alloc = runAllocationVariant({
        requestId: id,
        method: String(body.method ?? 'opm') as never,
        concludedEv: evalRes.concluded_ev,
        equityValue: evalRes.concluded_equity_value,
        classes: wb.classes,
        grants: wb.grants,
        derivedCapTable: wb.derived,
        volatility: Number(body.volatility ?? evalRes.median_volatility),
        timeToLiquidityYrs: ttl,
        riskFreeRate: Number(body.risk_free_rate ?? wb.inputs.dcf_risk_free_rate),
        dividendYield: Number(body.dividend_yield ?? 0),
        pwermScenarios: body.pwerm_scenarios,
      });
      const saved = await saveAllocation(id, alloc);
      return NextResponse.json({ data: saved });
    }

    if (step === 'run-dlom') {
      let wb = await loadValWorkbench(id);
      if (!wb.allocation) {
        // Allocation is a prerequisite — run the OPM default first, then DLOM.
        const evalRes = evaluateValuationApproaches({
          requestId: id,
          inputs: wb.inputs,
          comps: wb.comps,
          existingApproaches: wb.approaches,
          classes: wb.classes,
          grants: wb.grants,
          derivedCapTable: wb.derived,
          timeToLiquidityYrs: 3.5,
        });
        const alloc = runAllocationVariant({
          requestId: id,
          method: 'opm',
          concludedEv: evalRes.concluded_ev,
          equityValue: evalRes.concluded_equity_value,
          classes: wb.classes,
          grants: wb.grants,
          derivedCapTable: wb.derived,
          volatility: evalRes.median_volatility,
          timeToLiquidityYrs: 3.5,
          riskFreeRate: wb.inputs.dcf_risk_free_rate,
          dividendYield: 0,
        });
        await saveAllocation(id, alloc);
        wb = await loadValWorkbench(id);
      }
      const allocRow = wb.allocation as Record<string, unknown>;
      const dlom = runDlomCalculation({
        requestId: id,
        model: String(body.model ?? 'finnerty') as never,
        preDlomCommonPps: Number(allocRow.common_per_share_marketable),
        volatility: Number(allocRow.volatility),
        timeToLiquidityYrs: Number(allocRow.time_to_liquidity_yrs),
        riskFreeRate: Number(allocRow.risk_free_rate),
        dividendYield: Number(allocRow.dividend_yield),
        studyCitation: body.study_citation,
        studyPct: body.study_pct != null ? Number(body.study_pct) : undefined,
        rationale: body.rationale,
      });
      const saved = await saveDlom(id, dlom);
      return NextResponse.json({ data: saved });
    }

    if (step === 'generate-report') {
      const reportDate = String(body.report_date ?? new Date().toISOString().slice(0, 10));
      const { data, error } = await sb.rpc('val_draft_report', {
        p_request_id: id,
        p_report_date: reportDate,
        p_report_document_id: body.report_document_id ?? null,
      });
      if (error) return err('REPORT_FAILED', error.message);
      const { data: row } = await sb.from('val_reports').select('*').eq('id', data).single();
      return NextResponse.json({ data: row ?? { id: data } });
    }

    return NextResponse.json({ error: { code: 'UNSUPPORTED', message: `Unsupported POST step: ${step}` } }, { status: 400 });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Valuation computation step failed.';
    return err('STEP_FAILED', message);
  }
}
