import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/** PATCH /api/accounts/[id] — update an account. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: { code: 'VALIDATION', message: 'Invalid JSON body', requestId: crypto.randomUUID() } }, { status: 400 });
  }
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const f of ['code', 'name', 'account_type', 'normal_balance', 'subtype', 'description', 'currency', 'is_reconcilable', 'is_posting_allowed', 'is_control_account', 'is_system', 'is_active', 'detail_type', 'sort_order']) {
    if (f in body) updates[f] = body[f];
  }
  const { data, error } = await supabaseAdmin()
    .from('acct_chart_of_accounts')
    .update(updates)
    .eq('id', id)
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .select('*')
    .single();
  if (error || !data) {
    return NextResponse.json({ error: { code: 'VALIDATION', message: error?.message || 'Account not found', requestId: crypto.randomUUID() } }, { status: 400 });
  }
  return NextResponse.json({ data });
}

/** DELETE /api/accounts/[id] — deactivate (soft delete) or hard delete. */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const hard = searchParams.get('hard') === 'true';

  if (hard) {
    const { error } = await supabaseAdmin()
      .from('acct_chart_of_accounts')
      .delete()
      .eq('id', id)
      .eq('tenant_id', DEFAULT_TENANT_ID);
    if (error) return NextResponse.json({ error: { code: 'INTERNAL', message: error.message, requestId: crypto.randomUUID() } }, { status: 500 });
    return NextResponse.json({ data: { id, deleted: true } });
  }
  // Soft delete: deactivate.
  const { data, error } = await supabaseAdmin()
    .from('acct_chart_of_accounts')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .select('id, is_active')
    .single();
  if (error) return NextResponse.json({ error: { code: 'INTERNAL', message: error.message, requestId: crypto.randomUUID() } }, { status: 500 });
  return NextResponse.json({ data });
}
