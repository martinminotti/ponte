import { afterAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { DB_URL, as, closeDb, db, newUser, rejects, rpc, type User } from './harness';
import { JOB_SYNC_KEYS } from '@/domain/job';
import { WORKSHOP_KEYS } from '@/domain/settings';

type Result = { t: string; id: string; ok: boolean; number?: number; error?: string; row?: { doc: Record<string, unknown>; number: number } };
type Pull = {
  jobs: { id: string; number: number; doc: Record<string, unknown>; deleted: boolean }[];
  photos: { id: string; path: string; deleted: boolean }[];
  members: { userId: string; role: string; displayName: string; removed: boolean }[];
  workshop: { id: string; settings: Record<string, unknown>; deleted: boolean } | null;
  more: boolean;
  cursor: Record<string, unknown>;
};

// id unici a ogni esecuzione: le schede sono uniche in tutto il database, non solo nell'officina
const RUN = Math.random().toString(36).slice(2, 8);
const id = (s: string) => `${s}${RUN}`;

const push = async (u: User, w: string, changes: unknown[]) => (await rpc<{ results: Result[] }>(u, 'push', { p_workshop: w, p_changes: changes })).results;
const pull = (u: User, w: string, cursor: unknown = {}, limit = 500) => rpc<Pull>(u, 'pull', { p_workshop: w, p_cursor: cursor, p_limit: limit });
const job = (id: string, patch: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) => ({
  t: 'job',
  id,
  op: 'put',
  patch: { status: 'accettato', plate: 'AB123CD', ...patch },
  ...extra,
});

/** officina nuova con il suo titolare */
async function shop(name = 'Officina') {
  const owner = await newUser('titolare');
  const w = await rpc<string>(owner, 'create_workshop', { p_display_name: 'Mario', p_settings: { shop: name, prefix: '39', bogus: 1 } });
  return { owner, w };
}

afterAll(closeDb);

describe('contratto con l’app', () => {
  it('i campi che viaggiano sono gli stessi nell’app e nel database', async () => {
    const { rows } = await db().query('select ponte_private.job_keys() as j, ponte_private.settings_keys() as s');
    expect([...rows[0].j].sort()).toEqual([...JOB_SYNC_KEYS].sort());
    expect([...rows[0].s].sort()).toEqual([...WORKSHOP_KEYS].sort());
  });
});

describe('officina e appartenenza', () => {
  it('chi crea l’officina ne è il titolare; le impostazioni tengono solo i campi ammessi', async () => {
    const { owner, w } = await shop('Autofficina Guidi');
    const me = await rpc<{ user: string; workshops: { id: string; name: string; role: string }[] }>(owner, 'me');
    expect(me.user).toBe(owner.id);
    expect(me.workshops).toEqual([expect.objectContaining({ id: w, name: 'Autofficina Guidi', role: 'owner', displayName: 'Mario' })]);
    const first = await pull(owner, w);
    expect(first.workshop?.settings).toEqual({ shop: 'Autofficina Guidi', prefix: '39' });
  });

  it('chi non è membro non vede nulla: né tabelle né funzioni', async () => {
    const { owner, w } = await shop();
    await push(owner, w, [job(id('jobsecret1'))]);
    const stranger = await newUser('estraneo');
    expect(await as(stranger, 'select * from public.jobs')).toEqual([]);
    expect(await as(stranger, 'select * from public.workshops')).toEqual([]);
    expect(await rejects(pull(stranger, w))).toMatch('not_member');
    expect(await rejects(push(stranger, w, [job(id('jobhack01'))]))).toMatch('not_member');
    // anonimo: nessuna funzione
    expect(await rejects(rpc(null, 'me'))).toMatch(/permission denied/);
    // nessuna scrittura diretta, nemmeno da membro
    expect(await rejects(as(owner, `update public.jobs set doc = '{}' where id = $1`, [id('jobsecret1')]))).toMatch(/permission denied/);
    expect(await rejects(as(owner, `insert into public.members (workshop_id, user_id) values ($1, $2)`, [w, stranger.id]))).toMatch(/permission denied/);
  });

  it('al massimo tre officine per titolare', async () => {
    const u = await newUser();
    for (let i = 0; i < 3; i++) await rpc(u, 'create_workshop', { p_display_name: 'x' });
    expect(await rejects(rpc(u, 'create_workshop', { p_display_name: 'x' }))).toMatch('too_many_workshops');
  });
});

describe('inviti e ruoli', () => {
  it('il dipendente entra con il codice (anche scritto in minuscolo o con trattini), una volta sola', async () => {
    const { owner, w } = await shop();
    const code = await rpc<string>(owner, 'create_invite', { p_workshop: w, p_display_name: 'Luca' });
    expect(code).toMatch(/^[A-HJ-KM-NP-Z2-9]{8}$/);
    const staff = await newUser('luca');
    const typed = `${code.slice(0, 4).toLowerCase()}-${code.slice(4)}`;
    expect(await rpc(staff, 'join_workshop', { p_code: typed })).toBe(w);
    const me = await rpc<{ workshops: { role: string; displayName: string }[] }>(staff, 'me');
    expect(me.workshops[0]).toMatchObject({ role: 'staff', displayName: 'Luca' });
    const other = await newUser();
    expect(await rpc(other, 'join_workshop', { p_code: code })).toBeNull();
  });

  it('codici scaduti o revocati non valgono; i tentativi a vuoto si fermano', async () => {
    const { owner, w } = await shop();
    const code = await rpc<string>(owner, 'create_invite', { p_workshop: w });
    await rpc(owner, 'revoke_invite', { p_code: code });
    const u = await newUser();
    expect(await rpc(u, 'join_workshop', { p_code: code })).toBeNull();
    const code2 = await rpc<string>(owner, 'create_invite', { p_workshop: w });
    await db().query(`update public.invites set expires_at = now() - interval '1 minute' where code = $1`, [code2]);
    expect(await rpc(u, 'join_workshop', { p_code: code2 })).toBeNull();
    for (let i = 0; i < 18; i++) expect(await rpc(u, 'join_workshop', { p_code: 'AAAAAAAA' })).toBeNull();
    const code3 = await rpc<string>(owner, 'create_invite', { p_workshop: w });
    expect(await rejects(rpc(u, 'join_workshop', { p_code: code3 }))).toMatch('too_many_attempts');
  });

  it('il dipendente lavora sulle schede ma non cancella, non cambia l’officina, non invita', async () => {
    const { owner, w } = await shop();
    const staff = await newUser();
    await rpc(staff, 'join_workshop', { p_code: await rpc<string>(owner, 'create_invite', { p_workshop: w }) });
    const [r] = await push(staff, w, [job(id('jobstaff1'))]);
    expect(r.ok).toBe(true);
    const [del] = await push(staff, w, [{ t: 'job', id: id('jobstaff1'), op: 'del' }]);
    expect(del).toMatchObject({ ok: false, error: 'owner_only' });
    const [set] = await push(staff, w, [{ t: 'workshop', id: w, op: 'put', patch: { shop: 'Rubata' } }]);
    expect(set).toMatchObject({ ok: false, error: 'owner_only' });
    expect(await rejects(rpc(staff, 'create_invite', { p_workshop: w }))).toMatch('owner_only');
    expect(await as(staff, 'select * from public.invites')).toEqual([]);
    // il proprio nome sì, il ruolo no
    await rpc(staff, 'set_member', { p_workshop: w, p_user: staff.id, p_display_name: 'Luca B.' });
    expect(await rejects(rpc(staff, 'set_member', { p_workshop: w, p_user: staff.id, p_role: 'owner' }))).toMatch('owner_only');
  });

  it('chi viene tolto dall’officina perde subito l’accesso; l’ultimo titolare non può andarsene lasciando altri', async () => {
    const { owner, w } = await shop();
    const staff = await newUser();
    await rpc(staff, 'join_workshop', { p_code: await rpc<string>(owner, 'create_invite', { p_workshop: w }) });
    expect(await rejects(rpc(owner, 'leave_workshop', { p_workshop: w }))).toMatch('last_owner');
    expect(await rejects(rpc(owner, 'set_member', { p_workshop: w, p_user: owner.id, p_role: 'staff' }))).toMatch('last_owner');
    await rpc(owner, 'remove_member', { p_workshop: w, p_user: staff.id });
    expect(await rejects(pull(staff, w))).toMatch('not_member');
    expect(await as(staff, 'select * from public.jobs')).toEqual([]);
    // rientra con un nuovo invito
    await rpc(staff, 'join_workshop', { p_code: await rpc<string>(owner, 'create_invite', { p_workshop: w }) });
    expect((await pull(staff, w)).members.filter((m) => !m.removed)).toHaveLength(2);
  });

  it('un’officina chiusa sparisce per tutti', async () => {
    const { owner, w } = await shop();
    await rpc(owner, 'delete_workshop', { p_workshop: w });
    expect(await rejects(pull(owner, w))).toMatch('not_member');
    expect((await rpc<{ workshops: unknown[] }>(owner, 'me')).workshops).toEqual([]);
  });
});

describe('schede: invio', () => {
  it('numeri progressivi assegnati dal server, senza doppioni; un numero già usato altrove resta suo', async () => {
    const { owner, w } = await shop();
    const r = await push(owner, w, [job(id('jobnum001')), job(id('jobnum002')), job(id('jobnum003'), {}, { number: 40 }), job(id('jobnum004'), {}, { number: 40 }), job(id('jobnum005'))]);
    expect(r.map((x) => x.number)).toEqual([1, 2, 40, 41, 42]);
    // ripetere l'invio (rete instabile) non cambia il numero
    const again = await push(owner, w, [job(id('jobnum001'), { km: '1000' })]);
    expect(again[0]).toMatchObject({ ok: true, number: 1 });
    // un'altra officina ricomincia da 1
    const b = await shop();
    expect((await push(b.owner, b.w, [job(id('jobother1'))]))[0].number).toBe(1);
  });

  it('modifiche unite campo per campo: due dispositivi su campi diversi non si cancellano', async () => {
    const { owner, w } = await shop();
    const staff = await newUser();
    await rpc(staff, 'join_workshop', { p_code: await rpc<string>(owner, 'create_invite', { p_workshop: w }) });
    await push(owner, w, [job(id('jobmerge1'), { owner: 'Marco', km: '100' })]);
    await push(owner, w, [{ t: 'job', id: id('jobmerge1'), op: 'put', patch: { km: '200' } }]);
    await push(staff, w, [{ t: 'job', id: id('jobmerge1'), op: 'put', patch: { status: 'lavorazione', history: [{ s: 'lavorazione', t: 1 }] } }]);
    const row = (await pull(owner, w)).jobs.find((j) => j.id === id('jobmerge1'))!;
    expect(row.doc).toMatchObject({ owner: 'Marco', km: '200', status: 'lavorazione', plate: 'AB123CD' });
  });

  it('campi sconosciuti scartati, valori sbagliati rifiutati con la versione del server per riallinearsi', async () => {
    const { owner, w } = await shop();
    await push(owner, w, [job(id('jobbad001'), { owner: 'Anna', hacker: true, number: 999, updatedAt: 1 })]);
    let row = (await pull(owner, w)).jobs[0];
    expect(row.doc).not.toHaveProperty('hacker');
    expect(row.doc).not.toHaveProperty('number');
    expect(row.number).toBe(1);
    const [r] = await push(owner, w, [{ t: 'job', id: id('jobbad001'), op: 'put', patch: { status: 'rubato' } }]);
    expect(r).toMatchObject({ ok: false, error: 'bad_field:status' });
    expect(r.row?.doc).toMatchObject({ owner: 'Anna', status: 'accettato' });
    const [r2] = await push(owner, w, [{ t: 'job', id: id('jobbad001'), op: 'put', patch: { items: 'tanti' } }]);
    expect(r2.error).toBe('bad_field:items');
    // una modifica sbagliata non blocca le altre dello stesso invio
    const rs = await push(owner, w, [{ t: 'job', id: id('jobbad001'), op: 'put', patch: { paid: 'si' } }, job(id('jobgood01'))]);
    expect(rs.map((x) => x.ok)).toEqual([false, true]);
    row = (await pull(owner, w)).jobs.find((j) => j.id === id('jobbad001'))!;
    expect(row.doc.paid).toBeUndefined();
  });

  it('non si tocca una scheda di un’altra officina, nemmeno conoscendone l’id', async () => {
    const a = await shop();
    const b = await shop();
    await push(a.owner, a.w, [job(id('jobofa001'), { owner: 'Privato A' })]);
    const [r] = await push(b.owner, b.w, [{ t: 'job', id: id('jobofa001'), op: 'put', patch: { owner: 'Preso' } }]);
    expect(r).toMatchObject({ ok: false, error: 'not_found' });
    expect(r.row).toBeNull();
    const [d] = await push(b.owner, b.w, [{ t: 'job', id: id('jobofa001'), op: 'del' }]);
    expect(d.ok).toBe(false);
    expect((await pull(a.owner, a.w)).jobs[0].doc.owner).toBe('Privato A');
  });

  it('cancellare e annullare: la scheda torna con le sue foto', async () => {
    const { owner, w } = await shop();
    await push(owner, w, [job(id('jobdel001')), { t: 'photo', id: id('phodel001'), op: 'put', patch: { jobId: id('jobdel001'), w: 10, h: 20 } }]);
    await push(owner, w, [{ t: 'job', id: id('jobdel001'), op: 'del' }]);
    let p = await pull(owner, w);
    expect(p.jobs[0].deleted).toBe(true);
    expect(p.photos[0].deleted).toBe(true);
    await push(owner, w, [job(id('jobdel001'))]);
    p = await pull(owner, w);
    expect(p.jobs[0].deleted).toBe(false);
    expect(p.photos[0]).toMatchObject({ deleted: false, path: `${w}/${id('jobdel001')}/${id('phodel001')}.jpg` });
  });

  it('impostazioni dell’officina unite campo per campo', async () => {
    const { owner, w } = await shop('Prima');
    await push(owner, w, [{ t: 'workshop', id: w, op: 'put', patch: { shopAddr: 'Via Roma 1', workers: ['Luca'] } }]);
    await push(owner, w, [{ t: 'workshop', id: w, op: 'put', patch: { shop: 'Seconda', theme: 'dark' } }]);
    const s = (await pull(owner, w)).workshop!.settings;
    expect(s).toEqual({ shop: 'Seconda', prefix: '39', shopAddr: 'Via Roma 1', workers: ['Luca'] });
    expect((await rpc<{ workshops: { name: string }[] }>(owner, 'me')).workshops[0].name).toBe('Seconda');
  });

  it('troppe modifiche in un colpo solo: rifiutate', async () => {
    const { owner, w } = await shop();
    const many = Array.from({ length: 201 }, (_, i) => job(`jobmany${String(i).padStart(3, '0')}`));
    expect(await rejects(push(owner, w, many))).toMatch('bad_batch');
  });
});

describe('schede: ricezione', () => {
  it('a segno: solo le novità, nell’ordine, a pagine', async () => {
    const { owner, w } = await shop();
    await push(owner, w, [job(id('jobpull01')), job(id('jobpull02')), job(id('jobpull03'))]);
    const p1 = await pull(owner, w, {}, 2);
    expect(p1.jobs.map((j) => j.id)).toEqual([id('jobpull01'), id('jobpull02')]);
    expect(p1.more).toBe(true);
    const p2 = await pull(owner, w, p1.cursor, 2);
    expect(p2.jobs.map((j) => j.id)).toEqual([id('jobpull03')]);
    expect(p2.more).toBe(false);
    const p3 = await pull(owner, w, p2.cursor, 2);
    expect(p3.jobs).toEqual([]);
    expect(p3.workshop).toBeNull();
    await push(owner, w, [{ t: 'job', id: id('jobpull02'), op: 'put', patch: { km: '5' } }]);
    const p4 = await pull(owner, w, p3.cursor);
    expect(p4.jobs.map((j) => [j.id, j.doc.km])).toEqual([[id('jobpull02'), '5']]);
  });

  it('una transazione lenta non resta indietro: niente modifiche perse fra un segno e l’altro', async () => {
    const { owner, w } = await shop();
    await push(owner, w, [job(id('jobslow01'))]);
    const p0 = await pull(owner, w);
    // A comincia (prende il suo xid) ma non conclude: modifica una scheda che esiste già
    const a = new pg.Client({ connectionString: DB_URL });
    await a.connect();
    await a.query('begin');
    await a.query('set local role authenticated');
    await a.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: owner.id })]);
    await a.query('select public.push($1, $2)', [w, JSON.stringify([{ t: 'job', id: id('jobslow01'), op: 'put', patch: { km: '42' } }])]);
    // B scrive dopo e conclude prima
    await push(owner, w, [job(id('jobfast01'))]);
    const mid = await pull(owner, w, p0.cursor);
    // B non deve comparire prima di A: se il segno andasse oltre B, A (xid più basso) andrebbe perso
    expect(mid.jobs.map((j) => j.id)).not.toContain(id('jobfast01'));
    await a.query('commit');
    await a.end();
    const after = await pull(owner, w, mid.cursor);
    expect(after.jobs.map((j) => j.id).sort()).toEqual([id('jobfast01'), id('jobslow01')]);
    expect(after.jobs.find((j) => j.id === id('jobslow01'))!.doc.km).toBe('42');
  });

  it('i membri vedono chi c’è nell’officina', async () => {
    const { owner, w } = await shop();
    const staff = await newUser();
    await rpc(staff, 'join_workshop', { p_code: await rpc<string>(owner, 'create_invite', { p_workshop: w, p_display_name: 'Gino' }) });
    const p = await pull(staff, w);
    expect(p.members.map((m) => [m.role, m.displayName]).sort()).toEqual([
      ['owner', 'Mario'],
      ['staff', 'Gino'],
    ]);
  });
});

describe('foto nello storage', () => {
  it('si carica solo un file annunciato, nella cartella della propria officina', async () => {
    const { owner, w } = await shop();
    await push(owner, w, [job(id('jobpho001')), { t: 'photo', id: id('phophoto1'), op: 'put', patch: { jobId: id('jobpho001'), w: 800, h: 600 } }]);
    const path = `${w}/${id('jobpho001')}/${id('phophoto1')}.jpg`;
    await as(owner, `insert into storage.objects (bucket_id, name) values ('photos', $1)`, [path]);
    expect(await rejects(as(owner, `insert into storage.objects (bucket_id, name) values ('photos', $1)`, [`${w}/${id('jobpho001')}/altro.jpg`]))).toMatch(/row-level security/);
    const b = await shop();
    expect(await rejects(as(b.owner, `insert into storage.objects (bucket_id, name) values ('photos', $1)`, [`${w}/${id('jobpho001')}/${id('phophoto9')}.jpg`]))).toMatch(/row-level security/);
    expect(await as(b.owner, `select name from storage.objects where name = $1`, [path])).toEqual([]);
    expect(await as(owner, `select name from storage.objects where name = $1`, [path])).toEqual([{ name: path }]);
    // una foto per una scheda che non esiste: rifiutata
    const [r] = await push(owner, w, [{ t: 'photo', id: id('phonojob1'), op: 'put', patch: { jobId: 'nessuna1', w: 1, h: 1 } }]);
    expect(r).toMatchObject({ ok: false, error: 'no_job' });
  });
});

describe('errori dell’app', () => {
  it('si registrano con un tetto per persona; niente officine altrui', async () => {
    const { owner, w } = await shop();
    const other = await shop();
    const items = Array.from({ length: 25 }, (_, i) => ({ kind: 'error', message: `boom ${i}`, version: '2.1.0', platform: 'ios', workshop: i === 0 ? other.w : w, context: { route: '/job/x' } }));
    expect(await rpc(owner, 'report_errors', { p_items: items })).toBe(20);
    const rows = (await db().query('select workshop_id, message from public.client_errors where user_id = $1 order by id', [owner.id])).rows;
    expect(rows).toHaveLength(20);
    expect(rows[0].workshop_id).toBeNull(); // officina di cui non è membro: non si registra
    expect(rows[1].workshop_id).toBe(w);
    for (let i = 0; i < 3; i++) await rpc(owner, 'report_errors', { p_items: items });
    expect(Number((await db().query('select count(*) from public.client_errors where user_id = $1', [owner.id])).rows[0].count)).toBe(60);
    expect(await rejects(as(owner, 'select * from public.client_errors'))).toMatch(/permission denied/);
    expect(await rpc(null as never, 'report_errors', { p_items: items }).catch((e: Error) => e.message)).toMatch(/permission denied/);
  });
});
