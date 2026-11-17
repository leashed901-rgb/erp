import { NextRequest, NextResponse } from 'next/server';
import { createHash, randomUUID } from 'crypto';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { apiError } from '@/lib/podServer';

/**
 * POST /api/v1/tech-packs/:id/preview-pdf — store a rendered tech pack PDF
 * and link it to the pack. multipart { file, kind }.
 * kind=internal → the staff-only master copy (classification 'internal',
 * bucket design-private), sets pdf_asset_id. kind=supplier → the
 * watermarked, costs-withheld copy (classification 'supplier_preview',
 * bucket supplier-previews), sets preview_pdf_asset_id — this is what
 * ds_publish_rfq requires before an RFQ can publish. The supplier copy is
 * a derivative of the internal master: the design_assets derivative check
 * requires derived_from_asset_id for supplier_preview rows, so the internal
 * copy must exist first (the preview screen renders it first when needed).
 * The internal master is 'internal', not 'production_release', because a
 * production_release also requires a parent asset and this design has no
 * source asset row to derive from — the formal production release is a
 * later step, derived from this master.
 */
const BUCKETS = { supplier: 'supplier-previews', internal: 'design-private' } as const;
const MAX_BYTES = 25 * 1024 * 1024;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: tpId } = await params;
    const { data: tp, error: tpError } = await supabaseAdmin()
      .from('tech_packs')
      .select('id,design_id,revision,status,pdf_asset_id')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .eq('id', tpId)
      .single();
    if (tpError || !tp) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Tech pack not found.', requestId: crypto.randomUUID() } },
        { status: 404 },
      );
    }
    const form = await req.formData();
    const kind = String(form.get('kind') ?? 'supplier');
    if (!['supplier', 'internal'].includes(kind)) {
      return apiError(`Unknown kind ${kind}.`, 422);
    }
    const file = form.get('file');
    if (!file || typeof file === 'string' || !('arrayBuffer' in file)) {
      return apiError('No file uploaded (form field "file").', 400);
    }
    const upload = file as File;
    if (upload.type !== 'application/pdf') {
      return apiError(`Expected a PDF, got ${upload.type}.`, 422);
    }
    if (upload.size > MAX_BYTES) {
      return apiError('File is over the 25 MB limit.', 422);
    }
    const bucket = BUCKETS[kind as keyof typeof BUCKETS];
    if (kind === 'supplier' && !tp.pdf_asset_id) {
      return apiError(
        'Generate the internal PDF first — the supplier preview is derived from it.',
        422,
      );
    }
    const storagePath = `${DEFAULT_TENANT_ID}/tech-packs/${tpId}/${kind}-rev${tp.revision}-${randomUUID()}.pdf`;
    const bytes = Buffer.from(await upload.arrayBuffer());
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const { error: upErr } = await supabaseAdmin().storage.from(bucket).upload(storagePath, bytes, {
      contentType: 'application/pdf',
      upsert: false,
    });
    if (upErr) throw new Error(`storage upload: ${upErr.message}`);
    const { data: asset, error: assetError } = await supabaseAdmin()
      .from('design_assets')
      .insert({
        tenant_id: DEFAULT_TENANT_ID,
        design_id: tp.design_id,
        kind: kind === 'supplier' ? 'tech_pack_preview' : 'tech_pack_pdf',
        classification: kind === 'supplier' ? 'supplier_preview' : 'internal',
        derived_from_asset_id: kind === 'supplier' ? tp.pdf_asset_id : null,
        storage_path: storagePath,
        bucket,
        mime_type: 'application/pdf',
        size_bytes: upload.size,
        sha256,
        watermark: kind === 'supplier' ? { supplier: true, text: 'SUPPLIER PREVIEW — costs withheld' } : null,
        metadata: { tech_pack_id: tpId, revision: tp.revision, kind },
      })
      .select('id,storage_path,bucket,mime_type,size_bytes,sha256')
      .single();
    if (assetError) {
      // Don't leave an orphaned object in the bucket when the row fails.
      await supabaseAdmin().storage.from(bucket).remove([storagePath]);
      throw new Error(`design_assets insert: ${assetError.message}`);
    }
    const patch =
      kind === 'supplier' ? { preview_pdf_asset_id: asset.id } : { pdf_asset_id: asset.id };
    const { error: patchError } = await supabaseAdmin()
      .from('tech_packs')
      .update(patch)
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .eq('id', tpId);
    if (patchError) throw new Error(`tech-packs link: ${patchError.message}`);
    return NextResponse.json({ asset_id: asset.id, storage_path: storagePath, sha256 }, { status: 201 });
  } catch (err) {
    return apiError(err instanceof Error ? err.message : 'Failed to store tech pack PDF.');
  }
}
