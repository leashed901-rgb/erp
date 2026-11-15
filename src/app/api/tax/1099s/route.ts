import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/** GET /api/tax/1099s — list 1099 thresholds + contractor 1099 status.
 *  Reads acct_1099_thresholds + acct_contractor_invites. */
export async function GET() {
  const { data: thresholds, error } = await supabaseAdmin()
    .from('acct_1099_thresholds')
    .select('*')
    .eq('tenant_id', DEFAULT_TENANT_ID);
  if (error) {
    const code = (error as { code?: string }).code;
    if (code === '42P01' || code === 'PGRST205' || code === 'PGRST200') {
      return NextResponse.json({ data: [], thresholds: [], schema_pending: true });
    }
    return NextResponse.json({ error: { code: 'INTERNAL', message: error.message, requestId: crypto.randomUUID() } }, { status: 500 });
  }

  // Also get contractor invites to show W-9 status alongside.
  const { data: contractors } = await supabaseAdmin()
    .from('acct_contractor_invites')
    .select('id, email, vendor_id, status')
    .eq('tenant_id', DEFAULT_TENANT_ID);

  return NextResponse.json({
    data: thresholds || [],
    contractors: contractors || [],
    threshold: 600, // IRS 1099-NEC threshold for 2026
  });
}
