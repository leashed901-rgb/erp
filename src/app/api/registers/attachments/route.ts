import { NextResponse, NextRequest } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

/**
 * GET /api/registers/attachments?entityType=&entityId= — file
 * attachments on accounting records (Batch I, read-only here).
 * Attachments are written by the upload flow, not by hand; the
 * register shows what is attached where, with the storage path,
 * mime, size and sha256.
 */
export async function GET(req: NextRequest) {
  const q = new URL(req.url).searchParams;
  const entityType = q.get('entityType');
  const entityId = q.get('entityId');
  let query = supabaseAdmin().from('acct_attachments').select('*').eq('tenant_id', DEFAULT_TENANT_ID).order('created_at', { ascending: false }).limit(200);
  if (entityType) query = query.eq('entity_type', entityType);
  if (entityId) query = query.eq('entity_id', entityId);
  const { data, error } = await query;
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({
    data: ((data ?? []) as Record<string, unknown>[]).map((a) => ({
      id: a.id,
      entityType: a.entity_type,
      entityId: a.entity_id,
      fileName: a.file_name,
      storagePath: a.storage_path,
      mime: a.mime,
      size: a.size,
      sha256: a.sha256,
    })),
  });
}
