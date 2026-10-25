import Dexie, { type EntityTable } from 'dexie';
import type { Job, Photo, Settings } from '@/domain/types';

export interface SettingsRow extends Settings {
  key: 'main';
}

/**
 * Archivio locale su IndexedDB.
 * Tutta la persistenza passa da qui e da repo.ts: per aggiungere la sincronizzazione
 * con un backend (Supabase, API propria) basta sostituire le funzioni di repo.ts.
 */
export class OfficinaDB extends Dexie {
  jobs!: EntityTable<Job, 'id'>;
  settings!: EntityTable<SettingsRow, 'key'>;
  photos!: EntityTable<Photo, 'id'>;

  constructor(name = 'registro-officina') {
    super(name);
    this.version(1).stores({
      jobs: 'id, number, createdAt, updatedAt, status, client',
      settings: 'key',
      photos: 'id, jobId, createdAt',
    });
  }
}

export const db = new OfficinaDB();
