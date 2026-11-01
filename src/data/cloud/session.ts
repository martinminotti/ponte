/**
 * Sessione cloud: chi è entrato, in quale officina, e il motore di sincronizzazione acceso o spento.
 *
 * Offline-first anche all'avvio: l'officina collegata è salvata sul dispositivo (meta "cloud"), quindi l'app si apre
 * e si lavora subito, con o senza rete; il controllo con il server (sessione, ruolo, appartenenza) avviene dopo,
 * in sottofondo. Se il server dice che la persona non fa più parte dell'officina, i dati dell'officina lasciano
 * il dispositivo.
 */
import { useSyncExternalStore } from 'react';
import { db, getMeta, setMeta } from '../db';
import { setSyncTarget } from '../changes';
import { clearWorkshopData, getSettings, queueLocalArchive, saveSettings } from '../repo';
import type { SyncEngine } from '../sync/engine';
import type { SyncFatal } from '../sync/protocol';
import { cloudAvailable, cloudConfig } from './config';
import { setCloudAi } from '@/voice/config';
import type { WorkshopRef } from './account';

// client, motore e validazione si caricano solo con il cloud attivo (pacchetto a parte)
const rt = () => import('./runtime');

export type CloudPhase = 'off' | 'signed-out' | 'choosing' | 'linked';
export type CloudUser = { id: string; email: string };
export interface CloudState {
  /** off = cloud non configurato in questa build: tutto sul dispositivo, come prima */
  phase: CloudPhase;
  ready: boolean;
  user: CloudUser | null;
  workshop: WorkshopRef | null;
  /** avviso da mostrare una volta (es. tolto dall'officina) */
  notice?: string;
}
interface Saved {
  user: CloudUser;
  workshop: WorkshopRef;
}

let state: CloudState = { phase: 'off', ready: false, user: null, workshop: null };
const subs = new Set<() => void>();
function set(patch: Partial<CloudState>) {
  state = { ...state, ...patch };
  subs.forEach((f) => f());
}
export const getCloud = () => state;
export function useCloud(): CloudState {
  return useSyncExternalStore(
    (cb) => {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    () => state,
  );
}

let engine: SyncEngine | null = null;
const log = (msg: string, data?: unknown) => console.info('[sync]', msg, data ?? '');

async function activate(ws: WorkshopRef) {
  engine?.stop();
  engine = null;
  setSyncTarget({ workshop: ws.id, owner: ws.role === 'owner' });
  const { SyncEngine, SupabaseTransport, supabase } = await rt();
  const sb = supabase();
  engine = new SyncEngine({ transport: new SupabaseTransport(sb), workshop: ws.id, onFatal, log });
  engine.start();
  // assistente vocale incluso: il token della sessione (rinnovato da Supabase) apre la funzione "ai" del server
  const ai = (token?: string) => setCloudAi(token ? { url: cloudConfig.url, key: cloudConfig.key, token, workshop: ws.id } : null);
  ai((await sb.auth.getSession()).data.session?.access_token);
  authOff?.();
  authOff = sb.auth.onAuthStateChange((_e, s) => ai(s?.access_token)).data.subscription.unsubscribe;
}
let authOff: (() => void) | null = null;

function deactivate() {
  engine?.stop();
  engine = null;
  setSyncTarget(null);
  authOff?.();
  authOff = null;
  setCloudAi(null);
}

async function onFatal(e: SyncFatal) {
  if (e.reason === 'not_member') await removed();
  else if (e.reason === 'not_authenticated') {
    // i dati restano (e la coda delle modifiche): rientrando si riparte da dove si era
    engine?.stop();
    set({ phase: 'signed-out', notice: 'Accesso scaduto: entra di nuovo per continuare a sincronizzare.' });
  }
}

async function removed() {
  const name = state.workshop?.name;
  deactivate();
  await clearWorkshopData();
  set({ phase: state.user ? 'choosing' : 'signed-out', workshop: null, notice: name ? `Non fai più parte dell’officina «${name}».` : 'Non fai più parte dell’officina.' });
}

/** ruolo e nome del dispositivo dal ruolo nell'officina (le schermate usano settings.role) */
async function applyRole(ws: WorkshopRef) {
  await saveSettings({ role: ws.role === 'owner' ? 'admin' : 'staff', staffName: ws.role === 'staff' ? ws.displayName : undefined });
}

/** all'avvio dell'app, prima di mostrare qualunque schermata */
export async function bootCloud(): Promise<void> {
  if (!cloudAvailable()) return set({ phase: 'off', ready: true });
  const saved = await getMeta<Saved>('cloud');
  if (saved) {
    // la scrittura delle modifiche parte subito; il motore arriva appena caricato
    setSyncTarget({ workshop: saved.workshop.id, owner: saved.workshop.role === 'owner' });
    set({ phase: 'linked', ready: true, user: saved.user, workshop: saved.workshop });
    void activate(saved.workshop).then(checkMembership);
  } else {
    const { account } = await rt();
    const u = await account.currentUser().catch(() => null);
    set({ phase: u ? 'choosing' : 'signed-out', ready: true, user: u });
  }
  const { account } = await rt();
  account.onAuthChange((u) => {
    if (!u && state.user && state.phase !== 'signed-out') {
      engine?.stop();
      set({ phase: 'signed-out' });
    }
  });
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && void checkMembership());
}

let lastCheck = 0;
/** ruolo cambiato (titolare/dipendente) o persona tolta dall'officina: lo si scopre qui */
async function checkMembership() {
  if (state.phase !== 'linked' || !state.workshop || Date.now() - lastCheck < 60_000) return;
  lastCheck = Date.now();
  let list: WorkshopRef[];
  try {
    list = await (await rt()).account.myWorkshops();
  } catch {
    return; // senza rete: si riprova al prossimo ritorno in primo piano
  }
  const now = list.find((w) => w.id === state.workshop!.id);
  if (!now) return removed();
  if (now.role !== state.workshop.role || now.name !== state.workshop.name || now.displayName !== state.workshop.displayName) {
    if (state.user) await setMeta('cloud', { user: state.user, workshop: now } satisfies Saved);
    await applyRole(now);
    if (now.role !== state.workshop.role) await activate(now);
    set({ workshop: now });
  }
}

/** dopo il codice email: si riprende l'officina di prima (stessa persona) o si sceglie */
export async function afterSignIn(user: CloudUser): Promise<void> {
  const saved = await getMeta<Saved>('cloud');
  if (saved && saved.user.id === user.id) {
    await activate(saved.workshop);
    set({ phase: 'linked', user, workshop: saved.workshop, notice: undefined });
    void engine?.syncNow();
    return;
  }
  if (saved) {
    // un'altra persona su questo dispositivo: i dati dell'officina precedente non restano
    deactivate();
    await clearWorkshopData();
  }
  set({ phase: 'choosing', user, workshop: null, notice: undefined });
}

/**
 * Collega il dispositivo all'officina scelta.
 * upload = porta nel cloud le schede già su questo dispositivo (chi crea l'officina); altrimenti si parte puliti
 * e arriva l'archivio dell'officina.
 */
export async function linkWorkshop(ws: WorkshopRef, opts: { upload: boolean }): Promise<void> {
  if (!state.user) throw new Error('not_authenticated');
  if (opts.upload) {
    setSyncTarget({ workshop: ws.id, owner: ws.role === 'owner' });
    await queueLocalArchive();
  } else {
    setSyncTarget(null);
    await clearWorkshopData();
  }
  await applyRole(ws);
  await setMeta('cloud', { user: state.user, workshop: ws } satisfies Saved);
  await activate(ws);
  set({ phase: 'linked', workshop: ws, notice: undefined });
  await engine?.syncNow();
}

/** modifiche di questo dispositivo non ancora arrivate al server */
export const pendingChanges = () => db.outbox.count();

/**
 * Esce dall'officina su questo dispositivo (cambio officina o uscita dall'account).
 * Prima prova a consegnare le modifiche in coda; se restano (niente rete) e non si forza, non esce e dice quante sono.
 */
export async function leaveDevice(opts: { signOut: boolean; force?: boolean }): Promise<{ pending: number }> {
  if (engine) await Promise.race([engine.syncNow(), new Promise((r) => setTimeout(r, 8000))]);
  const pending = await pendingChanges();
  if (pending && !opts.force) return { pending };
  deactivate();
  await clearWorkshopData();
  if (opts.signOut) {
    await (await rt()).account.signOut();
    set({ phase: 'signed-out', user: null, workshop: null });
  } else set({ phase: 'choosing', workshop: null });
  return { pending: 0 };
}

export async function deleteMyAccount(): Promise<void> {
  await (await rt()).account.deleteAccount();
  deactivate();
  await clearWorkshopData();
  set({ phase: 'signed-out', user: null, workshop: null, notice: 'Account eliminato.' });
}

export const clearNotice = () => set({ notice: undefined });
export const syncNow = () => engine?.syncNow() ?? Promise.resolve();
export const fetchPhoto = (id: string) => engine?.fetchPhoto(id) ?? Promise.resolve(undefined);

/** la scheda appena creata riceve il numero dal server: lo si aspetta un attimo per mostrarlo */
export async function awaitJobNumber(id: string, ms = 2500): Promise<number> {
  const end = Date.now() + ms;
  void engine?.syncNow();
  for (;;) {
    const n = (await db.jobs.get(id))?.number ?? 0;
    if (n || Date.now() > end || !engine) return n;
    await new Promise((r) => setTimeout(r, 120));
  }
}

/** per la schermata dell'account: il nome dell'officina in Impostazioni segue quello del server */
export async function workshopName(): Promise<string> {
  return state.workshop?.name || (await getSettings()).shop;
}
