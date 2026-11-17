import { NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { apiError } from '@/lib/podServer';

/** GET /api/v1/materials — the tenant's BOM materials (ds_materials). */
export async function GET() {
  try {
    const { data, error } = await supabaseAdmin()
      .from('ds_materials')
      .select('id,kind,code,name,composition,weight_gsm,width_cm,color_ref,vendor_id,unit_cost,currency,uom,is_active')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .eq('is_active', true)
      .order('kind', { ascending: true })
      .order('name', { ascending: true });
    if (error) throw new Error(`materials: ${error.message}`);
    return NextResponse.json({ items: data ?? [] });
  } catch (err) {
    return apiError(err instanceof Error ? err.message : 'Failed to load materials.');
  }
}
