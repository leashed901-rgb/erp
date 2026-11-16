import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

/** GET /api/review-ignore-rules — standing ignore rules for review checks. */
export async function GET() {
  const { data, error } = await supabaseAdmin()
    .from('acct_review_ignore_rules')
    .select('*')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .order('created_at', { ascending: false });
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: data ?? [] });
}

/**
 * POST /api/review-ignore-rules — add a rule (Batch G). At least the
 * check code or a title match is needed — a rule with no scope would
 * ignore everything. reason is required: ignoring a check is a
 * decision, and the decision needs a recorded reason.
 */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return err('VALIDATION', 'Invalid JSON', 400);
  }
  const checkCode = String(body.checkCode || '').trim() || null;
  const titleContains = String(body.titleContains || '').trim() || null;
  const reason = String(body.reason || '').trim();
  if (!checkCode && !titleContains) {
    return err('VALIDATION', 'checkCode or titleContains is required', 400);
  }
  if (!reason) return err('VALIDATION', 'reason is required', 400);
  const { data, error } = await supabaseAdmin()
    .from('acct_review_ignore_rules')
    .insert({
      tenant_id: DEFAULT_TENANT_ID,
      check_code: checkCode,
      account_id: (body.accountId as string) || null,
      source_id: (body.sourceId as string) || null,
      title_contains: titleContains,
      reason,
    })
    .select('*')
    .single();
  if (error) return err('VALIDATION', error.message, 400);
  return NextResponse.json({ data }, { status: 201 });
}
