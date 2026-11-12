'use client';

import type { Pill as PillType } from '@/lib/contracts';

const PILL_COLORS: Record<string, string> = {
  status: 'bg-surface-container text-on-surface-variant',
  relation: 'bg-primary-container text-primary',
  party: 'bg-qb-blue/10 text-qb-blue',
  channel: 'bg-qb-teal/10 text-qb-teal',
  alert: 'bg-error/10 text-error',
  tag: 'bg-surface-container-low text-on-surface-variant',
  fulfillment: 'bg-qb-green/10 text-qb-green',
};

const STATUS_COLORS: Record<string, string> = {
  Paid: 'bg-[#e6f4ea] text-[#137333]',
  Deposited: 'bg-[#e6f4ea] text-[#137333]',
  PAID: 'bg-[#e6f4ea] text-[#137333]',
  Sent: 'bg-[#e8f0fe] text-[#1967d2]',
  Draft: 'bg-[#fef7e0] text-[#b06000]',
  Unpaid: 'bg-[#fce8e6] text-[#a50e0e]',
  Overdue: 'bg-[#fce8e6] text-[#a50e0e]',
  OPEN: 'bg-[#e8f0fe] text-[#1967d2]',
  DRAFT: 'bg-[#fef7e0] text-[#b06000]',
  OVERDUE: 'bg-[#fce8e6] text-[#a50e0e]',
  Void: 'bg-surface-container text-on-surface-variant',
};

/** Pill — universal pill component (spec §1.6). 7 variants. */
export function Pill({ pill, onClick, onContextMenu }: {
  pill: PillType;
  onClick?: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
}) {
  const isStatus = pill.type === 'status';
  const statusColor = isStatus ? STATUS_COLORS[pill.label] : null;
  const baseColor = PILL_COLORS[pill.type] || PILL_COLORS.tag;
  const colorClass = statusColor || baseColor;
  const clickable = onClick || pill.targetId;

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold whitespace-nowrap ${colorClass} ${clickable ? 'cursor-pointer hover:opacity-80' : ''}`}
      onClick={onClick}
      onContextMenu={onContextMenu}
      title={pill.label}
    >
      {pill.label}
    </span>
  );
}

export default Pill;
