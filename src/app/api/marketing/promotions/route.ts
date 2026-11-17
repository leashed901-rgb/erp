import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { toPromotion } from '@/lib/marketingTypes';

/* Promotions & discounts (doc 24) over commerce_promotions — the
   canonical discount table the unify layer points coupons, promos
   and redemptions at. Drawer-only fields (targets, scope, stacking)
   persist in the rules jsonb. */

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

const TYPES = ['percent', 'fixed_amount', 'free_shipping', 'bogo'];

export function promotionInsert(body: Record<string, unknown>) {
  const rules: Record<string, unknown> = {
    targets: Array.isArray(body.targets) ? body.targets : [],
    scope: typeof body.scope === 'string' ? body.scope : 'Entire order',
    perCustomerLimit: typeof body.perCustomerLimit === 'number' ? body.perCustomerLimit : null,
    combinable: body.combinable === true,
    status: body.draft === true ? 'draft' : 'live',
    bogo: body.bogo && typeof body.bogo === 'object' ? body.bogo : null,
  };
  return {
    tenant_id: DEFAULT_TENANT_ID,
    code: String(body.code || '').toUpperCase(),
    name: String(body.name || ''),
    promotion_type: TYPES.includes(String(body.promotionType)) ? String(body.promotionType) : 'percent',
    value: typeof body.value === 'number' ? body.value : 0,
    minimum_subtotal: typeof body.minimumSubtotal === 'number' ? body.minimumSubtotal : null,
    maximum_discount: typeof body.maximumDiscount === 'number' ? body.maximumDiscount : null,
    usage_limit: typeof body.usageLimit === 'number' ? body.usageLimit : null,
    start_at: typeof body.startAt === 'string' ? body.startAt : null,
    end_at: typeof body.endAt === 'string' ? body.endAt : null,
    active: body.active !== false,
    is_automatic: body.isAutomatic === true,
    rules,
  };
}

export async function GET() {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('commerce_promotions')
    .select('*')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .order('code', { ascending: true })
    .limit(200);
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: (data || []).map((r) => toPromotion(r as Record<string, unknown>)) });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  if (!body.code || !body.name) return err('VALIDATION', 'code and name are required', 400);
  const sb = supabaseAdmin();
  const { data, error } = await sb.from('commerce_promotions').insert(promotionInsert(body)).select('*').single();
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: toPromotion(data as Record<string, unknown>) }, { status: 201 });
}
