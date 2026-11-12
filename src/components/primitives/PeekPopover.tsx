'use client';

import { useState, useRef, useEffect } from 'react';
import type { PeekCard, Pill as PillType } from '@/lib/contracts';
import { Pill } from './Pill';

/**
 * PeekPopover — hover-intent peek (spec §1.2, §1.4).
 * 300ms hover delay, cancels on leave. Fetches /api/v1/peek/{type}/{id}.
 * Shows a compact card: title, subtitle, key fields, pills, quick actions.
 */
export function PeekPopover({
  targetType,
  targetId,
  children,
  onOpen,
}: {
  targetType: string;
  targetId: string;
  children: React.ReactNode;
  onOpen?: () => void;
}) {
  const [show, setShow] = useState(false);
  const [card, setCard] = useState<PeekCard | null>(null);
  const [loading, setLoading] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetchCard = async () => {
    if (!targetType || !targetId) return;
    setLoading(true);
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      const res = await fetch(`/api/v1/peek/${targetType}/${targetId}`, { signal: ac.signal });
      const json = await res.json();
      setCard(json.data || null);
    } catch {
      // aborted or error — leave card null
    } finally {
      setLoading(false);
    }
  };

  const handleEnter = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setShow(true);
      onOpen?.();
      void fetchCard();
    }, 300);
  };

  const handleLeave = () => {
    if (timer.current) clearTimeout(timer.current);
    setShow(false);
  };

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); abortRef.current?.abort(); }, []);

  return (
    <span className="relative inline-block" onMouseEnter={handleEnter} onMouseLeave={handleLeave}>
      {children}
      {show && (
        <div className="absolute z-[9999] top-full left-0 mt-1 w-72 bg-white rounded-lg shadow-2xl border border-surface-dim p-3" onMouseEnter={handleEnter} onMouseLeave={handleLeave}>
          {loading && <div className="text-[12px] text-on-surface-variant">Loading…</div>}
          {!loading && card && (
            <>
              <div className="font-semibold text-[13px] text-on-surface mb-0.5">{card.title}</div>
              {card.subtitle && <div className="text-[11px] text-on-surface-variant mb-2">{card.subtitle}</div>}
              {card.fields.length > 0 && (
                <dl className="text-[12px] space-y-1 mb-2">
                  {card.fields.map((f) => (
                    <div key={f.label} className="flex justify-between gap-2">
                      <dt className="text-on-surface-variant">{f.label}</dt>
                      <dd className="font-medium text-on-surface">{f.value}</dd>
                    </div>
                  ))}
                </dl>
              )}
              {card.pills.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-2">
                  {card.pills.map((p: PillType, i) => <Pill key={i} pill={p} />)}
                </div>
              )}
              {card.actions.length > 0 && (
                <div className="flex gap-1 flex-wrap pt-1 border-t border-surface-dim">
                  {card.actions.slice(0, 4).map((a) => (
                    <button key={a.id} className="text-[11px] font-semibold text-primary hover:underline" onClick={a.action ? undefined : undefined}>
                      {a.label}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
          {!loading && !card && <div className="text-[12px] text-on-surface-variant">No data</div>}
        </div>
      )}
    </span>
  );
}

export default PeekPopover;
