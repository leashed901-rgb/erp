import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

/**
 * GET /api/v1/returns/policies — return policy rules (doc 17: "policy rules
 * and order cases"). Global rule first, then category-scoped rules.
 */
export async function GET() {
  const { data, error } = await supabaseAdmin()
    .from('return_policy_rules')
    .select('id,scope,category_id,category_label,window_days,is_legal_minimum,notes,is_active,created_at')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .order('scope', { ascending: true })
    .order('window_days', { ascending: true });
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: data ?? [] });
}

/**
 * POST /api/v1/returns/policies — add a policy rule.
 * Body: { scope: 'global'|'category', category_id?, category_label?,
 *         window_days (1..3650), is_legal_minimum?, notes? }.
 */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return err('VALIDATION', 'Invalid JSON', 400);
  }
  const windowDays = Number(body.window_days);
  const scope = String(body.scope || 'global');
  if (!['global', 'category'].includes(scope)) return err('VALIDATION', "scope must be 'global' or 'category'", 400);
  if (!Number.isFinite(windowDays) || windowDays <= 0 || windowDays > 3650) {
    return err('VALIDATION', 'window_days must be between 1 and 3650', 400);
  }
  if (scope === 'category' && !body.category_id && !body.category_label) {
    return err('VALIDATION', 'category_id or category_label is required for a category-scoped rule', 400);
  }
  const { data, error } = await supabaseAdmin()
    .from('return_policy_rules')
    .insert({
      tenant_id: DEFAULT_TENANT_ID,
      scope,
      category_id: (body.category_id as string) || null,
      category_label: (body.category_label as string) || null,
      window_days: windowDays,
      is_legal_minimum: !!body.is_legal_minimum,
      notes: (body.notes as string) || null,
      is_active: true,
    })
    .select('*')
    .single();
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data }, { status: 201 });
}
