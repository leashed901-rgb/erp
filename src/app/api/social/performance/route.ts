import { NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import type { NetworkPerformance } from '@/lib/socialTypes';

/* Performance (doc 23): per-network delivery performance from
   social_post_networks — published / failed / scheduled / draft
   counts per channel, plus post totals. Engagement metrics are not
   stored in this schema; delivery is what the platform records. */

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

export async function GET() {
  const sb = supabaseAdmin();
  const { data: nets, error } = await sb
    .from('social_post_networks')
    .select('network, status')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .limit(5000);
  if (error) return err('INTERNAL', error.message, 500);
  const byNetwork = new Map<string, NetworkPerformance>();
  for (const n of nets || []) {
    const row = n as Record<string, unknown>;
    const network = String(row.network);
    if (!byNetwork.has(network)) byNetwork.set(network, { network, published: 0, failed: 0, scheduled: 0, draft: 0 });
    const entry = byNetwork.get(network)!;
    const s = String(row.status);
    if (s === 'published') entry.published++;
    else if (s === 'failed') entry.failed++;
    else if (s === 'scheduled') entry.scheduled++;
    else entry.draft++;
  }
  const { data: posts } = await sb
    .from('social_posts')
    .select('status')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .limit(5000);
  const postCounts: Record<string, number> = {};
  for (const p of posts || []) {
    const s = String((p as Record<string, unknown>).status);
    postCounts[s] = (postCounts[s] || 0) + 1;
  }
  return NextResponse.json({
    data: {
      byNetwork: [...byNetwork.values()].sort((a, b) => b.published - a.published),
      posts: postCounts,
    },
  });
}
