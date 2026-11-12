'use client';

import { useState, useEffect } from 'react';
import type { ImpactSummary } from '@/lib/contracts';

/**
 * ExistingRecordBanner — the edit-warning banner (spec §1.9, rule 7).
 * Shown when editing a pushed/global record. Fetches impact from
 * /api/v1/{type}/{id}/impact. Tier 1 = no banner, Tier 2 = notice,
 * Tier 3 = confirm on save, Tier 4 = locked fields.
 */
export function ExistingRecordBanner({ type, id }: { type: string; id: string }) {
  const [impact, setImpact] = useState<ImpactSummary | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/v1/${type}/${id}/impact`)
      .then((r) => r.json())
      .then((json) => { if (!cancelled) setImpact(json.data || null); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [type, id]);

  if (!impact || impact.tier <= 1) return null;

  const tierLabels: Record<number, { bg: string; text: string; msg: string }> = {
    2: { bg: 'bg-[#fef7e0] border-[#f9d77e]', text: 'text-[#b06000]', msg: 'You\'re editing an existing record shared with Global.' },
    3: { bg: 'bg-[#fce8e6] border-[#f28b82]', text: 'text-[#a50e0e]', msg: 'This change affects dependent records. Confirm on save.' },
    4: { bg: 'bg-surface-container border-surface-dim', text: 'text-on-surface-variant', msg: 'This record is posted/locked. Use Void, Adjust, or Credit memo.' },
  };

  const tier = tierLabels[impact.tier] || tierLabels[2];

  return (
    <div className={`flex items-center gap-3 p-3 border rounded-lg ${tier.bg} ${tier.text} mb-3`}>
      <span className="material-symbols-outlined text-[20px]">warning</span>
      <div className="flex-1 text-[12px] font-medium">
        {tier.msg}
        {impact.impactCounts && Object.keys(impact.impactCounts).length > 0 && (
          <span className="ml-2 text-[11px]">
            {Object.entries(impact.impactCounts).map(([k, v]) => `${v} ${k}`).join(' · ')}
          </span>
        )}
      </div>
      {impact.usedIn.length > 0 && (
        <button className="text-[11px] font-semibold underline" onClick={() => { /* show where used */ }}>
          View where used ({impact.usedIn.length})
        </button>
      )}
    </div>
  );
}

export default ExistingRecordBanner;
