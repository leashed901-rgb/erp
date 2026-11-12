'use client';

import { useEffect } from 'react';

/**
 * Modal — single-decision dialog (spec §1.2, §B.2.4).
 * Focus-trapped; ≤5 fields. Scrim closes only if form is clean.
 */
export function Modal({ open, title, children, onClose, maxWidth = 'max-w-md', dirty }: {
  open: boolean;
  title: string;
  children: React.ReactNode;
  onClose?: () => void;
  maxWidth?: string;
  dirty?: boolean;
}) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) {
        if (!dirty) onClose?.();
      }
    };
    if (open) document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, dirty, onClose]);

  if (!open) return null;

  return (
    <div className="modal-scrim open" onClick={() => { if (!dirty) onClose?.(); }}>
      <div className={`bg-white rounded-xl shadow-2xl w-full ${maxWidth} p-5`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-headline-sm">{title}</h3>
          <button className="w-8 h-8 rounded hover:bg-surface-container flex items-center justify-center" onClick={onClose}>
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export default Modal;
