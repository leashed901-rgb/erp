import { makeConfigHandlers } from '@/lib/supportConfigServer';
import { toSupportQueue } from '@/lib/supportTypes';

const h = makeConfigHandlers({
  table: 'support_queues',
  orderBy: 'sort_order',
  scoped: true,
  insertMap: (b) => {
    const name = typeof b.name === 'string' ? b.name.trim() : '';
    if (!name) return { error: 'name is required' };
    return {
      name,
      owner_type: typeof b.ownerType === 'string' ? b.ownerType : 'team',
      owner_staff_id: typeof b.ownerStaffId === 'string' ? b.ownerStaffId : null,
      owner_team_id: typeof b.ownerTeamId === 'string' ? b.ownerTeamId : null,
      filter: b.filter && typeof b.filter === 'object' ? b.filter : {},
      is_shared: b.isShared !== false,
      sort_order: typeof b.sortOrder === 'number' ? b.sortOrder : 0,
    };
  },
  patchMap: (b) => {
    const p: Record<string, unknown> = {};
    if (typeof b.name === 'string') p.name = b.name;
    if (b.filter && typeof b.filter === 'object') p.filter = b.filter;
    if (typeof b.isShared === 'boolean') p.is_shared = b.isShared;
    if (typeof b.sortOrder === 'number') p.sort_order = b.sortOrder;
    return p;
  },
  mapper: (r) => toSupportQueue(r),
});
export const GET = h.GET; export const POST = h.POST; export const PATCH = h.PATCH; export const DELETE = h.DELETE;
