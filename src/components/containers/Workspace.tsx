'use client';

import { useState } from 'react';

/**
 * Workspace — batch operation surface (spec §1.2, §B.2.7).
 * Used by Pay bills, Receive payment, Reconcile, Batch slips, etc.
 * Multi-step: setup → edit → finish. Saves as draft.
 */
export function Workspace({ title, steps, children, onFinish, onToast }: {
  title: string;
  steps: string[];
  children: React.ReactNode;
  onFinish?: () => void;
  onToast?: (msg: string) => void;
}) {
  const [activeStep, setActiveStep] = useState(0);

  return (
    <div className="flex flex-col h-full">
      <header className="h-14 bg-white border-b border-surface-dim px-6 flex items-center justify-between shrink-0">
        <h2 className="text-[16px] font-semibold">{title}</h2>
        <div className="flex items-center gap-2">
          {steps.map((step, i) => (
            <div key={step} className="flex items-center gap-1">
              <span className={`text-[12px] font-semibold ${i === activeStep ? 'text-primary' : i < activeStep ? 'text-[#137333]' : 'text-on-surface-variant'}`}>
                {i + 1}. {step}
              </span>
              {i < steps.length - 1 && <span className="text-on-surface-variant mx-1">→</span>}
            </div>
          ))}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6">
        {children}
      </div>

      <footer className="h-14 bg-white border-t border-surface-dim px-6 flex items-center justify-between shrink-0">
        <button
          className="h-8 px-3 border border-surface-dim rounded text-[13px] font-semibold hover:bg-surface-container disabled:opacity-50"
          disabled={activeStep === 0}
          onClick={() => setActiveStep((s) => Math.max(0, s - 1))}
        >
          Back
        </button>
        <div className="flex gap-2">
          <button className="h-8 px-3 border border-surface-dim rounded text-[13px] font-semibold hover:bg-surface-container" onClick={() => onToast?.('Saved as draft')}>
            Save draft
          </button>
          {activeStep < steps.length - 1 ? (
            <button className="h-8 px-4 bg-primary text-white rounded text-[13px] font-semibold" onClick={() => setActiveStep((s) => s + 1)}>
              Next
            </button>
          ) : (
            <button className="h-8 px-4 bg-primary text-white rounded text-[13px] font-semibold" onClick={() => { onFinish?.(); onToast?.('Completed'); }}>
              Finish
            </button>
          )}
        </div>
      </footer>
    </div>
  );
}

export default Workspace;
