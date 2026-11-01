import { db } from './db';
import { record, syncTarget } from './changes';
import type { Job, Photo, Settings } from '@/domain/types';
import { uid } from '@/domain/format';
import { diffJob } from '@/domain/job';
import { normalizeSettings, pickWorkshop } from '@/domain/settings';

/**
 * Archivio dell'app: l'unico punto da cui le schermate leggono e scrivono i dati.
 * Ogni scrittura va sul dispositivo (subito) e, con l'officina nel cloud, entra nella coda delle modifiche
 * nella stessa transazione: il motore di sincronizzazione la consegna al server appena c'è rete.
 */

export { normalizeJob } from '@/domain/job';
export { normalizeSettings } from '@/domain/settings';

/* ---------------- impostazioni ---------------- */

export async function getSettings(): Promise<Settings> {
  const row = await db.settings.get('main');
  return normalizeSettings(row);
}

/** salva le impostazioni: quelle dell'officina (nome, logo, operai…) arrivano anche agli altri dispositivi */
export async function saveSettings(patch: Partial<Settings>): Promise<void> {
  await db.transaction('rw', db.settings, db.outbox, async () => {
    const cur = await getSettings();
    await db.settings.put({ ...cur, ...patch, key: 'main' });
    const t = syncTarget();
    if (t) await record('workshop', t.workshop, 'put', pickWorkshop(patch) as Record<string, unknown>);
  });
}

/* ---------------- schede ---------------- */

export type NewJobInput = Omit<Job, 'id' | 'number' | 'createdAt' | 'updatedAt' | 'history' | 'status'> & Partial<Pick<Job, 'status'>>;

/**
 * Crea la scheda. In locale assegna il numero progressivo (in modo atomico); con l'officina nel cloud il numero
 * lo assegna il server, unico fra tutti i dispositivi: fino ad allora la scheda ha numero 0 ("in invio").
 */
export async function createJob(input: NewJobInput): Promise<Job> {
  return db.transaction('rw', db.jobs, db.settings, db.outbox, async () => {
    const cloud = !!syncTarget();
    const now = Date.now();
    const status = input.status ?? 'accettato';
    let number = 0;
    if (!cloud) {
      const s = await getSettings();
      const max = (await db.jobs.orderBy('number').last())?.number ?? 0;
      number = Math.max(s.nextNumber || 1, max + 1);
      await db.settings.put({ ...s, nextNumber: number + 1, key: 'main' });
    }
    const job: Job = { ...input, id: uid('j'), number, createdAt: now, updatedAt: now, status, history: [{ s: status, t: now }] };
    await db.jobs.add(job);
    await record('job', job.id, 'put', diffJob(undefined, job));
    return job;
  });
}

export async function patchJob(id: string, patch: Partial<Job>): Promise<void> {
  await mutateJob(id, (j) => ({ ...j, ...patch }));
}

/** Modifica atomica: legge la versione salvata, applica fn, riscrive. Evita di perdere modifiche ravvicinate. */
export async function mutateJob(id: string, fn: (j: Job) => Job): Promise<void> {
  await db.transaction('rw', db.jobs, db.outbox, async () => {
    const j = await db.jobs.get(id);
    if (!j) return;
    const next = { ...fn(j), id, number: j.number, updatedAt: Date.now() };
    await db.jobs.put(next);
    await record('job', id, 'put', diffJob(j, next));
  });
}

/** Elimina scheda e foto; restituisce cosa serve per annullare. */
export async function deleteJob(id: string): Promise<{ job: Job; photos: Photo[] } | null> {
  return db.transaction('rw', db.jobs, db.photos, db.outbox, async () => {
    const job = await db.jobs.get(id);
    if (!job) return null;
    const photos = await db.photos.where('jobId').equals(id).toArray();
    await db.photos.where('jobId').equals(id).delete();
    await db.jobs.delete(id);
    // il server toglie anche le foto della scheda
    await record('job', id, 'del');
    return { job, photos };
  });
}

export async function restoreJob(snap: { job: Job; photos: Photo[] }): Promise<void> {
  await db.transaction('rw', db.jobs, db.photos, db.outbox, async () => {
    await db.jobs.put(snap.job);
    if (snap.photos.length) await db.photos.bulkPut(snap.photos);
    // sul server la scheda torna in vita insieme alle sue foto
    await record('job', snap.job.id, 'put', diffJob(undefined, snap.job));
  });
}

export async function deleteDemo(): Promise<number> {
  const ids = (await db.jobs.toArray()).filter((j) => j.demo).map((j) => j.id);
  await db.transaction('rw', db.jobs, db.photos, db.outbox, async () => {
    await db.photos.where('jobId').anyOf(ids).delete();
    await db.jobs.bulkDelete(ids);
    for (const id of ids) await record('job', id, 'del');
  });
  return ids.length;
}

/* ---------------- foto ---------------- */

export async function addPhoto(jobId: string, blob: Blob, w: number, h: number): Promise<Photo> {
  const cloud = !!syncTarget();
  const p: Photo = { id: uid('p'), jobId, blob, w, h, createdAt: Date.now(), ...(cloud ? { up: 0 as const } : {}) };
  await db.transaction('rw', db.photos, db.jobs, db.outbox, async () => {
    await db.photos.add(p);
    // prima la foto (il server la annuncia), poi il riferimento nella scheda
    await record('photo', p.id, 'put', { jobId, w, h });
    const j = await db.jobs.get(jobId);
    if (j) {
      const next = { ...j, photoIds: [...(j.photoIds || []), p.id], updatedAt: Date.now() };
      await db.jobs.put(next);
      await record('job', jobId, 'put', diffJob(j, next));
    }
  });
  return p;
}

export async function removePhoto(id: string): Promise<void> {
  await db.transaction('rw', db.photos, db.jobs, db.outbox, async () => {
    const p = await db.photos.get(id);
    if (!p) return;
    await db.photos.delete(id);
    await record('photo', id, 'del');
    const j = await db.jobs.get(p.jobId);
    if (j) {
      const next = { ...j, photoIds: (j.photoIds || []).filter((x) => x !== id), updatedAt: Date.now() };
      await db.jobs.put(next);
      await record('job', j.id, 'put', diffJob(j, next));
    }
  });
}

/* ---------------- dispositivo ---------------- */

/** Richiede al browser di non cancellare l'archivio in caso di poco spazio. */
export async function requestPersistence(): Promise<boolean> {
  try {
    if (navigator.storage?.persisted && (await navigator.storage.persisted())) return true;
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}

/** schede presenti sul dispositivo (per proporre di portarle nel cloud) */
export const localJobCount = () => db.jobs.count();
