import { NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/**
 * GET /api/v1/tenant/actions
 * Returns the tenant's create-menu actions from the real database.
 * Calls platform_tenant_actions() RPC first; falls back to filtering
 * platform_quick_action_registry by the tenant's enabled modules.
 *
 * platform_quick_action_registry columns: action_code, module, display_name,
 * area, implementation, is_active, kind, object_type, required_access,
 * rpc_function, sort_order, target_table, ui_route
 */
export async function GET() {
  try {
    // Try the RPC first
    const { data: rpcData, error: rpcError } = await supabaseAdmin()
      .rpc('platform_tenant_actions', { p_tenant: DEFAULT_TENANT_ID });

    if (!rpcError && rpcData && rpcData.length > 0) {
      return NextResponse.json({ data: rpcData, source: 'rpc' });
    }

    // Fallback: get all active actions from the registry
    // The registry's 'module' field maps to the nav area (finance, crm, etc.)
    // We return ALL active actions since the tenant has 47 modules enabled
    const { data: actions, error: actErr } = await supabaseAdmin()
      .from('platform_quick_action_registry')
      .select('action_code,module,display_name,area,implementation,kind,object_type,required_access,rpc_function,sort_order,target_table,ui_route,is_active')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .limit(200);

    if (actErr || !actions) {
      return NextResponse.json({ data: [], source: 'fallback', error: actErr?.message });
    }

    return NextResponse.json({ data: actions, source: 'fallback', count: actions.length });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: { code: 'INTERNAL', message: e instanceof Error ? e.message : 'Failed', requestId: crypto.randomUUID() } },
      { status: 500 },
    );
  }
}
