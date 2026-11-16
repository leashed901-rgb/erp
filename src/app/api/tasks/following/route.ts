import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { toFollower } from '@/lib/taskTypes';
import { tenantOperatorUserId } from '@/lib/supportServer';

/* Following (doc 27) over platform_record_followers —
   registry action record.follow. */
function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

export async function GET() {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('platform_record_followers')
    .select('*')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: (data || []).map((r) => toFollower(r as Record<string, unknown>)) });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const relatedType = typeof body.relatedType === 'string' ? body.relatedType : null;
  const relatedId = typeof body.relatedId === 'string' ? body.relatedId : null;
  if (!relatedType || !relatedId) return err('VALIDATION', 'relatedType and relatedId are required', 400);
  const userId = typeof body.userId === 'string' ? body.userId : await tenantOperatorUserId();
  if (!userId) return err('INTERNAL', 'No user to follow as', 500);
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('platform_record_followers')
    .insert({
      tenant_id: DEFAULT_TENANT_ID,
      user_id: userId,
      related_type: relatedType,
      related_id: relatedId,
      reason: typeof body.reason === 'string' && ['manual', 'mentioned', 'assigned', 'created', 'commented'].includes(body.reason) ? body.reason : 'manual',
    })
    .select('*')
    .single();
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: toFollower(data as Record<string, unknown>) }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return err('VALIDATION', 'id query param required', 400);
  const sb = supabaseAdmin();
  const { error } = await sb.from('platform_record_followers').delete().eq('tenant_id', DEFAULT_TENANT_ID).eq('id', id);
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: { id, deleted: true } });
}
