import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './db';
import { createJob, deleteJob, getSettings, normalizeJob, restoreJob } from './repo';
import { exportBackup, importBackup, LEGACY_KEY, migrateLegacy } from './backup';

const base = () => {
  const { id: _id, number: _n, createdAt: _c, updatedAt: _u, history: _h, status: _s, ...rest } = normalizeJob({ id: 'tmp' });
  return rest;
};

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('repo', () => {
  it('numeri progressivi', async () => {
    const a = await createJob({ ...base(), plate: 'AA111AA' });
    const b = await createJob({ ...base(), plate: 'BB222BB' });
    expect([a.number, b.number]).toEqual([1, 2]);
    expect((await getSettings()).nextNumber).toBe(3);
  });
  it('elimina e ripristina', async () => {
    const a = await createJob(base());
    const snap = await deleteJob(a.id);
    expect(await db.jobs.count()).toBe(0);
    await restoreJob(snap!);
    expect(await db.jobs.get(a.id)).toBeTruthy();
  });
});

describe('migrazione dalla bozza', () => {
  it('converte euro in centesimi e assegna i numeri', async () => {
    const v1 = {
      jobs: [
        { id: 'j2', createdAt: 2000, plate: 'BB222BB', items: [{ desc: 'Olio', amount: 49.9 }], deposit: 10, status: 'pronto' },
        { id: 'j1', createdAt: 1000, plate: 'AA111AA', items: [], status: 'accettato' },
      ],
      settings: { shop: 'Officina Test', prefix: '378', workers: ['Ugo'] },
    };
    const store = { getItem: (k: string) => (k === LEGACY_KEY ? JSON.stringify(v1) : null) };
    expect(await migrateLegacy(store)).toBe(2);
    const j2 = await db.jobs.get('j2');
    expect(j2?.items[0].amount).toBe(4990);
    expect(j2?.deposit).toBe(1000);
    expect(j2?.number).toBe(2);
    const s = await getSettings();
    expect(s.shop).toBe('Officina Test');
    expect(s.nextNumber).toBe(3);
    expect(await migrateLegacy(store)).toBe(0);
  });
});

describe('backup', () => {
  it('esporta e reimporta', async () => {
    await createJob({ ...base(), plate: 'AA111AA' });
    await db.photos.add({ id: 'p1', jobId: (await db.jobs.toArray())[0].id, blob: new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' }), w: 1, h: 1, createdAt: 1 });
    const dump = JSON.stringify(await exportBackup());
    await db.delete();
    await db.open();
    const r = await importBackup(dump, 'replace');
    expect(r.added).toBe(1);
    expect(await db.photos.count()).toBe(1);
    const again = await importBackup(dump, 'merge');
    expect(again).toEqual({ added: 0, updated: 0, skipped: 1 });
  });
  it('rifiuta file non validi', async () => {
    await expect(importBackup('{nope', 'merge')).rejects.toThrow();
    await expect(importBackup('{"a":1}', 'merge')).rejects.toThrow();
  });
});
