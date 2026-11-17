import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { generateStatement, toStatementDto } from '@/lib/customerStatements';

const err = (code: string, message: string, status: number) =>
  NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });

/** GET /api/customer-statements — recorded statements with customer names. */
export async function GET() {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('acct_customer_statements')
    .select('*')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .order('generated_at', { ascending: false })
    .limit(100);
  if (error) return err('INTERNAL', error.message, 500);
  const rows = data || [];
  const customerIds = [...new Set(rows.map((r) => r.customer_id))];
  const names = new Map<string, string>();
  if (customerIds.length) {
    const { data: parties } = await sb.from('platform_parties').select('id,metadata').in('id', customerIds);
    (parties || []).forEach((p) => names.set(p.id, (p.metadata as Record<string, unknown>)?.name as string || ''));
  }
  return NextResponse.json({ data: rows.map((r) => ({ ...toStatementDto(r), customerName: names.get(r.customer_id) || '' })) });
}

/**
 * POST /api/customer-statements — generate a statement for one customer
 * for a period (acct_customer_statement lines + open-invoice aging),
 * stored as an acct_customer_statements row. Body: { customerId, from, to }.
 */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return err('VALIDATION', 'Invalid JSON', 400); }
  if (!body.customerId) return err('VALIDATION', 'customerId is required', 400);
  if (!body.from || !body.to) return err('VALIDATION', 'from and to are required', 400);
  const sb = supabaseAdmin();
  const { data: customer } = await sb.from('crm_customers').select('id').eq('id', String(body.customerId)).eq('tenant_id', DEFAULT_TENANT_ID).maybeSingle();
  if (!customer) return err('NOT_FOUND', 'Customer not found', 404);
  try {
    const { statement, lines } = await generateStatement(sb, String(body.customerId), String(body.from), String(body.to));
    return NextResponse.json({ data: statement, lines }, { status: 201 });
  } catch (e) {
    return err('INTERNAL', e instanceof Error ? e.message : 'Statement generation failed', 500);
  }
}
