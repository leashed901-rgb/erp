import { NextResponse, NextRequest } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

/**
 * GET /api/asset-classes — acct_asset_classes (Batch H).
 * POST — create a class. The code must be unique per tenant (the DB
 * enforces it); the three GL accounts are the ones depreciation posts
 * against, so all three are required.
 */
export async function GET() {
  const { data, error } = await supabaseAdmin().from('acct_asset_classes').select('*').eq('tenant_id', DEFAULT_TENANT_ID).order('code');
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({
    data: ((data ?? []) as Record<string, unknown>[]).map((c) => ({
      id: c.id,
      code: c.code,
      name: c.name,
      assetAccountId: c.asset_account_id,
      accumAccountId: c.accumulated_depreciation_account_id,
      expenseAccountId: c.depreciation_expense_account_id,
      lifeMonths: c.default_useful_life_months,
      method: c.default_method,
      residualPercent: c.residual_percent == null ? null : Number(c.residual_percent),
    })),
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const code = String(body.code || '').trim().toUpperCase();
  const name = String(body.name || '').trim();
  if (!code) return err('VALIDATION', 'Code is required', 400);
  if (!name) return err('VALIDATION', 'Name is required', 400);
  if (!body.assetAccountId || !body.accumAccountId || !body.expenseAccountId) {
    return err('VALIDATION', 'Asset, accumulated-depreciation, and depreciation-expense accounts are all required', 400);
  }
  const life = Number(body.lifeMonths);
  if (!Number.isFinite(life) || life <= 0) return err('VALIDATION', 'Useful life (months) must be positive', 400);
  const { data, error } = await supabaseAdmin().from('acct_asset_classes').insert({
    tenant_id: DEFAULT_TENANT_ID,
    code,
    name,
    asset_account_id: body.assetAccountId,
    accumulated_depreciation_account_id: body.accumAccountId,
    depreciation_expense_account_id: body.expenseAccountId,
    default_useful_life_months: life,
    default_method: body.method || 'straight_line',
    residual_percent: body.residualPercent != null ? Number(body.residualPercent) : 0,
  }).select('id').single();
  if (error) return err('DB_ERROR', error.message, 400);
  return NextResponse.json({ data: { id: (data as Record<string, unknown>).id } }, { status: 201 });
}
