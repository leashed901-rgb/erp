import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import type { ContractorInvite } from '@/lib/payrollTypes';

const err = (code: string, message: string, status: number) =>
  NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });

/** GET /api/payroll/contractors — contractor invites (1099-NEC side, doc 12). */
export async function GET() {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('acct_contractor_invites')
    .select('*')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .order('sent_at', { ascending: false })
    .limit(100);
  if (error) return err('INTERNAL', error.message, 500);
  const vendorIds = [...new Set((data || []).map((r) => r.vendor_id).filter(Boolean))];
  const names = new Map<string, string>();
  if (vendorIds.length) {
    const { data: vendors } = await sb.from('acct_vendors').select('id,display_name').in('id', vendorIds);
    (vendors || []).forEach((v) => names.set(v.id, v.display_name));
  }
  const dtos: ContractorInvite[] = (data || []).map((r) => ({
    id: r.id,
    email: (r.email as string) || null,
    name: r.vendor_id ? names.get(r.vendor_id) || null : null,
    status: String(r.status || 'invited'),
    createdAt: String(r.sent_at || r.expires_at || ''),
  }));
  return NextResponse.json({ data: dtos });
}

/** POST /api/payroll/contractors — invite a contractor (doc 12:
 *  acct_invite_contractor over an acct_vendors row). This POST did not
 *  exist — the contractors screen could list invites but never create
 *  one, so the contractor leg of the module dead-ended at the first
 *  step. Body: { vendorId, email }. The invite email itself queues
 *  through the mail path; the response carries the invite row. */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return err('VALIDATION', 'Invalid JSON', 400); }
  const vendorId = typeof body.vendorId === 'string' ? body.vendorId : typeof body.vendor_id === 'string' ? body.vendor_id : null;
  const email = typeof body.email === 'string' && body.email.includes('@') ? body.email.trim() : null;
  if (!vendorId) return err('VALIDATION', 'vendorId is required (contractors are vendor records)', 400);
  if (!email) return err('VALIDATION', 'A valid email is required', 400);
  const sb = supabaseAdmin();
  const { data: vendor } = await sb.from('acct_vendors').select('id').eq('id', vendorId).eq('tenant_id', DEFAULT_TENANT_ID).maybeSingle();
  if (!vendor) return err('NOT_FOUND', 'Vendor not found', 404);
  const { data, error } = await sb.rpc('acct_invite_contractor', { p_vendor_id: vendorId, p_email: email });
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data }, { status: 201 });
}
