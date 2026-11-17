import { NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status = 400) {
  return NextResponse.json({ error: { code, message } }, { status });
}

/** GET /api/tax/categories — the Form 1120/4562 reference categories an
 *  account maps to (acct_tax_categories). */
export async function GET() {
  const { data, error } = await supabaseAdmin()
    .from('acct_tax_categories')
    .select('id, code, name, description, default_taxable')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .order('code');
  if (error) return err('LIST_FAILED', error.message, 500);
  return NextResponse.json({ data: data || [], meta: { total: (data || []).length } });
}
