import { NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/* Who's on call right now (doc 26) — the support_v_oncall_now view. */
export async function GET() {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('support_v_oncall_now')
    .select('*')
    .eq('tenant_id', DEFAULT_TENANT_ID);
  if (error) return NextResponse.json({ error: { code: 'INTERNAL', message: error.message, requestId: crypto.randomUUID() } }, { status: 500 });
  return NextResponse.json({
    data: (data || []).map((r) => {
      const row = r as Record<string, unknown>;
      return {
        scheduleId: String(row.schedule_id || ''),
        scheduleName: String(row.schedule_name || ''),
        teamId: row.team_id ? String(row.team_id) : null,
        staffId: row.staff_id ? String(row.staff_id) : null,
        staffName: row.staff_name ? String(row.staff_name) : null,
      };
    }),
  });
}
