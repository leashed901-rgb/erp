import { NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/* AP bills with vendor names: acct_ap_bills joined to acct_vendors,
   first-line category (expense account name) and inbox provenance.
   Used by the Bills screen and the receipt attach-bill picker.
   Bill creation lives on the Document Engine API and the receipts
   create-bill route. */

export async function GET() {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('acct_ap_bills')
    .select('id, bill_number, vendor_id, bill_date, due_date, total, amount_paid, status, approval_status, memo, inbox_id')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .neq('status', 'void')
    .order('due_date', { ascending: true })
    .limit(200);
  if (error) return NextResponse.json({ error: { code: 'INTERNAL', message: error.message, requestId: crypto.randomUUID() } }, { status: 500 });
  const rows = (data || []) as Record<string, unknown>[];

  const vendorIds = [...new Set(rows.map((r) => r.vendor_id).filter(Boolean))] as string[];
  const { data: vendors } = vendorIds.length
    ? await sb.from('acct_vendors').select('id, legal_name').eq('tenant_id', DEFAULT_TENANT_ID).in('id', vendorIds)
    : { data: [] };
  const names = new Map(((vendors || []) as Record<string, unknown>[]).map((v) => [String(v.id), String(v.legal_name || '')]));

  /* First bill line per bill → category (expense account name, else the
     line description) */
  const billIds = rows.map((r) => String(r.id));
  const categoryByBill = new Map<string, string>();
  if (billIds.length) {
    const { data: lines } = await sb
      .from('acct_ap_bill_lines')
      .select('bill_id, line_no, description, expense_account_id')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .in('bill_id', billIds)
      .order('line_no', { ascending: true });
    const acctIds = [...new Set(((lines || []) as Record<string, unknown>[]).map((l) => l.expense_account_id).filter(Boolean))] as string[];
    const acctNames = new Map<string, string>();
    if (acctIds.length) {
      const { data: accts } = await sb
        .from('acct_chart_of_accounts')
        .select('id, name')
        .eq('tenant_id', DEFAULT_TENANT_ID)
        .in('id', acctIds);
      for (const a of (accts || []) as Record<string, unknown>[]) acctNames.set(String(a.id), String(a.name || ''));
    }
    for (const l of (lines || []) as Record<string, unknown>[]) {
      const bid = String(l.bill_id);
      if (categoryByBill.has(bid)) continue;
      const acctName = l.expense_account_id ? acctNames.get(String(l.expense_account_id)) : undefined;
      categoryByBill.set(bid, acctName || (l.description as string) || '');
    }
  }

  /* Inbox provenance: source + attachment presence */
  const inboxIds = [...new Set(rows.map((r) => r.inbox_id).filter(Boolean))] as string[];
  const inboxById = new Map<string, { source: string; hasAttachment: boolean }>();
  if (inboxIds.length) {
    const { data: inbox } = await sb
      .from('acct_document_inbox')
      .select('id, source, attachment_id')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .in('id', inboxIds);
    for (const r of (inbox || []) as Record<string, unknown>[]) {
      inboxById.set(String(r.id), { source: String(r.source || ''), hasAttachment: !!r.attachment_id });
    }
  }

  return NextResponse.json({
    data: rows.map((r) => {
      const inbox = r.inbox_id ? inboxById.get(String(r.inbox_id)) : undefined;
      return {
        id: String(r.id),
        billNumber: (r.bill_number as string) || '',
        vendorId: (r.vendor_id as string) || null,
        vendorName: r.vendor_id ? names.get(String(r.vendor_id)) || null : null,
        billDate: (r.bill_date as string) || null,
        dueDate: (r.due_date as string) || null,
        total: r.total != null ? Number(r.total) : 0,
        amountPaid: r.amount_paid != null ? Number(r.amount_paid) : 0,
        status: String(r.status || ''),
        approvalStatus: (r.approval_status as string) || null,
        memo: (r.memo as string) || '',
        category: categoryByBill.get(String(r.id)) || null,
        source: inbox ? inbox.source : null,
        attachmentsCount: inbox?.hasAttachment ? 1 : 0,
        inboxId: (r.inbox_id as string) || null,
      };
    }),
  });
}
