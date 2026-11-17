import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

/** GET /api/journal-batches/[id] — batch + its journal entries. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data: batch, error } = await supabaseAdmin()
    .from('acct_journal_batches')
    .select('*')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('id', id)
    .single();
  if (error || !batch) return err('NOT_FOUND', 'Journal batch not found', 404);
  const { data: entries } = await supabaseAdmin()
    .from('acct_journal_entries')
    .select('id,entry_no,entry_date,posting_date,source,reference,memo,total_debit,total_credit,status,reversed_by_id')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('batch_id', id)
    .order('entry_date', { ascending: false })
    .limit(200);
  const b = batch as Record<string, unknown>;
  return NextResponse.json({
    data: {
      id: b.id, batchNo: b.batch_no, source: b.source, status: b.status,
      description: b.description, createdAt: b.created_at, postedAt: b.posted_at,
      entries: entries ?? [],
    },
  });
}
