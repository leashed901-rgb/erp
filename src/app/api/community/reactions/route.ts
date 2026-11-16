import { NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/**
 * POST /api/community/reactions { targetType, targetId, customerId }
 * — a like on a product, post, review, comment or media.
 *
 * The table only allows reaction 'like' (CHECK). A like is
 * idempotent per customer+target: an existing like is returned
 * with deduped: true instead of writing a second row. The
 * ugc_counters_trg trigger refreshes ugc_product_counters on
 * insert, so like_count moves immediately.
 */

const VALID_TARGETS = ['product', 'post', 'review', 'comment', 'media'] as const;

function err(code: string, message: string, status = 400) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return err('VALIDATION', 'Invalid JSON body');
    const targetType = String(body.targetType || '');
    const targetId = String(body.targetId || '');
    const customerId = String(body.customerId || '');
    if (!(VALID_TARGETS as readonly string[]).includes(targetType)) {
      return err('VALIDATION', `targetType must be one of ${VALID_TARGETS.join(', ')}`);
    }
    if (!targetId) return err('VALIDATION', 'targetId is required');
    if (!customerId) return err('VALIDATION', 'customerId is required');
    const sb = supabaseAdmin();
    const { data: existing, error: readErr } = await sb
      .from('ugc_reactions')
      .select('id,target_type,target_id,customer_id,reaction,created_at')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .eq('target_type', targetType)
      .eq('target_id', targetId)
      .eq('customer_id', customerId)
      .maybeSingle();
    if (readErr) return err('INTERNAL', readErr.message, 500);
    if (existing) return NextResponse.json({ data: existing, deduped: true });
    const { data, error } = await sb
      .from('ugc_reactions')
      .insert({
        tenant_id: DEFAULT_TENANT_ID,
        target_type: targetType,
        target_id: targetId,
        customer_id: customerId,
        reaction: 'like',
      })
      .select('id,target_type,target_id,customer_id,reaction,created_at')
      .single();
    if (error) return err('INTERNAL', error.message, 500);
    return NextResponse.json({ data, deduped: false }, { status: 201 });
  } catch (e) {
    return err('INTERNAL', e instanceof Error ? e.message : String(e), 500);
  }
}
