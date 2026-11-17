import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

/**
 * POST /api/parties/[id]/merge — merge a duplicate party INTO another
 * (registered action `party.merge`, admin). Body: { into_id }.
 * Delegates to the platform_party_merge RPC: the [id] record is the
 * duplicate (p_from), into_id is the survivor (p_into). Returns the
 * number of rows the merge linked to the survivor.
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
  const intoId = body.into_id ? String(body.into_id) : '';
  if (!intoId) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'into_id is required', requestId: crypto.randomUUID() } },
      { status: 400 },
    );
  }
  if (intoId === id) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'Cannot merge a party into itself', requestId: crypto.randomUUID() } },
      { status: 400 },
    );
  }

  const { data, error } = await supabaseAdmin().rpc('platform_party_merge', { p_from: id, p_into: intoId });
  if (error) {
    return NextResponse.json(
      { error: { code: 'INTERNAL', message: error.message, requestId: crypto.randomUUID() } },
      { status: 500 },
    );
  }
  return NextResponse.json({ data: { merged_from: id, merged_into: intoId, rows_linked: data } });
}
