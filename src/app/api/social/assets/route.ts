import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { toMediaAsset } from '@/lib/socialTypes';
import { firstPartySellerId } from '@/lib/socialServer';

/* Media library (doc 23: social_media_assets). Uploads land in
   storage; this surface lists and registers the assets the
   composer can attach. Design mockups arrive as registered assets
   with their storage path. */

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

export async function GET() {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('social_media_assets')
    .select('*')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: (data || []).map((r) => toMediaAsset(r as Record<string, unknown>)) });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const storagePath = typeof body.storagePath === 'string' && body.storagePath.trim() ? body.storagePath.trim() : null;
  const mimeType = typeof body.mimeType === 'string' && body.mimeType.trim() ? body.mimeType.trim() : null;
  if (!storagePath || !mimeType) return err('VALIDATION', 'storagePath and mimeType are required', 400);
  const sellerId = await firstPartySellerId();
  if (!sellerId) return err('CONFLICT', 'The tenant has no first-party seller — set one up before adding assets', 409);
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('social_media_assets')
    .insert({
      tenant_id: DEFAULT_TENANT_ID,
      seller_id: sellerId,
      storage_bucket: typeof body.storageBucket === 'string' ? body.storageBucket : 'social-media',
      storage_path: storagePath,
      mime_type: mimeType,
      size_bytes: typeof body.sizeBytes === 'number' ? body.sizeBytes : null,
    })
    .select('*')
    .single();
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: toMediaAsset(data as Record<string, unknown>) }, { status: 201 });
}
