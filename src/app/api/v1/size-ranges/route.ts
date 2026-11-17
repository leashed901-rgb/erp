import { NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { apiError } from '@/lib/podServer';

/** GET /api/v1/size-ranges — the tenant's size ranges (ds_size_ranges). */
export async function GET() {
  try {
    const { data, error } = await supabaseAdmin()
      .from('ds_size_ranges')
      .select('id,name,sizes,base_size,unit')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .order('name', { ascending: true });
    if (error) throw new Error(`size-ranges: ${error.message}`);
    return NextResponse.json({ items: data ?? [] });
  } catch (err) {
    return apiError(err instanceof Error ? err.message : 'Failed to load size ranges.');
  }
}
