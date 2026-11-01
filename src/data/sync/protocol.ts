/**
 * Il contratto fra l'app e il server per la sincronizzazione (funzioni push e pull in supabase/migrations).
 * I dati in arrivo dal server si controllano con zod prima di entrare nell'archivio: una riga malformata
 * si scarta (e si segnala), non rompe l'app.
 */
import { z } from 'zod';
import type { SyncTable } from '../db';

export type Change = { t: SyncTable; id: string; op: 'put' | 'del'; patch?: Record<string, unknown>; number?: number };

export const PushResult = z.object({
  t: z.string(),
  id: z.string(),
  ok: z.boolean(),
  number: z.number().int().optional(),
  error: z.string().optional(),
  row: z.unknown().optional(),
});
export type PushResult = z.infer<typeof PushResult>;
export const PushResponse = z.object({ results: z.array(PushResult) });
export type PushResponse = z.infer<typeof PushResponse>;

export const PulledJob = z.object({
  id: z.string().min(1),
  number: z.number().int().nullable(),
  doc: z.record(z.string(), z.unknown()),
  createdAt: z.number(),
  updatedAt: z.number(),
  deleted: z.boolean(),
});
export type PulledJob = z.infer<typeof PulledJob>;

export const PulledPhoto = z.object({
  id: z.string().min(1),
  jobId: z.string().min(1),
  path: z.string(),
  w: z.number(),
  h: z.number(),
  createdAt: z.number(),
  deleted: z.boolean(),
});
export type PulledPhoto = z.infer<typeof PulledPhoto>;

export const PulledMember = z.object({
  userId: z.string(),
  role: z.enum(['owner', 'staff']),
  displayName: z.string(),
  removed: z.boolean(),
});
export type PulledMember = z.infer<typeof PulledMember>;

export const PullResponse = z.object({
  jobs: z.array(z.unknown()),
  photos: z.array(z.unknown()),
  members: z.array(z.unknown()),
  workshop: z.object({ id: z.string(), settings: z.record(z.string(), z.unknown()), deleted: z.boolean() }).nullable(),
  more: z.boolean(),
  cursor: z.record(z.string(), z.unknown()),
});
export type PullResponse = z.infer<typeof PullResponse>;

/** Come il motore parla con il server: Supabase in produzione, Postgres diretto nei test. */
export interface Transport {
  push(workshop: string, changes: Change[]): Promise<unknown>;
  pull(workshop: string, cursor: Record<string, unknown>, limit: number): Promise<unknown>;
  /** foto: caricamento e download dallo storage */
  upload?(path: string, blob: Blob): Promise<void>;
  download?(path: string): Promise<Blob>;
  /** avviso in tempo reale che qualcosa è cambiato sul server */
  subscribe?(workshop: string, onChange: () => void, onStatus?: (status: string) => void): () => void;
}

/** senza rete o server irraggiungibile: si riprova più tardi, la coda resta */
export class SyncNetworkError extends Error {}

/** errori che non dipendono dalla rete: riprovare non serve */
export class SyncFatal extends Error {
  constructor(
    message: string,
    public reason: 'not_member' | 'not_authenticated' | 'other',
  ) {
    super(message);
  }
}

export const photoPath = (workshop: string, jobId: string, photoId: string) => `${workshop}/${jobId}/${photoId}.jpg`;
