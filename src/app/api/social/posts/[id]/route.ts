import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { loadPost } from '@/lib/socialServer';

/* Post detail + updates (doc 23): caption/schedule edits, status
   transitions (approve from Oversight stamps approved_by and moves
   the post to scheduled when it has a time, cancel, publish-now). */

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

const POST_STATUSES = ['draft', 'scheduled', 'publishing', 'published', 'failed', 'cancelled'];

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const post = await loadPost(id);
  if (!post) return err('NOT_FOUND', 'Post not found', 404);
  return NextResponse.json({ data: post });
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const sb = supabaseAdmin();
  const { data: current } = await sb
    .from('social_posts')
    .select('id, status, scheduled_at')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('id', id)
    .maybeSingle();
  if (!current) return err('NOT_FOUND', 'Post not found', 404);

  const patch: Record<string, unknown> = {};
  if (typeof body.caption === 'string' && body.caption.trim()) patch.caption = body.caption.trim();
  if (typeof body.title === 'string') patch.title = body.title;
  if (typeof body.scheduledAt === 'string') patch.scheduled_at = body.scheduledAt || null;
  if (typeof body.note === 'string' || body.note === null) patch.error = body.note;
  if (body.approve === false) {
    patch.approved_by = null;
    patch.status = 'draft';
  }
  if (body.approve === true) {
    /* approved_by is a uuid FK to the platform's users — resolve the
       reviewer to a real user id (an explicit uuid wins; otherwise
       the platform's first staff user). */
    let approver: string | null = null;
    if (typeof body.approvedBy === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.approvedBy)) {
      approver = body.approvedBy;
    } else {
      const { data: users } = await sb.auth.admin.listUsers({ page: 1, perPage: 1 });
      approver = users?.users?.[0]?.id ?? null;
    }
    patch.approved_by = approver;
    const when = typeof body.scheduledAt === 'string' ? body.scheduledAt : (current.scheduled_at as string | null);
    patch.status = when ? 'scheduled' : 'draft';
  }
  if (typeof body.status === 'string') {
    if (!POST_STATUSES.includes(body.status)) return err('VALIDATION', `status must be one of ${POST_STATUSES.join(', ')}`, 400);
    patch.status = body.status;
    if (body.status === 'publishing' && !patch.scheduled_at && !current.scheduled_at) {
      patch.scheduled_at = new Date().toISOString();
    }
  }
  if (!Object.keys(patch).length) return err('VALIDATION', 'nothing to update', 400);

  const { error } = await sb.from('social_posts').update(patch).eq('tenant_id', DEFAULT_TENANT_ID).eq('id', id);
  if (error) return err('INTERNAL', error.message, 500);

  /* Keep network rows in step with the post's state. */
  if (patch.status === 'cancelled') {
    await sb.from('social_post_networks').update({ status: 'draft' }).eq('tenant_id', DEFAULT_TENANT_ID).eq('social_post_id', id).eq('status', 'scheduled');
    await sb.from('social_post_targets').update({ status: 'skipped' }).eq('tenant_id', DEFAULT_TENANT_ID).eq('post_id', id).eq('status', 'queued');
  } else if (patch.status === 'scheduled' || patch.status === 'publishing') {
    await sb.from('social_post_networks').update({ status: 'scheduled' }).eq('tenant_id', DEFAULT_TENANT_ID).eq('social_post_id', id).eq('status', 'draft');
    await sb.from('social_post_targets').update({ status: 'queued' }).eq('tenant_id', DEFAULT_TENANT_ID).eq('post_id', id).eq('status', 'skipped');
  }

  const post = await loadPost(id);
  return NextResponse.json({ data: post });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const sb = supabaseAdmin();
  const { data: current } = await sb
    .from('social_posts')
    .select('id, status')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('id', id)
    .maybeSingle();
  if (!current) return err('NOT_FOUND', 'Post not found', 404);
  if (current.status === 'published') return err('CONFLICT', 'A published post cannot be deleted — cancel is only for unpublished work', 409);
  await sb.from('social_post_networks').delete().eq('tenant_id', DEFAULT_TENANT_ID).eq('social_post_id', id);
  await sb.from('social_post_targets').delete().eq('tenant_id', DEFAULT_TENANT_ID).eq('post_id', id);
  const { error } = await sb.from('social_posts').delete().eq('tenant_id', DEFAULT_TENANT_ID).eq('id', id);
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: { id, deleted: true } });
}
