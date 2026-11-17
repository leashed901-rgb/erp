import { NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/** GET /api/v1/inventory/vendors — active vendors for pickers (reorder rules). */
export async function GET() {
  const { data, error } = await supabaseAdmin()
    .from('acct_vendors')
    .select('id,legal_name,display_name')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('is_active', true)
    .order('legal_name', { ascending: true });
  if (error) {
    return NextResponse.json({ error: { code: 'INTERNAL', message: error.message } }, { status: 500 });
  }
  return NextResponse.json({
    data: ((data ?? []) as { id: string; legal_name: string; display_name: string | null }[]).map((v) => ({
      id: v.id,
      name: v.display_name || v.legal_name,
    })),
  });
}
