import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { toMediaAsset } from '@/lib/socialTypes';
import { firstPartySellerId } from '@/lib/socialServer';

/* Media upload (doc 23: Content Library). Accepts one multipart file,
   stores it in the tenant's 'social-media' storage bucket, and registers
   the asset row the composer attaches to posts. The bucket is private;
   the library shows metadata, not a public URL. */

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return err('VALIDATION', 'a non-empty file field is required', 400);
  }
  if (!/^image\//.test(file.type) && !/^video\//.test(file.type)) {
    return err('VALIDATION', 'only image or video files are accepted', 400);
  }
  const sellerId = await firstPartySellerId();
  if (!sellerId) return err('CONFLICT', 'The tenant has no first-party seller — set one up before adding assets', 409);

  const safeName = file.name.replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 120) || 'upload';
  const path = `uploads/${crypto.randomUUID()}-${safeName}`;
  const sb = supabaseAdmin();
  const bytes = new Uint8Array(await file.arrayBuffer());
  const { error: upErr } = await sb.storage.from('social-media').upload(path, bytes, {
    contentType: file.type,
    upsert: false,
  });
  if (upErr) return err('INTERNAL', `storage upload failed: ${upErr.message}`, 502);

  const { data, error } = await sb
    .from('social_media_assets')
    .insert({
      tenant_id: DEFAULT_TENANT_ID,
      seller_id: sellerId,
      storage_bucket: 'social-media',
      storage_path: path,
      mime_type: file.type,
      size_bytes: file.size,
    })
    .select('*')
    .single();
  if (error) {
    await sb.storage.from('social-media').remove([path]);
    return err('INTERNAL', error.message, 500);
  }
  return NextResponse.json({ data: toMediaAsset(data as Record<string, unknown>) }, { status: 201 });
}
