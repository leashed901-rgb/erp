import { makeConfigHandlers } from '@/lib/supportConfigServer';
import { toKbArticle } from '@/lib/supportTypes';

const h = makeConfigHandlers({
  table: 'support_kb_articles',
  configShape: false,
  orderBy: 'title',
  scoped: true,
  insertMap: (b) => {
    const title = typeof b.title === 'string' ? b.title.trim() : '';
    if (!title) return { error: 'title is required' };
    return {
      title,
      summary: typeof b.summary === 'string' ? b.summary : null,
      body: typeof b.body === 'string' ? b.body : null,
      collection: typeof b.collection === 'string' ? b.collection : 'General',
      audience: typeof b.audience === 'string' ? b.audience : 'public',
      owner_name: typeof b.ownerName === 'string' ? b.ownerName : null,
      status: typeof b.status === 'string' ? b.status : 'draft',
    };
  },
  patchMap: (b) => {
    const p: Record<string, unknown> = {};
    if (typeof b.title === 'string') p.title = b.title;
    if (typeof b.summary === 'string') p.summary = b.summary;
    if (typeof b.body === 'string') p.body = b.body;
    if (typeof b.status === 'string') p.status = b.status;
    if (typeof b.collection === 'string') p.collection = b.collection;
    return p;
  },
  mapper: (r) => toKbArticle(r),
});
export const GET = h.GET; export const POST = h.POST; export const PATCH = h.PATCH; export const DELETE = h.DELETE;
