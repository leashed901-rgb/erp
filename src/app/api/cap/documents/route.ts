import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status = 400) {
  return NextResponse.json({ error: { code, message } }, { status });
}

const DOC_TYPES = ['board_consent', 'stockholder_consent', 'stock_certificate', 'stock_purchase_agreement', 'safe', 'convertible_note', '409a_report', 'equity_plan', 'grant_agreement', 'exercise_notice', '83b_election', 'charter', 'bylaws', 'side_letter', 'other'];

/** POST /api/cap/documents — inserts a cap document row (cap_documents). */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const title = String(body.title ?? '').trim();
    if (!title) return err('VALIDATION', 'title is required.');
    const type = String(body.document_type ?? body.type ?? 'other');
    if (!DOC_TYPES.includes(type)) return err('VALIDATION', `document_type must be one of: ${DOC_TYPES.join(', ')}`);
    const sb = supabaseAdmin();
    const { data: entityId } = await sb.rpc('acct_default_entity', { p_tenant_id: DEFAULT_TENANT_ID });
    const { data, error } = await sb
      .from('cap_documents')
      .insert({
        tenant_id: DEFAULT_TENANT_ID,
        entity_id: entityId ?? null,
        document_type: type,
        title,
        storage_path: body.storage_path ?? null,
        file_url: body.file_url ?? null,
        signed_on: body.signed_on ?? null,
        status: body.status ?? 'draft',
        related_type: body.related_type ?? null,
        related_id: body.related_id ?? null,
      })
      .select()
      .single();
    if (error) return err('CREATE_FAILED', error.message);
    return NextResponse.json({ data }, { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to create document.';
    return err('CREATE_FAILED', message);
  }
}
