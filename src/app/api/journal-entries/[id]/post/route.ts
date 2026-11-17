import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

/** POST /api/journal-entries/[id]/post — journal.post_draft. */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data: entry } = await supabaseAdmin()
    .from('acct_journal_entries')
    .select('id, status')
    .eq('id', id)
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .single();
  if (!entry) return err('NOT_FOUND', 'Journal entry not found', 404);
  if (entry.status !== 'draft') {
    return err('VALIDATION', `Only a draft can be posted (status is ${entry.status})`, 400);
  }
  const { data, error } = await supabaseAdmin().rpc('acct_post_draft_journal', {
    p_journal_id: id,
  });
  if (error) return err('VALIDATION', error.message, 400);
  return NextResponse.json({ data: { id: data || id }, message: 'Journal entry posted' });
}
