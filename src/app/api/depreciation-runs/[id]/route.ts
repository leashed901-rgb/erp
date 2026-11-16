import { NextResponse, NextRequest } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

/**
 * GET /api/depreciation-runs/[id] — one run with its lines, each
 * carrying the asset it depreciated (Batch H).
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { data: run, error } = await supabaseAdmin().from('acct_asset_depreciation_runs').select('*').eq('tenant_id', DEFAULT_TENANT_ID).eq('id', id).single();
  if (error || !run) return err('NOT_FOUND', 'Depreciation run not found', 404);
  const r = run as Record<string, unknown>;
  const { data: lines } = await supabaseAdmin().from('acct_asset_depreciation_lines').select('*').eq('run_id', id).order('id');
  const bookIds = [...new Set(((lines ?? []) as Record<string, unknown>[]).map((l) => l.asset_book_id as string))];
  const { data: books } = bookIds.length
    ? await supabaseAdmin().from('acct_asset_books').select('id, asset_id').in('id', bookIds)
    : { data: [] };
  const assetIds = [...new Set(((books ?? []) as Record<string, unknown>[]).map((b) => b.asset_id as string))];
  const { data: assets } = assetIds.length
    ? await supabaseAdmin().from('acct_fixed_assets').select('id, asset_number, name').in('id', assetIds)
    : { data: [] };
  const assetByBook = new Map(((books ?? []) as Record<string, unknown>[]).map((b) => [b.id, b.asset_id]));
  const assetById = new Map(((assets ?? []) as Record<string, unknown>[]).map((a) => [a.id, a]));
  const rows = ((lines ?? []) as Record<string, unknown>[]).map((l) => {
    const a = assetById.get(assetByBook.get(l.asset_book_id as string) as string) as Record<string, unknown> | undefined;
    return {
      id: l.id,
      assetBookId: l.asset_book_id,
      assetName: a ? String(a.name) : '—',
      assetNumber: a ? String(a.asset_number) : '—',
      amount: Number(l.depreciation_amount || 0),
      accumulatedAfter: Number(l.accumulated_after || 0),
      nbvAfter: Number(l.nbv_after || 0),
    };
  });
  return NextResponse.json({
    data: {
      id: r.id,
      periodId: r.period_id,
      runDate: r.run_date,
      status: r.status,
      journalId: r.journal_id,
      postedAt: r.posted_at,
      total: rows.reduce((s, x) => s + x.amount, 0),
      lines: rows,
    },
  });
}
