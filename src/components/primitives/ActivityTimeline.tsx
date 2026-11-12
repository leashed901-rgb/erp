'use client';

import { useState, useEffect } from 'react';
import type { ActivityEntry } from '@/lib/contracts';

/**
 * ActivityTimeline — the universal activity log (spec §1.4).
 * Shows every status change, email, payment, comment, with actor.
 * Fetches from /api/v1/{type}/{id}/activity.
 */
export function ActivityTimeline({ type, id }: { type: string; id: string }) {
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    fetch(`/api/v1/${type}/${id}/activity`)
      .then((r) => r.json())
      .then((json) => { if (!cancelled) { setEntries(json.data || []); setLoaded(true); } })
      .catch(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, [type, id]);

  const iconFor = (t: string) => {
    if (t === 'payment' || t === 'paid') return 'payments';
    if (t === 'send' || t === 'sent') return 'send';
    if (t === 'created') return 'add_circle';
    if (t === 'status') return 'change_circle';
    if (t === 'note') return 'edit_note';
    if (t === 'email') return 'mail';
    if (t === 'void') return 'block';
    return 'circle';
  };

  return (
    <div className="space-y-3">
      <h4 className="text-[12px] font-bold uppercase tracking-wide text-on-surface-variant">Activity</h4>
      {!loaded && <div className="text-[12px] text-on-surface-variant">Loading…</div>}
      {loaded && entries.length === 0 && <div className="text-[12px] text-on-surface-variant">No activity yet</div>}
      {loaded && entries.length > 0 && (
        <ol className="space-y-3">
          {entries.map((e) => (
            <li key={e.id} className="flex gap-2">
              <span className="material-symbols-outlined text-[16px] text-on-surface-variant mt-0.5">{iconFor(e.type)}</span>
              <div className="flex-1 min-w-0">
                <div className="text-[12px] text-on-surface">{e.text}</div>
                <div className="text-[11px] text-on-surface-variant">
                  {e.actor} · {e.date?.slice(0, 10) || ''}
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export default ActivityTimeline;
