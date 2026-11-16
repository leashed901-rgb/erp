import { NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
/* acct_estimates.customer_id references crm_customers (FK), not
   platform_parties — names/emails resolve there. */

/* Estimates over acct_estimates: customer names/emails resolved from
   platform_parties, converted invoice numbers from acct_ar_invoices,
   lines normalized out of the row's lines jsonb. Writes ride the
   Document Engine API (/api/v1/documents). */

interface RawLine {
  description?: string;
  desc?: string;
  quantity?: number;
  qty?: number;
  unit_price?: number;
  rate?: number;
}

export async function GET() {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('acct_estimates')
    .select('*')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .order('estimate_date', { ascending: false })
    .limit(200);
  if (error) return NextResponse.json({ error: { code: 'INTERNAL', message: error.message, requestId: crypto.randomUUID() } }, { status: 500 });
  const rows = (data || []) as Record<string, unknown>[];

  const customerIds = [...new Set(rows.map((r) => r.customer_id).filter(Boolean))] as string[];
  const parties = new Map<string, { name: string; email: string | null }>();
  if (customerIds.length) {
    const { data: custRows } = await sb
      .from('crm_customers')
      .select('id, first_name, last_name, company_name, email')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .in('id', customerIds);
    for (const c of (custRows || []) as Record<string, unknown>[]) {
      const person = [c.first_name, c.last_name].filter(Boolean).join(' ').trim();
      parties.set(String(c.id), {
        name: (c.company_name as string) || person || 'Customer',
        email: (c.email as string) || null,
      });
    }
  }

  const invoiceIds = [...new Set(rows.map((r) => r.converted_invoice_id).filter(Boolean))] as string[];
  const invoiceNumbers = new Map<string, string>();
  if (invoiceIds.length) {
    const { data: invRows } = await sb
      .from('acct_ar_invoices')
      .select('id, invoice_number')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .in('id', invoiceIds);
    for (const i of (invRows || []) as Record<string, unknown>[]) {
      invoiceNumbers.set(String(i.id), String(i.invoice_number || ''));
    }
  }

  return NextResponse.json({
    data: rows.map((r) => {
      const customer = r.customer_id ? parties.get(String(r.customer_id)) : undefined;
      const rawLines = Array.isArray(r.lines) ? (r.lines as RawLine[]) : [];
      return {
        id: String(r.id),
        number: (r.estimate_number as string) || '',
        customerId: (r.customer_id as string) || null,
        customerName: customer?.name || null,
        customerEmail: customer?.email || null,
        estimateDate: (r.estimate_date as string) || null,
        expiryDate: (r.expiry_date as string) || null,
        subtotal: r.subtotal != null ? Number(r.subtotal) : 0,
        taxTotal: r.tax_total != null ? Number(r.tax_total) : 0,
        total: r.total != null ? Number(r.total) : 0,
        status: String(r.status || 'draft'),
        notes: (r.notes as string) || '',
        lines: rawLines.map((l, i) => ({
          id: `l${i + 1}`,
          desc: l.description || l.desc || '',
          qty: Number(l.quantity ?? l.qty) || 0,
          rate: Number(l.unit_price ?? l.rate) || 0,
        })),
        convertedInvoiceId: (r.converted_invoice_id as string) || null,
        convertedInvoiceNo: r.converted_invoice_id ? invoiceNumbers.get(String(r.converted_invoice_id)) || null : null,
        createdAt: (r.created_at as string) || null,
        sentAt: (r.sent_at as string) || null,
        viewedAt: (r.viewed_at as string) || null,
        acceptedAt: (r.accepted_at as string) || null,
        declinedAt: (r.declined_at as string) || null,
      };
    }),
  });
}
