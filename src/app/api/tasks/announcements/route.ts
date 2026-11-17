import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { toAnnouncement } from '@/lib/taskTypes';
import { tenantOperatorUserId } from '@/lib/supportServer';

/* Team announcements (doc 27) over platform_announcements +
   platform_announcement_reads. */
function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

export async function GET() {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('platform_announcements')
    .select('*')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .order('is_pinned', { ascending: false })
    .order('published_at', { ascending: false })
    .limit(100);
  if (error) return err('INTERNAL', error.message, 500);
  const userId = await tenantOperatorUserId();
  let readIds = new Set<string>();
  if (userId && (data || []).length) {
    const { data: reads } = await sb
      .from('platform_announcement_reads')
      .select('announcement_id')
      .eq('user_id', userId)
      .in('announcement_id', (data || []).map((r) => String((r as { id: string }).id)));
    readIds = new Set((reads || []).map((r) => String((r as { announcement_id: string }).announcement_id)));
  }
  return NextResponse.json({
    data: (data || []).map((r) => ({ ...toAnnouncement(r as Record<string, unknown>), readByMe: readIds.has(String((r as { id: string }).id)) })),
  });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const sb = supabaseAdmin();

  if (body.action === 'mark_read') {
    const announcementId = typeof body.announcementId === 'string' ? body.announcementId : null;
    if (!announcementId) return err('VALIDATION', 'announcementId is required', 400);
    const userId = await tenantOperatorUserId();
    if (!userId) return err('INTERNAL', 'No user to mark read as', 500);
    const { error } = await sb
      .from('platform_announcement_reads')
      .upsert({ announcement_id: announcementId, user_id: userId, tenant_id: DEFAULT_TENANT_ID }, { onConflict: 'announcement_id,user_id' });
    if (error) return err('INTERNAL', error.message, 500);
    return NextResponse.json({ data: { announcementId, readByMe: true } });
  }

  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const text = typeof body.body === 'string' ? body.body.trim() : '';
  if (!title || !text) return err('VALIDATION', 'title and body are required', 400);
  const userId = await tenantOperatorUserId();
  const { data, error } = await sb
    .from('platform_announcements')
    .insert({
      tenant_id: DEFAULT_TENANT_ID,
      title,
      body: text,
      audience: typeof body.audience === 'string' ? body.audience : 'all',
      is_pinned: Boolean(body.isPinned),
      published_at: new Date().toISOString(),
      expires_at: typeof body.expiresAt === 'string' ? body.expiresAt : null,
      created_by: userId,
    })
    .select('*')
    .single();
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: toAnnouncement(data as Record<string, unknown>) }, { status: 201 });
}
