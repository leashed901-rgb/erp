'use client';

import type { Pill as PillType } from '@/lib/contracts';
import { Pill } from './Pill';

/**
 * RelatedRail — linked records as pills (spec §1.4, §1.6).
 * Shows relation pills (Order #1042, Inv #88, PO #12, Ticket #301)
 * that link to the related module. No extra API call — reads from
 * meta.relations on the record.
 */
export function RelatedRail({ relations }: {
  relations: { type: string; id: string; label: string }[];
}) {
  if (!relations || relations.length === 0) return null;

  return (
    <div className="space-y-2">
      <h4 className="text-[12px] font-bold uppercase tracking-wide text-on-surface-variant">Related</h4>
      <div className="flex flex-wrap gap-1">
        {relations.map((rel, i) => (
          <Pill
            key={`${rel.type}-${rel.id}-${i}`}
            pill={{ type: 'relation', label: rel.label, targetType: rel.type, targetId: rel.id } as PillType}
            onClick={() => { /* navigate to related record */ }}
          />
        ))}
      </div>
    </div>
  );
}

export default RelatedRail;
