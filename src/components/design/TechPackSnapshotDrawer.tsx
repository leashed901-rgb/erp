import type { TechPackSnapshot } from '@/lib/techPackTypes';
import { techPackStatusLabel } from '@/lib/techPackTypes';

/**
 * Read-only snapshot drawer — the render snapshot for a tech pack as it
 * stands now. Snapshots are reads: they never create a revisions row
 * (ds_tech_pack_snapshot is read-only; the HTML's "creates a revisions
 * row" comment is wrong). Shared by the editor and the preview.
 */
export default function TechPackSnapshotDrawer({
  snap,
  pomCount,
  onClose,
}: {
  snap: TechPackSnapshot;
  pomCount: number;
  onClose: () => void;
}) {
  const tp = snap.tech_pack;
  const rows: Array<[string, string]> = [
    ['Tech pack', `${tp.style_number ?? '—'} · Rev ${tp.revision} · ${techPackStatusLabel(tp.status)}`],
    ['Design', snap.design?.name ?? '—'],
    ['Size range', snap.size_range ? `${snap.size_range.name} (${snap.size_range.sizes.join('–')})` : '—'],
    ['Colorways', String(snap.colorways.length)],
    ['BOM lines', `${snap.bom.length} · $${snap.bom.reduce((s, b) => s + Number(b.quantity ?? 0) * Number(b.unit_cost ?? 0), 0).toFixed(2)}`],
    ['Measurements', `${snap.measurements.length} cells · ${pomCount} POMs`],
    ['Construction', `${snap.construction.length} operations`],
    ['Artwork', `${snap.artwork.length} placements`],
    ['Revisions', String(snap.revisions.length)],
  ];
  return (
    <div className="fixed inset-0 z-[81] flex justify-end" role="dialog" aria-label="Tech pack snapshot">
      <div className="absolute inset-0 bg-black/35" onClick={onClose} />
      <div className="relative w-[520px] max-w-[96vw] bg-white h-full flex flex-col shadow-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-dim">
          <div>
            <h2 className="text-headline-sm font-semibold">Snapshot</h2>
            <p className="text-body-sm text-on-surface-variant mt-0.5">
              The render snapshot for this tech pack — read-only, taken {new Date().toLocaleTimeString()}.
            </p>
          </div>
          <button
            className="w-8 h-8 rounded hover:bg-surface-container-low flex items-center justify-center"
            onClick={onClose}
            aria-label="Close"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2 text-[13px]">
          {rows.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4 py-2 border-b border-surface-container">
              <span className="text-on-surface-variant">{k}</span>
              <span className="font-medium text-right">{v}</span>
            </div>
          ))}
          <p className="text-[12px] text-on-surface-variant pt-2">
            Snapshots do not create revisions — they read the pack as it stands now. The preview document renders from this same snapshot.
          </p>
        </div>
      </div>
    </div>
  );
}
