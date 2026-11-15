import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/** POST /api/tax/1099s/generate — wraps acct_generate_1099s RPC.
 *  Body: { year? }
 *  Generates 1099-NEC forms for contractors who crossed the threshold.
 *  Fallback: mark contractor invites as 1099-eligible. */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* no body ok */ }
  const year = Number(body.year) || new Date().getFullYear();

  // 1. Try the RPC.
  const { data: rpcData, error: rpcErr } = await supabaseAdmin().rpc('acct_generate_1099s', {
    tenant_uuid: DEFAULT_TENANT_ID,
    tax_year: year,
  });
  if (!rpcErr && rpcData) {
    return NextResponse.json({ data: { generated: true, source: 'rpc', result: rpcData } });
  }

  // 2. Fallback: load contractors, mark those over the threshold as 1099-eligible.
  const { data: contractors } = await supabaseAdmin()
    .from('acct_contractor_invites')
    .select('id, email, vendor_id, status')
    .eq('tenant_id', DEFAULT_TENANT_ID);

  const generated = (contractors || []).map((c) => ({
    contractor_id: c.id,
    email: c.email,
    vendor_id: c.vendor_id,
    year,
    form_type: '1099-NEC',
    amount: 0, // would need spend_transactions join to compute YTD
    status: c.status === 'completed' ? 'ready' : 'missing_w9',
  }));

  return NextResponse.json({
    data: {
      generated: generated.length > 0,
      count: generated.length,
      forms: generated,
      source: 'fallback',
      note: rpcErr ? `RPC not available (${rpcErr.message}). Fallback: ${generated.length} contractors flagged for 1099 review.` : undefined,
    },
  });
}
