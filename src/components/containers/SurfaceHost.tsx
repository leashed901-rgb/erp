'use client';

import { useState, useCallback, createContext, useContext } from 'react';
import type { Envelope, SurfaceRequest } from '@/lib/contracts';
import { Drawer } from '@/components/containers/Drawer';
import { Modal } from '@/components/containers/Modal';

// ═══════════════════════════════════════════════════════════════
// useEnvelope — the Context Envelope store (spec §1.3, §B.1)
// ═══════════════════════════════════════════════════════════════

const EMPTY_ENVELOPE: Envelope = {
  origin_module: '',
  origin_record_id: null,
  origin_tab_id: null,
  party_id: null,
  order_id: null,
  item_id: null,
  design_id: null,
  account_id: null,
  channel_id: null,
  currency: 'USD',
  date_range: { start: null, end: null },
  return_to: null,
};

const EnvelopeContext = createContext<{
  envelope: Envelope;
  setEnvelope: (e: Envelope) => void;
  derive: (record: { id: string; type: string; partyId?: string }) => Envelope;
  clear: () => void;
}>({
  envelope: EMPTY_ENVELOPE,
  setEnvelope: () => {},
  derive: () => EMPTY_ENVELOPE,
  clear: () => {},
});

export function EnvelopeProvider({ children }: { children: React.ReactNode }) {
  const [envelope, setEnvelopeState] = useState<Envelope>(EMPTY_ENVELOPE);

  const setEnvelope = useCallback((e: Envelope) => setEnvelopeState(e), []);
  const clear = useCallback(() => setEnvelopeState(EMPTY_ENVELOPE), []);

  const derive = useCallback((record: { id: string; type: string; partyId?: string }): Envelope => {
    return {
      ...envelope,
      origin_record_id: record.id,
      origin_module: record.type,
      party_id: record.partyId || envelope.party_id || record.id,
    };
  }, [envelope]);

  return (
    <EnvelopeContext.Provider value={{ envelope, setEnvelope, derive, clear }}>
      {children}
    </EnvelopeContext.Provider>
  );
}

export function useEnvelope() {
  return useContext(EnvelopeContext);
}

// ═══════════════════════════════════════════════════════════════
// useSurfaces — the surface stack store (spec §B.1, §B.3.4)
// ═══════════════════════════════════════════════════════════════

export interface SurfaceInstance {
  id: string;
  request: SurfaceRequest;
  dirty: boolean;
}

export function useSurfaces() {
  const [surfaces, setSurfaces] = useState<SurfaceInstance[]>([]);

  const open = useCallback((request: SurfaceRequest) => {
    setSurfaces((prev) => {
      if (prev.length >= 2) {
        return [...prev.slice(0, 1), { id: crypto.randomUUID(), request, dirty: false }];
      }
      if (prev.length > 0 && !prev[prev.length - 1].dirty) {
        return [...prev.slice(0, -1), { id: crypto.randomUUID(), request, dirty: false }];
      }
      return [...prev, { id: crypto.randomUUID(), request, dirty: false }];
    });
  }, []);

  const close = useCallback((instanceId: string) => {
    setSurfaces((prev) => prev.filter((s) => s.id !== instanceId));
  }, []);

  const closeTop = useCallback(() => {
    setSurfaces((prev) => prev.slice(0, -1));
  }, []);

  const closeAll = useCallback(() => {
    setSurfaces([]);
  }, []);

  const setDirty = useCallback((instanceId: string, dirty: boolean) => {
    setSurfaces((prev) => prev.map((s) => s.id === instanceId ? { ...s, dirty } : s));
  }, []);

  return {
    surfaces,
    open,
    close,
    closeTop,
    closeAll,
    setDirty,
    top: surfaces[surfaces.length - 1] || null,
  };
}

// ═══════════════════════════════════════════════════════════════
// SurfaceHost — renders the active surface stack (spec §B.1)
// ═══════════════════════════════════════════════════════════════

export function SurfaceHost({ surfaces, onClose, children }: {
  surfaces: SurfaceInstance[];
  onClose: (instanceId: string) => void;
  children?: React.ReactNode;
}) {
  if (surfaces.length === 0 && !children) return null;

  return (
    <>
      {children}
      {surfaces.map((instance) => {
        const { request } = instance;
        if (request.type === 'drawer') {
          return (
            <Drawer
              key={instance.id}
              open
              title={request.entity}
              width={request.width || 480}
              dirty={instance.dirty}
              onClose={() => onClose(instance.id)}
            >
              {/* Drawer content rendered by parent screen */}
            </Drawer>
          );
        }
        if (request.type === 'modal') {
          return (
            <Modal
              key={instance.id}
              open
              title={request.entity}
              dirty={instance.dirty}
              onClose={() => onClose(instance.id)}
            >
              {/* Modal content rendered by parent */}
            </Modal>
          );
        }
        return null;
      })}
    </>
  );
}
