import { NextResponse, NextRequest } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

const FREQUENCIES = ['weekly', 'biweekly', 'monthly', 'quarterly', 'annually', 'yearly'];

/**
 * GET /api/recurring-bills — recurring bill schedules (Batch I).
 * POST — create a schedule (vendor + name + frequency + first run
 * date + lines as jsonb; the CHECK requires a non-empty line array
 * and vendor_id is NOT NULL). The engine runner
 * acct_run_recurring_bills only creates bills for active schedules.
 */
export async function GET() {
  const sb = supabaseAdmin();
  const { data, error } = await sb.from('acct_recurring_bills').select('*').eq('tenant_id', DEFAULT_TENANT_ID).order('next_run_date', { ascending: true });
  if (error) return err('INTERNAL', error.message, 500);
  const vendorIds = [...new Set(((data ?? []) as { vendor_id: string }[]).map((r) => r.vendor_id))] as string[];
  const { data: vendors } = vendorIds.length
    ? await sb.from('acct_vendors').select('id, name').in('id', vendorIds)
    : { data: [] };
  const vendorById = new Map(((vendors ?? []) as Record<string, unknown>[]).map((v) => [v.id, v.name]));
  return NextResponse.json({
    data: ((data ?? []) as Record<string, unknown>[]).map((r) => {
      const lines = Array.isArray(r.lines) ? r.lines : [];
      const total = lines.reduce((s: number, l: Record<string, unknown>) => s + Number(l.line_total || 0), 0);
      return {
        id: r.id,
        vendorId: r.vendor_id,
        vendor: (vendorById.get(r.vendor_id as string) as string) || '—',
        name: r.name,
        frequency: r.frequency,
        intervalCount: r.interval_count,
        startDate: r.start_date,
        endDate: r.end_date,
        nextRunDate: r.next_run_date,
        autoPost: r.auto_post,
        autoPay: !!(r.auto_pay_method || r.auto_pay_bank_account_id),
        autoPayMethod: r.auto_pay_method,
        autoPayBankAccountId: r.auto_pay_bank_account_id,
        isActive: r.is_active,
        lineCount: lines.length,
        totalAmount: total,
      };
    }),
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const vendorId = String(body.vendorId || '');
  const name = String(body.name || '').trim();
  const frequency = String(body.frequency || 'monthly');
  const nextRunDate = String(body.nextRunDate || '').slice(0, 10);
  const lines = Array.isArray(body.lines) ? body.lines : [];
  if (!vendorId) return err('VALIDATION', 'vendorId is required', 400);
  if (!name) return err('VALIDATION', 'name is required', 400);
  if (!FREQUENCIES.includes(frequency)) return err('VALIDATION', `frequency must be one of ${FREQUENCIES.join(', ')}`, 400);
  if (!nextRunDate) return err('VALIDATION', 'nextRunDate is required', 400);
  if (lines.length === 0) return err('VALIDATION', 'At least one line is required', 400);
  const parsedLines = lines.map((l: Record<string, unknown>) => {
    const qty = Number(l.quantity || 1);
    const price = Number(l.unitPrice || 0);
    return {
      description: String(l.description || '').trim(),
      quantity: qty,
      unit_price: price,
      // the bill runner reads unit_cost, not unit_price
      unit_cost: price,
      line_total: qty * price,
      // carried through so the engine runner can post the bill
      expense_account_id: l.expenseAccountId ? String(l.expenseAccountId) : null,
    };
  });
  if (parsedLines.some((l: { description: string; line_total: number }) => !l.description || !(l.line_total > 0))) return err('VALIDATION', 'Every line needs a description and a positive total', 400);
  const sb = supabaseAdmin();
  const { data: vendor } = await sb.from('acct_vendors').select('id').eq('tenant_id', DEFAULT_TENANT_ID).eq('id', vendorId).single();
  if (!vendor) return err('VALIDATION', 'Unknown vendor', 400);
  const { data: entityId, error: entityErr } = await sb.rpc('acct_default_entity', { p_tenant_id: DEFAULT_TENANT_ID });
  if (entityErr || !entityId) return err('INTERNAL', 'Could not resolve the default entity', 500);
  // A line without an explicit expense account defaults to the
  // default_expense role account — the runner posts the bill, and a
  // null expense account cannot post.
  const { data: defaultExpense } = await sb.rpc('acct_role_account', { p_tenant_id: DEFAULT_TENANT_ID, p_entity_id: entityId, p_role: 'default_expense' });
  const parsedLines2 = parsedLines.map((l: { expense_account_id: string | null }) => ({
    ...l,
    expense_account_id: l.expense_account_id || (defaultExpense as string | null) || null,
  }));
  if (parsedLines2.some((l: { expense_account_id: string | null }) => !l.expense_account_id)) return err('VALIDATION', 'No default_expense role account is configured; pass expenseAccountId per line', 400);
  const total = parsedLines2.reduce((s: number, l: { line_total: number }) => s + l.line_total, 0);
  // acct_recurring_bills has no auto_pay boolean and no total_amount
  // column: auto-pay is auto_pay_method + auto_pay_bank_account_id,
  // and the total is derived from the lines jsonb.
  let autoPayBankAccountId: string | null = null;
  if (body.autoPayBankAccountId) {
    const { data: bank } = await sb.from('acct_bank_accounts').select('id').eq('tenant_id', DEFAULT_TENANT_ID).eq('id', String(body.autoPayBankAccountId)).single();
    if (!bank) return err('VALIDATION', 'Unknown auto-pay bank account', 400);
    autoPayBankAccountId = String(body.autoPayBankAccountId);
  }
  const { data, error } = await sb.from('acct_recurring_bills').insert({
    tenant_id: DEFAULT_TENANT_ID,
    entity_id: entityId,
    vendor_id: vendorId,
    name,
    frequency,
    interval_count: Number(body.intervalCount || 1),
    start_date: body.startDate ? String(body.startDate).slice(0, 10) : nextRunDate,
    end_date: body.endDate ? String(body.endDate).slice(0, 10) : null,
    next_run_date: nextRunDate,
    lines: parsedLines2,
    auto_post: body.autoPost !== false,
    auto_pay_bank_account_id: autoPayBankAccountId,
    auto_pay_method: body.autoPayMethod ? String(body.autoPayMethod) : null,
    is_active: body.isActive !== false,
  }).select().single();
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: { id: data.id, name: data.name, frequency: data.frequency, nextRunDate: data.next_run_date, totalAmount: total, isActive: data.is_active } }, { status: 201 });
}
