import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/* Shared server helpers for the accounting (acct_*) routes. Most
   acct_* tables carry a NOT NULL entity_id — the tenant's single
   acct_entities row, resolved once per process. */

let entityCache: string | null = null;

export async function tenantEntityId(): Promise<string | null> {
  if (entityCache) return entityCache;
  const sb = supabaseAdmin();
  const { data } = await sb
    .from('acct_entities')
    .select('id')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  entityCache = (data as { id?: string } | null)?.id ?? null;
  return entityCache;
}

export { DEFAULT_TENANT_ID };
