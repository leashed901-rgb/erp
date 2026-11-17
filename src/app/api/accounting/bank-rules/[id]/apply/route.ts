import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/* Apply bank rules to the existing feed via the platform RPC
   acct_apply_bank_rules (tenant-wide; optionally one transaction).
   Returns the target rule's times_applied before/after so the UI can
   report the real delta for the rule the user ran. */

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const sb = supabaseAdmin();
  const readTimes = async () => {
    const { data } = await sb
      .from('acct_bank_rules')
      .select('times_applied')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .eq('id', id)
      .maybeSingle();
    return Number((data as { times_applied?: number } | null)?.times_applied || 0);
  };
  const before = await readTimes();
  const { error } = await sb.rpc('acct_apply_bank_rules', { p_tenant_id: DEFAULT_TENANT_ID, p_bank_txn_id: null });
  if (error) return err('INTERNAL', error.message, 500);
  const after = await readTimes();
  return NextResponse.json({ data: { id, appliedNow: after - before, timesApplied: after } });
}
