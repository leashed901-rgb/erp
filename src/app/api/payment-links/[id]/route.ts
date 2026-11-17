import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status = 400) {
  return NextResponse.json({ error: { code, message } }, { status });
}

/** PATCH /api/payment-links/[id] — edit title/description/amount/
 *  expires_at/status (status ∈ active|inactive|expired). */
export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = await req.json();
    const patch: Record<string, unknown> = {};
    if (body.title !== undefined) patch.title = String(body.title).trim();
    if (body.description !== undefined) patch.description = body.description == null ? null : String(body.description);
    if (body.amount !== undefined) {
      const amount = body.amount == null ? null : Number(body.amount);
      if (amount != null && (!Number.isFinite(amount) || amount <= 0)) {
        return err('VALIDATION', 'amount must be positive.');
      }
      patch.amount = amount;
    }
    if (body.expires_at !== undefined) patch.expires_at = body.expires_at ?? null;
    if (body.status !== undefined) {
      if (!['active', 'inactive', 'expired'].includes(String(body.status))) {
        return err('VALIDATION', 'status must be active, inactive, or expired.');
      }
      patch.status = String(body.status);
    }
    if (Object.keys(patch).length === 0) return err('VALIDATION', 'Nothing to update.');
    const { data, error } = await supabaseAdmin()
      .from('acct_payment_links')
      .update(patch)
      .eq('id', id)
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .select()
      .single();
    if (error) return err('UPDATE_FAILED', error.message);
    return NextResponse.json({ data });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to update payment link.';
    return err('UPDATE_FAILED', message);
  }
}

/** DELETE /api/payment-links/[id] — removes the link record. */
export async function DELETE(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const { error } = await supabaseAdmin()
      .from('acct_payment_links')
      .delete()
      .eq('id', id)
      .eq('tenant_id', DEFAULT_TENANT_ID);
    if (error) return err('DELETE_FAILED', error.message);
    return NextResponse.json({ data: { id, deleted: true } });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to delete payment link.';
    return err('DELETE_FAILED', message);
  }
}
