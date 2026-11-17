'use client';
/**
 * PricingDrawer — a quick-action drawer that opens for a specific catalog
 * item (product). Shows:
 *   - Variant matrix (colors × sizes) selection
 *   - Supplier price comparison with landed cost
 *   - "Open in Design Studio" CTA
 *
 * This REPLACES the old standalone PricingPage (which had broken HTML —
 * literal `&rsaquo;` entities, undefined selectCat/setShowFlyout, and
 * CSS classes popover-menu/flyout-scrim that don't exist so they rendered
 * inline as unstyled text). Per the design principle: pricing lives ON
 * the item as a quick action/drawer, not as a standalone sidebar page.
 *
 * Opened by passing `item={{ name, category, subcategory }}` and
 * `onClose`. Uses the global .drawer-scrim/.drawer/.open classes from
 * marketing.css (the same drawer pattern every other drawer in the app
 * uses — PartyFormDrawer, SequencingTab builder, etc.).
 */
import { useState } from 'react';

interface PricingItem {
  name: string;
  category?: string;
  subcategory?: string;
}

interface PricingDrawerProps {
  item: PricingItem;
  onClose: () => void;
  onToast: (m: string) => void;
}

type Supplier = {
  name: string;
  avatar: string;
  avatarBg: string;
  base: number;
  ship: number;
  cheapest?: boolean;
};

const COLORS = [
  { name: 'Black',  hex: '#1a1c1e' },
  { name: 'White',  hex: '#ffffff', border: '#dad9dd' },
  { name: 'Forest', hex: '#1e5a38' },
  { name: 'Maroon', hex: '#6b1e28' },
  { name: 'Royal',  hex: '#0077c5' },
];

const SIZES = ['S', 'M', 'L', 'XL', '2XL', '3XL'];

const SUPPLIERS: Supplier[] = [
  { name: 'Printful', avatar: 'P', avatarBg: '#0077c5', base: 9.12, ship: 3.50, cheapest: true },
  { name: 'Gelato',   avatar: 'G', avatarBg: '#1e5a38', base: 8.80, ship: 4.50 },
];

const usd = (n: number) => `$${n.toFixed(2)}`;

export default function PricingDrawer({ item, onClose, onToast }: PricingDrawerProps) {
  const [selectedColors, setSelectedColors] = useState<Set<string>>(new Set(['Black', 'White']));
  const [selectedSizes, setSelectedSizes] = useState<Set<string>>(new Set(['S', 'M', 'L']));

  function toggleColor(c: string) {
    setSelectedColors(prev => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c); else next.add(c);
      return next;
    });
  }
  function toggleSize(s: string) {
    setSelectedSizes(prev => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s); else next.add(s);
      return next;
    });
  }
  function selectAllColors() { setSelectedColors(new Set(COLORS.map(c => c.name))); }
  function selectAllSizes() { setSelectedSizes(new Set(SIZES)); }

  const crumb = item.category && item.subcategory
    ? `${item.category} › ${item.subcategory}`
    : item.category ?? item.name;

  return (
    <>
      <div className="drawer-scrim open" onClick={onClose} />
      <div
        className="drawer open"
        role="dialog"
        aria-label={`Pricing for ${item.name}`}
        style={{ width: 720, maxWidth: '96vw' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 h-14 border-b border-surface-dim shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-qb-blue text-white flex items-center justify-center font-bold">
              <span className="material-symbols-outlined text-[18px]">payments</span>
            </div>
            <div className="min-w-0">
              <div className="text-headline-sm truncate">{crumb}</div>
              <div className="text-[11px] text-on-surface-variant">Variant Matrix &amp; Supplier Routing</div>
            </div>
          </div>
          <button
            className="w-8 h-8 rounded hover:bg-surface-container flex items-center justify-center"
            onClick={onClose}
            aria-label="Close"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* Left: selections + matrix */}
          <div className="xl:col-span-2 space-y-6">
            {/* 1. Colors */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="text-label-sm font-bold uppercase tracking-wider text-on-surface">1. Select Colors</div>
                <button
                  className="text-[11px] text-primary font-semibold hover:underline"
                  onClick={selectAllColors}
                >
                  Select all
                </button>
              </div>
              <div className="flex flex-wrap gap-4">
                {COLORS.map(c => {
                  const selected = selectedColors.has(c.name);
                  return (
                    <button
                      key={c.name}
                      type="button"
                      className="flex flex-col items-center gap-1"
                      onClick={() => toggleColor(c.name)}
                    >
                      <div
                        className={`color-swatch ${selected ? 'selected' : ''}`}
                        style={{
                          background: c.hex,
                          borderColor: c.border ?? (selected ? '#0077c5' : '#dad9dd'),
                          width: 36,
                          height: 36,
                          borderRadius: '50%',
                          borderWidth: 2,
                          borderStyle: 'solid',
                          boxShadow: selected ? '0 0 0 2px rgba(0,119,197,.2)' : 'none',
                          cursor: 'pointer',
                        }}
                      />
                      <span className="text-[10px] font-medium text-on-surface-variant">{c.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 2. Sizes */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="text-label-sm font-bold uppercase tracking-wider text-on-surface">2. Select Sizes</div>
                <button
                  className="text-[11px] text-primary font-semibold hover:underline"
                  onClick={selectAllSizes}
                >
                  Select all
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {SIZES.map(s => {
                  const selected = selectedSizes.has(s);
                  return (
                    <button
                      key={s}
                      type="button"
                      className={`px-3 py-1.5 border rounded text-[12px] font-semibold ${
                        selected
                          ? 'border-qb-blue bg-qb-blue/10 text-qb-blue'
                          : 'border-surface-dim hover:border-primary'
                      }`}
                      onClick={() => toggleSize(s)}
                    >
                      {s}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Matrix preview */}
            <div>
              <div className="text-label-sm font-bold uppercase tracking-wider text-on-surface mb-3">Matrix Preview</div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-[12px] border border-surface-dim rounded">
                  <thead className="bg-surface-container-low">
                    <tr>
                      <th className="px-3 py-2 font-semibold" style={{ width: 120 }}>Color \ Size</th>
                      {SIZES.slice(0, 4).map(s => (
                        <th key={s} className="px-3 py-2 font-semibold text-center">{s}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-dim">
                    {COLORS.slice(0, 2).map(c => (
                      <tr key={c.name}>
                        <td className="px-3 py-2 font-medium">{c.name}</td>
                        {SIZES.slice(0, 4).map(s => {
                          const checked = selectedColors.has(c.name) && selectedSizes.has(s);
                          return (
                            <td key={s} className="px-3 py-2 text-center">
                              <input type="checkbox" checked={checked} readOnly className="row-check" />
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Right: supplier routing */}
          <div className="space-y-4">
            <div className="text-label-sm font-bold uppercase tracking-wider text-on-surface mb-1">3. Supplier Routing</div>
            <p className="text-[11px] text-on-surface-variant mb-3">
              Select the supplier with the lowest landed cost to fulfill this design.
            </p>
            <div className="space-y-2">
              {SUPPLIERS.map(sup => {
                const total = sup.base + sup.ship;
                return (
                  <div
                    key={sup.name}
                    className={`supplier-card border rounded-lg p-3 flex items-center justify-between ${
                      sup.cheapest ? 'border-qb-blue bg-qb-blue/5' : 'border-surface-dim'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="w-8 h-8 rounded text-white flex items-center justify-center font-bold"
                        style={{ background: sup.avatarBg }}
                      >
                        {sup.avatar}
                      </div>
                      <div>
                        <div className="font-semibold text-body-sm">{sup.name}</div>
                        <div className="text-[10px] text-on-surface-variant">
                          Base: {usd(sup.base)} · Ship: {usd(sup.ship)}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-secondary tabular-nums">
                        {usd(total)}
                        <span className="text-[10px] font-normal text-on-surface-variant">/unit</span>
                      </div>
                      {sup.cheapest && <div className="text-[10px] text-secondary font-semibold">Cheapest</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="h-14 border-t border-surface-dim px-4 flex items-center justify-between shrink-0">
          <button
            className="h-8 px-4 border border-surface-dim rounded text-body-md hover:bg-surface-container-low font-semibold"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            className="h-9 px-5 bg-primary text-white rounded text-body-md font-semibold hover:bg-primary-container flex items-center gap-2 shadow-sm"
            onClick={() => {
              onClose();
              onToast('Opening Design Studio with selected variant matrix…');
            }}
          >
            <span className="material-symbols-outlined text-[18px]">palette</span>
            Open in Design Studio
          </button>
        </div>
      </div>
    </>
  );
}
