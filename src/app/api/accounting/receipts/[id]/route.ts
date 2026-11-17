import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/* Edit one receipt intake: reviewer-confirmed fields upsert the
   acct_receipt_extractions row (status 'manual' when a person typed
   them), the intended category rides raw_extraction, and review
   state flips acct_document_inbox.status for_review ↔ processed. */

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const sb = supabaseAdmin();
  const { data: inbox, error: readErr } = await sb
    .from('acct_document_inbox')
    .select('id, attachment_id, status')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('id', id)
    .maybeSingle();
  if (readErr) return err('INTERNAL', readErr.message, 500);
  if (!inbox) return err('NOT_FOUND', 'Receipt not found', 404);
  const row = inbox as { attachment_id: string | null };

  const touchesExtraction =
    'vendorName' in body || 'receiptDate' in body || 'total' in body || 'taxAmount' in body || 'categoryAccountId' in body || 'notes' in body;
  if (touchesExtraction) {
    const { data: ext } = await sb
      .from('acct_receipt_extractions')
      .select('id, raw_extraction')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .eq('inbox_id', id)
      .maybeSingle();
    const raw = { ...(((ext as { raw_extraction?: Record<string, unknown> } | null)?.raw_extraction || {}) as Record<string, unknown>) };
    if ('categoryAccountId' in body) {
      if (typeof body.categoryAccountId === 'string' && body.categoryAccountId) raw.categoryAccountId = body.categoryAccountId;
      else delete raw.categoryAccountId;
    }
    if ('notes' in body) {
      if (typeof body.notes === 'string' && body.notes) raw.notes = body.notes;
      else delete raw.notes;
    }
    const fields: Record<string, unknown> = { raw_extraction: raw };
    if (typeof body.vendorName === 'string') fields.vendor_name = body.vendorName;
    if (typeof body.receiptDate === 'string') fields.receipt_date = body.receiptDate || null;
    if (typeof body.total === 'number') fields.extracted_total = body.total;
    if (typeof body.taxAmount === 'number') fields.tax_amount = body.taxAmount;
    if (ext) {
      const { error } = await sb.from('acct_receipt_extractions').update(fields).eq('tenant_id', DEFAULT_TENANT_ID).eq('id', (ext as { id: string }).id);
      if (error) return err('INTERNAL', error.message, 500);
    } else {
      const { error } = await sb.from('acct_receipt_extractions').insert({
        tenant_id: DEFAULT_TENANT_ID,
        inbox_id: id,
        attachment_id: row.attachment_id,
        status: 'manual',
        ...fields,
      });
      if (error) return err('INTERNAL', error.message, 500);
    }
    const inboxPatch: Record<string, unknown> = {};
    if (typeof body.receiptDate === 'string') inboxPatch.doc_date = body.receiptDate || null;
    if (typeof body.total === 'number') inboxPatch.total = body.total;
    if (Object.keys(inboxPatch).length) {
      await sb.from('acct_document_inbox').update(inboxPatch).eq('tenant_id', DEFAULT_TENANT_ID).eq('id', id);
    }
  }

  if (typeof body.status === 'string') {
    const next = body.status === 'reviewed' ? 'processed' : body.status === 'review' ? 'for_review' : null;
    if (next) {
      const { error } = await sb.from('acct_document_inbox').update({ status: next }).eq('tenant_id', DEFAULT_TENANT_ID).eq('id', id);
      if (error) return err('INTERNAL', error.message, 500);
    }
  }
  return NextResponse.json({ data: { id, updated: true } });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const sb = supabaseAdmin();
  await sb.from('acct_receipt_extractions').delete().eq('tenant_id', DEFAULT_TENANT_ID).eq('inbox_id', id);
  const { error } = await sb.from('acct_document_inbox').delete().eq('tenant_id', DEFAULT_TENANT_ID).eq('id', id);
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: { id, deleted: true } });
}
