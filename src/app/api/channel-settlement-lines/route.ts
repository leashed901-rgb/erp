import { NextResponse, NextRequest } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

/**
 * GET /api/channel-settlement-lines?settlementId= — the line detail
 * of one channel settlement (Batch I). Read-only: settlement lines
 * are written by the settlement itself, not by hand. The only place
 * they are referenced today is a COMMENT in /api/v1/settlements —
 * this route makes them visible.
 */
export async function GET(req: NextRequest) {
  const settlementId = new URL(req.url).searchParams.get('settlementId');
  if (!settlementId) return err('VALIDATION', 'settlementId is required', 400);
  const sb = supabaseAdmin();
  const { data, error } = await sb.from('acct_channel_settlement_lines').select('*').eq('settlement_id', settlementId).order('created_at', { ascending: true });
  if (error) return err('INTERNAL', error.message, 500);
  const accountIds = [...new Set(((data ?? []) as { account_id: string | null }[]).map((l) => l.account_id).filter(Boolean))] as string[];
  const orderIds = [...new Set(((data ?? []) as { erp_order_id: string | null }[]).map((l) => l.erp_order_id).filter(Boolean))] as string[];
  const [{ data: accounts }, { data: orders }] = await Promise.all([
    accountIds.length ? sb.from('acct_chart_of_accounts').select('id, code, name').in('id', accountIds) : Promise.resolve({ data: [] }),
    orderIds.length ? sb.from('erp_orders').select('id, order_number').in('id', orderIds) : Promise.resolve({ data: [] }),
  ]);
  const accountById = new Map(((accounts ?? []) as Record<string, unknown>[]).map((a) => [a.id, `${a.code} · ${a.name}`]));
  const orderById = new Map(((orders ?? []) as Record<string, unknown>[]).map((o) => [o.id, o.order_number]));
  return NextResponse.json({
    data: ((data ?? []) as Record<string, unknown>[]).map((l) => ({
      id: l.id,
      settlementId: l.settlement_id,
      lineType: l.line_type,
      amount: Number(l.amount || 0),
      erpOrderId: l.erp_order_id,
      orderNumber: (orderById.get(l.erp_order_id as string) as string) || null,
      accountId: l.account_id,
      account: (accountById.get(l.account_id as string) as string) || '—',
    })),
  });
}
