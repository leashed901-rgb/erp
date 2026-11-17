import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DomainKey } from '@/data/shellData';
import { useDesignCanvas } from '@/lib/designCanvasStore';
import { supabaseBrowser } from '@/lib/supabaseBrowser';
import {
  TECH_PACK_ALLOWED_TO,
  TECH_PACK_TRANSITION_LABEL,
  techPackStatusLabel,
  type PomLibraryRow,
  type TechPackSnapshot,
} from '@/lib/techPackTypes';
import type { BomLedger, BomLedgerLine } from '@/lib/bomLedger';
import CreateRfqDrawer from './CreateRfqDrawer';
import TechPackSnapshotDrawer from './TechPackSnapshotDrawer';

const TABS = ['Overview', 'Artwork', 'BOM', 'Construction', 'Measurements', 'Revisions'] as const;
type Tab = (typeof TABS)[number];

const LIFECYCLE = ['draft', 'in_review', 'approved', 'released'] as const;
const LIFECYCLE_LABEL: Record<string, string> = {
  draft: 'Draft',
  in_review: 'Review',
  approved: 'Approved',
  released: 'Released',
};

const statusChip = (status: string) => {
  switch (status) {
    case 'approved':
    case 'released':
      return 'bg-[#8af5be] text-[#00714b]';
    case 'in_review':
      return 'bg-[#e8f0fb] text-[#0055a5]';
    case 'archived':
      return 'bg-surface-container text-on-surface-variant';
    default:
      return 'bg-[#fff4dc] text-[#8a5a00]';
  }
};

/**
 * Tech pack editor — a 1:1 port of tech_pack_editor.html, wired to the
 * live routes. GET /api/v1/tech-packs/:id hydrates every tab; child rows
 * save through the artwork / bom / construction / measurements routes;
 * the header saves through PATCH; transitions go through
 * ds_transition_tech_pack with the signed-in member's session (the
 * status guard trigger forbids direct status writes).
 * Corrections vs the HTML: transition target is 'in_review' (not
 * 'review'); a transition does NOT bump the revision number; TechPackSnapshot
 * is a read (it opens the snapshot drawer), it does not create a
 * revision row.
 */
export default function TechPackEditorScreen({
  onNavigate,
  onToast,
}: {
  onNavigate: (domain: DomainKey, screenId: string) => void;
  onToast: (message: string) => void;
}) {
  const techPackId = useDesignCanvas((s) => s.techPackId);
  const openTechPack = useDesignCanvas((s) => s.openTechPack);
  const openRfq = useDesignCanvas((s) => s.openRfq);
  const [snap, setSnap] = useState<TechPackSnapshot | null>(null);
  const [pomLibrary, setPomLibrary] = useState<PomLibraryRow[]>([]);
  const [seasons, setSeasons] = useState<Array<{ id: string; name: string }>>([]);
  const [sizeRanges, setSizeRanges] = useState<Array<{ id: string; name: string; sizes: string[] }>>([]);
  const [tab, setTab] = useState<Tab>('Overview');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveNote, setSaveNote] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [transitionOpen, setTransitionOpen] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const [snapshotOpen, setSnapshotOpen] = useState(false);
  const [rfqOpen, setRfqOpen] = useState(false);
  const [artworkView, setArtworkView] = useState('front');

  const load = useCallback(async () => {
    if (!techPackId) return;
    setLoading(true);
    setError(null);
    try {
      const [snapRes, pomRes, seasonRes, rangeRes] = await Promise.all([
        fetch(`/api/v1/tech-packs/${techPackId}`),
        fetch('/api/v1/pom-library'),
        fetch('/api/v1/seasons'),
        fetch('/api/v1/size-ranges'),
      ]);
      const snapBody = await snapRes.json();
      if (!snapRes.ok) throw new Error(snapBody?.error?.message ?? 'Failed to load tech pack.');
      setSnap(snapBody);
      setPomLibrary((await pomRes.json()).items ?? []);
      setSeasons((await seasonRes.json()).items ?? []);
      setSizeRanges((await rangeRes.json()).items ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load tech pack.');
    } finally {
      setLoading(false);
    }
  }, [techPackId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!transitionOpen) return;
    const close = () => setTransitionOpen(false);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [transitionOpen]);

  const tp = snap?.tech_pack;
  const locked = tp ? tp.status !== 'draft' : false;
  const sizes = useMemo(() => {
    if (snap?.size_range?.sizes?.length) return snap.size_range.sizes;
    const seen = [...new Set((snap?.measurements ?? []).map((m) => m.size))];
    return seen.length ? seen : ['XS', 'S', 'M', 'L', 'XL'];
  }, [snap]);
  const measurementsByKey = useMemo(() => {
    const map = new Map<string, { value: number | string; tol_plus: number | null; tol_minus: number | null }>();
    for (const m of snap?.measurements ?? []) {
      map.set(`${m.pom_id}:${m.size}`, { value: m.value, tol_plus: m.tol_plus, tol_minus: m.tol_minus });
    }
    return map;
  }, [snap]);
  const bomTotal = useMemo(
    () => (snap?.bom ?? []).reduce((s, b) => s + Number(b.quantity ?? 0) * Number(b.unit_cost ?? 0), 0),
    [snap],
  );

  const flashSaved = () => {
    setSaveError(null);
    setSaveNote(`Saved ${new Date().toLocaleTimeString()}`);
  };
  const flashError = (e: unknown) => {
    setSaveError(e instanceof Error ? e.message : 'Save failed.');
  };

  const patchHeader = async (patch: Record<string, unknown>) => {
    if (!techPackId) return;
    try {
      const res = await fetch(`/api/v1/tech-packs/${techPackId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message ?? 'Failed to save.');
      setSnap((s) => (s ? { ...s, tech_pack: { ...s.tech_pack, ...body } } : s));
      flashSaved();
    } catch (e) {
      flashError(e);
      void load();
    }
  };

  const transition = async (to: string) => {
    if (!techPackId || !tp) return;
    setTransitionOpen(false);
    setTransitioning(true);
    setSaveError(null);
    try {
      const { data, error: rpcError } = await supabaseBrowser.rpc('ds_transition_tech_pack', {
        p_tp: techPackId,
        p_to: to,
        p_note: `Transitioned from ${tp.status} to ${to} in the editor.`,
      });
      if (rpcError) throw new Error(rpcError.message);
      setSnap((s) => (s && data ? { ...s, tech_pack: { ...s.tech_pack, ...(data as object) } } : s));
      await load();
      onToast(`Tech pack moved to ${techPackStatusLabel(to)}.`);
    } catch (e) {
      flashError(e);
    } finally {
      setTransitioning(false);
    }
  };

  const duplicate = async () => {
    if (!tp?.design_id) return;
    try {
      const res = await fetch('/api/v1/tech-packs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ designId: tp.design_id, title: tp.title, baseSize: tp.base_size, sizeRangeId: tp.size_range_id }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message ?? 'Failed to duplicate.');
      openTechPack(body.id as string);
      onToast(`Duplicated — new draft revision ${body.revision}.`);
      void load();
    } catch (e) {
      flashError(e);
    }
  };

  if (!techPackId) {
    return (
      <div className="px-6 py-12 bg-[#faf9fc] min-h-full">
        <div className="bg-white rounded-xl border border-surface-dim p-8 text-center max-w-lg mx-auto">
          <span className="material-symbols-outlined text-[32px] text-on-surface-variant">description</span>
          <p className="text-[14px] font-medium mt-2">No tech pack open</p>
          <p className="text-[12px] text-on-surface-variant mt-1">
            Open one from the Tech packs list.
          </p>
          <button
            className="mt-4 h-9 px-4 bg-primary text-white rounded text-[13px] font-semibold hover:bg-primary-container"
            onClick={() => onNavigate('design', 'tech-packs')}
          >
            Go to Tech packs
          </button>
        </div>
      </div>
    );
  }

  if (loading || !snap || !tp) {
    return (
      <div className="px-6 py-12 bg-[#faf9fc] min-h-full">
        <div className="bg-white rounded-xl border border-surface-dim p-8 text-center text-[13px] text-on-surface-variant">
          {error ?? 'Loading tech pack…'}
        </div>
      </div>
    );
  }

  const nextStage =
    tp.status === 'draft' ? 'in_review' : tp.status === 'in_review' ? 'approved' : tp.status === 'approved' ? 'released' : null;
  const validTargets = TECH_PACK_ALLOWED_TO[tp.status] ?? [];
  const artworkForView = (snap.artwork ?? []).filter((a) => (a.view ?? 'front') === artworkView);
  const firstPlacement = artworkForView[0] ?? (snap.artwork ?? [])[0];

  return (
    <div className="bg-[#faf9fc] min-h-full">
      {/* Context header */}
      <div className="h-[52px] px-6 flex items-center justify-between bg-white border-b border-surface-dim sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <button
            className="w-8 h-8 rounded hover:bg-surface-container-low flex items-center justify-center"
            onClick={() => onNavigate('design', 'tech-packs')}
            aria-label="Back to tech packs"
          >
            <span className="material-symbols-outlined text-[18px] text-on-surface-variant">arrow_back</span>
          </button>
          <span className="material-symbols-outlined text-[20px] text-on-surface-variant">description</span>
          <span className="text-[12px] font-semibold">Design Studio</span>
          <span className="text-outline">/</span>
          <span className="text-[12px] text-primary font-semibold">
            Tech Pack · {tp.style_number ?? `TP-${tp.revision}`}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="h-8 px-3 border border-surface-dim rounded text-[14px] hover:bg-surface-container-low flex items-center gap-1"
            onClick={() => setSnapshotOpen(true)}
          >
            <span className="material-symbols-outlined text-[16px]">photo_camera</span>TechPackSnapshot
          </button>
          <button
            className="h-8 px-3 border border-surface-dim rounded text-[14px] hover:bg-surface-container-low flex items-center gap-1"
            onClick={() => {
              openTechPack(tp.id);
              onNavigate('design', 'studio-design-preview');
            }}
          >
            <span className="material-symbols-outlined text-[16px]">preview</span>Design preview
          </button>
          <button
            className="h-8 px-3 border border-surface-dim rounded text-[14px] hover:bg-surface-container-low flex items-center gap-1"
            onClick={() => {
              openTechPack(tp.id);
              onNavigate('design', 'tech-pack-preview');
            }}
          >
            <span className="material-symbols-outlined text-[16px]">download</span>Export PDF
          </button>
          <div className="inline-flex rounded">
            <button
              className="h-8 px-3 bg-primary text-white text-[14px] font-semibold hover:bg-primary-container flex items-center gap-1 rounded-l disabled:opacity-50"
              disabled={!nextStage || transitioning}
              onClick={() => nextStage && transition(nextStage)}
            >
              <span className="material-symbols-outlined text-[16px]">check_circle</span>
              {transitioning ? 'Moving…' : nextStage ? `Move to ${techPackStatusLabel(nextStage)}` : techPackStatusLabel(tp.status)}
            </button>
            <button
              className="h-8 px-1.5 bg-primary text-white hover:bg-primary-container rounded-r border-l border-black/10 disabled:opacity-50"
              disabled={transitioning}
              onClick={(e) => {
                e.stopPropagation();
                setTransitionOpen((v) => !v);
              }}
              aria-label="More transitions"
            >
              <span className="material-symbols-outlined text-[16px]">expand_more</span>
            </button>
          </div>
        </div>
      </div>

      {transitionOpen && (
        <div
          className="fixed bg-white border border-surface-dim rounded-lg shadow-[0_8px_24px_rgba(0,0,0,0.14)] w-[260px] p-1 z-[200]"
          style={{ top: 56, right: 24 }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-2.5 pt-1.5 pb-1 text-[10px] font-bold uppercase tracking-wide text-on-surface-variant">
            Transition to
          </div>
          {['in_review', 'approved', 'released', 'draft', 'archived'].map((to) => {
            const allowed = validTargets.includes(to);
            return (
              <button
                key={to}
                className={`w-full flex items-center gap-2 px-2.5 py-1.5 text-[13px] rounded text-left ${
                  allowed ? 'hover:bg-surface-container-low' : 'opacity-45 cursor-not-allowed'
                }`}
                disabled={!allowed}
                title={allowed ? undefined : `Cannot move from ${techPackStatusLabel(tp.status)} to ${techPackStatusLabel(to)}.`}
                onClick={() => transition(to)}
              >
                <span className="material-symbols-outlined text-[16px] text-on-surface-variant">
                  {to === 'archived' ? 'archive' : to === 'draft' ? 'undo' : to === 'released' ? 'rocket_launch' : to === 'approved' ? 'check_circle' : 'rate_review'}
                </span>
                {TECH_PACK_TRANSITION_LABEL[to]}
                {!allowed && <span className="ml-auto text-[11px] text-on-surface-variant">not allowed</span>}
              </button>
            );
          })}
        </div>
      )}

      <main className="px-6 pb-12">
        {/* Tech pack header */}
        <div className="py-4 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-[24px] leading-8 font-semibold tracking-tight">{tp.title ?? 'Untitled tech pack'}</h1>
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${statusChip(tp.status)}`}>
                {techPackStatusLabel(tp.status)}
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#e8f0fb] text-[#0055a5]">
                Rev {tp.revision}
              </span>
            </div>
            <div className="text-[12px] text-on-surface-variant flex items-center gap-4 flex-wrap mt-1">
              <span className="flex items-center gap-1">
                <span className="material-symbols-outlined text-[14px]">tag</span>
                {tp.style_number ?? '—'}
              </span>
              <span className="flex items-center gap-1">
                <span className="material-symbols-outlined text-[14px]">palette</span>
                Design: {snap.design?.name ?? '—'}
              </span>
              <span className="flex items-center gap-1">
                <span className="material-symbols-outlined text-[14px]">calendar_today</span>
                Season: {snap.season?.name ?? '—'}
              </span>
              <span className="flex items-center gap-1">
                <span className="material-symbols-outlined text-[14px]">straighten</span>
                Base: {tp.base_size ?? '—'}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-center">
              <div className="text-[10px] uppercase tracking-wider font-bold text-on-surface-variant">Artwork layers</div>
              <div className="text-[16px] font-semibold tabular-nums">{snap.artwork.length}</div>
            </div>
            <div className="w-px h-10 bg-surface-dim" />
            <div className="text-center">
              <div className="text-[10px] uppercase tracking-wider font-bold text-on-surface-variant">BOM lines</div>
              <div className="text-[16px] font-semibold tabular-nums">{snap.bom.length}</div>
            </div>
            <div className="w-px h-10 bg-surface-dim" />
            <div className="text-center">
              <div className="text-[10px] uppercase tracking-wider font-bold text-on-surface-variant">POMs</div>
              <div className="text-[16px] font-semibold tabular-nums">{pomLibrary.length}</div>
            </div>
          </div>
        </div>

        {saveError && (
          <div className="mb-3 text-[13px] text-error bg-error-container/40 border border-error/30 rounded-md px-3 py-2">
            {saveError}
          </div>
        )}
        {saveNote && !saveError && (
          <div className="mb-3 text-[12px] text-[#00714b]">{saveNote}</div>
        )}
        {locked && (
          <div className="mb-3 text-[12px] text-on-surface-variant bg-surface-container-low border border-surface-dim rounded-md px-3 py-2">
            This tech pack is {techPackStatusLabel(tp.status)} — rows and header are locked. Move it back to Draft to edit.
          </div>
        )}

        {/* Tabs */}
        <div className="flex items-center gap-1 border-b border-surface-dim overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t}
              className={`px-4 py-2.5 text-[12px] font-medium border-b-2 whitespace-nowrap ${
                tab === t ? 'border-[#0077c5] text-[#0077c5] font-semibold' : 'border-transparent text-on-surface-variant'
              }`}
              onClick={() => setTab(t)}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 pt-4">
          <div className="lg:col-span-2">
            <div className="bg-white rounded-xl shadow-sm border border-surface-dim overflow-hidden">
              {tab === 'Overview' && (
                <OverviewTab
                  snap={snap}
                  seasons={seasons}
                  sizeRanges={sizeRanges}
                  locked={locked}
                  onPatch={patchHeader}
                  onReload={load}
                />
              )}
              {tab === 'Artwork' && (
                <ArtworkTab
                  snap={snap}
                  view={artworkView}
                  onView={setArtworkView}
                  firstPlacement={firstPlacement}
                  locked={locked}
                  onReload={load}
                  onError={flashError}
                  onSaved={flashSaved}
                />
              )}
              {tab === 'BOM' && (
                <BomTab snap={snap} total={bomTotal} locked={locked} onReload={load} onError={flashError} onSaved={flashSaved} />
              )}
              {tab === 'Construction' && (
                <ConstructionTab snap={snap} locked={locked} onReload={load} onError={flashError} onSaved={flashSaved} />
              )}
              {tab === 'Measurements' && (
                <MeasurementsTab
                  snap={snap}
                  pomLibrary={pomLibrary}
                  sizes={sizes}
                  measurementsByKey={measurementsByKey}
                  locked={locked}
                  onReload={load}
                  onError={flashError}
                  onSaved={flashSaved}
                />
              )}
              {tab === 'Revisions' && <RevisionsTab snap={snap} />}
            </div>
          </div>

          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-surface-dim p-4">
              <div className="text-[11px] font-bold uppercase tracking-wide pb-1.5 border-b border-surface-dim mb-2.5">Metadata</div>
              <div className="space-y-2 text-[13px]">
                <div className="flex justify-between"><span className="text-on-surface-variant">Style #</span><span className="font-mono text-[12px]">{tp.style_number ?? '—'}</span></div>
                <div className="flex justify-between"><span className="text-on-surface-variant">Size range</span><span>{snap.size_range?.name ?? '—'}{snap.size_range ? ` (${snap.size_range.sizes.join('–')})` : ''}</span></div>
                <div className="flex justify-between"><span className="text-on-surface-variant">Created</span><span>{new Date(tp.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span></div>
                <div className="flex justify-between"><span className="text-on-surface-variant">Last edit</span><span>{new Date(tp.updated_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span></div>
                <div className="flex justify-between"><span className="text-on-surface-variant">Approved by</span><span className="text-on-surface-variant">{tp.approved_by ?? '—'}</span></div>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-surface-dim p-4">
              <div className="text-[11px] font-bold uppercase tracking-wide pb-1.5 border-b border-surface-dim mb-2.5">Lifecycle</div>
              <div className="space-y-1.5 text-[13px]">
                {LIFECYCLE.map((stage) => {
                  const idx = LIFECYCLE.indexOf(stage);
                  const currentIdx = LIFECYCLE.indexOf(tp.status as (typeof LIFECYCLE)[number]);
                  const done = tp.status === 'archived' ? false : currentIdx >= 0 && idx <= currentIdx;
                  return (
                    <div key={stage} className="flex items-center gap-2">
                      <span className={`material-symbols-outlined text-[16px] ${done ? 'text-primary' : 'text-on-surface-variant'}`}>
                        {done ? 'check_circle' : 'radio_button_unchecked'}
                      </span>
                      {LIFECYCLE_LABEL[stage]}
                    </div>
                  );
                })}
                {tp.status === 'archived' && (
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[16px] text-primary">archive</span>Archived
                  </div>
                )}
              </div>
            </div>
            <div className="bg-white rounded-xl border border-surface-dim p-4">
              <div className="text-[11px] font-bold uppercase tracking-wide pb-1.5 border-b border-surface-dim mb-2.5">Actions</div>
              <div className="space-y-2">
                <button
                  className="w-full h-8 border border-surface-dim rounded text-[12px] font-semibold hover:bg-surface-container-low flex items-center gap-2 px-2"
                  onClick={() => setRfqOpen(true)}
                >
                  <span className="material-symbols-outlined text-[14px] text-[#0077c5]">request_quote</span>
                  Create RFQ from tech pack
                </button>
                <button
                  className="w-full h-8 border border-surface-dim rounded text-[12px] font-semibold hover:bg-surface-container-low flex items-center gap-2 px-2"
                  onClick={duplicate}
                >
                  <span className="material-symbols-outlined text-[14px] text-on-surface-variant">content_copy</span>
                  Duplicate tech pack
                </button>
                <button
                  className="w-full h-8 border border-error text-error rounded text-[12px] font-semibold hover:bg-error-container/20 flex items-center gap-2 px-2 disabled:opacity-50"
                  disabled={!validTargets.includes('archived')}
                  onClick={() => transition('archived')}
                >
                  <span className="material-symbols-outlined text-[14px]">archive</span>Archive
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>

      {snapshotOpen && (
        <TechPackSnapshotDrawer snap={snap} pomCount={pomLibrary.length} onClose={() => setSnapshotOpen(false)} />
      )}
      {rfqOpen && (
        <CreateRfqDrawer
          techPackId={tp.id}
          techPackTitle={tp.title ?? 'Untitled tech pack'}
          onClose={() => setRfqOpen(false)}
          onCreated={(rfqId) => {
            setRfqOpen(false);
            openRfq(rfqId);
            onNavigate('design', 'rfq-board');
          }}
        />
      )}
    </div>
  );
}

function fieldLabel(text: string) {
  return (
    <label className="block text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant mb-1.5">
      {text}
    </label>
  );
}

function OverviewTab({
  snap,
  seasons,
  sizeRanges,
  locked,
  onPatch,
  onReload,
}: {
  snap: TechPackSnapshot;
  seasons: Array<{ id: string; name: string }>;
  sizeRanges: Array<{ id: string; name: string; sizes: string[] }>;
  locked: boolean;
  onPatch: (patch: Record<string, unknown>) => Promise<void>;
  onReload: () => Promise<void>;
}) {
  const tp = snap.tech_pack;
  return (
    <div className="p-5 space-y-5">
      <div className="border border-surface-dim rounded-lg overflow-hidden">
        <div className="bg-surface-container-low px-3.5 py-2.5 border-b border-surface-dim flex items-center justify-between">
          <div className="font-semibold text-[13px] flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[16px]">info</span>Style information
          </div>
        </div>
        <div className="p-3.5 grid grid-cols-2 gap-3">
          <div>
            {fieldLabel('Style number')}
            <input
              className="w-full h-9 px-2.5 border border-surface-dim rounded-md text-[13px] disabled:bg-surface-container-low disabled:text-on-surface-variant"
              defaultValue={tp.style_number ?? ''}
              disabled={locked}
              onBlur={(e) => {
                if (e.target.value !== (tp.style_number ?? '')) void onPatch({ style_number: e.target.value || null });
              }}
            />
          </div>
          <div>
            {fieldLabel('Title')}
            <input
              className="w-full h-9 px-2.5 border border-surface-dim rounded-md text-[13px] disabled:bg-surface-container-low disabled:text-on-surface-variant"
              defaultValue={tp.title ?? ''}
              disabled={locked}
              onBlur={(e) => {
                if (e.target.value !== (tp.title ?? '')) void onPatch({ title: e.target.value || null });
              }}
            />
          </div>
          <div>
            {fieldLabel('Season')}
            <select
              className="w-full h-9 px-2 border border-surface-dim rounded-md text-[13px] bg-white disabled:bg-surface-container-low"
              defaultValue={tp.season_id ?? ''}
              disabled={locked}
              onChange={(e) => void onPatch({ season_id: e.target.value || null })}
            >
              <option value="">—</option>
              {seasons.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            {fieldLabel('Base size')}
            <input
              className="w-full h-9 px-2.5 border border-surface-dim rounded-md text-[13px] disabled:bg-surface-container-low disabled:text-on-surface-variant"
              defaultValue={tp.base_size ?? ''}
              disabled={locked}
              onBlur={(e) => {
                if (e.target.value !== (tp.base_size ?? '')) void onPatch({ base_size: e.target.value || null });
              }}
            />
          </div>
          <div className="col-span-2">
            {fieldLabel('Size range')}
            <select
              className="w-full h-9 px-2 border border-surface-dim rounded-md text-[13px] bg-white disabled:bg-surface-container-low"
              defaultValue={tp.size_range_id ?? ''}
              disabled={locked}
              onChange={(e) => void onPatch({ size_range_id: e.target.value || null })}
            >
              <option value="">—</option>
              {sizeRanges.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} ({r.sizes.join('–')})
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
      <div className="border border-surface-dim rounded-lg overflow-hidden">
        <div className="bg-surface-container-low px-3.5 py-2.5 border-b border-surface-dim">
          <div className="font-semibold text-[13px] flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[16px]">history</span>Change summary
          </div>
        </div>
        <div className="p-3.5">
          {snap.revisions.length === 0 ? (
            <p className="text-[12px] text-on-surface-variant">No transitions yet — this pack is still on its first draft.</p>
          ) : (
            <div className="space-y-2 text-[12px]">
              {snap.revisions.map((r) => (
                <div key={r.id} className="flex items-center gap-2">
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#e8f0fb] text-[#0055a5]">
                    Rev {r.revision}
                  </span>
                  <span className="flex-1">{r.change_summary ?? `${r.from_status ?? '—'} → ${r.to_status}`}</span>
                  <span className="text-on-surface-variant">
                    {new Date(r.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                  </span>
                </div>
              ))}
            </div>
          )}
          <button className="mt-3 text-[12px] text-[#0077c5] font-medium" onClick={() => void onReload()}>
            Refresh
          </button>
        </div>
      </div>
    </div>
  );
}

function ArtworkTab({
  snap,
  view,
  onView,
  firstPlacement,
  locked,
  onReload,
  onError,
  onSaved,
}: {
  snap: TechPackSnapshot;
  view: string;
  onView: (v: string) => void;
  firstPlacement: TechPackSnapshot['artwork'][number] | undefined;
  locked: boolean;
  onReload: () => Promise<void>;
  onError: (e: unknown) => void;
  onSaved: () => void;
}) {
  const tpId = snap.tech_pack.id;
  const saveRow = async (row: Record<string, unknown>) => {
    try {
      const res = await fetch(`/api/v1/tech-packs/${tpId}/artwork`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(row),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message ?? 'Failed to save artwork.');
      onSaved();
      await onReload();
    } catch (e) {
      onError(e);
    }
  };
  const addRow = () =>
    saveRow({ view: 'front', placement: 'New placement', technique: 'Screen print', width_mm: 100, height_mm: 100, sort: snap.artwork.length + 1 });
  const removeRow = async (id: string) => {
    try {
      const res = await fetch(`/api/v1/tech-packs/${tpId}/artwork?id=${id}`, { method: 'DELETE' });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message ?? 'Failed to delete artwork.');
      onSaved();
      await onReload();
    } catch (e) {
      onError(e);
    }
  };
  return (
    <div className="p-5">
      <div className="border border-surface-dim rounded-lg overflow-hidden">
        <div className="bg-surface-container-low px-3.5 py-2.5 border-b border-surface-dim flex items-center justify-between">
          <div className="font-semibold text-[13px] flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[16px]">palette</span>Artwork placements
          </div>
          <button
            className="h-7 px-2 border border-surface-dim rounded text-[12px] font-semibold hover:bg-surface-container-low disabled:opacity-50"
            disabled={locked}
            onClick={addRow}
          >
            + Add artwork
          </button>
        </div>
        <div className="p-3.5">
          <div className="w-full h-[200px] bg-[#faf9fc] border border-surface-dim rounded-md flex items-center justify-center relative mb-4">
            <div className="absolute top-2 left-2 flex gap-0.5 bg-white rounded-md border border-surface-dim p-0.5">
              {['front', 'back', 'left', 'right'].map((v) => (
                <button
                  key={v}
                  className={`px-2.5 py-1 text-[11px] font-semibold rounded ${view === v ? 'bg-[#0077c5] text-white' : 'text-on-surface-variant'}`}
                  onClick={() => onView(v)}
                >
                  {v.charAt(0).toUpperCase() + v.slice(1)}
                </button>
              ))}
            </div>
            {firstPlacement ? (
              <div className="w-[120px] h-[120px] border-2 border-dashed border-[#0077c5] bg-[#0077c5]/5 flex items-center justify-center relative">
                <div className="absolute -top-2.5 left-0 bg-[#0077c5] text-white text-[9px] font-semibold px-1.5 py-0.5 rounded">
                  {firstPlacement.placement ?? 'Placement'} · {firstPlacement.width_mm ?? '—'}×{firstPlacement.height_mm ?? '—'}mm
                </div>
                <span className="text-[11px] text-[#0077c5] font-semibold">ARTWORK</span>
              </div>
            ) : (
              <span className="text-[12px] text-on-surface-variant">No artwork on this view yet.</span>
            )}
          </div>
          {snap.artwork.length === 0 ? (
            <p className="text-[12px] text-on-surface-variant">No artwork placements yet — add one above.</p>
          ) : (
            <table className="w-full text-[12px]">
              <thead>
                <tr className="grid grid-cols-[1fr_1.5fr_1.5fr_80px_80px_40px] gap-2 py-2 border-b border-surface-dim text-[10px] uppercase tracking-wide text-on-surface-variant font-bold">
                  <th className="text-left">View</th>
                  <th className="text-left">Placement</th>
                  <th className="text-left">Technique</th>
                  <th className="text-right">Width (mm)</th>
                  <th className="text-right">Height (mm)</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {snap.artwork.map((a) => (
                  <ArtworkRow key={a.id} row={a} locked={locked} onSave={saveRow} onRemove={() => removeRow(a.id)} />
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

function ArtworkRow({
  row,
  locked,
  onSave,
  onRemove,
}: {
  row: TechPackSnapshot['artwork'][number];
  locked: boolean;
  onSave: (row: Record<string, unknown>) => Promise<void>;
  onRemove: () => void;
}) {
  const [draft, setDraft] = useState({ view: row.view ?? '', placement: row.placement ?? '', technique: row.technique ?? '', width_mm: row.width_mm ?? '', height_mm: row.height_mm ?? '' });
  const commit = () => {
    if (locked) return;
    const changed =
      draft.view !== (row.view ?? '') ||
      draft.placement !== (row.placement ?? '') ||
      draft.technique !== (row.technique ?? '') ||
      String(draft.width_mm) !== String(row.width_mm ?? '') ||
      String(draft.height_mm) !== String(row.height_mm ?? '');
    if (!changed) return;
    void onSave({
      id: row.id,
      view: draft.view || null,
      placement: draft.placement || null,
      technique: draft.technique || null,
      width_mm: draft.width_mm === '' ? null : Number(draft.width_mm),
      height_mm: draft.height_mm === '' ? null : Number(draft.height_mm),
    });
  };
  const inputCls = 'w-full border border-transparent bg-transparent px-1.5 py-1 rounded text-[12px] hover:border-surface-dim focus:outline-none focus:border-[#0077c5] focus:bg-white disabled:text-on-surface-variant';
  return (
    <tr className="grid grid-cols-[1fr_1.5fr_1.5fr_80px_80px_40px] gap-2 py-1.5 border-b border-surface-container-low items-center">
      <td>
        <select className={inputCls} value={draft.view} disabled={locked} onChange={(e) => setDraft({ ...draft, view: e.target.value })} onBlur={commit}>
          {['front', 'back', 'left', 'right'].map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
      </td>
      <td>
        <input className={inputCls} value={draft.placement} disabled={locked} onChange={(e) => setDraft({ ...draft, placement: e.target.value })} onBlur={commit} />
      </td>
      <td>
        <input className={inputCls} value={draft.technique} disabled={locked} onChange={(e) => setDraft({ ...draft, technique: e.target.value })} onBlur={commit} />
      </td>
      <td>
        <input className={`${inputCls} text-right`} value={draft.width_mm} disabled={locked} onChange={(e) => setDraft({ ...draft, width_mm: e.target.value })} onBlur={commit} />
      </td>
      <td>
        <input className={`${inputCls} text-right`} value={draft.height_mm} disabled={locked} onChange={(e) => setDraft({ ...draft, height_mm: e.target.value })} onBlur={commit} />
      </td>
      <td className="text-right">
        <button
          className="w-6 h-6 rounded hover:bg-error-container inline-flex items-center justify-center disabled:opacity-50"
          disabled={locked}
          onClick={onRemove}
          aria-label="Remove artwork"
        >
          <span className="material-symbols-outlined text-[14px]">close</span>
        </button>
      </td>
    </tr>
  );
}

function BomTab({
  snap,
  total,
  locked,
  onReload,
  onError,
  onSaved,
}: {
  snap: TechPackSnapshot;
  total: number;
  locked: boolean;
  onReload: () => Promise<void>;
  onError: (e: unknown) => void;
  onSaved: () => void;
}) {
  const tpId = snap.tech_pack.id;
  const saveRow = async (row: Record<string, unknown>) => {
    try {
      const res = await fetch(`/api/v1/tech-packs/${tpId}/bom`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(row),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message ?? 'Failed to save BOM line.');
      onSaved();
      await onReload();
    } catch (e) {
      onError(e);
    }
  };
  const removeRow = async (id: string) => {
    try {
      const res = await fetch(`/api/v1/tech-packs/${tpId}/bom?id=${id}`, { method: 'DELETE' });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message ?? 'Failed to delete BOM line.');
      onSaved();
      await onReload();
    } catch (e) {
      onError(e);
    }
  };
  return (
    <div className="p-5">
      <LedgerPanel tpId={tpId} locked={locked} onApply={saveRow} onError={onError} />
      <div className="border border-surface-dim rounded-lg overflow-hidden">
        <div className="bg-surface-container-low px-3.5 py-2.5 border-b border-surface-dim flex items-center justify-between">
          <div className="font-semibold text-[13px] flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[16px]">list_alt</span>Bill of materials
          </div>
          <button
            className="h-7 px-2 border border-surface-dim rounded text-[12px] font-semibold hover:bg-surface-container-low disabled:opacity-50"
            disabled={locked}
            onClick={() => saveRow({ kind: 'trim', description: 'New line', quantity: 1, uom: 'pc', unit_cost: 0, sort: snap.bom.length + 1 })}
          >
            + Add BOM line
          </button>
        </div>
        <div className="p-3.5">
          {snap.bom.length === 0 ? (
            <p className="text-[12px] text-on-surface-variant">No BOM lines yet — add one above. The pack cannot move to Review with an empty BOM.</p>
          ) : (
            <table className="w-full text-[12px]">
              <thead>
                <tr className="grid grid-cols-[80px_2fr_80px_80px_80px_80px_40px] gap-2 py-2 border-b border-surface-dim text-[10px] uppercase tracking-wide text-on-surface-variant font-bold">
                  <th className="text-left">Kind</th>
                  <th className="text-left">Description</th>
                  <th className="text-right">Qty</th>
                  <th className="text-right">UOM</th>
                  <th className="text-right">Unit cost</th>
                  <th className="text-right">Ext.</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {snap.bom.map((b) => (
                  <BomRow key={b.id} row={b} locked={locked} onSave={saveRow} onRemove={() => removeRow(b.id)} />
                ))}
              </tbody>
            </table>
          )}
          <div className="flex items-center justify-end gap-3 mt-4 pt-3 border-t border-surface-dim">
            <span className="text-[11px] text-on-surface-variant uppercase tracking-wider font-bold">Total BOM cost</span>
            <span className="text-[16px] font-semibold tabular-nums">${total.toFixed(2)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Reactive BOM Ledger panel — the computed BOM, re-derived on every read
 * from the pack's POMs, construction ops and priced materials. Change a
 * measurement, a material price, the marker efficiency or the waste % and
 * the ledger moves. "Apply" writes a computed quantity back onto the
 * manual BOM row it belongs to; count lines and the thread allocation
 * have no apply — they are checks, not consumptions.
 */
function LedgerPanel({
  tpId,
  locked,
  onApply,
  onError,
}: {
  tpId: string;
  locked: boolean;
  onApply: (row: Record<string, unknown>) => Promise<void>;
  onError: (e: unknown) => void;
}) {
  const [fabricWidthCm, setFabricWidthCm] = useState(150);
  const [markerEfficiency, setMarkerEfficiency] = useState(85);
  const [wastePct, setWastePct] = useState(5);
  const [ledger, setLedger] = useState<BomLedger | null>(null);
  const [loading, setLoading] = useState(false);
  const [applyingId, setApplyingId] = useState<string | null>(null);
  // onError is recreated by the parent on every render; routing it through
  // a ref keeps the load callback stable so the fetch effect is not reset
  // by unrelated re-renders (a debounced fetch starved that way).
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const q = new URLSearchParams({
        fabricWidthCm: String(fabricWidthCm),
        markerEfficiency: String(markerEfficiency),
        wastePct: String(wastePct),
      });
      const res = await fetch(`/api/v1/tech-packs/${tpId}/bom-ledger?${q}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message ?? 'Failed to load BOM ledger.');
      setLedger(body as BomLedger);
    } catch (e) {
      setLedger(null);
      onErrorRef.current(e);
    } finally {
      setLoading(false);
    }
  }, [tpId, fabricWidthCm, markerEfficiency, wastePct]);

  useEffect(() => {
    void load();
  }, [load]);

  const applyLine = async (line: BomLedgerLine) => {
    if (!line.canApply || line.computedQty == null || !line.bomLineId) return;
    setApplyingId(line.bomLineId);
    try {
      await onApply({ id: line.bomLineId, quantity: line.computedQty });
      await load();
    } catch (e) {
      onError(e);
    } finally {
      setApplyingId(null);
    }
  };

  return (
    <div className="border border-surface-dim rounded-lg overflow-hidden mb-4">
      <div className="bg-surface-container-low px-3.5 py-2.5 border-b border-surface-dim flex items-center justify-between">
        <div className="font-semibold text-[13px] flex items-center gap-1.5 whitespace-nowrap">
          <span className="material-symbols-outlined text-[16px]">calculate</span>
          Reactive BOM ledger
          <span className="text-[11px] font-normal text-on-surface-variant">
            computed from POMs · marker · materials — updates when any of them change
          </span>
        </div>
        <div className="flex items-center gap-3 text-[11px]">
          <label className="flex items-center gap-1 font-semibold text-on-surface-variant">
            Fabric width
            <input
              type="number"
              min={10}
              value={fabricWidthCm}
              disabled={locked}
              onChange={(e) => setFabricWidthCm(Number(e.target.value) || 150)}
              className="w-16 h-7 px-1.5 border border-surface-dim rounded text-[12px] font-normal text-on-surface bg-white"
            />
            cm
          </label>
          <label className="flex items-center gap-1 font-semibold text-on-surface-variant">
            Marker efficiency
            <input
              type="number"
              min={1}
              max={100}
              value={markerEfficiency}
              disabled={locked}
              onChange={(e) => setMarkerEfficiency(Number(e.target.value) || 85)}
              className="w-14 h-7 px-1.5 border border-surface-dim rounded text-[12px] font-normal text-on-surface bg-white"
            />
            %
          </label>
          <label className="flex items-center gap-1 font-semibold text-on-surface-variant">
            Waste
            <input
              type="number"
              min={0}
              max={50}
              value={wastePct}
              disabled={locked}
              onChange={(e) => setWastePct(Number(e.target.value) || 0)}
              className="w-14 h-7 px-1.5 border border-surface-dim rounded text-[12px] font-normal text-on-surface bg-white"
            />
            %
          </label>
        </div>
      </div>
      <div className="p-3.5">
        {loading && !ledger ? (
          <p className="text-[12px] text-on-surface-variant">Computing ledger…</p>
        ) : !ledger ? (
          <p className="text-[12px] text-on-surface-variant">Ledger unavailable — check the pack has BOM lines and base-size measurements.</p>
        ) : (
          <>
            {ledger.notes.map((n) => (
              <p key={n} className="text-[11px] text-on-surface-variant mb-2">
                {n}
              </p>
            ))}
            <table className="w-full text-[12px]">
              <thead>
                <tr className="grid grid-cols-[minmax(0,2fr)_80px_90px_70px_80px_70px] gap-2 py-2 border-b border-surface-dim text-[10px] uppercase tracking-wide text-on-surface-variant font-bold">
                  <th className="text-left">Line · how it was computed</th>
                  <th className="text-right">Entered</th>
                  <th className="text-right">Computed</th>
                  <th className="text-right">Variance</th>
                  <th className="text-right">Ext.</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {ledger.lines.map((line) => {
                  const variance =
                    line.computedQty != null && line.enteredQty !== 0
                      ? ((line.computedQty - line.enteredQty) / line.enteredQty) * 100
                      : null;
                  const differs = line.canApply && line.computedQty != null && Math.abs(line.computedQty - line.enteredQty) > 0.0001;
                  return (
                    <tr key={line.bomLineId ?? line.description} className="grid grid-cols-[minmax(0,2fr)_80px_90px_70px_80px_70px] gap-2 py-2 border-b border-surface-dim items-start">
                      <td>
                        <div className="font-semibold">{line.description}</div>
                        <div className="text-[11px] text-on-surface-variant leading-snug mt-0.5">{line.basis}</div>
                      </td>
                      <td className="text-right tabular-nums">
                        {line.enteredQty} {line.uom}
                      </td>
                      <td className="text-right tabular-nums font-semibold">
                        {line.computedQty != null ? `${line.computedQty} ${line.uom}` : '—'}
                      </td>
                      <td className="text-right tabular-nums">
                        {variance != null ? `${variance > 0 ? '+' : ''}${variance.toFixed(1)}%` : '—'}
                      </td>
                      <td className="text-right tabular-nums">${line.computedExt.toFixed(2)}</td>
                      <td className="text-right">
                        {differs && (
                          <button
                            className="h-7 px-2 border border-surface-dim rounded text-[11px] font-semibold hover:bg-surface-container-low disabled:opacity-50"
                            disabled={locked || applyingId === line.bomLineId}
                            onClick={() => void applyLine(line)}
                          >
                            {applyingId === line.bomLineId ? 'Applying…' : 'Apply'}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="flex items-center justify-end gap-6 mt-4 pt-3 border-t border-surface-dim">
              <span className="text-[11px] text-on-surface-variant uppercase tracking-wider font-bold">
                Entered total <span className="text-[14px] text-on-surface normal-case tracking-normal font-semibold tabular-nums">${ledger.enteredTotal.toFixed(2)}</span>
              </span>
              <span className="text-[11px] text-on-surface-variant uppercase tracking-wider font-bold">
                Ledger total <span className="text-[16px] text-on-surface normal-case tracking-normal font-semibold tabular-nums">${ledger.computedTotal.toFixed(2)}</span>
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function BomRow({
  row,
  locked,
  onSave,
  onRemove,
}: {
  row: TechPackSnapshot['bom'][number];
  locked: boolean;
  onSave: (row: Record<string, unknown>) => Promise<void>;
  onRemove: () => void;
}) {
  const [draft, setDraft] = useState({
    kind: row.kind ?? '',
    description: row.description ?? '',
    quantity: row.quantity ?? '',
    uom: row.uom ?? '',
    unit_cost: row.unit_cost ?? '',
  });
  const commit = () => {
    if (locked) return;
    const changed =
      draft.kind !== (row.kind ?? '') ||
      draft.description !== (row.description ?? '') ||
      String(draft.quantity) !== String(row.quantity ?? '') ||
      draft.uom !== (row.uom ?? '') ||
      String(draft.unit_cost) !== String(row.unit_cost ?? '');
    if (!changed) return;
    void onSave({
      id: row.id,
      kind: draft.kind || null,
      description: draft.description || null,
      quantity: draft.quantity === '' ? null : Number(draft.quantity),
      uom: draft.uom || null,
      unit_cost: draft.unit_cost === '' ? null : Number(draft.unit_cost),
    });
  };
  const inputCls = 'w-full border border-transparent bg-transparent px-1.5 py-1 rounded text-[12px] hover:border-surface-dim focus:outline-none focus:border-[#0077c5] focus:bg-white disabled:text-on-surface-variant';
  const ext = Number(draft.quantity || 0) * Number(draft.unit_cost || 0);
  return (
    <tr className="grid grid-cols-[80px_2fr_80px_80px_80px_80px_40px] gap-2 py-1.5 border-b border-surface-container-low items-center">
      <td>
        <select className={inputCls} value={draft.kind} disabled={locked} onChange={(e) => setDraft({ ...draft, kind: e.target.value })} onBlur={commit}>
          {['fabric', 'trim', 'label', 'body'].map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
      </td>
      <td>
        <input className={inputCls} value={draft.description} disabled={locked} onChange={(e) => setDraft({ ...draft, description: e.target.value })} onBlur={commit} />
      </td>
      <td>
        <input className={`${inputCls} text-right`} value={draft.quantity} disabled={locked} onChange={(e) => setDraft({ ...draft, quantity: e.target.value })} onBlur={commit} />
      </td>
      <td>
        <input className={`${inputCls} text-right`} value={draft.uom} disabled={locked} onChange={(e) => setDraft({ ...draft, uom: e.target.value })} onBlur={commit} />
      </td>
      <td>
        <input className={`${inputCls} text-right`} value={draft.unit_cost} disabled={locked} onChange={(e) => setDraft({ ...draft, unit_cost: e.target.value })} onBlur={commit} />
      </td>
      <td className="text-right font-semibold tabular-nums">${ext.toFixed(2)}</td>
      <td className="text-right">
        <button
          className="w-6 h-6 rounded hover:bg-error-container inline-flex items-center justify-center disabled:opacity-50"
          disabled={locked}
          onClick={onRemove}
          aria-label="Remove BOM line"
        >
          <span className="material-symbols-outlined text-[14px]">close</span>
        </button>
      </td>
    </tr>
  );
}

function ConstructionTab({
  snap,
  locked,
  onReload,
  onError,
  onSaved,
}: {
  snap: TechPackSnapshot;
  locked: boolean;
  onReload: () => Promise<void>;
  onError: (e: unknown) => void;
  onSaved: () => void;
}) {
  const tpId = snap.tech_pack.id;
  const saveRow = async (row: Record<string, unknown>) => {
    try {
      const res = await fetch(`/api/v1/tech-packs/${tpId}/construction`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(row),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message ?? 'Failed to save operation.');
      onSaved();
      await onReload();
    } catch (e) {
      onError(e);
    }
  };
  const removeRow = async (id: string) => {
    try {
      const res = await fetch(`/api/v1/tech-packs/${tpId}/construction?id=${id}`, { method: 'DELETE' });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message ?? 'Failed to delete operation.');
      onSaved();
      await onReload();
    } catch (e) {
      onError(e);
    }
  };
  return (
    <div className="p-5">
      <div className="border border-surface-dim rounded-lg overflow-hidden">
        <div className="bg-surface-container-low px-3.5 py-2.5 border-b border-surface-dim flex items-center justify-between">
          <div className="font-semibold text-[13px] flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[16px]">construction</span>Construction operations
          </div>
          <button
            className="h-7 px-2 border border-surface-dim rounded text-[12px] font-semibold hover:bg-surface-container-low disabled:opacity-50"
            disabled={locked}
            onClick={() => saveRow({ area: 'new area', operation: 'new operation', stitch_type: '504', spi: 12, seam_allowance_mm: 6, sort: snap.construction.length + 1 })}
          >
            + Add operation
          </button>
        </div>
        <div className="p-3.5">
          {snap.construction.length === 0 ? (
            <p className="text-[12px] text-on-surface-variant">No operations yet — add one above.</p>
          ) : (
            <table className="w-full text-[12px]">
              <thead>
                <tr className="grid grid-cols-[1fr_1fr_80px_80px_100px_40px] gap-2 py-2 border-b border-surface-dim text-[10px] uppercase tracking-wide text-on-surface-variant font-bold">
                  <th className="text-left">Area</th>
                  <th className="text-left">Operation</th>
                  <th className="text-right">Stitch</th>
                  <th className="text-right">SPI</th>
                  <th className="text-right">SA (mm)</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {snap.construction.map((c) => (
                  <ConstructionRow key={c.id} row={c} locked={locked} onSave={saveRow} onRemove={() => removeRow(c.id)} />
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

function ConstructionRow({
  row,
  locked,
  onSave,
  onRemove,
}: {
  row: TechPackSnapshot['construction'][number];
  locked: boolean;
  onSave: (row: Record<string, unknown>) => Promise<void>;
  onRemove: () => void;
}) {
  const [draft, setDraft] = useState({
    area: row.area ?? '',
    operation: row.operation ?? '',
    stitch_type: row.stitch_type ?? '',
    spi: row.spi ?? '',
    seam_allowance_mm: row.seam_allowance_mm ?? '',
  });
  const commit = () => {
    if (locked) return;
    const changed =
      draft.area !== (row.area ?? '') ||
      draft.operation !== (row.operation ?? '') ||
      draft.stitch_type !== (row.stitch_type ?? '') ||
      String(draft.spi) !== String(row.spi ?? '') ||
      String(draft.seam_allowance_mm) !== String(row.seam_allowance_mm ?? '');
    if (!changed) return;
    void onSave({
      id: row.id,
      area: draft.area || null,
      operation: draft.operation || null,
      stitch_type: draft.stitch_type || null,
      spi: draft.spi === '' ? null : Number(draft.spi),
      seam_allowance_mm: draft.seam_allowance_mm === '' ? null : Number(draft.seam_allowance_mm),
    });
  };
  const inputCls = 'w-full border border-transparent bg-transparent px-1.5 py-1 rounded text-[12px] hover:border-surface-dim focus:outline-none focus:border-[#0077c5] focus:bg-white disabled:text-on-surface-variant';
  return (
    <tr className="grid grid-cols-[1fr_1fr_80px_80px_100px_40px] gap-2 py-1.5 border-b border-surface-container-low items-center">
      <td>
        <input className={inputCls} value={draft.area} disabled={locked} onChange={(e) => setDraft({ ...draft, area: e.target.value })} onBlur={commit} />
      </td>
      <td>
        <input className={inputCls} value={draft.operation} disabled={locked} onChange={(e) => setDraft({ ...draft, operation: e.target.value })} onBlur={commit} />
      </td>
      <td>
        <input className={inputCls} value={draft.stitch_type} disabled={locked} onChange={(e) => setDraft({ ...draft, stitch_type: e.target.value })} onBlur={commit} />
      </td>
      <td>
        <input className={`${inputCls} text-right`} value={draft.spi} disabled={locked} onChange={(e) => setDraft({ ...draft, spi: e.target.value })} onBlur={commit} />
      </td>
      <td>
        <input className={`${inputCls} text-right`} value={draft.seam_allowance_mm} disabled={locked} onChange={(e) => setDraft({ ...draft, seam_allowance_mm: e.target.value })} onBlur={commit} />
      </td>
      <td className="text-right">
        <button
          className="w-6 h-6 rounded hover:bg-error-container inline-flex items-center justify-center disabled:opacity-50"
          disabled={locked}
          onClick={onRemove}
          aria-label="Remove operation"
        >
          <span className="material-symbols-outlined text-[14px]">close</span>
        </button>
      </td>
    </tr>
  );
}

function MeasurementsTab({
  snap,
  pomLibrary,
  sizes,
  measurementsByKey,
  locked,
  onReload,
  onError,
  onSaved,
}: {
  snap: TechPackSnapshot;
  pomLibrary: PomLibraryRow[];
  sizes: string[];
  measurementsByKey: Map<string, { value: number | string; tol_plus: number | null; tol_minus: number | null }>;
  locked: boolean;
  onReload: () => Promise<void>;
  onError: (e: unknown) => void;
  onSaved: () => void;
}) {
  const tpId = snap.tech_pack.id;
  const [cells, setCells] = useState<Record<string, string>>({});
  useEffect(() => {
    const next: Record<string, string> = {};
    for (const [key, cell] of measurementsByKey) next[key] = String(cell.value ?? '');
    setCells(next);
  }, [measurementsByKey]);
  const saveCell = async (pomId: string, size: string, raw: string) => {
    if (locked) return;
    const key = `${pomId}:${size}`;
    const prev = measurementsByKey.get(key)?.value;
    if (raw === '' || raw === String(prev ?? '')) return;
    const value = Number(raw);
    if (Number.isNaN(value)) {
      setCells((c) => ({ ...c, [key]: String(prev ?? '') }));
      onError(new Error('Measurement must be a number.'));
      return;
    }
    const pom = pomLibrary.find((p) => p.id === pomId);
    try {
      const res = await fetch(`/api/v1/tech-packs/${tpId}/measurements`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rows: [{ pom_id: pomId, size_label: size, value, tol_plus: pom?.default_tol_plus ?? null, tol_minus: pom?.default_tol_minus ?? null }],
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message ?? 'Failed to save measurement.');
      onSaved();
      await onReload();
    } catch (e) {
      onError(e);
      setCells((c) => ({ ...c, [key]: String(prev ?? '') }));
    }
  };
  return (
    <div className="p-5">
      <div className="border border-surface-dim rounded-lg overflow-hidden">
        <div className="bg-surface-container-low px-3.5 py-2.5 border-b border-surface-dim flex items-center justify-between">
          <div className="font-semibold text-[13px] flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[16px]">straighten</span>Points of measure (POM)
          </div>
          <div className="text-[11px] text-on-surface-variant">Tolerance applies symmetrically unless noted</div>
        </div>
        <div className="p-3.5 overflow-x-auto">
          {pomLibrary.length === 0 ? (
            <p className="text-[12px] text-on-surface-variant">No POM library rows yet — the measurements grid needs the library first.</p>
          ) : (
            <table className="w-full border-collapse text-[11px]">
              <thead>
                <tr>
                  <th className="bg-surface-container-low px-2 py-1.5 font-bold text-center border border-surface-dim text-[10px] uppercase tracking-wide text-on-surface-variant w-[60px]">Code</th>
                  <th className="bg-surface-container-low px-2 py-1.5 font-bold text-left border border-surface-dim text-[10px] uppercase tracking-wide text-on-surface-variant w-[160px]">POM</th>
                  {sizes.map((s) => (
                    <th key={s} className={`bg-surface-container-low px-2 py-1.5 font-bold text-center border border-surface-dim text-[10px] uppercase tracking-wide text-on-surface-variant ${s === snap.tech_pack.base_size ? 'text-[#0077c5]' : ''}`}>
                      {s}
                      {s === snap.tech_pack.base_size ? ' ★' : ''}
                    </th>
                  ))}
                  <th className="bg-surface-container-low px-2 py-1.5 font-bold text-center border border-surface-dim text-[10px] uppercase tracking-wide text-on-surface-variant w-[80px]">Tol +</th>
                  <th className="bg-surface-container-low px-2 py-1.5 font-bold text-center border border-surface-dim text-[10px] uppercase tracking-wide text-on-surface-variant w-[80px]">Tol −</th>
                </tr>
              </thead>
              <tbody>
                {pomLibrary.map((p) => (
                  <tr key={p.id}>
                    <td className="border border-surface-dim px-1.5 py-1 text-left font-semibold bg-[#faf9fc]">{p.code}</td>
                    <td className="border border-surface-dim px-1.5 py-1 text-left font-semibold bg-[#faf9fc]" title={p.how_to_measure ?? ''}>
                      {p.name}
                    </td>
                    {sizes.map((s) => {
                      const key = `${p.id}:${s}`;
                      return (
                        <td key={s} className={`border border-surface-dim px-1 py-0.5 text-center ${s === snap.tech_pack.base_size ? 'bg-[#e8f0fb]/50' : ''}`}>
                          <input
                            className="w-full border-none text-center text-[11px] py-0.5 bg-transparent focus:outline-1 focus:outline-[#0077c5] focus:bg-white disabled:text-on-surface-variant"
                            value={cells[key] ?? ''}
                            disabled={locked}
                            onChange={(e) => setCells((c) => ({ ...c, [key]: e.target.value }))}
                            onBlur={(e) => void saveCell(p.id, s, e.target.value)}
                          />
                        </td>
                      );
                    })}
                    <td className="border border-surface-dim px-1.5 py-1 text-center text-on-surface-variant">{p.default_tol_plus ?? '—'}</td>
                    <td className="border border-surface-dim px-1.5 py-1 text-center text-on-surface-variant">{p.default_tol_minus ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="text-[11px] text-on-surface-variant mt-2">
            Base size {snap.tech_pack.base_size ?? '—'} is highlighted. Values are in {snap.size_range?.unit ?? 'cm'}. The pack cannot move to Review with an empty measurement chart.
          </p>
        </div>
      </div>
    </div>
  );
}

function RevisionsTab({ snap }: { snap: TechPackSnapshot }) {
  return (
    <div className="p-5">
      <div className="border border-surface-dim rounded-lg overflow-hidden">
        <div className="bg-surface-container-low px-3.5 py-2.5 border-b border-surface-dim flex items-center justify-between">
          <div className="font-semibold text-[13px] flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[16px]">history</span>Revision history
          </div>
          <div className="text-[11px] text-on-surface-variant">Immutable — every transition creates a snapshot</div>
        </div>
        <div className="p-3.5">
          {snap.revisions.length === 0 ? (
            <p className="text-[12px] text-on-surface-variant">No revisions yet.</p>
          ) : (
            snap.revisions.map((r) => (
              <div key={r.id} className="flex items-center gap-3 py-3 border-b border-surface-dim last:border-0">
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#8af5be] text-[#00714b]">
                  Rev {r.revision}
                </span>
                <div className="flex-1">
                  <div className="font-medium text-[13px]">
                    {r.from_status ? `${techPackStatusLabel(r.from_status)} → ${techPackStatusLabel(r.to_status ?? '')}` : `Created as ${techPackStatusLabel(r.to_status ?? '')}`}
                  </div>
                  <div className="text-[11px] text-on-surface-variant">{r.change_summary ?? '—'}</div>
                </div>
                <div className="text-right text-[11px] text-on-surface-variant">
                  {r.created_by ?? '—'}
                  <br />
                  {new Date(r.created_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
