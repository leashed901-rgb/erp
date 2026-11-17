import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import type { Summary1099, Form1099 } from '@/lib/taxTypes';

const err = (code: string, message: string, status: number) =>
  NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });

/**
 * GET /api/tax/1099/summary?year= — payee 1099 readiness from
 * acct_1099_summary, enriched with each vendor's W-9 state (doc 10:
 * missing W-9 blocks generation).
 */
export async function GET(req: NextRequest) {
  const year = Number(new URL(req.url).searchParams.get('year')) || new Date().getFullYear() - 1;
  const sb = supabaseAdmin();
  const { data, error } = await sb.rpc('acct_1099_summary', {
    p_tenant_id: DEFAULT_TENANT_ID,
    p_tax_year: year,
  });
  if (error) return err('INTERNAL', error.message, 500);

  const rows = (data || []) as Array<Record<string, unknown>>;
  // Vendor W-9 lookup for any payee ids the RPC returns
  const vendorIds = rows.map((r) => String(r.vendor_id || r.payee_id || '')).filter(Boolean);
  const w9 = new Map<string, { w9: boolean; tinLast4: string | null; name: string }>();
  if (vendorIds.length) {
    const { data: vendors } = await sb
      .from('acct_vendors')
      .select('id,display_name,w9_received_at,tin_last4')
      .in('id', vendorIds);
    (vendors || []).forEach((v) => w9.set(v.id, { w9: Boolean(v.w9_received_at), tinLast4: v.tin_last4, name: v.display_name }));
  }

  // Generated forms live in acct_payroll_tax_forms (acct_generate_1099s
  // writes them there, keyed by vendor_id + form_type + tax_year).
  const formStatus = new Map<string, string>();
  if (vendorIds.length) {
    const { data: forms } = await sb
      .from('acct_payroll_tax_forms')
      .select('vendor_id,form_type,status')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .eq('tax_year', year)
      .in('vendor_id', vendorIds);
    (forms || []).forEach((f) => formStatus.set(`${f.vendor_id}|${f.form_type}`, f.status));
  }

  const payees: Form1099[] = rows.map((r) => {
    const vid = String(r.vendor_id || r.payee_id || '');
    const v = w9.get(vid);
    const form = String(r.form || '1099-NEC');
    const genStatus = formStatus.get(`${vid}|${form}`);
    const totalPaid = Number(r.total_paid ?? r.amount ?? r.total ?? 0);
    const threshold = Number(r.threshold ?? 600);
    return {
      vendorId: vid,
      vendorName: String(r.vendor_name || r.payee_name || v?.name || 'Vendor'),
      tinLast4: (r.tin_last4 as string) || v?.tinLast4 || null,
      w9Received: typeof r.w9_received === 'boolean' ? r.w9_received : Boolean(v?.w9),
      totalPaid,
      threshold,
      meetsThreshold: totalPaid >= threshold,
      form,
      status: genStatus ? `generated (${genStatus})` : 'not_generated',
    };
  });

  const summary: Summary1099 = {
    taxYear: year,
    threshold: payees[0]?.threshold ?? 600,
    payees,
    missingW9Count: payees.filter((p) => p.meetsThreshold && !p.w9Received).length,
    generatedCount: payees.filter((p) => p.status !== 'not_generated').length,
  };
  return NextResponse.json({ data: summary });
}
