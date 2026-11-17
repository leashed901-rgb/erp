import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

const err = (code: string, message: string, status: number, extra?: Record<string, unknown>) =>
  NextResponse.json({ error: { code, message, requestId: crypto.randomUUID(), ...extra } }, { status });

/**
 * POST /api/tax/1099/generate { taxYear } — registry action tax.generate_1099s.
 * W-9 GATE (doc 10): if any payee at/over threshold has no W-9 on file,
 * generation is blocked with 409 + the offending payees, and the RPC is
 * never called. Otherwise runs acct_generate_1099s.
 */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return err('VALIDATION', 'Invalid JSON', 400); }
  const year = Number(body.taxYear) || new Date().getFullYear() - 1;
  const sb = supabaseAdmin();

  const { data: summaryRows, error: sumErr } = await sb.rpc('acct_1099_summary', {
    p_tenant_id: DEFAULT_TENANT_ID,
    p_tax_year: year,
  });
  if (sumErr) return err('INTERNAL', sumErr.message, 500);
  const rows = (summaryRows || []) as Array<Record<string, unknown>>;
  const vendorIds = rows.map((r) => String(r.vendor_id || r.payee_id || '')).filter(Boolean);
  const w9 = new Map<string, boolean>();
  if (vendorIds.length) {
    const { data: vendors } = await sb.from('acct_vendors').select('id,w9_received_at').in('id', vendorIds);
    (vendors || []).forEach((v) => w9.set(v.id, Boolean(v.w9_received_at)));
  }
  const blocked = rows
    .filter((r) => {
      const total = Number(r.total_paid ?? r.amount ?? r.total ?? 0);
      const threshold = Number(r.threshold ?? 600);
      const vid = String(r.vendor_id || r.payee_id || '');
      const has = typeof r.w9_received === 'boolean' ? r.w9_received : w9.get(vid);
      return total >= threshold && !has;
    })
    .map((r) => ({
      vendorId: String(r.vendor_id || r.payee_id || ''),
      vendorName: String(r.vendor_name || r.payee_name || 'Vendor'),
      totalPaid: Number(r.total_paid ?? r.amount ?? r.total ?? 0),
    }));
  if (blocked.length) {
    return err('W9_MISSING', `${blocked.length} payee(s) at/over threshold are missing a W-9 — generation blocked.`, 409, { blocked });
  }

  const { data, error } = await sb.rpc('acct_generate_1099s', {
    p_tenant_id: DEFAULT_TENANT_ID,
    p_tax_year: year,
  });
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: { taxYear: year, result: data } }, { status: 201 });
}
