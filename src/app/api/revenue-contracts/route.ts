import { NextResponse, NextRequest } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

/**
 * GET /api/revenue-contracts — acct_revenue_contracts with customer
 * names (Batch H). POST — create a contract. There is no engine
 * create RPC for revenue contracts, so this is a direct insert; the
 * contract number comes from the engine's acct_next_number ('RC-').
 */
export async function GET() {
  const { data, error } = await supabaseAdmin().from('acct_revenue_contracts').select('*').eq('tenant_id', DEFAULT_TENANT_ID).order('contract_date', { ascending: false });
  if (error) return err('INTERNAL', error.message, 500);
  const rows = (data ?? []) as Record<string, unknown>[];
  const names = new Map<string, string>();
  const custIds = [...new Set(rows.map((c) => c.customer_id as string).filter(Boolean))];
  if (custIds.length) {
    const { data: parties } = await supabaseAdmin().from('platform_parties').select('id, metadata').in('id', custIds);
    for (const p of (parties ?? []) as Record<string, unknown>[]) {
      const m = (p.metadata ?? {}) as Record<string, unknown>;
      names.set(p.id as string, String(m.name || ''));
    }
  }
  return NextResponse.json({
    data: rows.map((c) => ({
      id: c.id,
      contractNumber: c.contract_number,
      customerId: c.customer_id,
      customerName: names.get(c.customer_id as string) || null,
      contractDate: c.contract_date,
      startDate: c.start_date,
      endDate: c.end_date,
      totalPrice: Number(c.total_transaction_price || 0),
      status: c.status,
    })),
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const contractDate = String(body.contractDate || '').slice(0, 10);
  const total = Number(body.totalPrice);
  if (!body.customerId) return err('VALIDATION', 'Customer is required', 400);
  if (!contractDate) return err('VALIDATION', 'Contract date is required', 400);
  if (!Number.isFinite(total) || total <= 0) return err('VALIDATION', 'Total transaction price must be positive', 400);
  const { data: ent } = await supabaseAdmin().rpc('acct_default_entity', { p_tenant_id: DEFAULT_TENANT_ID });
  const { data: num } = await supabaseAdmin().rpc('acct_next_number', {
    p_tenant_id: DEFAULT_TENANT_ID,
    p_entity_id: ent,
    p_doc_type: 'revenue_contract',
    p_default_prefix: 'RC-',
  });
  const { data, error } = await supabaseAdmin().from('acct_revenue_contracts').insert({
    tenant_id: DEFAULT_TENANT_ID,
    entity_id: ent,
    customer_id: body.customerId,
    contract_number: (num as string) || `RC-${Date.now()}`,
    contract_date: contractDate,
    start_date: body.startDate || null,
    end_date: body.endDate || null,
    currency: String(body.currency || 'USD').slice(0, 3),
    total_transaction_price: total,
    status: 'draft',
  }).select('id').single();
  if (error) return err('DB_ERROR', error.message, 400);
  return NextResponse.json({ data: { id: (data as Record<string, unknown>).id } }, { status: 201 });
}
