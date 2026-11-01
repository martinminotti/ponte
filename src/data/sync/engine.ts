/**
 * Motore di sincronizzazione: manda al server le modifiche in coda, carica le foto, riceve le novità.
 *
 *  - Un giro alla volta: se arriva una richiesta mentre gira, se ne fa un altro subito dopo (mai due in parallelo).
 *  - Senza rete non si perde niente: la coda resta sul dispositivo e si riprova con attese crescenti (2 s → 1 min).
 *  - Un rifiuto del server su una singola modifica (campo non valido, permesso) non blocca le altre: la modifica si
 *    scarta e la riga torna com'è sul server.
 *  - Si parte quando: c'è una modifica locale, torna la rete, l'app torna in primo piano, il server avvisa
 *    in tempo reale, e comunque ogni minuto.
 */
import { db, getMeta, type OutboxRow } from '../db';
import { onLocalChange } from '../changes';
import { applyPull, putServerJob, type Log } from './apply';
import { photoPath, PullResponse, PulledJob, PushResponse, SyncFatal, type Change, type Transport } from './protocol';
import { setSyncStatus } from './status';

export class SyncNetworkError extends Error {}

export interface EngineOptions {
  transport: Transport;
  workshop: string;
  onFatal?: (e: SyncFatal) => void;
  log?: Log;
  /** righe per pagina in ricezione */
  pageSize?: number;
  /** modifiche per invio */
  batchSize?: number;
}

export class SyncEngine {
  private running: Promise<void> | null = null;
  private again = false;
  private stopped = false;
  private retry: ReturnType<typeof setTimeout> | null = null;
  private debounce: ReturnType<typeof setTimeout> | null = null;
  private backoff = 0;
  private offs: (() => void)[] = [];
  private readonly log: Log;

  constructor(private o: EngineOptions) {
    this.log = o.log ?? (() => {});
  }

  /** avvia gli inneschi automatici (rete, primo piano, tempo reale, timer) e fa subito un giro */
  start() {
    this.stopped = false;
    const soon = (ms = 300) => this.schedule(ms);
    this.offs.push(onLocalChange(() => soon(400)));
    if (typeof window !== 'undefined') {
      const online = () => {
        this.backoff = 0;
        soon(0);
      };
      const visible = () => document.visibilityState === 'visible' && soon(0);
      window.addEventListener('online', online);
      document.addEventListener('visibilitychange', visible);
      const every = setInterval(() => document.visibilityState === 'visible' && soon(0), 60_000);
      this.offs.push(() => {
        window.removeEventListener('online', online);
        document.removeEventListener('visibilitychange', visible);
        clearInterval(every);
      });
    }
    const unsub = this.o.transport.subscribe?.(this.o.workshop, () => soon(250));
    if (unsub) this.offs.push(unsub);
    soon(0);
  }

  stop() {
    this.stopped = true;
    this.offs.forEach((f) => f());
    this.offs = [];
    if (this.retry) clearTimeout(this.retry);
    if (this.debounce) clearTimeout(this.debounce);
    setSyncStatus({ state: 'off' });
  }

  schedule(ms: number) {
    if (this.stopped) return;
    if (this.debounce) clearTimeout(this.debounce);
    this.debounce = setTimeout(() => {
      this.debounce = null;
      this.syncNow().catch(() => {});
    }, ms);
  }

  /** un giro completo: invio, foto, ricezione. Risolve quando il dispositivo è allineato (o non si può). */
  syncNow(): Promise<void> {
    if (this.running) {
      this.again = true;
      return this.running;
    }
    this.running = (async () => {
      try {
        do {
          this.again = false;
          setSyncStatus({ state: 'syncing', pending: await db.outbox.count() });
          await this.pushAll();
          await this.uploadPhotos();
          await this.pullAll();
        } while (this.again && !this.stopped);
        this.backoff = 0;
        setSyncStatus({ state: 'idle', pending: await db.outbox.count(), lastSyncAt: Date.now(), error: undefined });
      } catch (e) {
        await this.failed(e);
      } finally {
        this.running = null;
      }
    })();
    return this.running;
  }

  private async failed(e: unknown) {
    const pending = await db.outbox.count().catch(() => 0);
    if (e instanceof SyncFatal) {
      this.log('sincronizzazione fermata', e.reason);
      setSyncStatus({ state: 'error', pending, error: e.message });
      this.o.onFatal?.(e);
      return;
    }
    const offline = e instanceof SyncNetworkError || (typeof navigator !== 'undefined' && navigator.onLine === false);
    this.log(offline ? 'senza rete, riprovo' : 'errore di sincronizzazione, riprovo', String(e));
    setSyncStatus({ state: offline ? 'offline' : 'error', pending, error: offline ? undefined : String((e as Error)?.message ?? e) });
    this.backoff = Math.min(60_000, this.backoff ? this.backoff * 2 : 2_000);
    if (!this.stopped) {
      if (this.retry) clearTimeout(this.retry);
      this.retry = setTimeout(() => this.syncNow().catch(() => {}), this.backoff);
    }
  }

  /* ---------------- invio ---------------- */

  private async pushAll() {
    // un invio interrotto (app chiusa, rete caduta) lascia righe "in viaggio": tornano in coda
    await db.outbox
      .where('seq')
      .above(0)
      .modify((r) => void delete r.inflight);
    const size = this.o.batchSize ?? 100;
    for (;;) {
      const batch = await db.transaction('rw', db.outbox, async () => {
        const rows = await db.outbox.orderBy('seq').limit(size).toArray();
        for (const r of rows) await db.outbox.update(r.seq!, { inflight: 1 });
        return rows;
      });
      if (!batch.length) return;
      const changes: Change[] = batch.map((r) => ({ t: r.t, id: r.id, op: r.op, patch: r.patch, ...(r.number ? { number: r.number } : {}) }));
      let raw: unknown;
      try {
        raw = await this.o.transport.push(this.o.workshop, changes);
      } catch (e) {
        await db.outbox.bulkUpdate(batch.map((r) => ({ key: r.seq!, changes: { inflight: undefined, tries: (r.tries || 0) + 1 } })));
        throw e;
      }
      const res = PushResponse.parse(raw).results;
      await this.settle(batch, res);
    }
  }

  private async settle(batch: OutboxRow[], results: PushResponse['results']) {
    await db.transaction('rw', [db.outbox, db.jobs, db.photos], async () => {
      for (let i = 0; i < batch.length; i++) {
        const row = batch[i];
        const r = results[i];
        await db.outbox.delete(row.seq!);
        if (!r) continue;
        if (r.ok) {
          // numero assegnato dal server: la scheda "in invio" prende il suo numero definitivo
          if (row.t === 'job' && r.number) {
            const j = await db.jobs.get(row.id);
            if (j && j.number !== r.number) await db.jobs.update(row.id, { number: r.number });
          }
          continue;
        }
        this.log('modifica rifiutata dal server', { t: row.t, id: row.id, error: r.error });
        // ci si riallinea alla versione del server (con sopra le modifiche locali successive, ancora in coda)
        if (row.t === 'job') {
          const server = PulledJob.safeParse(r.row);
          const later = (await db.outbox.where('[t+id]').equals(['job', row.id]).toArray()).filter((o) => o.seq! > row.seq!);
          if (server.success) await putServerJob(server.data, later);
          else if (!later.length && row.op === 'put' && r.error === 'not_found') await db.jobs.delete(row.id);
        }
        if (row.t === 'photo' && row.op === 'put') await db.photos.delete(row.id);
      }
    });
  }

  /* ---------------- foto ---------------- */

  private async uploadPhotos() {
    const t = this.o.transport;
    if (!t.upload) return;
    const todo = await db.photos.where('up').equals(0).toArray();
    for (const p of todo) {
      if (!p.blob) continue;
      // il server deve già conoscerla (annunciata con push): altrimenti lo storage la rifiuta
      if (await db.outbox.where('[t+id]').equals(['photo', p.id]).count()) continue;
      await t.upload(photoPath(this.o.workshop, p.jobId, p.id), p.blob);
      await db.photos.update(p.id, { up: 1 });
    }
  }

  /** scarica una foto arrivata da un altro dispositivo (al primo sguardo, non tutte in anticipo) */
  async fetchPhoto(id: string): Promise<Blob | undefined> {
    const p = await db.photos.get(id);
    if (!p) return undefined;
    if (p.blob) return p.blob;
    if (!this.o.transport.download) return undefined;
    const blob = await this.o.transport.download(photoPath(this.o.workshop, p.jobId, p.id));
    await db.photos.update(id, { blob });
    return blob;
  }

  /* ---------------- ricezione ---------------- */

  private async pullAll() {
    let cursor = (await getMeta<Record<string, unknown>>(`cursor:${this.o.workshop}`)) ?? {};
    for (let page = 0; page < 1000; page++) {
      const raw = await this.o.transport.pull(this.o.workshop, cursor, this.o.pageSize ?? 500);
      const res = PullResponse.parse(raw);
      await applyPull(res, this.o.workshop, this.log);
      cursor = res.cursor;
      if (!res.more) return;
    }
  }
}
