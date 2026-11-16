import { useState } from 'react';
import { useDesignCanvas } from '@/lib/designCanvasStore';

/**
 * Create RFQ from a tech pack — a drawer, not a toast. Prefilled from the
 * tech pack (title + line), the user sets quantity and bid deadline, then
 * the RFQ is created and the board opens. POST /api/v1/rfqs.
 */
export default function CreateRfqDrawer({
  techPackId,
  techPackTitle,
  onClose,
  onCreated,
}: {
  techPackId: string;
  techPackTitle: string;
  onClose: () => void;
  onCreated: (rfqId: string) => void;
}) {
  const openRfq = useDesignCanvas((s) => s.openRfq);
  const [quantity, setQuantity] = useState('500');
  const [deadline, setDeadline] = useState(() => {
    const d = new Date(Date.now() + 7 * 24 * 3600 * 1000);
    return d.toISOString().slice(0, 16);
  });
  const [sealed, setSealed] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setError(null);
    const qty = parseInt(quantity, 10);
    if (!qty || qty <= 0) {
      setError('Quantity must be at least 1.');
      return;
    }
    if (!deadline || new Date(deadline).getTime() <= Date.now() + 60 * 60 * 1000) {
      setError('Bid deadline must be at least 1 hour away — publishing requires it.');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/v1/rfqs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: `RFQ — ${techPackTitle}`,
          techPackId,
          quantity: qty,
          bidDeadline: new Date(deadline).toISOString(),
          sealed,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message ?? 'Failed to create RFQ.');
      openRfq(body.id as string);
      onCreated(body.id as string);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create RFQ.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[81] flex justify-end" role="dialog" aria-label="Create RFQ">
      <div className="absolute inset-0 bg-black/35" onClick={onClose} />
      <div className="relative w-[480px] max-w-[96vw] bg-white h-full flex flex-col shadow-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-dim">
          <div>
            <h2 className="text-headline-sm font-semibold">Create RFQ from tech pack</h2>
            <p className="text-body-sm text-on-surface-variant mt-0.5">{techPackTitle}</p>
          </div>
          <button
            className="w-8 h-8 rounded hover:bg-surface-container-low flex items-center justify-center"
            onClick={onClose}
            aria-label="Close"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant mb-1.5">
              Quantity
            </label>
            <input
              className="w-full h-9 px-2.5 border border-surface-dim rounded-md text-[13px]"
              type="number"
              min={1}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant mb-1.5">
              Bid deadline
            </label>
            <input
              className="w-full h-9 px-2.5 border border-surface-dim rounded-md text-[13px]"
              type="datetime-local"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
            />
            <p className="text-[11px] text-on-surface-variant mt-1">
              Publishing requires a deadline at least 1 hour out.
            </p>
          </div>
          <label className="flex items-center gap-2 text-body-sm">
            <input
              type="checkbox"
              className="accent-[#0077c5]"
              checked={sealed}
              onChange={(e) => setSealed(e.target.checked)}
            />
            Sealed bids — amounts stay hidden until the RFQ closes
          </label>
          {error && (
            <div className="text-[13px] text-error bg-error-container/40 border border-error/30 rounded-md px-3 py-2">
              {error}
            </div>
          )}
        </div>
        <div className="px-5 py-4 border-t border-surface-dim flex justify-end gap-2">
          <button
            className="h-9 px-4 border border-surface-dim rounded text-[13px] font-medium hover:bg-surface-container-low"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            className="h-9 px-4 bg-primary text-white rounded text-[13px] font-semibold hover:bg-primary-container disabled:opacity-50"
            onClick={submit}
            disabled={saving}
          >
            {saving ? 'Creating…' : 'Create RFQ'}
          </button>
        </div>
      </div>
    </div>
  );
}
