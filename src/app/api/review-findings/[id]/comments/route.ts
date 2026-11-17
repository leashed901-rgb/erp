import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

/** GET /api/review-findings/[id]/comments — comments on a finding. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data, error } = await supabaseAdmin()
    .from('acct_review_comments')
    .select('id,finding_id,body,created_at')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('finding_id', id)
    .order('created_at', { ascending: true });
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: data ?? [] });
}

/** POST /api/review-findings/[id]/comments — add a comment. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return err('VALIDATION', 'Invalid JSON', 400);
  }
  const text = String(body.body || '').trim();
  if (!text) return err('VALIDATION', 'body is required', 400);
  const { data: finding } = await supabaseAdmin()
    .from('acct_review_findings')
    .select('id')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('id', id)
    .maybeSingle();
  if (!finding) return err('NOT_FOUND', 'Review finding not found', 404);
  const { data, error } = await supabaseAdmin()
    .from('acct_review_comments')
    .insert({ tenant_id: DEFAULT_TENANT_ID, finding_id: id, body: text })
    .select('id,finding_id,body,created_at')
    .single();
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data }, { status: 201 });
}
