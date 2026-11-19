import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

/** POST /api/reconciliations/[id]/finish — close the period. Refuses
 *  to finish while the Difference meter is non-zero, with the exact
 *  difference in the error so the user knows what to adjust. */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = supabaseAdmin();
  const { data: rec } = await sb
    .from('acct_reconciliations')
    .select('id, status, as_of_date')
    .eq('id', id)
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .single();
  if (!rec) return err('NOT_FOUND', 'Reconciliation not found', 404);
  if (rec.status === 'reconciled' || rec.status === 'closed') {
    return err('VALIDATION', `Reconciliation is already ${rec.status}`, 400);
  }
  const { data: summary } = await sb.rpc('acct_reconciliation_summary', {
    p_reconciliation_id: id,
  });
  const difference = Number(summary?.[0]?.difference ?? 0);
  if (Math.abs(difference) >= 0.01) {
    return err(
      'VALIDATION',
      `Cannot close: difference is $${Math.abs(difference).toFixed(2)}. Clear or adjust items first.`,
      400,
    );
  }
  const { data, error } = await sb
    .from('acct_reconciliations')
    .update({ status: 'reconciled', completed_at: new Date().toISOString() })
    .eq('id', id)
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .select('id, status, completed_at')
    .single();
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({
    data,
    message: `Reconciliation complete — period ending ${rec.as_of_date} closed.`,
  });
}
