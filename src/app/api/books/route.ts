import { NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

/**
 * GET /api/books — the tenant's accounting books (Batch I picker).
 * Books are created in the Entities screen's book management, not
 * here; this is a read-only list for pickers (recurring journals,
 * FX revaluation runs, book mappings).
 */
export async function GET() {
  const sb = supabaseAdmin();
  const { data, error } = await sb.from('acct_books').select('id, entity_id, name').eq('tenant_id', DEFAULT_TENANT_ID).order('name');
  if (error) return err('INTERNAL', error.message, 500);
  const entityIds = [...new Set(((data ?? []) as { entity_id: string }[]).map((b) => b.entity_id))] as string[];
  const { data: entities } = entityIds.length
    ? await sb.from('acct_entities').select('id, legal_name, display_name').in('id', entityIds)
    : { data: [] };
  const entityById = new Map(((entities ?? []) as Record<string, unknown>[]).map((e) => [e.id, e.display_name || e.legal_name]));
  return NextResponse.json({
    data: ((data ?? []) as Record<string, unknown>[]).map((b) => ({
      id: b.id,
      entityId: b.entity_id,
      entity: (entityById.get(b.entity_id as string) as string) || '—',
      name: b.name,
    })),
  });
}
