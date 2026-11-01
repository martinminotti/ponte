/**
 * Da capo a fondo su Supabase vero (in CI: `supabase start`): accesso con il codice email, officina, invito,
 * sincronizzazione attraverso le API (PostgREST), foto nello storage, avvisi in tempo reale, funzioni "ai" e
 * "account". Si salta se non c'è un Supabase locale (SUPABASE_API_URL).
 */
import { afterAll, describe, expect, it, vi } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';

const API = process.env.SUPABASE_API_URL || '';
const KEY = process.env.SUPABASE_KEY || '';
const MAIL = process.env.SUPABASE_MAIL_URL || 'http://127.0.0.1:54324';
const run = API && KEY ? describe : describe.skip;

const clients: SupabaseClient[] = [];
afterAll(async () => {
  for (const c of clients) await c.removeAllChannels();
});

/** il codice di 6 cifre arrivato nella casella di prova (Mailpit; Inbucket nelle versioni vecchie) */
async function codeFor(email: string): Promise<string> {
  for (let i = 0; i < 40; i++) {
    try {
      const r = await fetch(`${MAIL}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`);
      if (r.ok) {
        const list = (await r.json()) as { messages?: { ID: string; Subject: string }[] };
        const m = list.messages?.[0];
        const code = m?.Subject.match(/\b(\d{6})\b/)?.[1];
        if (code) return code;
      }
    } catch {
      /* casella non ancora pronta */
    }
    try {
      const box = email.split('@')[0];
      const r = await fetch(`${MAIL}/api/v1/mailbox/${box}`);
      if (r.ok) {
        const list = (await r.json()) as { id: string; subject: string }[];
        const code = list.at(-1)?.subject.match(/\b(\d{6})\b/)?.[1];
        if (code) return code;
      }
    } catch {
      /* idem */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`nessun codice per ${email}`);
}

async function signIn(name: string) {
  const sb = createClient(API, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  clients.push(sb);
  const email = `${name}-${Math.random().toString(36).slice(2, 8)}@prova.ponte`;
  const { error } = await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
  expect(error).toBeNull();
  const { data, error: e2 } = await sb.auth.verifyOtp({ email, token: await codeFor(email), type: 'email' });
  expect(e2).toBeNull();
  return { sb, user: data.user!, token: data.session!.access_token };
}

async function device(sb: SupabaseClient, workshop: string, owner = true) {
  vi.resetModules();
  (globalThis as { __PONTE_TEST_IDB__?: unknown }).__PONTE_TEST_IDB__ = { indexedDB: new IDBFactory(), IDBKeyRange };
  const { db } = await import('@/data/db');
  const repo = await import('@/data/repo');
  const changes = await import('@/data/changes');
  const { SyncEngine } = await import('@/data/sync/engine');
  const { SupabaseTransport } = await import('@/data/cloud/transport');
  await db.open();
  changes.setSyncTarget({ workshop, owner });
  const transport = new SupabaseTransport(sb);
  const engine = new SyncEngine({ transport, workshop });
  return { db, repo, engine, transport };
}

const base = { owner: '', plateCountry: 'I' as const, vin: '', make: 'Fiat', model: 'Panda', km: '', dueDate: '', client: 'privato' as const, company: { name: '', vat: '', cf: '', addr: '', sdi: '' }, phone: '', wa: true, services: [], tyres: '', request: '', notes: '', workers: [], photoIds: [], items: [], deposit: 0, vatRate: 22, vatIncl: true, billing: 'mensile' as const, invoiced: false, invoiceNo: '', paid: false, payMethod: '', warrantyMonths: 12, warrantyNote: '' };

run('Supabase vero', () => {
  it('titolare e dipendente: accesso con codice, invito, schede e foto sincronizzate, avvisi in tempo reale', async () => {
    const t = await signIn('titolare');
    const { data: w, error } = await t.sb.rpc('create_workshop', { p_display_name: 'Mario', p_settings: { shop: 'Officina CI' } });
    expect(error).toBeNull();
    const { data: code } = await t.sb.rpc('create_invite', { p_workshop: w, p_display_name: 'Luca' });
    const s = await signIn('dipendente');
    const { data: joined } = await s.sb.rpc('join_workshop', { p_code: code, p_display_name: '' });
    expect(joined).toBe(w);

    const a = await device(t.sb, w as string);
    const job = await a.repo.createJob({ ...base, plate: 'CI00001', owner: 'Cliente CI' });
    const photo = await a.repo.addPhoto(job.id, new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2])], { type: 'image/jpeg' }), 4, 3);
    await a.engine.syncNow();
    expect(await a.db.outbox.count()).toBe(0);
    expect((await a.db.jobs.get(job.id))?.number).toBe(1);
    expect((await a.db.photos.get(photo.id))?.up).toBe(1);

    const b = await device(s.sb, w as string, false);
    // avviso in tempo reale: B lo riceve quando A cambia la scheda
    let pinged = 0;
    let status = '';
    const off = b.transport.subscribe(
      w as string,
      () => pinged++,
      (st) => (status = st),
    );
    await b.engine.syncNow();
    expect(await b.db.jobs.get(job.id)).toMatchObject({ plate: 'CI00001', owner: 'Cliente CI', number: 1 });
    expect((await b.engine.fetchPhoto(photo.id))?.size).toBe(6);
    expect((await b.repo.getSettings()).shop).toBe('Officina CI');

    for (let i = 0; i < 60 && status !== 'SUBSCRIBED'; i++) await new Promise((r) => setTimeout(r, 250)); // il canale si collega
    expect(status).toBe('SUBSCRIBED');
    await a.repo.patchJob(job.id, { status: 'pronto', km: '99' });
    await a.engine.syncNow();
    for (let i = 0; i < 40 && !pinged; i++) await new Promise((r) => setTimeout(r, 250));
    off();
    expect(pinged).toBeGreaterThan(0);
    await b.engine.syncNow();
    expect(await b.db.jobs.get(job.id)).toMatchObject({ status: 'pronto', km: '99' });

    // il dipendente non cancella
    await b.repo.deleteJob(job.id);
    await b.engine.syncNow();
    expect((await b.db.jobs.get(job.id))?.plate).toBe('CI00001');
  });

  it('chi non è dell’officina non vede le foto né le schede', async () => {
    const t = await signIn('a');
    const { data: w } = await t.sb.rpc('create_workshop', { p_display_name: 'A' });
    const a = await device(t.sb, w as string);
    const job = await a.repo.createJob({ ...base, plate: 'PRIV001' });
    const p = await a.repo.addPhoto(job.id, new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' }), 1, 1);
    await a.engine.syncNow();
    const x = await signIn('estraneo');
    const { data: rows } = await x.sb.from('jobs').select('*');
    expect(rows).toEqual([]);
    const { data: file } = await x.sb.storage.from('photos').download(`${w}/${job.id}/${p.id}.jpg`);
    expect(file).toBeNull();
    const { error } = await x.sb.rpc('pull', { p_workshop: w, p_cursor: {}, p_limit: 10 });
    expect(error?.message).toMatch('not_member');
  });

  it('funzione ai: serve l’accesso e l’officina giusta', async () => {
    const t = await signIn('ai');
    const { data: w } = await t.sb.rpc('create_workshop', { p_display_name: 'AI' });
    const call = (token: string | null, workshop: string) =>
      fetch(`${API}/functions/v1/ai/anthropic/v1/messages`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', apikey: KEY, ...(token ? { Authorization: `Bearer ${token}` } : {}), 'x-ponte-workshop': workshop },
        body: JSON.stringify({ model: 'qualunque', max_tokens: 99999, messages: [{ role: 'user', content: 'ciao' }] }),
      });
    expect((await call(null, w as string)).status).toBe(401);
    const other = await signIn('altro');
    expect((await call(other.token, w as string)).status).toBe(403);
    // membro: passa i controlli (in CI senza chiave del modello il server risponde 503, con la chiave risponderebbe il modello)
    expect([200, 503]).toContain((await call(t.token, w as string)).status);
    const { data: usage } = await t.sb.from('ai_usage').select('requests').eq('workshop_id', w);
    expect(usage?.[0]?.requests).toBe(1);
  });

  it('eliminazione dell’account: l’officina di cui era unico titolare si chiude con le sue foto', async () => {
    const t = await signIn('via');
    const { data: w } = await t.sb.rpc('create_workshop', { p_display_name: 'Via' });
    const a = await device(t.sb, w as string);
    const job = await a.repo.createJob({ ...base, plate: 'BYE0001' });
    const p = await a.repo.addPhoto(job.id, new Blob([new Uint8Array([7, 7, 7])], { type: 'image/jpeg' }), 1, 1);
    await a.engine.syncNow();
    const r = await fetch(`${API}/functions/v1/account`, { method: 'DELETE', headers: { apikey: KEY, Authorization: `Bearer ${t.token}` } });
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ closed: 1, photos: 1 });
    const svc = process.env.SUPABASE_SERVICE_KEY;
    if (svc) {
      const admin = createClient(API, svc, { auth: { persistSession: false } });
      const { data: rows } = await admin.from('workshops').select('id').eq('id', w);
      expect(rows).toEqual([]);
      const { data: f } = await admin.storage.from('photos').list(`${w}/${job.id}`);
      expect((f || []).filter((x) => x.name === `${p.id}.jpg`)).toEqual([]);
      const { data: u } = await admin.auth.admin.getUserById(t.user.id);
      expect(u.user).toBeNull();
    }
  });
});
