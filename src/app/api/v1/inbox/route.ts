import { NextRequest, NextResponse } from 'next/server';
import { createHash, randomUUID } from 'crypto';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/**
 * The receipts inbox API (spec: the Receipts screen is the document inbox).
 * One family: /api/v1/inbox — rows live in acct_document_inbox, NOT in
 * acct_ar_receipts (those are sales receipts — money in from a customer).
 * An inbox row is an uploaded expense receipt awaiting review: it becomes
 * a bill (acct_inbox_create_bill RPC) or an expense (documents POST
 * type=Expense with inboxId), or it matches a bank transaction.
 */

const BUCKET = 'design-private';
const MAX_BYTES = 20 * 1024 * 1024;
const ALLOWED_MIME = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'application/pdf',
]);

const sanitize = (name: string) => name.replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 80) || 'receipt';

/** GET /api/v1/inbox — lists inbox rows, newest first. */
export async function GET() {
  const { data, error } = await supabaseAdmin()
    .from('acct_document_inbox')
    .select('*')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) {
    return NextResponse.json({ error: { code: 'INTERNAL', message: error.message, requestId: crypto.randomUUID() } }, { status: 500 });
  }
  let rows = data || [];
  // Attach the vendor name (vendor_id → acct_vendors legal_name; the spine
  // is the fallback — party ids ARE the vendor row ids).
  const vendorIds = [...new Set(rows.map((r: Record<string, unknown>) => r.vendor_id as string).filter(Boolean))];
  if (vendorIds.length > 0) {
    const [{ data: vendors }, { data: parties }] = await Promise.all([
      supabaseAdmin().from('acct_vendors').select('id, legal_name').in('id', vendorIds),
      supabaseAdmin().from('platform_parties').select('id, display_name, metadata').in('id', vendorIds),
    ]);
    const names = new Map<string, string>();
    for (const v of (vendors || []) as Array<Record<string, unknown>>) names.set(v.id as string, v.legal_name as string);
    for (const p of (parties || []) as Array<Record<string, unknown>>) {
      if (!names.has(p.id as string)) {
        names.set(p.id as string, (p.display_name as string) || ((p.metadata as Record<string, unknown>)?.name as string) || '');
      }
    }
    rows = rows.map((r: Record<string, unknown>) => ({ ...r, vendor_name: names.get(r.vendor_id as string) || '' }));
  }
  // Unmatched bank transactions for the match menu (matched_doc_id is null
  // while a movement is unclaimed). Empty today — listed honestly.
  const { data: bank } = await supabaseAdmin()
    .from('acct_bank_transactions')
    .select('id, transaction_date, amount, description, payee')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .is('matched_doc_id', null)
    .order('transaction_date', { ascending: false })
    .limit(20);
  // Bank accounts for the drawer's payment-account select.
  const { data: bankAccts } = await supabaseAdmin()
    .from('acct_bank_accounts')
    .select('id, name')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('is_active', true)
    .order('created_at', { ascending: true });
  // For converted rows, show what they became: the created expense's bank
  // account + category, and a bill number when the file was attached to one.
  const spendIds = [...new Set(rows.map((r: Record<string, unknown>) => r.created_spend_id as string).filter(Boolean))];
  if (spendIds.length > 0) {
    const [{ data: spends }, { data: spendLines }] = await Promise.all([
      supabaseAdmin().from('acct_spend_transactions').select('id, bank_account_id').in('id', spendIds),
      supabaseAdmin().from('acct_spend_lines').select('spend_id, account_id').in('spend_id', spendIds),
    ]);
    const bankById = new Map((bankAccts || []).map((a: Record<string, unknown>) => [a.id as string, a.name as string]));
    const acctIds2 = [...new Set((spendLines || []).map((l: Record<string, unknown>) => l.account_id as string).filter(Boolean))];
    let coaNames = new Map<string, string>();
    if (acctIds2.length > 0) {
      const { data: coa } = await supabaseAdmin().from('acct_chart_of_accounts').select('id, name').in('id', acctIds2);
      coaNames = new Map((coa || []).map((a: Record<string, unknown>) => [a.id as string, a.name as string]));
    }
    const spendById = new Map((spends || []).map((s: Record<string, unknown>) => [s.id as string, s]));
    const lineBySpend = new Map((spendLines || []).map((l: Record<string, unknown>) => [l.spend_id as string, l]));
    rows = rows.map((r: Record<string, unknown>) => {
      if (!r.created_spend_id) return r;
      const spend = spendById.get(r.created_spend_id as string) as Record<string, unknown> | undefined;
      const line = lineBySpend.get(r.created_spend_id as string) as Record<string, unknown> | undefined;
      return {
        ...r,
        expense_bank_name: spend ? bankById.get(spend.bank_account_id as string) || '' : '',
        expense_category: line?.account_id ? coaNames.get(line.account_id as string) || '' : '',
      };
    });
  }
  const attachIds = [...new Set(rows.map((r: Record<string, unknown>) => r.attachment_id as string).filter(Boolean))];
  if (attachIds.length > 0) {
    const { data: atts } = await supabaseAdmin()
      .from('acct_attachments')
      .select('id, entity_type, entity_id')
      .in('id', attachIds);
    const billIds = (atts || []).filter((a: Record<string, unknown>) => a.entity_type === 'acct_ap_bills').map((a: Record<string, unknown>) => a.entity_id as string);
    let billNums = new Map<string, string>();
    if (billIds.length > 0) {
      const { data: bills } = await supabaseAdmin().from('acct_ap_bills').select('id, bill_number').in('id', billIds);
      billNums = new Map((bills || []).map((b: Record<string, unknown>) => [b.id as string, b.bill_number as string]));
    }
    const attById = new Map((atts || []).map((a: Record<string, unknown>) => [a.id as string, a]));
    rows = rows.map((r: Record<string, unknown>) => {
      const att = r.attachment_id ? (attById.get(r.attachment_id as string) as Record<string, unknown> | undefined) : undefined;
      if (!att || att.entity_type !== 'acct_ap_bills') return r;
      return { ...r, attached_bill_number: billNums.get(att.entity_id as string) || '' };
    });
  }
  return NextResponse.json({ data: rows, meta: { unmatchedBank: bank || [], bankAccounts: bankAccts || [] } });
}

/** POST /api/v1/inbox — uploads a receipt file (multipart, field "file").
 *  Stores the bytes under <tenant>/receipts/ in the asset bucket and
 *  inserts the inbox row (doc_kind 'receipt', status 'for_review').
 *  No OCR exists — extracted stays empty; the user fills the fields in
 *  the drawer. Uploading the same file twice is a duplicate (the
 *  before-insert trigger sets status 'duplicate' by sha256). */
export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get('file');
    if (!file || typeof file === 'string' || !('arrayBuffer' in file)) {
      return NextResponse.json({ error: { code: 'VALIDATION', message: 'No file uploaded (form field "file")', requestId: crypto.randomUUID() } }, { status: 400 });
    }
    const upload = file as File;
    if (!ALLOWED_MIME.has(upload.type)) {
      return NextResponse.json({ error: { code: 'VALIDATION', message: `Unsupported file type ${upload.type}. PDF, JPG, PNG, WebP.`, requestId: crypto.randomUUID() } }, { status: 422 });
    }
    if (upload.size > MAX_BYTES) {
      return NextResponse.json({ error: { code: 'VALIDATION', message: 'File is over the 20 MB limit.', requestId: crypto.randomUUID() } }, { status: 422 });
    }
    const source = String(form.get('source') || 'upload');
    if (!['upload', 'photo', 'email', 'api'].includes(source)) {
      return NextResponse.json({ error: { code: 'VALIDATION', message: `Unknown source ${source}.`, requestId: crypto.randomUUID() } }, { status: 400 });
    }
    const bytes = Buffer.from(await upload.arrayBuffer());
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const storagePath = `${DEFAULT_TENANT_ID}/receipts/${randomUUID()}-${sanitize(upload.name)}`;
    const { error: upErr } = await supabaseAdmin()
      .storage.from(BUCKET)
      .upload(storagePath, bytes, { contentType: upload.type, upsert: false });
    if (upErr) {
      return NextResponse.json({ error: { code: 'INTERNAL', message: `storage upload: ${upErr.message}`, requestId: crypto.randomUUID() } }, { status: 500 });
    }
    const { data, error } = await supabaseAdmin()
      .from('acct_document_inbox')
      .insert({
        tenant_id: DEFAULT_TENANT_ID,
        doc_kind: 'receipt',
        source,
        storage_path: storagePath,
        file_name: upload.name,
        sha256,
        status: 'for_review',
        extracted: {},
      })
      .select('*')
      .single();
    if (error) {
      return NextResponse.json({ error: { code: 'INTERNAL', message: error.message, requestId: crypto.randomUUID() } }, { status: 500 });
    }
    // The file is also an attachment (entity: this inbox row) so it can be
    // re-pointed at a bill later — attach-to-bill moves this row's entity.
    const { data: att } = await supabaseAdmin()
      .from('acct_attachments')
      .insert({
        tenant_id: DEFAULT_TENANT_ID,
        entity_type: 'acct_document_inbox',
        entity_id: (data as Record<string, unknown>).id as string,
        file_name: upload.name,
        storage_path: storagePath,
        mime_type: upload.type,
        size_bytes: upload.size,
        sha256,
      })
      .select('id')
      .single();
    if (att) {
      await supabaseAdmin()
        .from('acct_document_inbox')
        .update({ attachment_id: (att as Record<string, unknown>).id as string })
        .eq('id', (data as Record<string, unknown>).id as string);
      (data as Record<string, unknown>).attachment_id = (att as Record<string, unknown>).id as string;
    }
    return NextResponse.json({ data }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: { code: 'INTERNAL', message: err instanceof Error ? err.message : 'Upload failed', requestId: crypto.randomUUID() } }, { status: 500 });
  }
}
