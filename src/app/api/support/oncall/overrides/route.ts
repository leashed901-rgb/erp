import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/* On-call overrides (doc 26) over support_oncall_overrides —
   registry action create.oncall_override. */
function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

export async function GET() {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('support_oncall_overrides')
    .select('*')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .order('starts_at', { ascending: true })
    .limit(200);
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({
    data: (data || []).map((r) => {
      const row = r as Record<string, unknown>;
      return {
        id: String(row.id),
        scheduleId: String(row.schedule_id || ''),
        staffId: String(row.staff_id || ''),
        startsAt: String(row.starts_at || ''),
        endsAt: String(row.ends_at || ''),
        reason: typeof row.reason === 'string' ? row.reason : null,
      };
    }),
  });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const scheduleId = typeof body.scheduleId === 'string' ? body.scheduleId : null;
  const staffId = typeof body.staffId === 'string' ? body.staffId : null;
  const startsAt = typeof body.startsAt === 'string' ? body.startsAt : null;
  const endsAt = typeof body.endsAt === 'string' ? body.endsAt : null;
  if (!scheduleId || !staffId || !startsAt || !endsAt) return err('VALIDATION', 'scheduleId, staffId, startsAt and endsAt are required', 400);
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('support_oncall_overrides')
    .insert({
      tenant_id: DEFAULT_TENANT_ID,
      schedule_id: scheduleId,
      staff_id: staffId,
      starts_at: startsAt,
      ends_at: endsAt,
      reason: typeof body.reason === 'string' ? body.reason : null,
    })
    .select('*')
    .single();
  if (error) return err('INTERNAL', error.message, 500);
  const row = data as Record<string, unknown>;
  return NextResponse.json({
    data: {
      id: String(row.id),
      scheduleId: String(row.schedule_id || ''),
      staffId: String(row.staff_id || ''),
      startsAt: String(row.starts_at || ''),
      endsAt: String(row.ends_at || ''),
      reason: typeof row.reason === 'string' ? row.reason : null,
    },
  }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return err('VALIDATION', 'id query param required', 400);
  const sb = supabaseAdmin();
  const { error } = await sb.from('support_oncall_overrides').delete().eq('tenant_id', DEFAULT_TENANT_ID).eq('id', id);
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: { id, deleted: true } });
}
