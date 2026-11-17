import { NextResponse, NextRequest } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

/**
 * GET /api/recognition-schedules/[id] — one generic schedule with its
 * lines (Batch H). POST — cancel it via
 * acct_cancel_recognition_schedule (a reason is required by the
 * engine).
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { data: s, error } = await supabaseAdmin().from('acct_recognition_schedules').select('*').eq('tenant_id', DEFAULT_TENANT_ID).eq('id', id).single();
  if (error || !s) return err('NOT_FOUND', 'Recognition schedule not found', 404);
  const row = s as Record<string, unknown>;
  const [{ data: lines }, { data: accts }] = await Promise.all([
    supabaseAdmin().from('acct_recognition_lines').select('*').eq('tenant_id', DEFAULT_TENANT_ID).eq('schedule_id', id).order('line_no'),
    supabaseAdmin().from('acct_chart_of_accounts').select('id, code, name').in('id', [row.balance_account_id, row.pl_account_id].filter(Boolean) as string[]),
  ]);
  const acctById = new Map(((accts ?? []) as Record<string, unknown>[]).map((a) => [a.id, `${a.code} — ${a.name}`]));
  return NextResponse.json({
    data: {
      id: row.id,
      kind: row.kind,
      name: row.name,
      totalAmount: Number(row.total_amount || 0),
      startDate: row.start_date,
      months: row.months,
      method: row.method,
      balanceAccountId: row.balance_account_id,
      balanceAccountName: acctById.get(row.balance_account_id as string) ?? null,
      plAccountId: row.pl_account_id,
      plAccountName: acctById.get(row.pl_account_id as string) ?? null,
      vendorId: row.vendor_id,
      customerId: row.customer_id,
      autoReverse: Boolean(row.auto_reverse),
      status: row.status,
      lines: ((lines ?? []) as Record<string, unknown>[]).map((l) => ({
        id: l.id,
        lineNo: l.line_no,
        recognizeOn: l.recognize_on,
        amount: Number(l.amount || 0),
        status: l.status,
        journalEntryId: l.journal_entry_id,
        postedAt: l.posted_at,
      })),
    },
  });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const reason = String(body.reason || '').trim();
  if (!reason) return err('VALIDATION', 'A cancellation reason is required', 400);
  const { error } = await supabaseAdmin().rpc('acct_cancel_recognition_schedule', { p_schedule_id: id, p_reason: reason });
  if (error) return err('RPC_FAILED', error.message, 400);
  return NextResponse.json({ data: { id, status: 'cancelled' } });
}
