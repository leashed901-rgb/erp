import { NextResponse, NextRequest } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

/**
 * GET /api/recognition-schedules — the generic prepaid / deferred /
 * accrued schedules (Batch H). POST — create one via
 * acct_create_recognition_schedule. The engine validates the P&L
 * account type by kind (expense kinds need an expense account,
 * revenue kinds need a revenue account) and defaults the balance
 * account from the role accounts when omitted; accrued kinds are
 * always one month.
 */
const KINDS = ['prepaid_expense', 'deferred_revenue', 'accrued_expense', 'accrued_revenue'];

export async function GET() {
  const { data, error } = await supabaseAdmin().from('acct_recognition_schedules').select('*').eq('tenant_id', DEFAULT_TENANT_ID).order('start_date', { ascending: false });
  if (error) return err('INTERNAL', error.message, 500);
  const rows = (data ?? []) as Record<string, unknown>[];
  const acctIds = [...new Set(rows.flatMap((r) => [r.balance_account_id, r.pl_account_id]).filter(Boolean) as string[])];
  const { data: accts } = acctIds.length
    ? await supabaseAdmin().from('acct_chart_of_accounts').select('id, code, name').in('id', acctIds)
    : { data: [] };
  const acctById = new Map(((accts ?? []) as Record<string, unknown>[]).map((a) => [a.id, `${a.code} — ${a.name}`]));
  return NextResponse.json({
    data: rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      name: r.name,
      totalAmount: Number(r.total_amount || 0),
      startDate: r.start_date,
      months: r.months,
      method: r.method,
      balanceAccountId: r.balance_account_id,
      balanceAccountName: acctById.get(r.balance_account_id as string) ?? null,
      plAccountId: r.pl_account_id,
      plAccountName: acctById.get(r.pl_account_id as string) ?? null,
      vendorId: r.vendor_id,
      customerId: r.customer_id,
      autoReverse: Boolean(r.auto_reverse),
      status: r.status,
    })),
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const kind = String(body.kind || '');
  const name = String(body.name || '').trim();
  const amount = Number(body.totalAmount);
  const start = String(body.startDate || '').slice(0, 10);
  const months = Number(body.months);
  if (!KINDS.includes(kind)) return err('VALIDATION', `kind must be one of ${KINDS.join(', ')}`, 400);
  if (!name) return err('VALIDATION', 'Name is required', 400);
  if (!Number.isFinite(amount) || amount <= 0) return err('VALIDATION', 'Total amount must be positive', 400);
  if (!start) return err('VALIDATION', 'Start date is required', 400);
  if (!Number.isFinite(months) || months <= 0) return err('VALIDATION', 'Months must be positive', 400);
  if (!body.plAccountId) return err('VALIDATION', 'P&L account is required', 400);
  const { data, error } = await supabaseAdmin().rpc('acct_create_recognition_schedule', {
    p_tenant_id: DEFAULT_TENANT_ID,
    p_kind: kind,
    p_name: name,
    p_amount: amount,
    p_start: start,
    p_months: months,
    p_pl_account_id: body.plAccountId,
    p_balance_account_id: body.balanceAccountId || null,
    p_method: body.method || 'straight_line',
    p_initial_offset_account_id: body.initialOffsetAccountId || null,
    p_vendor_id: body.vendorId || null,
    p_customer_id: body.customerId || null,
    p_source_doc_type: body.sourceDocType || null,
    p_source_doc_id: body.sourceDocId || null,
    p_auto_reverse: body.autoReverse !== false,
    p_recognized_through: body.recognizedThrough || null,
  });
  if (error) return err('RPC_FAILED', error.message, 400);
  return NextResponse.json({ data: { id: data } }, { status: 201 });
}
