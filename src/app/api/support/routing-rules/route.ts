import { makeConfigHandlers } from '@/lib/supportConfigServer';
import { toRoutingRule } from '@/lib/supportTypes';

const h = makeConfigHandlers({
  table: 'support_routing_rules',
  orderBy: 'rule_order',
  scoped: true,
  insertMap: (b) => {
    const name = typeof b.name === 'string' ? b.name.trim() : '';
    if (!name) return { error: 'name is required' };
    return {
      name,
      rule_order: typeof b.ruleOrder === 'number' ? b.ruleOrder : 0,
      conditions: b.conditions && typeof b.conditions === 'object' ? b.conditions : {},
      strategy: typeof b.strategy === 'string' ? b.strategy : 'round_robin',
      target_team_id: typeof b.targetTeamId === 'string' ? b.targetTeamId : null,
      target_staff_id: typeof b.targetStaffId === 'string' ? b.targetStaffId : null,
      set_priority: typeof b.setPriority === 'string' ? b.setPriority : null,
      set_tags: Array.isArray(b.setTags) ? b.setTags : [],
      sla_policy_id: typeof b.slaPolicyId === 'string' ? b.slaPolicyId : null,
      is_active: b.isActive !== false,
    };
  },
  patchMap: (b) => {
    const p: Record<string, unknown> = {};
    if (typeof b.name === 'string') p.name = b.name;
    if (typeof b.isActive === 'boolean') p.is_active = b.isActive;
    if (typeof b.ruleOrder === 'number') p.rule_order = b.ruleOrder;
    if (b.conditions && typeof b.conditions === 'object') p.conditions = b.conditions;
    return p;
  },
  mapper: (r) => toRoutingRule(r),
});
export const GET = h.GET; export const POST = h.POST; export const PATCH = h.PATCH; export const DELETE = h.DELETE;
