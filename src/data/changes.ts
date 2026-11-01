import { db, type OutboxRow, type SyncTable } from './db';

/**
 * Registro delle modifiche locali da mandare al server.
 * Attivo solo con l'officina nel cloud (setSyncTarget); in locale le scritture non lasciano traccia.
 * record() va chiamata dentro la transazione della scrittura (che deve includere db.outbox): la modifica e la sua
 * registrazione o avvengono entrambe o nessuna.
 */

export type SyncTarget = { workshop: string; owner: boolean };
let target: SyncTarget | null = null;

export function setSyncTarget(t: SyncTarget | null) {
  target = t;
}
export const syncTarget = (): SyncTarget | null => target;

const listeners = new Set<() => void>();
/** il motore di sincronizzazione si mette in ascolto: c'è qualcosa da mandare */
export function onLocalChange(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
function notify() {
  // dopo la fine della transazione: chi legge la coda deve trovarci la modifica
  setTimeout(() => listeners.forEach((f) => f()), 0);
}

export async function record(t: SyncTable, id: string, op: 'put' | 'del', patch: Record<string, unknown> = {}, number?: number): Promise<void> {
  if (!target) return;
  if (t === 'workshop' && !target.owner) return;
  if (op === 'put' && !Object.keys(patch).length && !number) return;
  const last = await db.outbox.where('[t+id]').equals([t, id]).last();
  if (op === 'put' && last && last.op === 'put' && !last.inflight) {
    await db.outbox.update(last.seq!, { patch: { ...last.patch, ...patch }, number: last.number ?? number });
  } else {
    const row: OutboxRow = { t, id, op, patch, at: Date.now() };
    if (number) row.number = number;
    await db.outbox.add(row);
  }
  notify();
}

/** quante modifiche aspettano di partire */
export const pendingCount = () => db.outbox.count();
