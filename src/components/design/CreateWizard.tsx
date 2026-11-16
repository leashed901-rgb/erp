'use client';
/**
 * CreateWizard — the wizard launched from the Catalog sidebar (move 4).
 *
 * A 3-step flow that combines catalog browsing + design selection:
 *   Step 1: Choose a category (the storefront nav tree)
 *   Step 2: Choose a REAL blank for that category (GET /api/v1/blanks)
 *           + a REAL variant color (GET /api/v1/blanks/:id)
 *   Step 3: Confirm → creates the draft design + loads the canvas
 *
 * No invented blanks, no invented colors: when the supplier catalog has
 * no items mapped to a category, step 2 says so instead of showing a
 * fake tee.
 */
import { useEffect, useState } from 'react';
import { useDesignCanvas } from '@/lib/designCanvasStore';
import { getBlank, listBlanks, type BlankCard, type BlankDetail } from '@/lib/podApi';
import type { DomainKey } from '@/data/shellData';

interface CreateWizardProps {
  onToast: (m: string) => void;
  onNavigate: (d: DomainKey, screenId: string) => void;
  /** Pre-selected category (set when launched from a catalog child's wizard icon) */
  initialCategory?: string;
  /** Pre-selected subcategory (set when launched from a subcategory's wizard icon) */
  initialSubcategory?: string;
}

export default function CreateWizard({ onToast, onNavigate, initialCategory, initialSubcategory }: CreateWizardProps) {
  const [step, setStep] = useState<1 | 2 | 3>(initialCategory ? 2 : 1);
  const [category, setCategory] = useState<string | null>(initialCategory || null);
  const [subcategory, setSubcategory] = useState<string | null>(initialSubcategory || null);
  const [blankId, setBlankId] = useState<string | null>(null);
  const [blanks, setBlanks] = useState<BlankCard[]>([]);
  const [blanksStatus, setBlanksStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [blanksError, setBlanksError] = useState<string | null>(null);
  const [detail, setDetail] = useState<BlankDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [colorName, setColorName] = useState<string | null>(null);
  const [finishing, setFinishing] = useState(false);

  // The storefront nav tree (departments → subcategories) — navigation
  // structure, not product data.
  const navMap = useDesignCanvas((s) => s.navMap);

  const loadBlankDetail = useDesignCanvas((s) => s.loadBlankDetail);
  const startDesign = useDesignCanvas((s) => s.startDesign);
  const loadBlankFromDetail = useDesignCanvas((s) => s.loadBlankFromDetail);
  const setSupplierCategory = useDesignCanvas((s) => s.setSupplierCategory);

  // Step 2 data — real blanks for the chosen category.
  useEffect(() => {
    if (step !== 2 || !category) return;
    let cancelled = false;
    setBlanksStatus('loading');
    setBlanksError(null);
    setBlankId(null);
    setDetail(null);
    setColorName(null);
    listBlanks({ category, subcategory: subcategory ?? undefined, limit: 24 })
      .then((res) => {
        if (cancelled) return;
        setBlanks(res.items);
        setBlanksStatus('ready');
        if (res.items.length === 0) {
          setBlanksError(
            res.meta?.matched === false
              ? `No products in “${category}” yet — the supplier catalog has no items mapped to this category.`
              : 'No products in this category yet.',
          );
        }
      })
      .catch((e: Error) => {
        if (!cancelled) {
          setBlanksStatus('error');
          setBlanksError(e.message || 'Could not load products for this category.');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [step, category, subcategory]);

  // Real variant colors for the chosen blank.
  useEffect(() => {
    if (!blankId) {
      setDetail(null);
      setColorName(null);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    getBlank(blankId)
      .then((d) => {
        if (cancelled) return;
        setDetail(d);
        setColorName(d.variants.colors[0]?.name ?? null);
      })
      .catch(() => {
        if (!cancelled) setDetail(null);
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [blankId]);

  const selectedBlank = blanks.find((b) => b.id === blankId) ?? null;
  const colors = detail?.variants.colors ?? [];

  function next() {
    if (step === 1 && category) {
      setStep(2);
    } else if (step === 2 && blankId) {
      setStep(3);
    }
  }
  function back() {
    if (step > 1) setStep((s) => (s - 1) as 1 | 2 | 3);
  }
  function finish() {
    if (!blankId || finishing) return;
    setFinishing(true);
    void (async () => {
      const d = await loadBlankDetail(blankId);
      if (!d) {
        onToast('Could not load that product — try again.');
        setFinishing(false);
        return;
      }
      try {
        await startDesign(d, colorName ?? undefined);
      } catch {
        // Draft creation failed (network) — still design.
        loadBlankFromDetail(d);
      }
      if (category) {
        const sub = navMap[category]?.[0] || subcategory || '';
        setSupplierCategory(category, sub);
      }
      onNavigate('design', 'new-design');
      onToast('Wizard complete — canvas loaded, Design drawer opened.');
      setFinishing(false);
    })();
  }

  return (
    <main className="px-6 pb-12 flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 text-body-sm text-on-surface-variant py-3">
        <span className="material-symbols-outlined text-[18px]">auto_fix_high</span>
        <span>Catalog</span>
        <span className="text-on-surface-variant/40">/</span>
        <span className="text-on-surface font-medium">Create wizard</span>
      </div>

      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-headline-lg">Create wizard</h1>
          <p className="text-body-sm text-on-surface-variant mt-0.5">
            Pick a category, choose a blank, and start designing
          </p>
        </div>
      </div>

      {/* Stepper */}
      <div className="flex items-center gap-2 mb-6">
        {[1, 2, 3].map((n) => (
          <div key={n} className="flex items-center gap-2">
            <div
              className={`w-7 h-7 rounded-full flex items-center justify-center text-label-sm font-semibold ${
                step >= n ? 'bg-primary text-white' : 'bg-surface-container text-on-surface-variant'
              }`}
            >
              {n}
            </div>
            <span className={`text-label-md ${step >= n ? 'text-on-surface font-medium' : 'text-on-surface-variant'}`}>
              {n === 1 ? 'Category' : n === 2 ? 'Blank & variant' : 'Confirm'}
            </span>
            {n < 3 && <span className="w-8 h-px bg-surface-dim mx-1" />}
          </div>
        ))}
      </div>

      {/* Step body */}
      <div className="flex-1 bg-white rounded-xl border border-surface-dim p-6 overflow-y-auto">
        {step === 1 && (
          <>
            <h2 className="text-title-md mb-1">Choose a category</h2>
            <p className="text-body-sm text-on-surface-variant mb-4">
              The real catalog departments — the same tree as the sidebar and the top bar.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {Object.keys(navMap).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => { setCategory(c); setSubcategory(navMap[c]?.[0] ?? null); }}
                  className={`p-4 rounded-xl border text-left transition-colors ${
                    category === c
                      ? 'border-primary bg-primary-container/20'
                      : 'border-surface-dim hover:bg-surface-container-low'
                  }`}
                >
                  <span className="material-symbols-outlined text-[20px] text-on-surface-variant">
                    {c.toLowerCase().includes('home') ? 'bed'
                      : c.toLowerCase().includes('accessor') ? 'diamond'
                      : c.toLowerCase().includes('book') ? 'menu_book'
                      : c.toLowerCase().includes('card') ? 'mail'
                      : c.toLowerCase().includes('drink') ? 'local_cafe'
                      : c.toLowerCase().includes('tech') ? 'devices'
                      : c.toLowerCase().includes('game') ? 'extension'
                      : c.toLowerCase().includes('wellness') ? 'spa'
                      : c.toLowerCase().includes('wall') ? 'wall_art'
                      : c.toLowerCase().includes('keep') ? 'redeem'
                      : c.toLowerCase().includes('business') ? 'work'
                      : c.toLowerCase().includes('collection') ? 'collections_bookmark'
                      : 'checkroom'}
                  </span>
                  <div className="font-medium text-body-md mt-1">{c}</div>
                  <div className="text-[11px] text-on-surface-variant">
                    {navMap[c].length} subcategories
                  </div>
                </button>
              ))}
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <h2 className="text-title-md mb-1">Choose a blank & variant</h2>
            <p className="text-body-sm text-on-surface-variant mb-4">
              Category: <b>{category}</b>
              {subcategory ? <> / {subcategory}</> : null}
            </p>

            <div className="section-label">Blank</div>
            {blanksStatus === 'loading' && (
              <p className="text-body-sm text-on-surface-variant mb-6">Loading products…</p>
            )}
            {blanksStatus !== 'loading' && blanks.length === 0 && (
              <p className="text-body-sm text-on-surface-variant mb-6">{blanksError ?? 'No products in this category yet.'}</p>
            )}
            {blanks.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 mb-6">
                {blanks.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => setBlankId(b.id)}
                    className={`p-3 rounded-xl border text-left transition-colors ${
                      blankId === b.id
                        ? 'border-primary bg-primary-container/20'
                        : 'border-surface-dim hover:bg-surface-container-low'
                    }`}
                  >
                    {b.mockupThumbUrl && (
                      <img src={b.mockupThumbUrl} alt={b.name} className="w-full aspect-square object-cover rounded-lg mb-2" />
                    )}
                    <div className="font-medium text-body-md">{b.name}</div>
                    <div className="text-[11px] text-on-surface-variant">
                      {b.brand} · {b.supplier}
                      {b.baseCost != null ? ` · $${b.baseCost.toFixed(2)}` : ''}
                    </div>
                  </button>
                ))}
              </div>
            )}

            {blankId && (
              <>
                <div className="section-label">Color / variant</div>
                {detailLoading && (
                  <p className="text-body-sm text-on-surface-variant">Loading colors…</p>
                )}
                {!detailLoading && colors.length === 0 && (
                  <p className="text-body-sm text-on-surface-variant">No colors on file for this product.</p>
                )}
                <div className="flex flex-wrap gap-2">
                  {colors.map((c) => (
                    <button
                      key={c.name}
                      type="button"
                      onClick={() => setColorName(c.name)}
                      className={`w-10 h-10 rounded-full border-2 transition-colors ${
                        colorName === c.name ? 'border-on-surface' : 'border-transparent'
                      }`}
                      title={c.name}
                    >
                      <div className="w-full h-full rounded-full" style={{ background: c.hex || '#cccccc' }} />
                    </button>
                  ))}
                </div>
              </>
            )}
          </>
        )}

        {step === 3 && (
          <>
            <h2 className="text-title-md mb-1">Confirm</h2>
            <p className="text-body-sm text-on-surface-variant mb-4">
              Ready to load the canvas with your selection.
            </p>
            <dl className="grid grid-cols-2 gap-y-2 max-w-sm text-body-sm">
              <dt className="text-on-surface-variant">Category</dt>
              <dd className="font-medium">{category}</dd>
              <dt className="text-on-surface-variant">Blank</dt>
              <dd className="font-medium">{selectedBlank?.name ?? '—'}</dd>
              <dt className="text-on-surface-variant">Color</dt>
              <dd className="font-medium">{colorName ?? '—'}</dd>
            </dl>
          </>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between mt-4">
        <button
          type="button"
          className="h-9 px-4 border border-surface-dim rounded text-body-md hover:bg-surface-container-low"
          onClick={back}
          disabled={step === 1}
        >
          Back
        </button>
        {step < 3 ? (
          <button
            type="button"
            className="h-9 px-4 bg-primary text-white text-body-md font-semibold rounded hover:bg-primary-container flex items-center gap-1"
            onClick={next}
            disabled={(step === 1 && !category) || (step === 2 && !blankId)}
          >
            Next
            <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
          </button>
        ) : (
          <button
            type="button"
            className="h-9 px-4 bg-primary text-white text-body-md font-semibold rounded hover:bg-primary-container flex items-center gap-1"
            onClick={finish}
            disabled={finishing || !blankId}
          >
            <span className="material-symbols-outlined text-[16px]">palette</span>
            {finishing ? 'Loading…' : 'Start designing'}
          </button>
        )}
      </div>

      <style jsx>{`
        .section-label {
          font-size: 11px;
          font-weight: 700;
          color: #5a6355;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          margin-bottom: 8px;
        }
      `}</style>
    </main>
  );
}
