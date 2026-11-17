import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

/**
 * GET /api/v1/nav — the tenant's navigation tree, driven by the database
 * (platform_feature_tree_coverage), NOT hardcoded shellData.ts.
 *
 * Returns the nav grouped by domain (module) → group → screens, with
 * backing tables + implementation status. This is the DB-driven replacement
 * for shellData.ts's DOMAINS array (C1 unification).
 *
 * Also returns the quick-action registry (platform_quick_action_registry)
 * so the Create menu + right-click menus read from one source.
 */
export async function GET() {
  const [navRes, actionsRes] = await Promise.all([
    supabaseAdmin()
      .from('platform_feature_tree_coverage')
      .select('feature_path, module, backing_table, is_implemented')
      .order('feature_path'),
    supabaseAdmin()
      .from('platform_quick_action_registry')
      // action_code + module are the execution binding: without them the
      // Create flyout could only pass a display label and nearly every
      // registry action fell through to a toast (found 2026-11-15).
      .select('action_code, module, display_name, kind, area, object_type, implementation, rpc_function, target_table, ui_route')
      .order('display_name'),
  ]);

  if (navRes.error) {
    return NextResponse.json({ error: { code: 'INTERNAL', message: navRes.error.message } }, { status: 500 });
  }

  // Group feature paths into a nav tree: domain → groups → screens
  const domains = new Map<string, { key: string; label: string; groups: Map<string, { id: string; label: string; screens: any[] }> }>();

  for (const row of navRes.data || []) {
    const parts = (row.feature_path || '').split('/').filter(Boolean);
    if (parts.length === 0) continue;

    const moduleKey = row.module || parts[0].toLowerCase().replace(/\s+/g, '_');
    const domainLabel = parts[0];
    const groupLabel = parts.length > 2 ? parts[1] : domainLabel;
    const screenLabel = parts[parts.length - 1];
    const screenId = `${moduleKey}-${parts.slice(1).join('--').toLowerCase().replace(/\s+/g, '-')}`;

    if (!domains.has(moduleKey)) {
      domains.set(moduleKey, { key: moduleKey, label: domainLabel, groups: new Map() });
    }
    const domain = domains.get(moduleKey)!;
    if (!domain.groups.has(groupLabel)) {
      domain.groups.set(groupLabel, { id: groupLabel.toLowerCase().replace(/\s+/g, '-'), label: groupLabel, screens: [] });
    }
    domain.groups.get(groupLabel)!.screens.push({
      id: screenId,
      label: screenLabel,
      module: moduleKey,
      backingTable: row.backing_table,
      implemented: row.is_implemented,
    });
  }

  const navTree = Array.from(domains.values()).map(d => ({
    key: d.key,
    label: d.label,
    groups: Array.from(d.groups.values()),
  }));

  return NextResponse.json({
    data: {
      domains: navTree,
      actions: actionsRes.data || [],
    },
    meta: {
      domainCount: navTree.length,
      screenCount: navTree.reduce((sum, d) => sum + d.groups.reduce((s, g) => s + g.screens.length, 0), 0),
      actionCount: actionsRes.data?.length || 0,
    },
  });
}
