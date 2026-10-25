import { db } from './db';
import { getSettings, normalizeJob, normalizeSettings } from './repo';
import type { Job, LineItem, Photo, Settings } from '@/domain/types';
import { uid } from '@/domain/format';

export const LEGACY_KEY = 'registro-officina-v1';
const APP = 'registro-officina';

/* ---------------- formato della bozza (v1, importi in euro) ---------------- */

interface V1Job {
  id?: string;
  createdAt?: number;
  items?: { desc?: string; amount?: number }[];
  deposit?: number;
  paidAmount?: number;
  [k: string]: unknown;
}

const toCents = (e: unknown) => Math.round((Number(e) || 0) * 100);

export function convertV1(data: { jobs?: V1Job[]; settings?: Record<string, unknown> }): { jobs: Job[]; settings: Partial<Settings> } {
  const sorted = [...(data.jobs || [])].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  const jobs = sorted.map((j, i) => {
    const items: LineItem[] = (j.items || []).map((it) => ({ id: uid('i'), desc: String(it.desc || ''), amount: toCents(it.amount) }));
    return normalizeJob({
      ...(j as unknown as Partial<Job>),
      id: String(j.id || uid('j')),
      number: i + 1,
      items,
      deposit: toCents(j.deposit),
      paidAmount: j.paidAmount == null ? undefined : toCents(j.paidAmount),
      photoIds: [],
    });
  });
  const s = data.settings || {};
  const settings: Partial<Settings> = {
    shop: String(s.shop || ''),
    prefix: String(s.prefix || '39'),
    warranty: s.warranty == null ? 12 : Number(s.warranty),
    vat: s.vat == null ? 22 : Number(s.vat),
    accent: typeof s.accent === 'string' ? s.accent : undefined,
    logo: typeof s.logo === 'string' ? s.logo : '',
    workers: Array.isArray(s.workers) ? (s.workers as string[]) : [],
    nextNumber: jobs.length + 1,
  };
  Object.keys(settings).forEach((k) => settings[k as keyof Settings] === undefined && delete settings[k as keyof Settings]);
  return { jobs, settings };
}

/**
 * Al primo avvio importa l'archivio della bozza (localStorage) se presente.
 * Il localStorage originale non viene toccato: resta come copia di sicurezza.
 */
export async function migrateLegacy(storage: Pick<Storage, 'getItem'> | undefined = globalThis.localStorage): Promise<number> {
  const s = await getSettings();
  if (s.migratedV1) return 0;
  let raw: string | null;
  try {
    raw = storage?.getItem(LEGACY_KEY) ?? null;
  } catch {
    raw = null;
  }
  let imported = 0;
  if (raw) {
    try {
      const { jobs, settings } = convertV1(JSON.parse(raw));
      const existing = await db.jobs.count();
      await db.transaction('rw', db.jobs, db.settings, async () => {
        if (!existing) {
          await db.jobs.bulkPut(jobs);
          imported = jobs.length;
          await db.settings.put({ ...normalizeSettings({ ...s, ...settings }), migratedV1: true, key: 'main' });
        } else {
          await db.settings.put({ ...s, migratedV1: true, key: 'main' });
        }
      });
      return imported;
    } catch {
      /* archivio della bozza illeggibile: si parte da vuoto */
    }
  }
  await db.settings.put({ ...s, migratedV1: true, key: 'main' });
  return imported;
}

/* ---------------- backup v2 ---------------- */

interface PhotoDump {
  id: string;
  jobId: string;
  w: number;
  h: number;
  createdAt: number;
  type: string;
  data: string;
}

export interface BackupFile {
  app: typeof APP;
  version: 2;
  exportedAt: number;
  settings: Settings;
  jobs: Job[];
  photos: PhotoDump[];
}

async function blobToBase64(b: Blob): Promise<string> {
  const buf = new Uint8Array(await b.arrayBuffer());
  let s = '';
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(s);
}
function base64ToBlob(d: string, type: string): Blob {
  const bin = atob(d);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return new Blob([out], { type });
}

export async function exportBackup(): Promise<BackupFile> {
  const [settings, jobs, photos] = await Promise.all([getSettings(), db.jobs.toArray(), db.photos.toArray()]);
  const dumps: PhotoDump[] = [];
  for (const p of photos) {
    dumps.push({ id: p.id, jobId: p.jobId, w: p.w, h: p.h, createdAt: p.createdAt, type: p.blob.type || 'image/jpeg', data: await blobToBase64(p.blob) });
  }
  return { app: APP, version: 2, exportedAt: Date.now(), settings, jobs, photos: dumps };
}

export interface ImportResult {
  added: number;
  updated: number;
  skipped: number;
}

/**
 * Importa un backup (v2) o un archivio della bozza (v1).
 * "merge": aggiunge le schede nuove e aggiorna quelle più recenti nel file.
 * "replace": svuota l'archivio e carica il file.
 */
export async function importBackup(text: string, mode: 'merge' | 'replace'): Promise<ImportResult> {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('Il file non è un backup valido (JSON non leggibile).');
  }
  const d = data as Partial<BackupFile> & { jobs?: unknown[]; settings?: Record<string, unknown> };
  if (!d || !Array.isArray(d.jobs)) throw new Error('Il file non contiene schede di Ponte.');

  let jobs: Job[];
  let settings: Partial<Settings>;
  let photos: Photo[] = [];
  if (d.app === APP && d.version === 2) {
    jobs = (d.jobs as Job[]).map((j) => normalizeJob(j));
    settings = d.settings || {};
    photos = (d.photos || []).map((p) => ({ id: p.id, jobId: p.jobId, w: p.w, h: p.h, createdAt: p.createdAt, blob: base64ToBlob(p.data, p.type) }));
  } else {
    ({ jobs, settings } = convertV1(d as { jobs: V1Job[] }));
  }

  const res: ImportResult = { added: 0, updated: 0, skipped: 0 };
  await db.transaction('rw', db.jobs, db.settings, db.photos, async () => {
    const cur = await getSettings();
    if (mode === 'replace') {
      await db.jobs.clear();
      await db.photos.clear();
      await db.jobs.bulkPut(jobs);
      await db.photos.bulkPut(photos);
      res.added = jobs.length;
      await db.settings.put({ ...normalizeSettings({ ...cur, ...settings }), migratedV1: true, key: 'main' });
    } else {
      const maxNo = (await db.jobs.orderBy('number').last())?.number ?? 0;
      let n = Math.max(maxNo, cur.nextNumber - 1);
      for (const j of jobs) {
        const ex = await db.jobs.get(j.id);
        if (!ex) {
          const clash = j.number && (await db.jobs.where('number').equals(j.number).count());
          await db.jobs.put(clash || !j.number ? { ...j, number: ++n } : j);
          if (!clash && j.number > n) n = j.number;
          res.added++;
        } else if ((j.updatedAt || 0) > (ex.updatedAt || 0)) {
          await db.jobs.put({ ...j, number: ex.number });
          res.updated++;
        } else res.skipped++;
      }
      const ids = new Set(jobs.map((j) => j.id));
      await db.photos.bulkPut(photos.filter((p) => ids.has(p.jobId)));
      await db.settings.put({ ...cur, nextNumber: n + 1, key: 'main' });
    }
  });
  return res;
}

export function backupFileName(ts = Date.now()): string {
  const d = new Date(ts);
  const p = (x: number) => String(x).padStart(2, '0');
  return `ponte-backup-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.json`;
}
