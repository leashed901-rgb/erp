import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status = 400) {
  return NextResponse.json({ error: { code, message } }, { status });
}

/** POST /api/cap/plans — creates an option pool (cap_option_pools). */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const name = String(body.name ?? '').trim();
    if (!name) return err('VALIDATION', 'Plan name is required.');
    const shareClassId = String(body.share_class_id ?? body.class_id ?? '');
    if (!shareClassId) return err('VALIDATION', 'share_class_id is required.');
    const authorized = Number(body.authorized_shares ?? body.total_reserved ?? 0);
    if (!Number.isFinite(authorized) || authorized <= 0) return err('VALIDATION', 'Reserved share pool must be positive.');

    const { data, error } = await supabaseAdmin()
      .from('cap_option_pools')
      .insert({
        tenant_id: DEFAULT_TENANT_ID,
        share_class_id: shareClassId,
        name,
        authorized_shares: authorized,
        adopted_on: body.adopted_on ?? body.board_approved_at ?? null,
        plan_document_id: body.plan_document_id ?? null,
        board_consent_document_id: body.board_consent_document_id ?? body.board_approval_id ?? null,
        shareholder_approved_on: body.shareholder_approved_on ?? null,
        iso_share_limit: body.iso_share_limit != null ? Number(body.iso_share_limit) : null,
      })
      .select()
      .single();
    if (error) return err('CREATE_FAILED', error.message);
    return NextResponse.json({ data }, { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to create equity plan.';
    return err('CREATE_FAILED', message);
  }
}
