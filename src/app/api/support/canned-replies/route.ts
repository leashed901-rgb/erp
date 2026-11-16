import { makeConfigHandlers } from '@/lib/supportConfigServer';
import { toCannedReply } from '@/lib/supportTypes';

const h = makeConfigHandlers({
  table: 'support_canned_replies',
  orderBy: 'title',
  scoped: true,
  insertMap: (b) => {
    const title = typeof b.title === 'string' ? b.title.trim() : '';
    const bodyText = typeof b.body === 'string' ? b.body : '';
    if (!title || !bodyText) return { error: 'title and body are required' };
    return {
      title,
      body: bodyText,
      category_code: typeof b.categoryCode === 'string' ? b.categoryCode : null,
      locale: typeof b.locale === 'string' ? b.locale : 'en',
      is_active: b.isActive !== false,
    };
  },
  patchMap: (b) => {
    const p: Record<string, unknown> = {};
    if (typeof b.title === 'string') p.title = b.title;
    if (typeof b.body === 'string') p.body = b.body;
    if (typeof b.isActive === 'boolean') p.is_active = b.isActive;
    return p;
  },
  mapper: (r) => toCannedReply(r),
});
export const GET = h.GET; export const POST = h.POST; export const PATCH = h.PATCH; export const DELETE = h.DELETE;
