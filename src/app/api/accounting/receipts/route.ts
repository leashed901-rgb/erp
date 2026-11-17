import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { tenantEntityId } from '@/lib/acctServer';

/* Receipt intake over acct_document_inbox (doc_kind 'receipt') joined
   with acct_receipt_extractions. Status map: uploaded/extracting/
   for_review → review; processed → reviewed. The intended category
   (chosen in the screen's picker before an expense exists) is kept
   in the extraction's raw_extraction.categoryAccountId — the only
   place the model holds it pre-expense. */

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

export async function GET() {
  const sb = supabaseAdmin();
  const { data: inbox, error } = await sb
    .from('acct_document_inbox')
    .select('*')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('doc_kind', 'receipt')
    .order('created_at', { ascending: false })
    .limit(500);
  if (error) return err('INTERNAL', error.message, 500);
  const rows = (inbox || []) as Record<string, unknown>[];
  const ids = rows.map((r) => String(r.id));
  const attIds = rows.map((r) => r.attachment_id).filter(Boolean) as string[];

  const { data: exts } = ids.length
    ? await sb.from('acct_receipt_extractions').select('*').eq('tenant_id', DEFAULT_TENANT_ID).in('inbox_id', ids)
    : { data: [] };
  const extByInbox = new Map<string, Record<string, unknown>>();
  for (const e of (exts || []) as Record<string, unknown>[]) {
    if (e.inbox_id) extByInbox.set(String(e.inbox_id), e);
    if (e.attachment_id && attIds.includes(String(e.attachment_id))) {
      const owner = rows.find((r) => String(r.attachment_id) === String(e.attachment_id));
      if (owner && !extByInbox.has(String(owner.id))) extByInbox.set(String(owner.id), e);
    }
  }

  const vendorIds = rows.map((r) => r.vendor_id).filter(Boolean) as string[];
  const { data: vendors } = vendorIds.length
    ? await sb.from('acct_vendors').select('id, legal_name').eq('tenant_id', DEFAULT_TENANT_ID).in('id', vendorIds)
    : { data: [] };
  const vendorNames = new Map(((vendors || []) as Record<string, unknown>[]).map((v) => [String(v.id), String(v.legal_name || '')]));

  const txnIds = rows.map((r) => r.matched_bank_transaction_id).filter(Boolean) as string[];
  const { data: txns } = txnIds.length
    ? await sb.from('acct_bank_transactions').select('id, bank_account_id').eq('tenant_id', DEFAULT_TENANT_ID).in('id', txnIds)
    : { data: [] };
  const txnAcct = new Map(((txns || []) as Record<string, unknown>[]).map((t) => [String(t.id), String(t.bank_account_id)]));
  const { data: bankAccts } = await sb.from('acct_bank_accounts').select('id, name').eq('tenant_id', DEFAULT_TENANT_ID);
  const bankNames = new Map(((bankAccts || []) as Record<string, unknown>[]).map((a) => [String(a.id), String(a.name || '')]));

  const spendIds = rows.map((r) => r.created_spend_id).filter(Boolean) as string[];
  const { data: spendLines } = spendIds.length
    ? await sb.from('acct_spend_lines').select('spend_id, account_id').eq('tenant_id', DEFAULT_TENANT_ID).in('spend_id', spendIds).order('line_no', { ascending: true })
    : { data: [] };
  const spendCat = new Map<string, string>();
  for (const l of (spendLines || []) as Record<string, unknown>[]) {
    if (!spendCat.has(String(l.spend_id)) && l.account_id) spendCat.set(String(l.spend_id), String(l.account_id));
  }
  const { data: coa } = await sb.from('acct_chart_of_accounts').select('id, name').eq('tenant_id', DEFAULT_TENANT_ID);
  const coaNames = new Map(((coa || []) as Record<string, unknown>[]).map((a) => [String(a.id), String(a.name || '')]));

  return NextResponse.json({
    data: rows.map((r) => {
      const ext = extByInbox.get(String(r.id));
      const raw = (ext?.raw_extraction && typeof ext.raw_extraction === 'object' ? ext.raw_extraction : {}) as Record<string, unknown>;
      const spendCategoryId = r.created_spend_id ? spendCat.get(String(r.created_spend_id)) || null : null;
      const categoryAccountId = spendCategoryId || (typeof raw.categoryAccountId === 'string' ? raw.categoryAccountId : null);
      const matchedTxnId = (r.matched_bank_transaction_id as string) || (ext?.matched_bank_transaction_id as string) || null;
      const bankAcctId = matchedTxnId ? txnAcct.get(matchedTxnId) || null : null;
      const status = String(r.status || 'uploaded');
      return {
        id: String(r.id),
        ref: (r.doc_number as string) || (r.file_name as string) || 'Receipt',
        fileName: (r.file_name as string) || null,
        source: String(r.source || 'upload'),
        rawStatus: status,
        status: status === 'processed' ? 'reviewed' : 'review',
        vendorName: (ext?.vendor_name as string) || (r.vendor_id ? vendorNames.get(String(r.vendor_id)) || null : null),
        vendorId: (r.vendor_id as string) || null,
        amount: ext?.extracted_total != null ? Number(ext.extracted_total) : r.total != null ? Number(r.total) : null,
        taxAmount: ext?.tax_amount != null ? Number(ext.tax_amount) : null,
        date: (ext?.receipt_date as string) || (r.doc_date as string) || String(r.created_at || '').slice(0, 10),
        paymentAccountId: bankAcctId,
        paymentAccountLabel: bankAcctId ? bankNames.get(bankAcctId) || null : null,
        categoryAccountId,
        categoryLabel: categoryAccountId ? coaNames.get(categoryAccountId) || null : null,
        createdSpendId: (r.created_spend_id as string) || null,
        createdBillId: (r.created_bill_id as string) || null,
        matchedBankTransactionId: matchedTxnId,
        extractionStatus: ext ? String(ext.status || '') : null,
        notes: typeof raw.notes === 'string' ? raw.notes : null,
        ocrScore: ext?.ocr_score != null ? Number(ext.ocr_score) : null,
        hasAttachment: !!r.attachment_id,
        createdAt: String(r.created_at || ''),
      };
    }),
  });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const fileName = typeof body.fileName === 'string' ? body.fileName.trim() : '';
  const sha256 = typeof body.sha256 === 'string' ? body.sha256.trim() : '';
  if (!fileName) return err('VALIDATION', 'fileName is required', 400);
  if (!sha256) return err('VALIDATION', 'sha256 is required', 400);
  const entityId = await tenantEntityId();
  if (!entityId) return err('INTERNAL', 'No accounting entity exists for this tenant', 500);
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('acct_document_inbox')
    .insert({
      tenant_id: DEFAULT_TENANT_ID,
      entity_id: entityId,
      doc_kind: 'receipt',
      source: body.source === 'photo' ? 'photo' : 'upload',
      file_name: fileName,
      sha256,
      status: 'uploaded',
      extracted: {},
    })
    .select('*')
    .single();
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: { id: String((data as { id: string }).id) } }, { status: 201 });
}
