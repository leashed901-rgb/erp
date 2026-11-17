/* §1.3 Context Envelope — carries the record a create action was
   started from (e.g. a customer profile) into GlobalShell's create
   routing, and the return_to target for when the surface closes.
   Module-scoped state (not persisted): the envelope is meaningful
   only within the current session flow. This replaces the
   platformStore copy now that the store's data mirrors are gone. */

export interface ContextEnvelope {
  originModule?: string;
  originRecordId?: string;
  partyId?: string;
  returnTo?: string;
}

let current: ContextEnvelope = {};
const listeners = new Set<() => void>();

export function getEnvelope(): ContextEnvelope {
  return current;
}

export function setEnvelope(env: ContextEnvelope): void {
  current = { ...env };
  listeners.forEach((fn) => fn());
}

export function clearEnvelope(): void {
  current = {};
  listeners.forEach((fn) => fn());
}

export function subscribeEnvelope(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
