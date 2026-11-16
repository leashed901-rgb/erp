import { NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/* Policies (doc 26) over policy_settings — tenant key/value policy
   configuration. */
export async function GET() {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('policy_settings')
    .select('*')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .order('key', { ascending: true })
    .limit(300);
  if (error) return NextResponse.json({ error: { code: 'INTERNAL', message: error.message, requestId: crypto.randomUUID() } }, { status: 500 });
  return NextResponse.json({
    data: (data || []).map((r) => {
      const row = r as Record<string, unknown>;
      return {
        id: String(row.id),
        key: String(row.key || ''),
        value: row.value,
        scope: typeof row.scope === 'string' ? row.scope : null,
        updatedAt: String(row.updated_at || ''),
      };
    }),
  });
}
