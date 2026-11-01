/**
 * Banco di prova del database: Postgres vero (in locale con stub-supabase.sql, in CI con `supabase start`).
 * Ogni chiamata gira "come" un utente: ruolo authenticated + token con il suo id, come fanno le API di Supabase.
 */
import pg from 'pg';
import { randomUUID } from 'node:crypto';

export const DB_URL = process.env.DATABASE_URL || 'postgresql://postgres@localhost:54329/ponte_test?host=/tmp/pgdata';

let pool: pg.Pool | null = null;
export function db(): pg.Pool {
  if (!pool) pool = new pg.Pool({ connectionString: DB_URL, max: 8 });
  return pool;
}
export async function closeDb() {
  await pool?.end();
  pool = null;
}

export type User = { id: string; email: string };

export async function newUser(name = 'u'): Promise<User> {
  const id = randomUUID();
  const email = `${name}-${id.slice(0, 8)}@test.ponte`;
  await db().query('insert into auth.users (id, email) values ($1, $2)', [id, email]);
  return { id, email };
}

/** esegue sql come l'utente indicato (null = anonimo), in una transazione propria */
export async function as<T = unknown>(u: User | null, sql: string, params: unknown[] = []): Promise<T[]> {
  const c = await db().connect();
  try {
    await c.query('begin');
    await c.query(`set local role ${u ? 'authenticated' : 'anon'}`);
    if (u) await c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: u.id, role: 'authenticated' })]);
    const r = await c.query(sql, params);
    await c.query('commit');
    return r.rows as T[];
  } catch (e) {
    await c.query('rollback').catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

/** chiama una funzione rpc e restituisce il valore (come supabase.rpc) */
export async function rpc<T = unknown>(u: User | null, fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const names = Object.keys(args);
  const sql = `select public.${fn}(${names.map((n, i) => `${n} => $${i + 1}`).join(', ')}) as v`;
  const rows = await as<{ v: T }>(
    u,
    sql,
    names.map((n) => (args[n] !== null && typeof args[n] === 'object' ? JSON.stringify(args[n]) : args[n])),
  );
  return rows[0]?.v as T;
}

/** messaggio d'errore di Postgres, per controllare i rifiuti */
export async function rejects(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    return (e as Error).message;
  }
  return '(nessun errore)';
}
