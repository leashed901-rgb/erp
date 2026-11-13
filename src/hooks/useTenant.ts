'use client';

import { useState, useEffect } from 'react';

export interface TenantModule {
  module_code: string;
  display_name: string;
  module_type: string;
  nav_modules: string[];
  nav_prefixes: string[];
  sort_order: number;
}

export interface TenantAction {
  action_code: string;
  module: string;
  display_name: string;
  area: string;
  implementation: string;
  kind: string;
  object_type: string;
  required_access: string;
  rpc_function: string | null;
  sort_order: number;
  target_table: string | null;
  ui_route: string | null;
  is_active: boolean;
}

/**
 * useTenantNav — fetches the tenant's navigation tree from the real
 * database via /api/v1/tenant/nav. This replaces the static shellData.ts
 * nav array. Each client's module set drives the UI — this is what
 * makes a vet practice and a retail store run the same app differently.
 */
export function useTenantNav() {
  const [modules, setModules] = useState<TenantModule[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/v1/tenant/nav')
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        setModules(json.data || []);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
    return () => { cancelled = true; };
  }, []);

  return { modules, loaded };
}

/**
 * useTenantActions — fetches the tenant's create-menu actions from the
 * real database via /api/v1/tenant/actions. This replaces the static
 * CreateFlyout action list. 181 actions from platform_quick_action_registry.
 */
export function useTenantActions() {
  const [actions, setActions] = useState<TenantAction[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/v1/tenant/actions')
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        setActions(json.data || []);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
    return () => { cancelled = true; };
  }, []);

  // Group actions by area for the Create menu
  const grouped: Record<string, TenantAction[]> = {};
  for (const a of actions) {
    const area = a.area || 'other';
    if (!grouped[area]) grouped[area] = [];
    grouped[area].push(a);
  }

  return { actions, grouped, loaded };
}
