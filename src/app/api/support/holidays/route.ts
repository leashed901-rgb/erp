import { makeConfigHandlers } from '@/lib/supportConfigServer';
import { toHoliday } from '@/lib/supportTypes';

const h = makeConfigHandlers({
  table: 'support_holidays',
  orderBy: 'holiday_date',
  scoped: true,
  insertMap: (b) => {
    const name = typeof b.name === 'string' ? b.name.trim() : '';
    const date = typeof b.holidayDate === 'string' ? b.holidayDate : '';
    if (!name || !date) return { error: 'name and holidayDate are required' };
    return {
      name,
      holiday_date: date,
      business_hours_id: typeof b.businessHoursId === 'string' ? b.businessHoursId : null,
    };
  },
  patchMap: (b) => {
    const p: Record<string, unknown> = {};
    if (typeof b.name === 'string') p.name = b.name;
    if (typeof b.holidayDate === 'string') p.holiday_date = b.holidayDate;
    return p;
  },
  mapper: (r) => toHoliday(r),
});
export const GET = h.GET; export const POST = h.POST; export const PATCH = h.PATCH; export const DELETE = h.DELETE;
