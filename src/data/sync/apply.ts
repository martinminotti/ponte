/**
 * Porta nell'archivio del dispositivo le righe ricevute dal server.
 * Le modifiche locali non ancora confermate (in coda) restano in vista: si riapplicano sopra la versione del server,
 * così chi sta scrivendo non vede tornare indietro un campo mentre la sua modifica è in viaggio.
 */
import { db, setMeta, type OutboxRow } from '../db';
import { applyJobPatch, normalizeJob } from '@/domain/job';
import { normalizeSettings, pickWorkshop } from '@/domain/settings';
import type { Job, Photo, Settings } from '@/domain/types';
import { PulledJob, PulledMember, PulledPhoto, type PullResponse } from './protocol';

export type Member = PulledMember;
export type Log = (msg: string, data?: unknown) => void;

const TEMPLATE = normalizeJob({ id: 'x', createdAt: 0, updatedAt: 0 });
const kind = (v: unknown) => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v);

/** toglie dal documento i campi nulli o di tipo diverso da quello atteso (un client vecchio o difettoso) */
export function cleanDoc(doc: Record<string, unknown>): Partial<Job> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(doc)) {
    if (v === null || v === undefined) continue;
    const expected = k in TEMPLATE ? kind((TEMPLATE as unknown as Record<string, unknown>)[k]) : null;
    if (expected && kind(v) !== expected) continue;
    out[k] = v;
  }
  return out as Partial<Job>;
}

export function jobFromServer(j: PulledJob): Job {
  return normalizeJob({ ...cleanDoc(j.doc), id: j.id, number: j.number ?? 0, createdAt: j.createdAt, updatedAt: j.updatedAt });
}

function byRow(pending: OutboxRow[]) {
  const m = new Map<string, OutboxRow[]>();
  for (const o of pending) {
    const k = `${o.t}:${o.id}`;
    const l = m.get(k);
    if (l) l.push(o);
    else m.set(k, [o]);
  }
  return m;
}

/** una scheda dal server, con sopra le modifiche locali ancora in coda */
export async function putServerJob(j: PulledJob, mine: OutboxRow[]): Promise<void> {
  if (mine.some((o) => o.op === 'del')) return; // cancellata qui: la cancellazione è in viaggio
  if (j.deleted) {
    if (mine.some((o) => o.op === 'put')) return; // modificata qui dopo: la modifica la riporta in vita sul server
    await db.jobs.delete(j.id);
    await db.photos.where('jobId').equals(j.id).delete();
    return;
  }
  let job = jobFromServer(j);
  for (const o of mine) job = applyJobPatch(job, o.patch);
  await db.jobs.put(job);
}

export async function applyPull(res: PullResponse, workshop: string, log: Log = () => {}): Promise<{ jobs: number; photos: number }> {
  let jobs = 0;
  let photos = 0;
  await db.transaction('rw', [db.jobs, db.photos, db.settings, db.outbox, db.meta], async () => {
    const pending = byRow(await db.outbox.toArray());

    for (const raw of res.jobs) {
      const p = PulledJob.safeParse(raw);
      if (!p.success) {
        log('scheda malformata dal server, scartata', { raw, issues: p.error.issues });
        continue;
      }
      await putServerJob(p.data, pending.get(`job:${p.data.id}`) || []);
      jobs++;
    }

    for (const raw of res.photos) {
      const p = PulledPhoto.safeParse(raw);
      if (!p.success) {
        log('foto malformata dal server, scartata', { raw });
        continue;
      }
      const f = p.data;
      const mine = pending.get(`photo:${f.id}`) || [];
      if (f.deleted) {
        if (!mine.some((o) => o.op === 'put')) await db.photos.delete(f.id);
      } else if (!mine.some((o) => o.op === 'del')) {
        const cur = await db.photos.get(f.id);
        const next: Photo = { id: f.id, jobId: f.jobId, w: f.w, h: f.h, createdAt: cur?.createdAt ?? f.createdAt, blob: cur?.blob, up: cur?.up === 0 ? 0 : 1 };
        await db.photos.put(next);
      }
      photos++;
    }

    if (res.workshop) {
      const cur = normalizeSettings(await db.settings.get('main'));
      let next: Settings = { ...cur, ...(pickWorkshop(res.workshop.settings as Partial<Settings>) as Partial<Settings>) };
      for (const o of pending.get(`workshop:${workshop}`) || []) next = { ...next, ...(o.patch as Partial<Settings>) };
      await db.settings.put({ ...normalizeSettings(next), key: 'main' });
    }

    if (res.members.length) {
      const list = new Map<string, Member>(((await db.meta.get('members'))?.value as Member[] | undefined)?.map((m) => [m.userId, m]) ?? []);
      for (const raw of res.members) {
        const m = PulledMember.safeParse(raw);
        if (m.success) list.set(m.data.userId, m.data);
      }
      await setMeta('members', [...list.values()]);
    }

    await setMeta(`cursor:${workshop}`, res.cursor);
  });
  return { jobs, photos };
}
