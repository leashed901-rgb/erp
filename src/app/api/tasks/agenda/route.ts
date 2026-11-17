import { NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/* Agenda (doc 27) — the platform_v_agenda view: tasks, events and
   appointments in one chronological feed. */
export async function GET() {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('platform_v_agenda')
    .select('*')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .order('starts_at', { ascending: true })
    .limit(300);
  if (error) return NextResponse.json({ error: { code: 'INTERNAL', message: error.message, requestId: crypto.randomUUID() } }, { status: 500 });
  return NextResponse.json({
    data: (data || []).map((r) => {
      const row = r as Record<string, unknown>;
      return {
        kind: String(row.kind || ''),
        id: String(row.id || ''),
        title: String(row.title || ''),
        startsAt: typeof row.starts_at === 'string' ? row.starts_at : null,
        endsAt: typeof row.ends_at === 'string' ? row.ends_at : null,
        status: typeof row.status === 'string' ? row.status : null,
      };
    }),
  });
}
