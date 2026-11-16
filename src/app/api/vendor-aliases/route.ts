import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import type { VendorAlias } from '@/lib/arApLinkTypes';

const err = (code: string, message: string, status: number) =>
  NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });

const MATCH_TYPES = ['equals', 'starts_with', 'contains'];

const toAlias = (r: Record<string, unknown>, names: Map<string, string> = new Map()): VendorAlias => ({
  id: String(r.id),
  alias: String(r.alias || ''),
  matchType: String(r.match_type || ''),
  vendorId: (r.vendor_id as string) || null,
  vendorName: r.vendor_id ? (names.get(`v:${r.vendor_id}`) || null) : null,
  customerId: (r.customer_id as string) || null,
  customerName: r.customer_id ? (names.get(`c:${r.customer_id}`) || null) : null,
  accountId: (r.account_id as string) || null,
  accountName: r.account_id ? (names.get(`a:${r.account_id}`) || null) : null,
});

/**
 * GET /api/vendor-aliases — payee-name aliases the bank matcher uses
 * (acct_vendor_aliases). One of vendor, customer or account must be set
 * (engine CHECK); match_type is equals | starts_with | contains.
 */
export async function GET() {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('acct_vendor_aliases')
    .select('*')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .order('alias', { ascending: true })
    .limit(100);
  if (error) return err('INTERNAL', error.message, 500);
  const rows = data || [];
  const names = new Map<string, string>();
  const vendorIds = [...new Set(rows.map((r) => r.vendor_id).filter(Boolean))];
  const customerIds = [...new Set(rows.map((r) => r.customer_id).filter(Boolean))];
  const accountIds = [...new Set(rows.map((r) => r.account_id).filter(Boolean))];
  if (vendorIds.length) {
    const { data: v } = await sb.from('acct_vendors').select('id,legal_name,display_name').in('id', vendorIds);
    (v || []).forEach((x) => names.set(`v:${x.id}`, x.display_name || x.legal_name || ''));
  }
  if (customerIds.length) {
    const { data: p } = await sb.from('platform_parties').select('id,metadata').in('id', customerIds);
    (p || []).forEach((x) => names.set(`c:${x.id}`, ((x.metadata as Record<string, unknown>)?.name as string) || ''));
  }
  if (accountIds.length) {
    const { data: a } = await sb.from('acct_chart_of_accounts').select('id,code,name').in('id', accountIds);
    (a || []).forEach((x) => names.set(`a:${x.id}`, `${x.code} ${x.name}`));
  }
  return NextResponse.json({ data: rows.map((r) => toAlias(r, names)) });
}

/**
 * POST /api/vendor-aliases — add an alias. Body:
 * { alias, matchType?, vendorId?, customerId?, accountId? }.
 */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return err('VALIDATION', 'Invalid JSON', 400); }
  if (!body.alias) return err('VALIDATION', 'alias is required', 400);
  const matchType = String(body.matchType || 'equals');
  if (!MATCH_TYPES.includes(matchType)) return err('VALIDATION', `matchType must be one of ${MATCH_TYPES.join(', ')}`, 400);
  if (!body.vendorId && !body.customerId && !body.accountId) {
    return err('VALIDATION', 'Link the alias to a vendor, customer or account', 400);
  }
  const sb = supabaseAdmin();
  const { data, error } = await sb.from('acct_vendor_aliases').insert({
    tenant_id: DEFAULT_TENANT_ID,
    alias: String(body.alias),
    match_type: matchType,
    vendor_id: body.vendorId ? String(body.vendorId) : null,
    customer_id: body.customerId ? String(body.customerId) : null,
    account_id: body.accountId ? String(body.accountId) : null,
  }).select('*').single();
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: toAlias(data) }, { status: 201 });
}
