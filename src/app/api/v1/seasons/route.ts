import { NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { apiError } from '@/lib/podServer';

/** GET /api/v1/seasons — the tenant's seasons (ds_seasons). */
export async function GET() {
  try {
    const { data, error } = await supabaseAdmin()
      .from('ds_seasons')
      .select('id,code,name,starts_on,ends_on,status')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .order('starts_on', { ascending: false });
    if (error) throw new Error(`seasons: ${error.message}`);
    return NextResponse.json({ items: data ?? [] });
  } catch (err) {
    return apiError(err instanceof Error ? err.message : 'Failed to load seasons.');
  }
}
