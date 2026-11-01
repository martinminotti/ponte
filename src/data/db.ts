import Dexie, { type EntityTable } from 'dexie';
import type { Job, Photo, Settings } from '@/domain/types';

export interface SettingsRow extends Settings {
  key: 'main';
}

/** tipi di riga che viaggiano con la sincronizzazione */
export type SyncTable = 'job' | 'photo' | 'workshop';

/**
 * Una modifica fatta su questo dispositivo e non ancora confermata dal server.
 * Le modifiche alla stessa riga si uniscono finché non partono (meno traffico, stesso risultato).
 */
export interface OutboxRow {
  seq?: number;
  t: SyncTable;
  id: string;
  op: 'put' | 'del';
  patch: Record<string, unknown>;
  /** numero di scheda già assegnato (schede portate nel cloud da un archivio esistente) */
  number?: number;
  at: number;
  /** in viaggio verso il server: non ci si unisce altro */
  inflight?: 1;
  tries?: number;
}

export interface MetaRow {
  key: string;
  value: unknown;
}

/**
 * Archivio locale su IndexedDB: l'app legge e scrive sempre qui (istantanea, anche senza rete).
 * Tutte le scritture passano da repo.ts, che con l'officina nel cloud registra anche la modifica in outbox;
 * il motore di sincronizzazione (sync/engine.ts) la manda al server e porta qui quelle degli altri dispositivi.
 */
export class OfficinaDB extends Dexie {
  jobs!: EntityTable<Job, 'id'>;
  settings!: EntityTable<SettingsRow, 'key'>;
  photos!: EntityTable<Photo, 'id'>;
  outbox!: EntityTable<OutboxRow, 'seq'>;
  meta!: EntityTable<MetaRow, 'key'>;

  constructor(name = 'registro-officina', deps?: { indexedDB: IDBFactory; IDBKeyRange: typeof IDBKeyRange }) {
    super(name, deps);
    this.version(1).stores({
      jobs: 'id, number, createdAt, updatedAt, status, client',
      settings: 'key',
      photos: 'id, jobId, createdAt',
    });
    // v2: sincronizzazione con il cloud (coda delle modifiche, segno di ricezione, foto da caricare)
    this.version(2).stores({
      photos: 'id, jobId, createdAt, up',
      outbox: '++seq, [t+id]',
      meta: 'key',
    });
  }
}

// nei test di sincronizzazione ogni "dispositivo" ha il suo IndexedDB (vedi supabase/tests/sync.test.ts)
const testIdb = (globalThis as { __PONTE_TEST_IDB__?: { indexedDB: IDBFactory; IDBKeyRange: typeof IDBKeyRange } }).__PONTE_TEST_IDB__;
export const db = new OfficinaDB('registro-officina', testIdb);

export async function getMeta<T>(key: string): Promise<T | undefined> {
  return (await db.meta.get(key))?.value as T | undefined;
}
export async function setMeta(key: string, value: unknown): Promise<void> {
  await db.meta.put({ key, value });
}
