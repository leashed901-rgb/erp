import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

const LEVELS = ['department', 'sub_department', 'service_type', 'sku_line'] as const;

/**
 * GET /api/item-classifications — list finance item classifications
 * (Batch F). Each row carries its live item count.
 */
export async function GET() {
  const { data, error } = await supabaseAdmin()
    .from('acct_item_classifications')
    .select('*')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .order('sort_order', { ascending: true })
    .order('code', { ascending: true });
  if (error) return err('INTERNAL', error.message, 500);
  const rows = (data ?? []) as Record<string, unknown>[];
  const ids = rows.map((r) => r.id as string);
  let counts = new Map<string, number>();
  if (ids.length > 0) {
    const { data: items } = await supabaseAdmin()
      .from('acct_items')
      .select('classification_id')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .in('classification_id', ids);
    for (const it of (items ?? []) as { classification_id: string }[]) {
      counts.set(it.classification_id, (counts.get(it.classification_id) ?? 0) + 1);
    }
  }
  return NextResponse.json({
    data: rows.map((r) => ({
      id: r.id,
      level: r.level,
      parentId: r.parent_id,
      code: r.code,
      name: r.name,
      defaultIncomeAccountId: r.default_income_account_id,
      defaultExpenseAccountId: r.default_expense_account_id,
      defaultCogsAccountId: r.default_cogs_account_id,
      defaultAssetAccountId: r.default_asset_account_id,
      defaultTaxCategory: r.default_tax_category,
      sortOrder: r.sort_order,
      isActive: r.is_active,
      itemCount: counts.get(r.id as string) ?? 0,
    })),
  });
}

/**
 * POST /api/item-classifications — create one. The DB CHECKs are the
 * contract: code must match ^[A-Z0-9]{1,8}$, level must be one of the
 * four levels. Violations surface as 400 with the engine's message.
 */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return err('VALIDATION', 'Invalid JSON', 400);
  }
  const level = String(body.level || '');
  const code = String(body.code || '').trim().toUpperCase();
  const name = String(body.name || '').trim();
  if (!(LEVELS as readonly string[]).includes(level)) {
    return err('VALIDATION', `level must be one of: ${LEVELS.join(', ')}`, 400);
  }
  if (!/^[A-Z0-9]{1,8}$/.test(code)) {
    return err('VALIDATION', 'code must be 1-8 uppercase letters/digits', 400);
  }
  if (!name) return err('VALIDATION', 'name is required', 400);
  const insert: Record<string, unknown> = {
    tenant_id: DEFAULT_TENANT_ID,
    level,
    parent_id: (body.parentId as string) || null,
    code,
    name,
    default_income_account_id: (body.defaultIncomeAccountId as string) || null,
    default_expense_account_id: (body.defaultExpenseAccountId as string) || null,
    default_cogs_account_id: (body.defaultCogsAccountId as string) || null,
    default_asset_account_id: (body.defaultAssetAccountId as string) || null,
    default_tax_category: (body.defaultTaxCategory as string) || null,
    sort_order: Number(body.sortOrder) || 0,
    is_active: body.isActive !== false,
  };
  const { data, error } = await supabaseAdmin()
    .from('acct_item_classifications')
    .insert(insert)
    .select('*')
    .single();
  if (error) return err('VALIDATION', error.message, 400);
  return NextResponse.json({ data }, { status: 201 });
}
