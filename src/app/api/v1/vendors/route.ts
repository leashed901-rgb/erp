import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { apiError } from '@/lib/podServer';

/**
 * GET /api/v1/vendors — tenant vendors for pickers (RFQ invitations, etc.).
 * ?q= matches display/legal/company name. Tenant-scoped.
 */
export async function GET(req: NextRequest) {
  try {
    const params = new URL(req.url).searchParams;
    const q = params.get('q');
    const limit = Math.min(Math.max(parseInt(params.get('limit') ?? '50', 10) || 50, 1), 100);
    let query = supabaseAdmin()
      .from('acct_vendors')
      .select('id,display_name,legal_name,company_name,email,phone,currency')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .order('display_name', { ascending: true })
      .limit(limit);
    if (q) {
      query = query.or(`display_name.ilike.%${q}%,legal_name.ilike.%${q}%,company_name.ilike.%${q}%`);
    }
    const { data, error } = await query;
    if (error) throw new Error(`acct_vendors: ${error.message}`);
    return NextResponse.json({
      items: (data ?? []).map((v) => ({
        id: v.id as string,
        name: (v.display_name as string) || (v.legal_name as string) || (v.company_name as string) || (v.id as string),
        email: (v.email as string | null) ?? null,
        currency: (v.currency as string | null) ?? null,
      })),
    });
  } catch (err) {
    return apiError(err instanceof Error ? err.message : 'Failed to list vendors.');
  }
}
