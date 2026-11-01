import type { SupabaseClient } from '@supabase/supabase-js';
import { SyncFatal, SyncNetworkError, type Change, type Transport } from '../sync/protocol';

/** un errore di rete (niente connessione, server irraggiungibile) si riprova; il resto no */
export function isNetworkError(e: unknown): boolean {
  const m = String((e as { message?: string })?.message ?? e ?? '');
  return /Failed to fetch|NetworkError|Load failed|network|ECONNREFUSED|timeout|aborted/i.test(m) || (e as { status?: number })?.status === 0;
}

/** errori delle funzioni del database → errori della sincronizzazione */
export function classify(e: { message?: string; code?: string; status?: number } | null): Error {
  const m = e?.message || 'errore sconosciuto';
  if (isNetworkError(e)) return new SyncNetworkError(m);
  if (/not_member/.test(m)) return new SyncFatal('Non fai più parte di questa officina.', 'not_member');
  if (/not_authenticated|JWT|jwt|401/.test(m) || e?.status === 401) return new SyncFatal('Accesso scaduto: entra di nuovo.', 'not_authenticated');
  return new Error(m);
}

/** La sincronizzazione attraverso Supabase: funzioni push/pull, storage delle foto, avvisi in tempo reale. */
export class SupabaseTransport implements Transport {
  constructor(private sb: SupabaseClient) {}

  async push(workshop: string, changes: Change[]) {
    const { data, error } = await this.sb.rpc('push', { p_workshop: workshop, p_changes: changes });
    if (error) throw classify(error);
    return data;
  }

  async pull(workshop: string, cursor: Record<string, unknown>, limit: number) {
    const { data, error } = await this.sb.rpc('pull', { p_workshop: workshop, p_cursor: cursor, p_limit: limit });
    if (error) throw classify(error);
    return data;
  }

  async upload(path: string, blob: Blob) {
    const { error } = await this.sb.storage.from('photos').upload(path, blob, { upsert: true, contentType: 'image/jpeg', cacheControl: '31536000' });
    if (error) throw classify(error);
  }

  async download(path: string) {
    const { data, error } = await this.sb.storage.from('photos').download(path);
    if (error || !data) throw classify(error);
    return data;
  }

  /** il server avvisa che qualcosa è cambiato; i dati veri si prendono poi con pull (che rispetta i permessi) */
  subscribe(workshop: string, onChange: () => void) {
    const ch = this.sb.channel(`officina:${workshop}`);
    for (const table of ['jobs', 'photos', 'members']) {
      ch.on('postgres_changes', { event: '*', schema: 'public', table, filter: `workshop_id=eq.${workshop}` }, onChange);
    }
    ch.on('postgres_changes', { event: '*', schema: 'public', table: 'workshops', filter: `id=eq.${workshop}` }, onChange);
    ch.subscribe();
    return () => {
      void this.sb.removeChannel(ch);
    };
  }
}
