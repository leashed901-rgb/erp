import { makeConfigHandlers } from '@/lib/supportConfigServer';
import { toSupportAutomation } from '@/lib/supportTypes';

const h = makeConfigHandlers({
  table: 'support_automations',
  orderBy: 'name',
  scoped: true,
  insertMap: (b) => {
    const name = typeof b.name === 'string' ? b.name.trim() : '';
    const trigger = typeof b.triggerEvent === 'string' ? b.triggerEvent.trim() : '';
    if (!name || !trigger) return { error: 'name and triggerEvent are required' };
    return {
      name,
      trigger_event: trigger,
      conditions: b.conditions && typeof b.conditions === 'object' ? b.conditions : {},
      actions: Array.isArray(b.actions) ? b.actions : [],
      dry_run: Boolean(b.dryRun),
      kill_switch: Boolean(b.killSwitch),
      is_active: b.isActive !== false,
    };
  },
  patchMap: (b) => {
    const p: Record<string, unknown> = {};
    if (typeof b.name === 'string') p.name = b.name;
    if (typeof b.isActive === 'boolean') p.is_active = b.isActive;
    if (typeof b.dryRun === 'boolean') p.dry_run = b.dryRun;
    if (typeof b.killSwitch === 'boolean') p.kill_switch = b.killSwitch;
    if (Array.isArray(b.actions)) p.actions = b.actions;
    return p;
  },
  mapper: (r) => toSupportAutomation(r),
});
export const GET = h.GET; export const POST = h.POST; export const PATCH = h.PATCH; export const DELETE = h.DELETE;
