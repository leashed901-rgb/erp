import { NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { apiError } from '@/lib/podServer';

/** GET /api/v1/pom-library — the tenant's points of measure (ds_pom_library). */
export async function GET() {
  try {
    const { data, error } = await supabaseAdmin()
      .from('ds_pom_library')
      .select('id,code,name,how_to_measure,category,default_tol_plus,default_tol_minus,sort')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .order('sort', { ascending: true });
    if (error) throw new Error(`pom-library: ${error.message}`);
    return NextResponse.json({ items: data ?? [] });
  } catch (err) {
    return apiError(err instanceof Error ? err.message : 'Failed to load POM library.');
  }
}
