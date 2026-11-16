import { NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

/**
 * GET /api/entities — the tenant's legal entities (Batch I picker).
 * Entities are managed in the Entities screen, not here; this is a
 * read-only list for pickers (consolidation, intercompany, channel
 * accounts). The list-rows 'entities' loader carries the fuller
 * register; this returns the picker shape.
 */
export async function GET() {
  const { data, error } = await supabaseAdmin().from('acct_entities').select('id, legal_name, display_name, functional_currency, is_active').eq('tenant_id', DEFAULT_TENANT_ID).order('legal_name');
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({
    data: ((data ?? []) as Record<string, unknown>[]).map((e) => ({
      id: e.id,
      legalName: e.legal_name,
      displayName: e.display_name,
      name: e.display_name || e.legal_name || '—',
      functionalCurrency: e.functional_currency,
      isActive: e.is_active,
    })),
  });
}
