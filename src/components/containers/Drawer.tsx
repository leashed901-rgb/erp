'use client';

import { useState, useEffect } from 'react';

/**
 * Drawer — the right-side sliding panel (spec §1.2, §B.2.4).
 * Non-modal over the list; sticky footer; width 480 or 720.
 * Click outside does NOT close (prevents data loss). Esc closes with dirty guard.
 * Make full page promotes drawer state to DocumentPage.
 */
export function Drawer({ open, title, width = 480, dirty, children, onClose, onMakeFullPage }: {
  open: boolean;
  title: string;
  width?: 480 | 720;
  dirty?: boolean;
  children: React.ReactNode;
  onClose?: () => void;
  onMakeFullPage?: () => void;
}) {
  const [showDiscard, setShowDiscard] = useState(false);

  const handleClose = () => {
    if (dirty) { setShowDiscard(true); return; }
    onClose?.();
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) {
        e.preventDefault();
        handleClose();
      }
    };
    if (open) document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, dirty, onClose]);

  if (!open) return null;

  return (
    <>
      <div className={`drawer-scrim ${open ? 'open' : ''}`} onClick={(e) => { /* Don't close — spec: click outside does not close */ }} />
      <div className={`drawer ${open ? 'open' : ''}`} style={{ width }}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 h-14 border-b border-surface-dim shrink-0">
          <h3 className="text-[16px] font-semibold truncate">{title}</h3>
          <div className="flex items-center gap-1 shrink-0">
            {onMakeFullPage && (
              <button className="w-8 h-8 rounded hover:bg-surface-container flex items-center justify-center" onClick={onMakeFullPage} title="Make full page">
                <span className="material-symbols-outlined text-[20px]">open_in_full</span>
              </button>
            )}
            <button className="w-8 h-8 rounded hover:bg-surface-container flex items-center justify-center" onClick={handleClose} title="Close (Esc)">
              <span className="material-symbols-outlined text-[20px]">close</span>
            </button>
          </div>
        </div>
        {/* Body — scrollable */}
        <div className="flex-1 overflow-y-auto p-6">
          {children}
        </div>
      </div>

      {/* Dirty guard */}
      {showDiscard && (
        <div className="modal-scrim open" onClick={() => setShowDiscard(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-headline-sm mb-2">Discard changes?</h3>
            <p className="text-[13px] text-on-surface-variant mb-4">You have unsaved changes. They will be lost if you close.</p>
            <div className="flex justify-end gap-2">
              <button className="h-8 px-3 border border-surface-dim rounded text-[13px] font-semibold hover:bg-surface-container" onClick={() => setShowDiscard(false)}>Keep editing</button>
              <button className="h-8 px-3 bg-error text-white rounded text-[13px] font-semibold hover:bg-error/80" onClick={() => { setShowDiscard(false); onClose?.(); }}>Discard</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default Drawer;
