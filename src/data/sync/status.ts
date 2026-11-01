import { useSyncExternalStore } from 'react';

/** Stato della sincronizzazione, per l'interfaccia (pallino in Impostazioni, avvisi). */
export type SyncState = 'off' | 'idle' | 'syncing' | 'offline' | 'error';
export interface SyncStatus {
  state: SyncState;
  /** modifiche di questo dispositivo non ancora sul server */
  pending: number;
  /** ultima sincronizzazione completa riuscita */
  lastSyncAt?: number;
  error?: string;
}

let status: SyncStatus = { state: 'off', pending: 0 };
const subs = new Set<() => void>();

export function setSyncStatus(patch: Partial<SyncStatus>) {
  status = { ...status, ...patch };
  subs.forEach((f) => f());
}
export const getSyncStatus = () => status;

export function useSyncStatus(): SyncStatus {
  return useSyncExternalStore(
    (cb) => {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    () => status,
  );
}
