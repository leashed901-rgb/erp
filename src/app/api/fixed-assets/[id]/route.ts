import { NextResponse, NextRequest } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

/**
 * GET /api/fixed-assets/[id] — one asset with its depreciation books
 * and its depreciation lines (through the runs that posted them).
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { data: asset, error } = await supabaseAdmin().from('acct_fixed_assets').select('*').eq('tenant_id', DEFAULT_TENANT_ID).eq('id', id).single();
  if (error || !asset) return err('NOT_FOUND', 'Asset not found', 404);
  const a = asset as Record<string, unknown>;
  const [{ data: books }, { data: runs }] = await Promise.all([
    supabaseAdmin().from('acct_asset_books').select('*').eq('asset_id', id),
    supabaseAdmin().from('acct_asset_depreciation_runs').select('id, run_date, status, journal_id').eq('tenant_id', DEFAULT_TENANT_ID).order('run_date', { ascending: false }),
  ]);
  const bookIds = ((books ?? []) as Record<string, unknown>[]).map((b) => b.id as string);
  const { data: lines } = bookIds.length
    ? await supabaseAdmin().from('acct_asset_depreciation_lines').select('*').in('asset_book_id', bookIds).order('id')
    : { data: [] };
  const runById = new Map(((runs ?? []) as Record<string, unknown>[]).map((r) => [r.id, r]));
  const cost = Number(a.original_cost || 0);
  const accum = Number(a.accumulated_depreciation || 0);
  return NextResponse.json({
    data: {
      id: a.id,
      assetNumber: a.asset_number,
      name: a.name,
      description: a.description,
      status: a.status,
      acquired: a.acquisition_date,
      inService: a.placed_in_service_date,
      cost,
      residual: Number(a.residual_value || 0),
      accumulated: accum,
      netBookValue: cost - accum,
      lifeMonths: a.useful_life_months,
      classId: a.asset_class_id,
      location: a.location,
      serial: a.serial_number,
      disposalDate: a.disposal_date,
      disposalProceeds: a.disposal_proceeds == null ? null : Number(a.disposal_proceeds),
      disposalGainLoss: a.disposal_gain_loss == null ? null : Number(a.disposal_gain_loss),
      acquisitionJournalId: a.acquisition_journal_id,
      disposalJournalId: a.disposal_journal_id,
      books: ((books ?? []) as Record<string, unknown>[]).map((b) => ({
        id: b.id,
        assetId: b.asset_id,
        bookId: b.book_id,
        method: b.depreciation_method,
        convention: b.convention,
        lifeMonths: b.useful_life_months,
        inServiceCost: Number(b.in_service_cost || 0),
        accumulated: Number(b.accumulated_depreciation || 0),
        netBookValue: Number(b.net_book_value || 0),
        startDate: b.depreciation_start_date,
        lastDepreciationDate: b.last_depreciation_date,
      })),
      lines: ((lines ?? []) as Record<string, unknown>[]).map((l) => {
        const run = runById.get(l.run_id as string) as Record<string, unknown> | undefined;
        return {
          id: l.id,
          assetBookId: l.asset_book_id,
          amount: Number(l.depreciation_amount || 0),
          accumulatedAfter: Number(l.accumulated_after || 0),
          nbvAfter: Number(l.nbv_after || 0),
          runDate: run ? run.run_date : null,
          runStatus: run ? run.status : null,
          journalId: run ? run.journal_id : null,
        };
      }),
    },
  });
}
