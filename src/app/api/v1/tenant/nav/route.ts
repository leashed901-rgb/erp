import { NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/**
 * GET /api/v1/tenant/nav
 * Returns the tenant's navigation tree from the real database.
 * Calls platform_tenant_nav() RPC first; falls back to joining
 * platform_tenant_modules + platform_modules.
 *
 * platform_modules columns: code, name, kind, nav_modules, nav_prefixes,
 * tables, sort_order, depends_on, description
 */
export async function GET() {
  try {
    // Try the RPC first
    const { data: rpcData, error: rpcError } = await supabaseAdmin()
      .rpc('platform_tenant_nav', { p_tenant: DEFAULT_TENANT_ID });

    if (!rpcError && rpcData && rpcData.length > 0) {
      return NextResponse.json({ data: rpcData, source: 'rpc' });
    }

    // Fallback: join platform_tenant_modules + platform_modules
    const { data: tenantModules, error: tmErr } = await supabaseAdmin()
      .from('platform_tenant_modules')
      .select('module_code,enabled')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .eq('enabled', true);

    if (tmErr || !tenantModules) {
      return NextResponse.json({ data: [], source: 'fallback', error: tmErr?.message });
    }

    // platform_modules uses 'code' as the key, not 'module_code'
    const codes = tenantModules.map((m) => m.module_code);
    const { data: modules, error: modErr } = await supabaseAdmin()
      .from('platform_modules')
      .select('code,name,kind,nav_modules,nav_prefixes,sort_order')
      .in('code', codes)
      .order('sort_order', { ascending: true });

    if (modErr || !modules) {
      return NextResponse.json({ data: [], source: 'fallback', error: modErr?.message });
    }

    // Map to the shape the client expects
    const nav = modules.map((m) => ({
      module_code: m.code,
      display_name: m.name,
      module_type: m.kind,
      nav_modules: m.nav_modules || [],
      nav_prefixes: m.nav_prefixes || [],
      sort_order: m.sort_order,
    }));

    return NextResponse.json({ data: nav, source: 'fallback', count: nav.length });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: { code: 'INTERNAL', message: e instanceof Error ? e.message : 'Failed', requestId: crypto.randomUUID() } },
      { status: 500 },
    );
  }
}
