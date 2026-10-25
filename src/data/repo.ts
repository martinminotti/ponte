import { db, type SettingsRow } from './db';
import { DEFAULT_SETTINGS, EMPTY_COMPANY, type Job, type Photo, type Settings } from '@/domain/types';
import { uid } from '@/domain/format';

/* ---------------- impostazioni ---------------- */

export async function getSettings(): Promise<Settings> {
  const row = await db.settings.get('main');
  return normalizeSettings(row);
}

export function normalizeSettings(row: Partial<Settings> | undefined | null): Settings {
  const { key: _k, ...rest } = (row || {}) as Partial<SettingsRow>;
  return { ...DEFAULT_SETTINGS, ...rest, workers: [...(rest.workers || [])] };
}

export async function saveSettings(patch: Partial<Settings>): Promise<void> {
  await db.transaction('rw', db.settings, async () => {
    const cur = await getSettings();
    await db.settings.put({ ...cur, ...patch, key: 'main' });
  });
}

/* ---------------- schede ---------------- */

export type NewJobInput = Omit<Job, 'id' | 'number' | 'createdAt' | 'updatedAt' | 'history' | 'status'> &
  Partial<Pick<Job, 'status'>>;

/** Crea la scheda assegnando il numero progressivo in modo atomico. */
export async function createJob(input: NewJobInput): Promise<Job> {
  return db.transaction('rw', db.jobs, db.settings, async () => {
    const s = await getSettings();
    const max = (await db.jobs.orderBy('number').last())?.number ?? 0;
    const number = Math.max(s.nextNumber || 1, max + 1);
    const now = Date.now();
    const status = input.status ?? 'accettato';
    const job: Job = {
      ...input,
      id: uid('j'),
      number,
      createdAt: now,
      updatedAt: now,
      status,
      history: [{ s: status, t: now }],
    };
    await db.jobs.add(job);
    await db.settings.put({ ...s, nextNumber: number + 1, key: 'main' });
    return job;
  });
}

export async function putJob(job: Job): Promise<void> {
  await db.jobs.put({ ...job, updatedAt: Date.now() });
}

export async function patchJob(id: string, patch: Partial<Job>): Promise<void> {
  await db.jobs.update(id, { ...patch, updatedAt: Date.now() });
}

/** Modifica atomica: legge la versione salvata, applica fn, riscrive. Evita di perdere modifiche ravvicinate. */
export async function mutateJob(id: string, fn: (j: Job) => Job): Promise<void> {
  await db.transaction('rw', db.jobs, async () => {
    const j = await db.jobs.get(id);
    if (!j) return;
    await db.jobs.put({ ...fn(j), id, updatedAt: Date.now() });
  });
}

/** Elimina scheda e foto; restituisce cosa serve per annullare. */
export async function deleteJob(id: string): Promise<{ job: Job; photos: Photo[] } | null> {
  return db.transaction('rw', db.jobs, db.photos, async () => {
    const job = await db.jobs.get(id);
    if (!job) return null;
    const photos = await db.photos.where('jobId').equals(id).toArray();
    await db.photos.where('jobId').equals(id).delete();
    await db.jobs.delete(id);
    return { job, photos };
  });
}

export async function restoreJob(snap: { job: Job; photos: Photo[] }): Promise<void> {
  await db.transaction('rw', db.jobs, db.photos, async () => {
    await db.jobs.put(snap.job);
    if (snap.photos.length) await db.photos.bulkPut(snap.photos);
  });
}

export async function deleteDemo(): Promise<number> {
  const ids = (await db.jobs.toArray()).filter((j) => j.demo).map((j) => j.id);
  await db.transaction('rw', db.jobs, db.photos, async () => {
    await db.photos.where('jobId').anyOf(ids).delete();
    await db.jobs.bulkDelete(ids);
  });
  return ids.length;
}

/* ---------------- foto ---------------- */

export async function addPhoto(jobId: string, blob: Blob, w: number, h: number): Promise<Photo> {
  const p: Photo = { id: uid('p'), jobId, blob, w, h, createdAt: Date.now() };
  await db.transaction('rw', db.photos, db.jobs, async () => {
    await db.photos.add(p);
    const j = await db.jobs.get(jobId);
    if (j) await db.jobs.update(jobId, { photoIds: [...(j.photoIds || []), p.id], updatedAt: Date.now() });
  });
  return p;
}

export async function removePhoto(id: string): Promise<void> {
  await db.transaction('rw', db.photos, db.jobs, async () => {
    const p = await db.photos.get(id);
    if (!p) return;
    await db.photos.delete(id);
    const j = await db.jobs.get(p.jobId);
    if (j) await db.jobs.update(j.id, { photoIds: (j.photoIds || []).filter((x) => x !== id), updatedAt: Date.now() });
  });
}

/* ---------------- normalizzazione ---------------- */

/** Completa i campi mancanti di una scheda (dati importati, versioni precedenti). */
export function normalizeJob(j: Partial<Job> & { id: string }): Job {
  return {
    number: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    status: 'accettato',
    history: [],
    plate: '',
    plateCountry: 'I',
    vin: '',
    make: '',
    model: '',
    km: '',
    dueDate: '',
    client: 'privato',
    owner: '',
    phone: '',
    wa: true,
    services: [],
    tyres: '',
    request: '',
    notes: '',
    workers: [],
    photoIds: [],
    items: [],
    deposit: 0,
    vatRate: 22,
    vatIncl: true,
    billing: 'mensile',
    invoiced: false,
    invoiceNo: '',
    paid: false,
    payMethod: '',
    warrantyMonths: 0,
    warrantyNote: '',
    ...j,
    company: { ...EMPTY_COMPANY, ...(j.company || {}) },
  } as Job;
}

/** Richiede al browser di non cancellare l'archivio in caso di poco spazio. */
export async function requestPersistence(): Promise<boolean> {
  try {
    if (navigator.storage?.persisted && (await navigator.storage.persisted())) return true;
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}
