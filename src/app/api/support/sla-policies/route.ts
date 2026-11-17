import { makeConfigHandlers } from '@/lib/supportConfigServer';
import { toSlaPolicy } from '@/lib/supportTypes';

const h = makeConfigHandlers({
  table: 'support_sla_policies',
  orderBy: 'name',
  scoped: true,
  insertMap: (b) => {
    const name = typeof b.name === 'string' ? b.name.trim() : '';
    if (!name) return { error: 'name is required' };
    return {
      name,
      first_response_minutes: typeof b.firstResponseMinutes === 'number' ? b.firstResponseMinutes : null,
      next_reply_minutes: typeof b.nextReplyMinutes === 'number' ? b.nextReplyMinutes : null,
      resolution_minutes: typeof b.resolutionMinutes === 'number' ? b.resolutionMinutes : null,
      uses_business_hours: Boolean(b.usesBusinessHours),
      business_hours_id: typeof b.businessHoursId === 'string' ? b.businessHoursId : null,
      is_default: Boolean(b.isDefault),
      is_active: b.isActive !== false,
    };
  },
  patchMap: (b) => {
    const p: Record<string, unknown> = {};
    if (typeof b.name === 'string') p.name = b.name;
    if (typeof b.firstResponseMinutes === 'number') p.first_response_minutes = b.firstResponseMinutes;
    if (typeof b.nextReplyMinutes === 'number') p.next_reply_minutes = b.nextReplyMinutes;
    if (typeof b.resolutionMinutes === 'number') p.resolution_minutes = b.resolutionMinutes;
    if (typeof b.isActive === 'boolean') p.is_active = b.isActive;
    if (typeof b.isDefault === 'boolean') p.is_default = b.isDefault;
    return p;
  },
  mapper: (r) => toSlaPolicy(r),
});
export const GET = h.GET; export const POST = h.POST; export const PATCH = h.PATCH; export const DELETE = h.DELETE;
