import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

/**
 * GET /api/products/suppliers — the supplier list for the product drawer
 * (Purchasing tab). `suppliers` is a global table (no tenant_id).
 */
export async function GET() {
  const { data, error } = await supabaseAdmin()
    .from('suppliers')
    .select('id,name,slug,kind')
    .order('name', { ascending: true })
    .limit(500);
  if (error) {
    return NextResponse.json({ error: { code: 'INTERNAL', message: error.message } }, { status: 500 });
  }
  return NextResponse.json({ data: data ?? [] });
}
