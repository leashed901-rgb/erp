import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/* acct_vendors list + find-or-create (same VND-#### pattern as the
   parties route and the receipts create-bill route). */

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

export async function GET() {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('acct_vendors')
    .select('id, legal_name, vendor_number, is_active, email, phone, payment_terms_days')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('is_active', true)
    .order('legal_name')
    .limit(500);
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({
    data: ((data || []) as Record<string, unknown>[]).map((v) => ({
      id: String(v.id),
      legalName: String(v.legal_name || ''),
      vendorNumber: (v.vendor_number as string) || null,
      email: (v.email as string) || null,
      phone: (v.phone as string) || null,
      paymentTermsDays: v.payment_terms_days != null ? Number(v.payment_terms_days) : null,
    })),
  });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) return err('VALIDATION', 'name is required', 400);
  const sb = supabaseAdmin();

  const { data: existing } = await sb
    .from('acct_vendors')
    .select('id, legal_name, vendor_number')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .ilike('legal_name', name)
    .limit(1);
  if (existing && existing.length) {
    const v = existing[0] as Record<string, unknown>;
    return NextResponse.json({
      data: { id: String(v.id), legalName: String(v.legal_name || ''), vendorNumber: (v.vendor_number as string) || null, created: false },
    });
  }

  const [numRes, apRes] = await Promise.all([
    sb.from('acct_vendors').select('vendor_number').eq('tenant_id', DEFAULT_TENANT_ID).like('vendor_number', 'VND-%'),
    sb.from('acct_chart_of_accounts').select('id').eq('tenant_id', DEFAULT_TENANT_ID).eq('is_active', true).eq('subtype', 'accounts_payable').limit(1),
  ]);
  let nextNum = 1;
  for (const row of (numRes.data || []) as { vendor_number?: string }[]) {
    const m = /^VND-(\d+)$/.exec(row.vendor_number || '');
    if (m) nextNum = Math.max(nextNum, parseInt(m[1], 10) + 1);
  }
  const apAccountId = (apRes.data?.[0] as { id?: string } | undefined)?.id;
  if (!apAccountId) return err('INTERNAL', 'No Accounts Payable account found in the chart of accounts', 500);

  const { data, error } = await sb
    .from('acct_vendors')
    .insert({
      tenant_id: DEFAULT_TENANT_ID,
      vendor_number: `VND-${String(nextNum).padStart(4, '0')}`,
      legal_name: name,
      currency: 'USD',
      ap_account_id: apAccountId,
      payment_terms_days: 30,
      is_1099_vendor: false,
      is_active: true,
      metadata: {},
    })
    .select('id, legal_name, vendor_number')
    .single();
  if (error) return err('INTERNAL', error.message, 500);
  const v = data as Record<string, unknown>;
  return NextResponse.json(
    { data: { id: String(v.id), legalName: String(v.legal_name || ''), vendorNumber: (v.vendor_number as string) || null, created: true } },
    { status: 201 }
  );
}
