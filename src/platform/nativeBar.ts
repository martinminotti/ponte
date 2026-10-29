import { useEffect, useRef, useSyncExternalStore } from 'react';
import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';

/**
 * Barra in basso nativa su iPhone (ios/App/App/NativeBarPlugin.swift): Liquid Glass vero su iOS 26.
 * La pagina web dichiara cosa mostrare; la barra nativa disegna e restituisce i tocchi.
 */

export type BarItem = { id: string; label: string; symbol: string; style?: 'primary' | 'wa' | 'plain'; disabled?: boolean };
type Config =
  { mode: 'tabs'; tabs: BarItem[]; selected?: string; accessory?: BarItem } | { mode: 'actions'; actions: BarItem[] } | { mode: 'search'; text: string; placeholder: string } | { mode: 'hidden' };

interface NativeBarPlugin {
  configure(c: Config & { dark?: boolean }): Promise<void>;
  setCompact(o: { compact: boolean }): Promise<void>;
  blurSearch(): Promise<void>;
  addListener(e: 'select', cb: (d: { id: string }) => void): Promise<PluginListenerHandle>;
  addListener(e: 'search', cb: (d: { text: string; end: boolean }) => void): Promise<PluginListenerHandle>;
}

const NativeBar = registerPlugin<NativeBarPlugin>('NativeBar');

export const nativeBarAvailable = (): boolean => Capacitor.getPlatform() === 'ios' && Capacitor.isPluginAvailable('NativeBar');

/* ---------- azioni dichiarate dalla schermata aperta (scheda, modulo) ---------- */

export type NativeAction = BarItem & { onPress: () => void };
let pageActions: NativeAction[] | null = null;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

export function usePageActions(): NativeAction[] | null {
  return useSyncExternalStore(
    (cb) => {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    () => pageActions,
  );
}

/** La schermata registra le sue azioni finché è montata. I gestori restano sempre gli ultimi, senza riconfigurare la barra. */
export function useNativeActions(actions: NativeAction[] | null) {
  const latest = useRef(actions);
  latest.current = actions;
  const key = actions ? JSON.stringify(actions.map(({ id, label, symbol, style, disabled }) => [id, label, symbol, style, disabled])) : '';
  useEffect(() => {
    if (!latest.current) return;
    pageActions = latest.current.map((a) => ({ ...a, onPress: () => latest.current?.find((x) => x.id === a.id)?.onPress() }));
    emit();
    return () => {
      pageActions = null;
      emit();
    };
  }, [key]);
}

/* ---------- ricerca nativa ---------- */

type Search = { active: boolean; text: string; placeholder: string; onText: ((t: string) => void) | null };
let search: Search = { active: false, text: '', placeholder: '', onText: null };
const searchSubs = new Set<() => void>();
const emitSearch = () => searchSubs.forEach((f) => f());

export function useNativeSearch(): Search {
  return useSyncExternalStore(
    (cb) => {
      searchSubs.add(cb);
      return () => searchSubs.delete(cb);
    },
    () => search,
  );
}

/** Il campo web (sola lettura su iPhone) apre la ricerca nativa sopra la tastiera; il testo torna alla pagina mentre si scrive. */
export function startNativeSearch(text: string, placeholder: string, onText: (t: string) => void) {
  search = { active: true, text, placeholder, onText };
  emitSearch();
  window.scrollTo({ top: 0 });
}

/** Scorrendo i risultati la tastiera si chiude; il campo resta agganciato in alto. */
export function blurNativeSearch() {
  if (search.active) NativeBar.blurSearch().catch(() => {});
}

/** Chiude la ricerca nativa. Il testo resta alla pagina (per tornare all'elenco filtrato), salvo chiusura esplicita. */
export function endNativeSearch() {
  if (!search.active) return;
  search = { ...search, active: false };
  emitSearch();
}

export function onBarSearch(): () => void {
  let h: PluginListenerHandle | undefined;
  let off = false;
  NativeBar.addListener('search', (d) => {
    search.text = d.text;
    search.onText?.(d.text);
    if (d.end) endNativeSearch();
  }).then((x) => {
    if (off) x.remove();
    else h = x;
  });
  return () => {
    off = true;
    h?.remove();
  };
}

/* ---------- ponte verso il plugin ---------- */

let lastSent = '';
export function configureBar(c: Config, dark: boolean) {
  const payload = { ...c, dark };
  const s = JSON.stringify(payload);
  if (s === lastSent) return;
  lastSent = s;
  NativeBar.configure(payload).catch(() => {
    lastSent = '';
  });
}

let lastCompact: boolean | null = null;
export function setBarCompact(compact: boolean) {
  if (compact === lastCompact) return;
  lastCompact = compact;
  NativeBar.setCompact({ compact }).catch(() => {});
}

export function onBarSelect(cb: (id: string) => void): () => void {
  let h: PluginListenerHandle | undefined;
  let off = false;
  NativeBar.addListener('select', (d) => cb(d.id)).then((x) => {
    if (off) x.remove();
    else h = x;
  });
  return () => {
    off = true;
    h?.remove();
  };
}

/* ---------- testata in alto: capsule di vetro con indietro, titolo e azioni ---------- */

/** voce di un menu nativo (UIMenu): `group` separa le voci in blocchi, come le righe di separazione */
export type TopMenuItem = { id: string; label: string; symbol: string; destructive?: boolean; group?: number };
export type TopItem = { id: string; label: string; symbol: string; disabled?: boolean; menu?: TopMenuItem[] };
export type TopConfig = {
  title: string;
  /** il titolo è in vista (le sezioni lo mostrano solo quando il titolo grande è passato sotto la testata) */
  visible: boolean;
  leading: TopItem | null;
  trailing: TopItem[];
};
/** la testata dichiarata dalla schermata, con i gestori dei tocchi */
export type TopSpec = TopConfig & { onSelect: (id: string) => void };

interface NativeTopPlugin {
  configureTop(c: (TopConfig & { mode: 'bar'; dark: boolean; animated: boolean }) | { mode: 'hidden'; animated: boolean }): Promise<void>;
  addListener(e: 'top', cb: (d: { id: string }) => void): Promise<PluginListenerHandle>;
}
const NativeTop = NativeBar as unknown as NativeTopPlugin;

let topSpec: TopSpec | null = null;
const topSubs = new Set<() => void>();
const emitTop = () => topSubs.forEach((f) => f());
const subTop = (cb: () => void) => {
  topSubs.add(cb);
  return () => topSubs.delete(cb);
};

export function useTopSpec(): TopSpec | null {
  return useSyncExternalStore(subTop, () => topSpec);
}

/** La schermata dichiara la sua testata finché è montata (la schermata disegnata sotto il gesto indietro no). */
export function useNativeTop(spec: TopSpec | null) {
  const latest = useRef(spec);
  latest.current = spec;
  const key = spec ? JSON.stringify([spec.title, spec.visible, spec.leading, spec.trailing.map(({ id, label, symbol, disabled, menu }) => [id, label, symbol, disabled, menu])]) : '';
  useEffect(() => {
    if (!latest.current) return;
    const mine: TopSpec = { ...latest.current, onSelect: (id) => latest.current?.onSelect(id) };
    topSpec = mine;
    emitTop();
    return () => {
      if (topSpec === mine) {
        topSpec = null;
        emitTop();
      }
    };
  }, [key]);
}

/**
 * Quante ragioni tengono da parte la testata nativa: il gesto indietro (la testata deve scorrere con la sua
 * pagina) e le schermate a foglio che salgono o scendono (la testata viaggia con il foglio). Intanto la pagina
 * disegna la sua copia web, identica, che si muove con lei.
 */
let held = 0;
export function holdTop(): () => void {
  held++;
  emitTop();
  let done = false;
  return () => {
    if (done) return;
    done = true;
    held--;
    emitTop();
  };
}
export function useTopHeld(): boolean {
  return useSyncExternalStore(subTop, () => held > 0);
}

/** la testata nativa è in vista: la pagina lascia solo lo spazio, senza disegnarla */
let topNative = false;
export function setTopNative(on: boolean) {
  if (on === topNative) return;
  topNative = on;
  emitTop();
}
export const topIsNative = () => topNative;
export function useTopNative(): boolean {
  return useSyncExternalStore(subTop, () => topNative);
}

let lastTop = '';
export function configureTop(c: TopConfig | null, dark: boolean, animated: boolean): Promise<void> {
  const payload = c ? { ...c, mode: 'bar' as const, dark, animated } : { mode: 'hidden' as const, animated };
  const s = JSON.stringify({ ...payload, animated: undefined });
  if (s === lastTop) return Promise.resolve();
  lastTop = s;
  return NativeTop.configureTop(payload).catch(() => {
    lastTop = '';
    throw new Error('top');
  });
}

export function onTopSelect(cb: (id: string) => void): () => void {
  let h: PluginListenerHandle | undefined;
  let off = false;
  NativeTop.addListener('top', (d) => cb(d.id)).then((x) => {
    if (off) x.remove();
    else h = x;
  });
  return () => {
    off = true;
    h?.remove();
  };
}
