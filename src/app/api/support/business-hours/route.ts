import { makeConfigHandlers } from '@/lib/supportConfigServer';
import { toBusinessHours } from '@/lib/supportTypes';

const h = makeConfigHandlers({
  table: 'support_business_hours',
  orderBy: 'name',
  scoped: true,
  insertMap: (b) => {
    const name = typeof b.name === 'string' ? b.name.trim() : '';
    if (!name) return { error: 'name is required' };
    return {
      name,
      timezone: typeof b.timezone === 'string' ? b.timezone : 'America/Chicago',
      schedule: b.schedule && typeof b.schedule === 'object' ? b.schedule : {},
      is_default: Boolean(b.isDefault),
      is_active: b.isActive !== false,
    };
  },
  patchMap: (b) => {
    const p: Record<string, unknown> = {};
    if (typeof b.name === 'string') p.name = b.name;
    if (typeof b.timezone === 'string') p.timezone = b.timezone;
    if (b.schedule && typeof b.schedule === 'object') p.schedule = b.schedule;
    if (typeof b.isActive === 'boolean') p.is_active = b.isActive;
    if (typeof b.isDefault === 'boolean') p.is_default = b.isDefault;
    return p;
  },
  mapper: (r) => toBusinessHours(r),
});
export const GET = h.GET; export const POST = h.POST; export const PATCH = h.PATCH; export const DELETE = h.DELETE;
