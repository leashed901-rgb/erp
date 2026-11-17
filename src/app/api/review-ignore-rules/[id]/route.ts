import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

/** DELETE /api/review-ignore-rules/[id] — remove a standing ignore rule. */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await supabaseAdmin()
    .from('acct_review_ignore_rules')
    .delete()
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('id', id);
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: { id, deleted: true } });
}
