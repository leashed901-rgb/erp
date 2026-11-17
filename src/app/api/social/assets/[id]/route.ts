import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/* Media asset delete (doc 23: Content Library). Soft-deletes the row
   (the list filters deleted_at IS NULL) and removes the stored object
   best-effort — a storage failure does not block the row delete. */

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const sb = supabaseAdmin();
  const { data: current } = await sb
    .from('social_media_assets')
    .select('id, storage_bucket, storage_path')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  if (!current) return err('NOT_FOUND', 'Asset not found', 404);
  const { error } = await sb
    .from('social_media_assets')
    .update({ deleted_at: new Date().toISOString() })
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('id', id);
  if (error) return err('INTERNAL', error.message, 500);
  const row = current as { storage_bucket: string; storage_path: string };
  if (row.storage_bucket && row.storage_path) {
    await sb.storage.from(row.storage_bucket).remove([row.storage_path]);
  }
  return NextResponse.json({ data: { id, deleted: true } });
}
