/**
 * Sincronizzazione da capo a fondo: dispositivi veri (archivio, coda, motore dell'app, ognuno con il suo IndexedDB)
 * che parlano con le funzioni push/pull di Postgres, come farebbero con Supabase.
 */
import { afterAll, describe, expect, it, vi } from 'vitest';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { as, closeDb, newUser, rpc, type User } from './harness';
import type { Change, Transport } from '@/data/sync/protocol';

afterAll(closeDb);

/** lo storage delle foto: i permessi li decide Postgres (policy su storage.objects), i byte stanno qui */
const files = new Map<string, Blob>();

class PgTransport implements Transport {
  online = true;
  constructor(private u: User) {}
  private check() {
    if (!this.online) throw new TypeError('Failed to fetch');
  }
  async push(workshop: string, changes: Change[]) {
    this.check();
    return rpc(this.u, 'push', { p_workshop: workshop, p_changes: changes });
  }
  async pull(workshop: string, cursor: Record<string, unknown>, limit: number) {
    this.check();
    return rpc(this.u, 'pull', { p_workshop: workshop, p_cursor: cursor, p_limit: limit });
  }
  async upload(path: string, blob: Blob) {
    this.check();
    const there = await as(this.u, `select 1 from storage.objects where bucket_id = 'photos' and name = $1`, [path]);
    if (!there.length) await as(this.u, `insert into storage.objects (bucket_id, name) values ('photos', $1)`, [path]);
    files.set(path, blob);
  }
  async download(path: string) {
    this.check();
    const ok = await as(this.u, `select 1 from storage.objects where bucket_id = 'photos' and name = $1`, [path]);
    if (!ok.length) throw new Error('not found');
    return files.get(path)!;
  }
}

/** un telefono: moduli dell'app caricati da capo con un IndexedDB tutto suo */
async function device(u: User, workshop: string, owner = true) {
  vi.resetModules();
  (globalThis as { __PONTE_TEST_IDB__?: unknown }).__PONTE_TEST_IDB__ = { indexedDB: new IDBFactory(), IDBKeyRange };
  const { db } = await import('@/data/db');
  const repo = await import('@/data/repo');
  const changes = await import('@/data/changes');
  const { SyncEngine } = await import('@/data/sync/engine');
  await db.open();
  changes.setSyncTarget({ workshop, owner });
  const transport = new PgTransport(u);
  const logs: unknown[] = [];
  const engine = new SyncEngine({ transport, workshop, pageSize: 3, batchSize: 4, log: (m, d) => logs.push([m, d]) });
  return { db, repo, engine, transport, logs, sync: () => engine.syncNow() };
}

const base = {
  owner: '',
  plateCountry: 'I' as const,
  vin: '',
  make: 'Fiat',
  model: 'Panda',
  km: '',
  dueDate: '',
  client: 'privato' as const,
  company: { name: '', vat: '', cf: '', addr: '', sdi: '' },
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
  billing: 'mensile' as const,
  invoiced: false,
  invoiceNo: '',
  paid: false,
  payMethod: '',
  warrantyMonths: 12,
  warrantyNote: '',
};

async function shop() {
  const owner = await newUser('titolare');
  const w = await rpc<string>(owner, 'create_workshop', { p_display_name: 'Mario', p_settings: { shop: 'Officina Sync' } });
  return { owner, w };
}

describe('due dispositivi della stessa officina', () => {
  it('una scheda nata su un telefono arriva sull’altro con il numero assegnato dal server', async () => {
    const { owner, w } = await shop();
    const a = await device(owner, w);
    const job = await a.repo.createJob({ ...base, plate: 'GK482TR', owner: 'Marco Bianchi' });
    expect(job.number).toBe(0); // in invio
    await a.sync();
    expect((await a.db.jobs.get(job.id))?.number).toBe(1);
    expect(await a.db.outbox.count()).toBe(0);

    const b = await device(owner, w);
    await b.sync();
    const got = await b.db.jobs.get(job.id);
    expect(got).toMatchObject({ number: 1, plate: 'GK482TR', owner: 'Marco Bianchi', make: 'Fiat', status: 'accettato' });
    expect(got?.history).toHaveLength(1);
    // le impostazioni dell'officina arrivano anche loro
    expect((await b.repo.getSettings()).shop).toBe('Officina Sync');
  });

  it('modifiche contemporanee su campi diversi: si uniscono; sullo stesso campo vince l’ultima arrivata', async () => {
    const { owner, w } = await shop();
    const staff = await newUser('luca');
    await rpc(staff, 'join_workshop', { p_code: await rpc<string>(owner, 'create_invite', { p_workshop: w }) });
    const a = await device(owner, w);
    const job = await a.repo.createJob({ ...base, plate: 'AB123CD' });
    await a.sync();
    const b = await device(staff, w, false);
    await b.sync();

    await a.repo.patchJob(job.id, { km: '120000', notes: 'da A' });
    await b.repo.mutateJob(job.id, (j) => ({ ...j, status: 'lavorazione', history: [...j.history, { s: 'lavorazione', t: 2 }], notes: 'da B' }));
    await a.sync();
    await b.sync();
    await a.sync();
    const ja = await a.db.jobs.get(job.id);
    const jb = await b.db.jobs.get(job.id);
    expect(ja).toMatchObject({ km: '120000', status: 'lavorazione', notes: 'da B' });
    expect(jb).toMatchObject({ km: '120000', status: 'lavorazione', notes: 'da B' });
  });

  it('senza rete si lavora lo stesso: le modifiche partono al ritorno, nell’ordine', async () => {
    const { owner, w } = await shop();
    const a = await device(owner, w);
    a.transport.online = false;
    const j1 = await a.repo.createJob({ ...base, plate: 'OFF0001' });
    const j2 = await a.repo.createJob({ ...base, plate: 'OFF0002' });
    await a.repo.patchJob(j1.id, { km: '10' });
    await a.repo.patchJob(j1.id, { km: '20' });
    await a.sync(); // fallisce: senza rete
    expect(await a.db.outbox.count()).toBe(2); // le modifiche alla stessa scheda si sono unite
    expect((await a.db.jobs.get(j1.id))?.km).toBe('20');
    a.engine.stop();
    a.transport.online = true;
    await a.sync();
    expect(await a.db.outbox.count()).toBe(0);
    expect((await a.db.jobs.get(j1.id))?.number).toBe(1);
    expect((await a.db.jobs.get(j2.id))?.number).toBe(2);
    const b = await device(owner, w);
    await b.sync();
    expect((await b.db.jobs.get(j1.id))?.km).toBe('20');
  });

  it('una modifica locale ancora in coda non viene cancellata da ciò che arriva dal server', async () => {
    const { owner, w } = await shop();
    const a = await device(owner, w);
    const b = await device(owner, w);
    const job = await a.repo.createJob({ ...base, plate: 'REB0001', owner: 'Anna' });
    await a.sync();
    await b.sync();
    // B scrive offline sul proprietario; intanto A cambia il telefono
    b.transport.online = false;
    await b.repo.patchJob(job.id, { owner: 'Anna Rossi' });
    await a.repo.patchJob(job.id, { phone: '333 1234567' });
    await a.sync();
    b.engine.stop();
    b.transport.online = true;
    // ricezione senza invio (la rete torna a metà del giro): il campo scritto in B resta, quello di A arriva
    const { applyPull } = await import('@/data/sync/apply');
    const { PullResponse } = await import('@/data/sync/protocol');
    const { getMeta } = await import('@/data/db');
    const cursor = (await getMeta<Record<string, unknown>>(`cursor:${w}`)) ?? {};
    await applyPull(PullResponse.parse(await b.transport.pull(w, cursor, 500)), w);
    expect(await b.db.jobs.get(job.id)).toMatchObject({ owner: 'Anna Rossi', phone: '333 1234567' });
    expect(await b.db.outbox.count()).toBe(1);
    await b.sync();
    await a.sync();
    expect(await a.db.jobs.get(job.id)).toMatchObject({ owner: 'Anna Rossi', phone: '333 1234567' });
  });

  it('cancellare e annullare passano agli altri dispositivi', async () => {
    const { owner, w } = await shop();
    const a = await device(owner, w);
    const b = await device(owner, w);
    const job = await a.repo.createJob({ ...base, plate: 'DEL0001' });
    await a.sync();
    await b.sync();
    const snap = await a.repo.deleteJob(job.id);
    await a.sync();
    await b.sync();
    expect(await b.db.jobs.get(job.id)).toBeUndefined();
    await a.repo.restoreJob(snap!);
    await a.sync();
    await b.sync();
    expect(await b.db.jobs.get(job.id)).toMatchObject({ plate: 'DEL0001', number: 1 });
  });

  it('il dipendente non può cancellare: la scheda torna com’era', async () => {
    const { owner, w } = await shop();
    const staff = await newUser();
    await rpc(staff, 'join_workshop', { p_code: await rpc<string>(owner, 'create_invite', { p_workshop: w }) });
    const a = await device(owner, w);
    const job = await a.repo.createJob({ ...base, plate: 'NODEL01' });
    await a.sync();
    const b = await device(staff, w, false);
    await b.sync();
    await b.repo.deleteJob(job.id);
    expect(await b.db.jobs.get(job.id)).toBeUndefined();
    await b.sync();
    // rifiutata dal server: dopo il giro successivo la scheda è di nuovo lì
    await b.engine.syncNow();
    expect(b.logs.some((l) => JSON.stringify(l).includes('owner_only'))).toBe(true);
    const back = await b.db.jobs.get(job.id);
    expect(back?.plate).toBe('NODEL01');
  });

  it('le foto: si caricano dal telefono che le scatta e si scaricano sull’altro quando servono', async () => {
    const { owner, w } = await shop();
    const a = await device(owner, w);
    const job = await a.repo.createJob({ ...base, plate: 'PHO0001' });
    const blob = new Blob([new Uint8Array([0xff, 0xd8, 1, 2, 3])], { type: 'image/jpeg' });
    const p = await a.repo.addPhoto(job.id, blob, 640, 480);
    await a.sync();
    expect((await a.db.photos.get(p.id))?.up).toBe(1);
    expect(files.has(`${w}/${job.id}/${p.id}.jpg`)).toBe(true);
    const b = await device(owner, w);
    await b.sync();
    const meta = await b.db.photos.get(p.id);
    expect(meta).toMatchObject({ jobId: job.id, w: 640, h: 480 });
    expect(meta?.blob).toBeUndefined();
    expect((await b.db.jobs.get(job.id))?.photoIds).toEqual([p.id]);
    const got = await b.engine.fetchPhoto(p.id);
    expect(got?.size).toBe(5);
    expect((await b.db.photos.get(p.id))?.blob).toBeTruthy();
    // tolta su B, sparisce anche da A
    await b.repo.removePhoto(p.id);
    await b.sync();
    await a.sync();
    expect(await a.db.photos.get(p.id)).toBeUndefined();
    expect((await a.db.jobs.get(job.id))?.photoIds).toEqual([]);
  });

  it('le impostazioni dell’officina cambiate dal titolare arrivano a tutti; quelle del dispositivo no', async () => {
    const { owner, w } = await shop();
    const a = await device(owner, w);
    const b = await device(owner, w);
    await a.repo.saveSettings({ shopAddr: 'Via III Settembre 112', workers: ['Luca', 'Gino'], theme: 'dark' });
    await a.sync();
    await b.sync();
    const s = await b.repo.getSettings();
    expect(s).toMatchObject({ shop: 'Officina Sync', shopAddr: 'Via III Settembre 112', workers: ['Luca', 'Gino'] });
    expect(s.theme).toBe('system');
  });

  it('un archivio grande arriva a pagine, senza doppioni e senza buchi', async () => {
    const { owner, w } = await shop();
    const a = await device(owner, w);
    for (let i = 0; i < 11; i++) await a.repo.createJob({ ...base, plate: `BULK${String(i).padStart(3, '0')}` });
    await a.sync();
    const nums = (await a.db.jobs.toArray()).map((j) => j.number).sort((x, y) => x - y);
    expect(nums).toEqual(Array.from({ length: 11 }, (_, i) => i + 1));
    const b = await device(owner, w);
    await b.sync();
    expect(await b.db.jobs.count()).toBe(11);
  });

  it('un nuovo telefono ritrova tutto (foto comprese) dopo che l’altro si è rotto', async () => {
    const { owner, w } = await shop();
    const a = await device(owner, w);
    const job = await a.repo.createJob({ ...base, plate: 'SAFE001', owner: 'Cliente Fedele', items: [{ id: 'i1', desc: 'Tagliando', amount: 18900 }] });
    await a.repo.addPhoto(job.id, new Blob([new Uint8Array([9, 9])], { type: 'image/jpeg' }), 10, 10);
    await a.sync();
    const fresh = await device(owner, w);
    await fresh.sync();
    const j = await fresh.db.jobs.get(job.id);
    expect(j).toMatchObject({ owner: 'Cliente Fedele', number: 1 });
    expect(j?.items[0]).toMatchObject({ desc: 'Tagliando', amount: 18900 });
    expect(await fresh.db.photos.count()).toBe(1);
  });
});
