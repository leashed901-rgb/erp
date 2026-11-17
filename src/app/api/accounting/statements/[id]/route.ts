import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { toStatementDto } from '../route';

/* One statement: GET returns the row plus its document lines
   (invoices in the period with per-invoice paid/open amounts — the
   same presentation the statements drawer renders). PATCH moves
   status within the platform vocab (draft|generated|sent|viewed|
   void); DELETE voids. */

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

async function load(sb: ReturnType<typeof supabaseAdmin>, id: string) {
  const { data } = await sb
    .from('acct_customer_statements')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .single();
  return data as Record<string, unknown> | null;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = supabaseAdmin();
  const row = await load(sb, id);
  if (!row) return err('NOT_FOUND', 'Statement not found', 404);

  const { data: customer } = await sb
    .from('crm_customers')
    .select('id, first_name, last_name, company_name, email')
    .eq('id', row.customer_id as string)
    .single();
  const cust = customer
    ? {
        name: (customer.company_name as string) || [customer.first_name, customer.last_name].filter(Boolean).join(' ') || 'Customer',
        email: (customer.email as string) || null,
      }
    : undefined;

  const { data: invoices } = await sb
    .from('acct_ar_invoices')
    .select('id, invoice_number, invoice_date, total, amount_paid, amount_credited, status')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('customer_id', row.customer_id as string)
    .gte('invoice_date', row.period_start as string)
    .lte('invoice_date', row.period_end as string)
    .order('invoice_date', { ascending: true });

  const lines = (invoices || []).map(i => {
    const open = ['void', 'written_off'].includes(String(i.status))
      ? 0
      : Math.max(0, Number(i.total || 0) - Number(i.amount_paid || 0) - Number(i.amount_credited || 0));
    return {
      invoiceId: i.id as string,
      number: i.invoice_number as string,
      date: i.invoice_date as string,
      description: `Invoice ${i.invoice_number}`,
      amount: Number(i.total || 0),
      paid: Number(i.amount_paid || 0) + Number(i.amount_credited || 0),
      balance: open,
      status: i.status as string,
    };
  });

  return NextResponse.json({
    data: {
      ...toStatementDto(row as never, cust),
      lines,
    },
  });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const status = typeof body.status === 'string' ? body.status : '';
  if (!['draft', 'generated', 'sent', 'viewed', 'void'].includes(status)) {
    return err('VALIDATION', 'status must be draft|generated|sent|viewed|void', 400);
  }
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('acct_customer_statements')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .select('*')
    .single();
  if (error || !data) return err('NOT_FOUND', error?.message || 'Statement not found', 404);
  return NextResponse.json({ data: toStatementDto(data as never) });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('acct_customer_statements')
    .update({ status: 'void', updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .select('id')
    .single();
  if (error || !data) return err('NOT_FOUND', error?.message || 'Statement not found', 404);
  return NextResponse.json({ data: { id, voided: true } });
}
