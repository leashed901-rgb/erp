import { NextResponse, NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

/**
 * POST /api/fixed-assets/[id]/place-in-service — acct_place_asset_in_service.
 * Methods: straight_line | declining_balance | double_declining.
 * Conventions: full_month | mid_month | next_month. Life (months) is
 * required by the engine when neither the asset nor its class carries one.
 * Returns the book id the RPC created.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const inService = String(body.inService || '').slice(0, 10);
  if (!inService) return err('VALIDATION', 'In-service date is required', 400);
  const { data, error } = await supabaseAdmin().rpc('acct_place_asset_in_service', {
    p_asset_id: id,
    p_in_service: inService,
    p_method: body.method || null,
    p_life_months: body.lifeMonths != null ? Number(body.lifeMonths) : null,
    p_residual: body.residual != null ? Number(body.residual) : null,
    p_convention: body.convention || 'full_month',
    p_class_id: body.classId || null,
  });
  if (error) return err('RPC_FAILED', error.message, 400);
  return NextResponse.json({ data: { bookId: data } });
}
