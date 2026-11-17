import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/**
 * GET /api/parties/duplicates?status=pending — the dedupe queue
 * (crm_duplicate_candidates), strongest matches first. Resolve a pair
 * with POST /api/parties/[record_a]/merge { into_id: record_b }.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status');
  let query = supabaseAdmin()
    .from('crm_duplicate_candidates')
    .select('*')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .order('match_score', { ascending: false })
    .limit(200);
  if (status) query = query.eq('status', status);
  const { data, error } = await query;
  if (error) {
    return NextResponse.json(
      { error: { code: 'INTERNAL', message: error.message, requestId: crypto.randomUUID() } },
      { status: 500 },
    );
  }
  return NextResponse.json({ data });
}
