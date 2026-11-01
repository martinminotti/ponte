/**
 * Errori dell'app: con l'officina nel cloud si mandano al server (tabella client_errors) per sistemarli prima che
 * l'officina debba segnalarli. Solo messaggio, punto del codice, versione e schermata: mai dati delle schede.
 * Raccolti a gruppi, limitati (anche dal server), mai bloccanti.
 */
import { Capacitor } from '@capacitor/core';
import { getCloud } from './session';

type Item = { kind: string; message: string; stack?: string; context?: Record<string, unknown>; version: string; platform: string; workshop?: string };
const queue: Item[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
const seen = new Map<string, number>();

export function reportError(e: unknown, kind = 'error', context: Record<string, unknown> = {}) {
  const err = e instanceof Error ? e : new Error(typeof e === 'string' ? e : JSON.stringify(e));
  const key = `${kind}:${err.message}`;
  // lo stesso errore ripetuto in un minuto conta una volta
  if (Date.now() - (seen.get(key) ?? 0) < 60_000) return;
  seen.set(key, Date.now());
  console.error('[Ponte]', kind, err);
  const cloud = getCloud();
  if (cloud.phase !== 'linked') return;
  queue.push({
    kind,
    message: err.message.slice(0, 1000),
    stack: err.stack?.slice(0, 4000),
    context: { route: typeof location !== 'undefined' ? location.hash.split('?')[0] : '', ...context },
    version: typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev',
    platform: Capacitor.getPlatform(),
    workshop: cloud.workshop?.id,
  });
  if (queue.length > 40) queue.splice(0, queue.length - 40);
  if (!timer) timer = setTimeout(flush, 3000);
}

async function flush() {
  timer = null;
  const items = queue.splice(0, 20);
  if (!items.length) return;
  try {
    const { supabase } = await import('./runtime');
    await supabase().rpc('report_errors', { p_items: items });
  } catch {
    /* senza rete: pazienza, non si insiste */
  }
  if (queue.length) timer = setTimeout(flush, 3000);
}

/** errori non gestiti di tutta l'app */
export function installErrorReporting() {
  if (typeof window === 'undefined') return;
  window.addEventListener('error', (ev) => reportError(ev.error ?? ev.message, 'window'));
  window.addEventListener('unhandledrejection', (ev) => reportError(ev.reason, 'promise'));
}
