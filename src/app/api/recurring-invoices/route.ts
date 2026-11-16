import { NextResponse, NextRequest } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

const FREQUENCIES = ['weekly', 'biweekly', 'monthly', 'quarterly', 'annually', 'yearly'];

/**
 * GET /api/recurring-invoices — recurring invoice schedules (Batch I).
 * POST — create a schedule (customer + name + frequency + first run
 * date + lines as jsonb). Lines live ONLY in the parent jsonb: the
 * engine runner reads the child table first, but its child path
 * hardcodes revenue_account_id NULL into the invoice line, and
 * acct_post_invoice then fails (acct_post_entry raises on a null
 * account) — so any child row would make every run fail. The jsonb
 * path carries revenue_account_id and posts. The list and detail
 * routes read the jsonb when the child table is empty. The engine
 * gap to fix upstream: acct_run_recurring_invoices child path +
 * the child table has no revenue_account_id column at all.
 * The engine runner acct_run_recurring_invoices only creates invoices
 * for schedules in status 'active'.
 */
export async function GET() {
  const sb = supabaseAdmin();
  const { data, error } = await sb.from('acct_recurring_invoices').select('*').eq('tenant_id', DEFAULT_TENANT_ID).order('next_run_date', { ascending: true });
  if (error) return err('INTERNAL', error.message, 500);
  const customerIds = [...new Set(((data ?? []) as { customer_id: string | null }[]).map((r) => r.customer_id).filter(Boolean))] as string[];
  // customer_id is an FK to crm_customers (not acct_customers):
  // the invoice customer is the CRM customer; acct_customers is its
  // AR/tax profile, linked 1:1 via platform_customer_identity_links.
  const { data: customers } = customerIds.length
    ? await sb.from('crm_customers').select('id, company_name, first_name, last_name').in('id', customerIds)
    : { data: [] };
  const customerById = new Map(((customers ?? []) as Record<string, unknown>[]).map((c) => [c.id, (c.company_name as string) || `${c.first_name || ''} ${c.last_name || ''}`.trim()]));
  const ids = ((data ?? []) as { id: string }[]).map((r) => r.id);
  const lineCounts = new Map<string, number>();
  if (ids.length) {
    for (let i = 0; i < ids.length; i += 100) {
      const { data: lines } = await sb.from('acct_recurring_invoice_lines').select('recurring_invoice_id').in('recurring_invoice_id', ids.slice(i, i + 100));
      for (const l of (lines ?? []) as { recurring_invoice_id: string }[]) lineCounts.set(l.recurring_invoice_id, (lineCounts.get(l.recurring_invoice_id) || 0) + 1);
    }
  }
  return NextResponse.json({
    data: ((data ?? []) as Record<string, unknown>[]).map((r) => {
      const jsonbLines = Array.isArray(r.lines) ? r.lines : [];
      const total = jsonbLines.reduce((s: number, l: Record<string, unknown>) => s + Number(l.line_total || 0), 0);
      return {
        id: r.id,
        customerId: r.customer_id,
        customer: (customerById.get(r.customer_id as string) as string) || '—',
        templateNumber: r.template_number,
        name: r.name,
        frequency: r.frequency,
        intervalCount: r.interval_count,
        nextRunDate: r.next_run_date,
        currency: r.currency,
        totalAmount: Number(r.total ?? total),
        status: r.status,
        lineCount: lineCounts.get(r.id as string) || jsonbLines.length,
      };
    }),
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const customerId = String(body.customerId || '');
  const name = String(body.name || '').trim();
  const frequency = String(body.frequency || 'monthly');
  const nextRunDate = String(body.nextRunDate || '').slice(0, 10);
  const currency = String(body.currency || 'USD').toUpperCase().slice(0, 3);
  const lines = Array.isArray(body.lines) ? body.lines : [];
  if (!customerId) return err('VALIDATION', 'customerId is required', 400);
  if (!name) return err('VALIDATION', 'name is required', 400);
  if (!FREQUENCIES.includes(frequency)) return err('VALIDATION', `frequency must be one of ${FREQUENCIES.join(', ')}`, 400);
  if (!nextRunDate) return err('VALIDATION', 'nextRunDate is required', 400);
  if (lines.length === 0) return err('VALIDATION', 'At least one line is required', 400);
  const parsedLines0 = lines.map((l: Record<string, unknown>, i: number) => {
    const qty = Number(l.quantity || 1);
    const price = Number(l.unitPrice || 0);
    const tax = Number(l.taxAmount || 0);
    return {
      line_number: Number(l.lineNumber || i + 1),
      description: String(l.description || '').trim(),
      quantity: qty,
      unit_price: price,
      tax_amount: tax,
      line_total: qty * price + tax,
      // carried through so the engine runner can post the invoice:
      // it reads unit_price + revenue_account_id from the jsonb.
      revenue_account_id: l.revenueAccountId ? String(l.revenueAccountId) : null,
    };
  });
  if (parsedLines0.some((l: { description: string; line_total: number }) => !l.description || !(l.line_total > 0))) return err('VALIDATION', 'Every line needs a description and a positive total', 400);
  const sb = supabaseAdmin();
  const { data: customer } = await sb.from('crm_customers').select('id').eq('tenant_id', DEFAULT_TENANT_ID).eq('id', customerId).single();
  if (!customer) return err('VALIDATION', 'Unknown customer (CRM customers only — crm_customers)', 400);
  const { data: entityId, error: entityErr } = await sb.rpc('acct_default_entity', { p_tenant_id: DEFAULT_TENANT_ID });
  if (entityErr || !entityId) return err('INTERNAL', 'Could not resolve the default entity', 500);
  // A line without an explicit revenue account defaults to the
  // default_income role account — the runner posts the invoice, and
  // a null revenue account makes acct_post_entry raise.
  const { data: defaultIncome } = await sb.rpc('acct_role_account', { p_tenant_id: DEFAULT_TENANT_ID, p_entity_id: entityId, p_role: 'default_income' });
  const parsedLines = parsedLines0.map((l: Record<string, unknown>) => ({
    ...l,
    revenue_account_id: l.revenue_account_id || (defaultIncome as string | null) || null,
  }));
  if (parsedLines.some((l: Record<string, unknown>) => !l.revenue_account_id)) return err('VALIDATION', 'No default_income role account is configured; pass revenueAccountId per line', 400);
  const total = parsedLines.reduce((s: number, l: { line_total: number }) => s + l.line_total, 0);
  // template_number is NOT NULL: number it from the engine sequence
  // when the caller does not supply one.
  let templateNumber = body.templateNumber ? String(body.templateNumber) : null;
  if (!templateNumber) {
    const { data: num, error: numErr } = await sb.rpc('acct_next_number', { p_tenant_id: DEFAULT_TENANT_ID, p_entity_id: entityId, p_doc_type: 'recurring_invoice', p_default_prefix: 'RT-' });
    if (numErr || !num) return err('INTERNAL', 'Could not number the template', 500);
    templateNumber = num as string;
  }
  const { data, error } = await sb.from('acct_recurring_invoices').insert({
    tenant_id: DEFAULT_TENANT_ID,
    entity_id: entityId,
    customer_id: customerId,
    template_number: templateNumber,
    name,
    frequency,
    interval_count: Number(body.intervalCount || 1),
    next_run_date: nextRunDate,
    currency,
    subtotal: total,
    total: total,
    status: body.status ? String(body.status) : 'active',
    lines: parsedLines.map((l: Record<string, unknown>) => ({ description: l.description, quantity: l.quantity, unit_price: l.unit_price, revenue_account_id: l.revenue_account_id, tax_amount: l.tax_amount, line_total: l.line_total })),
  }).select().single();
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: { id: data.id, name: data.name, frequency: data.frequency, nextRunDate: data.next_run_date, totalAmount: total, status: data.status } }, { status: 201 });
}
