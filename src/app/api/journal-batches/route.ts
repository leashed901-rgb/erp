import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

/** GET /api/journal-batches — journal batches with entry counts. */
export async function GET(req: NextRequest) {
  const sp = new URL(req.url).searchParams;
  const limit = Math.min(Number(sp.get('limit') || 100), 500);
  const { data, error } = await supabaseAdmin()
    .from('acct_journal_batches')
    .select('*')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) return err('INTERNAL', error.message, 500);
  const rows = (data ?? []) as Record<string, unknown>[];
  const ids = rows.map((r) => r.id as string);
  const counts = new Map<string, number>();
  // Chunk the .in() — 400+ ids in one URL fails silently and every
  // batch would report 0 entries.
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const { data: entries } = await supabaseAdmin()
      .from('acct_journal_entries')
      .select('batch_id')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .in('batch_id', chunk);
    for (const e of (entries ?? []) as { batch_id: string | null }[]) {
      if (e.batch_id) counts.set(e.batch_id, (counts.get(e.batch_id) ?? 0) + 1);
    }
  }
  return NextResponse.json({
    data: rows.map((r) => ({
      id: r.id, batchNo: r.batch_no, source: r.source, status: r.status,
      description: r.description, entryCount: counts.get(r.id as string) ?? 0,
      createdAt: r.created_at, postedAt: r.posted_at,
    })),
  });
}
