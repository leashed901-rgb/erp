import { NextResponse, NextRequest } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

/**
 * GET /api/fx-revaluation-runs — FX revaluation runs (Batch I).
 * POST — run the revaluation: creates a draft run row, calls the
 * engine (acct_fx_revalue revalues open foreign-currency AR/AP,
 * posts the gain/loss journal and schedules its next-day reversal),
 * then records the run as posted with the journal id and net gain.
 * The engine does NOT write the run row itself — this route does.
 */
export async function GET() {
  const { data, error } = await supabaseAdmin().from('acct_fx_revaluation_runs').select('*').eq('tenant_id', DEFAULT_TENANT_ID).order('revaluation_date', { ascending: false }).limit(200);
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({
    data: ((data ?? []) as Record<string, unknown>[]).map((r) => ({
      id: r.id,
      bookId: r.book_id,
      periodId: r.period_id,
      revaluationDate: r.revaluation_date,
      status: r.status,
      journalId: r.journal_id,
    })),
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const asOf = String(body.asOf || '').slice(0, 10) || new Date().toISOString().slice(0, 10);
  // book_id and period_id are NOT NULL on the run row: resolve the
  // caller's values, else the first book and the period holding asOf
  // (else the latest period).
  let bookId = body.bookId ? String(body.bookId) : null;
  let periodId = body.periodId ? String(body.periodId) : null;
  const sb = supabaseAdmin();
  if (!bookId) {
    const { data: book } = await sb.from('acct_books').select('id').eq('tenant_id', DEFAULT_TENANT_ID).order('name').limit(1).single();
    bookId = (book as { id: string } | null)?.id || null;
  }
  if (!periodId) {
    const { data: period } = await sb.from('acct_periods').select('id').eq('tenant_id', DEFAULT_TENANT_ID).lte('start_date', asOf).gte('end_date', asOf).limit(1).single();
    if (period) periodId = (period as { id: string }).id;
    else {
      const { data: latest } = await sb.from('acct_periods').select('id').eq('tenant_id', DEFAULT_TENANT_ID).order('start_date', { ascending: false }).limit(1).single();
      periodId = (latest as { id: string } | null)?.id || null;
    }
  }
  if (!bookId) return err('VALIDATION', 'No book exists for this tenant', 400);
  if (!periodId) return err('VALIDATION', 'No period exists for this tenant', 400);
  if (body.bookId) {
    const { data: book } = await sb.from('acct_books').select('id').eq('tenant_id', DEFAULT_TENANT_ID).eq('id', bookId).single();
    if (!book) return err('VALIDATION', 'Unknown book', 400);
  }
  if (body.periodId) {
    const { data: period } = await sb.from('acct_periods').select('id').eq('id', periodId).single();
    if (!period) return err('VALIDATION', 'Unknown period', 400);
  }
  const { data: run, error: runErr } = await sb.from('acct_fx_revaluation_runs').insert({
    tenant_id: DEFAULT_TENANT_ID,
    book_id: bookId,
    period_id: periodId,
    revaluation_date: asOf,
    status: 'draft',
  }).select().single();
  if (runErr) return err('INTERNAL', runErr.message, 500);
  const { data: result, error: rpcErr } = await sb.rpc('acct_fx_revalue', { p_tenant_id: DEFAULT_TENANT_ID, p_as_of: asOf });
  if (rpcErr) {
    await sb.from('acct_fx_revaluation_runs').update({ status: 'void' }).eq('tenant_id', DEFAULT_TENANT_ID).eq('id', run.id);
    return err('INTERNAL', rpcErr.message, 500);
  }
  const res = (result || {}) as Record<string, unknown>;
  const { data: updated } = await sb.from('acct_fx_revaluation_runs').update({
    status: 'posted',
    journal_id: (res.journal_id as string) || null,
  }).eq('tenant_id', DEFAULT_TENANT_ID).eq('id', run.id).select().single();
  return NextResponse.json({
    data: {
      id: updated?.id || run.id,
      revaluationDate: asOf,
      status: 'posted',
      journalId: (res.journal_id as string) || null,
      documents: Number(res.documents || 0),
      netGain: res.net_gain == null ? null : Number(res.net_gain),
      reversalId: (res.reversal_id as string) || null,
    },
  });
}
