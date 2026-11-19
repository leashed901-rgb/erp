import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status = 400) {
  return NextResponse.json({ error: { code, message } }, { status });
}

const APPROVAL_TYPES = ['plan_adopt', 'pool_increase', 'grant_batch', 'issuance', 'valuation_adopt', 'financing', 'qualified_individual', 'other'];

/**
 * POST /api/cap/approvals — inserts a board approval (cap_board_approvals).
 * Accepts the current contract {approval_type, approval_method, adopted_on,
 * signer_stakeholder_ids, recitals, document_id} and the legacy store shape
 * {type, title, adopted_at, signers, summary, code}.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const sb = supabaseAdmin();
    const { data: entityId, error: entityErr } = await sb.rpc('acct_default_entity', { p_tenant_id: DEFAULT_TENANT_ID });
    if (entityErr) return err('ENTITY_FAILED', entityErr.message);

    const rawType = String(body.approval_type ?? body.type ?? 'other');
    const approvalType = APPROVAL_TYPES.includes(rawType) ? rawType : 'other';
    const adoptedOn = String(body.adopted_on ?? body.adopted_at ?? '');
    if (!adoptedOn) return err('VALIDATION', 'adopted_on is required.');
    const method = String(body.approval_method ?? 'written_consent');
    if (!['written_consent', 'meeting'].includes(method)) return err('VALIDATION', 'approval_method must be written_consent or meeting.');

    const signers = body.signer_stakeholder_ids ?? body.signers ?? [];
    const signerIds = (Array.isArray(signers) ? signers : []).filter(
      (s): s is string => typeof s === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s),
    );
    const recitals: Record<string, unknown> =
      body.recitals && typeof body.recitals === 'object' ? body.recitals : {};
    if (body.title) recitals.title = String(body.title);
    if (body.code) recitals.code = String(body.code);
    if (body.summary) recitals.summary = String(body.summary);

    const { data, error } = await sb
      .from('cap_board_approvals')
      .insert({
        tenant_id: DEFAULT_TENANT_ID,
        entity_id: entityId,
        approval_type: approvalType,
        approval_method: method,
        adopted_on: adoptedOn,
        document_id: body.document_id ?? null,
        signer_stakeholder_ids: signerIds,
        recitals,
      })
      .select()
      .single();
    if (error) return err('CREATE_FAILED', error.message);
    return NextResponse.json({ data }, { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to record board approval.';
    return err('CREATE_FAILED', message);
  }
}
