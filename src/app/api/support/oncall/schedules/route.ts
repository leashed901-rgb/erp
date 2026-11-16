import { makeConfigHandlers } from '@/lib/supportConfigServer';
import { toOncallSchedule } from '@/lib/supportTypes';

const h = makeConfigHandlers({
  table: 'support_oncall_schedules',
  configShape: false,
  orderBy: 'name',
  scoped: true,
  insertMap: (b) => {
    const name = typeof b.name === 'string' ? b.name.trim() : '';
    if (!name) return { error: 'name is required' };
    return {
      name,
      team_id: typeof b.teamId === 'string' ? b.teamId : null,
      timezone: typeof b.timezone === 'string' ? b.timezone : 'America/Chicago',
      rotation_type: typeof b.rotationType === 'string' ? b.rotationType : 'weekly',
      shift_length_hours: typeof b.shiftLengthHours === 'number' ? b.shiftLengthHours : 168,
      rotation_start_at: typeof b.rotationStartAt === 'string' ? b.rotationStartAt : new Date().toISOString(),
      covers: typeof b.covers === 'string' && ['always', 'after_hours', 'business_hours'].includes(b.covers) ? b.covers : 'always',
      business_hours_id: typeof b.businessHoursId === 'string' ? b.businessHoursId : null,
      is_active: b.isActive !== false,
    };
  },
  patchMap: (b) => {
    const p: Record<string, unknown> = {};
    if (typeof b.name === 'string') p.name = b.name;
    if (typeof b.isActive === 'boolean') p.is_active = b.isActive;
    if (typeof b.rotationType === 'string') p.rotation_type = b.rotationType;
    return p;
  },
  mapper: (r) => toOncallSchedule(r),
});
export const GET = h.GET; export const POST = h.POST; export const PATCH = h.PATCH; export const DELETE = h.DELETE;
