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
