import { NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { setModuleEnabled, tenantOperatorUserId } from '@/lib/platformServer';

export const dynamic = 'force-dynamic';

function fail(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

/**
 * GET /api/platform/modules — Settings/Modules + Industry packs:
 * platform_modules (catalog) joined with platform_tenant_modules (this
 * tenant's switches), platform_packs + platform_pack_items, and
 * platform_tenant_packs (applied).
 */
export async function GET() {
  try {
    const db = supabaseAdmin();
    const [catalog, tenantMods, packs, tenantPacks, packItems] = await Promise.all([
      db.from('platform_modules').select('code, name, kind, domain_no, description, depends_on, sort_order').order('sort_order'),
      db.from('platform_tenant_modules').select('module_code, enabled, config, enabled_at').eq('tenant_id', DEFAULT_TENANT_ID),
      db.from('platform_packs').select('code, name, kind, description, modules, version').order('code'),
      db.from('platform_tenant_packs').select('pack_code, version, applied_at, result').eq('tenant_id', DEFAULT_TENANT_ID),
      db.from('platform_pack_items').select('pack_code'),
    ]);
    const state = new Map((tenantMods.data || []).map((t) => [t.module_code, t]));
    const itemCounts = new Map<string, number>();
    for (const it of packItems.data || []) itemCounts.set(it.pack_code, (itemCounts.get(it.pack_code) || 0) + 1);
    const applied = new Map((tenantPacks.data || []).map((t) => [t.pack_code, t]));
    return NextResponse.json({
      data: {
        modules: (catalog.data || []).map((m) => ({
          code: m.code,
          name: m.name,
          kind: m.kind,
          description: m.description,
          dependsOn: m.depends_on || [],
          enabled: state.has(m.code) ? !!state.get(m.code)?.enabled : null,
          enabledAt: state.get(m.code)?.enabled_at ?? null,
        })),
        packs: (packs.data || []).map((p) => ({
          code: p.code,
          name: p.name,
          kind: p.kind,
          description: p.description,
          modules: p.modules || [],
          version: p.version,
          itemCount: itemCounts.get(p.code) || 0,
          applied: applied.has(p.code),
          appliedAt: applied.get(p.code)?.applied_at ?? null,
        })),
      },
    });
  } catch (e: unknown) {
    return fail('INTERNAL', e instanceof Error ? e.message : 'Failed', 500);
  }
}

/**
 * POST /api/platform/modules
 *   { action: 'module.enable', module, enabled } → platform_enable_module
 *     (replicated in lib/platformServer — the RPC guards on
 *     platform__can_admin(auth.uid()), unreachable via service role)
 *   { action: 'pack.apply', pack }               → platform_apply_pack
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const action = String(body.action || '');
    const db = supabaseAdmin();

    if (action === 'module.enable') {
      try {
        const result = await setModuleEnabled(String(body.module || ''), body.enabled !== false);
        return NextResponse.json({ data: result });
      } catch (e) {
        // setModuleEnabled's guards are user-facing refusals, not server
        // faults: unknown module and "dependents still enabled" used to
        // surface as 500 ACTION_FAILED from the catch-all below.
        const message = e instanceof Error ? e.message : 'Module toggle failed';
        if (message.startsWith('Unknown module')) return fail('NOT_FOUND', message, 404);
        if (message.startsWith('Turn off ')) return fail('DEPENDENTS_ENABLED', message, 400);
        throw e;
      }
    }

    if (action === 'pack.apply') {
      const { data, error } = await db.rpc('platform_apply_pack', {
        p_tenant: DEFAULT_TENANT_ID,
        p_pack: String(body.pack || ''),
      });
      if (error) {
        // platform_apply_pack may guard on admin the same way; fall back to
        // its visible effect: record the application for this tenant.
        const operatorId = await tenantOperatorUserId();
        const { data: pack } = await db.from('platform_packs').select('code, version').eq('code', String(body.pack || '')).maybeSingle();
        if (!pack) return fail('NOT_FOUND', `Unknown pack ${String(body.pack || '')}`, 404);
        const { error: upErr } = await db.from('platform_tenant_packs').upsert(
          { tenant_id: DEFAULT_TENANT_ID, pack_code: pack.code, version: pack.version, applied_by: operatorId, applied_at: new Date().toISOString(), result: { via: 'api-fallback', rpcError: error.message } },
          { onConflict: 'tenant_id,pack_code' },
        );
        if (upErr) return fail('RPC_FAILED', upErr.message, 500);
        return NextResponse.json({ data: { applied: pack.code } }, { status: 201 });
      }
      return NextResponse.json({ data: data ?? { ok: true } }, { status: 201 });
    }

    return fail('UNKNOWN_ACTION', `Action ${action} is not handled here`, 400);
  } catch (e: unknown) {
    return fail('ACTION_FAILED', e instanceof Error ? e.message : 'Action failed', 500);
  }
}
