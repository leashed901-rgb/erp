import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

/**
 * POST /api/parties/[id]/roles — add a role to an existing party
 * (registered action `party.add_role`). One record per human, many
 * roles: this NEVER creates a second party — platform_party_add_role
 * creates the role projection for the same spine id.
 * Body: { role, details? }. Returns the role record's id.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'Invalid JSON body', requestId: crypto.randomUUID() } },
      { status: 400 },
    );
  }
  const role = body.role ? String(body.role) : '';
  if (!role) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'role is required', requestId: crypto.randomUUID() } },
      { status: 400 },
    );
  }

  const { data, error } = await supabaseAdmin().rpc('platform_party_add_role', {
    p_party_id: id,
    p_role: role,
    p_details: (body.details as Record<string, unknown>) || {},
  });
  if (error) {
    return NextResponse.json(
      { error: { code: 'INTERNAL', message: error.message, requestId: crypto.randomUUID() } },
      { status: 500 },
    );
  }
  return NextResponse.json({ data: { party_id: id, role, record_id: data } }, { status: 201 });
}
