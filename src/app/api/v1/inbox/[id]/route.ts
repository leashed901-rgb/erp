import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/** GET /api/v1/inbox/[id] — one inbox row + a fresh signed file URL. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data, error } = await supabaseAdmin()
    .from('acct_document_inbox')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .single();
  if (error || !data) {
    return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Inbox row not found', requestId: crypto.randomUUID() } }, { status: 404 });
  }
  let fileUrl: string | null = null;
  if (data.storage_path) {
    const { data: signed } = await supabaseAdmin()
      .storage.from('design-private')
      .createSignedUrl(data.storage_path as string, 3600);
    fileUrl = signed?.signedUrl || null;
  }
  return NextResponse.json({ data: { ...data, file_url: fileUrl } });
}

const PATCHABLE = ['vendor_id', 'doc_number', 'doc_date', 'due_date', 'total', 'status', 'matched_bank_transaction_id', 'created_bill_id', 'created_spend_id', 'error', 'extracted'];

/** PATCH /api/v1/inbox/[id] — updates the review fields. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: { code: 'VALIDATION', message: 'Invalid JSON', requestId: crypto.randomUUID() } }, { status: 400 });
  }
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const f of PATCHABLE) {
    if (body[f] !== undefined) patch[f] = body[f];
  }
  if (Object.keys(patch).length === 1) {
    return NextResponse.json({ error: { code: 'VALIDATION', message: 'Nothing to update', requestId: crypto.randomUUID() } }, { status: 400 });
  }
  const { data, error } = await supabaseAdmin()
    .from('acct_document_inbox')
    .update(patch)
    .eq('id', id)
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .select('*')
    .single();
  if (error) {
    return NextResponse.json({ error: { code: 'INTERNAL', message: error.message, requestId: crypto.randomUUID() } }, { status: 500 });
  }
  return NextResponse.json({ data });
}

/** DELETE /api/v1/inbox/[id] — removes the row (and its stored file). */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data: row } = await supabaseAdmin()
    .from('acct_document_inbox')
    .select('storage_path')
    .eq('id', id)
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .single();
  const { error } = await supabaseAdmin()
    .from('acct_document_inbox')
    .delete()
    .eq('id', id)
    .eq('tenant_id', DEFAULT_TENANT_ID);
  if (error) {
    return NextResponse.json({ error: { code: 'INTERNAL', message: error.message, requestId: crypto.randomUUID() } }, { status: 500 });
  }
  if (row?.storage_path) {
    await supabaseAdmin().storage.from('design-private').remove([row.storage_path as string]);
  }
  return NextResponse.json({ data: { deleted: id } });
}
