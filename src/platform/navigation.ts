import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import { holdTop, topIsNative } from './nativeBar';

/**
 * Navigazione come in un'app iOS.
 *
 * Transizioni: ogni passaggio fra schermate usa le View Transitions del browser (Safari 18 / iOS 18 e successivi).
 * Andare avanti (elenco → scheda → conto) fa entrare la schermata nuova da destra mentre la vecchia arretra
 * un po' e si scurisce; tornare indietro fa il percorso inverso. Fra le sezioni della barra (Oggi, Schede,
 * Fatture, Impostazioni) si passa all'istante, come con la tab bar di iOS. Curva: molla senza rimbalzo.
 *
 * Gesto indietro: sull'iPhone è quello vero di WebKit (plugin Navigation): si trascina dal bordo sinistro,
 * la schermata segue il dito e si può tornare sui propri passi. È attivo solo dove c'è un "indietro"
 * (non nelle sezioni) e mai con un foglio aperto. Quando il gesto ha già animato il ritorno, la transizione
 * della pagina non si ripete.
 */

interface NavigationPlugin {
  setSwipeBack(o: { enabled: boolean }): Promise<void>;
  addListener(e: 'swipe', cb: (d: { active: boolean }) => void): Promise<PluginListenerHandle>;
}
const Navigation = registerPlugin<NavigationPlugin>('Navigation');
const nativeNav = () => Capacitor.getPlatform() === 'ios' && Capacitor.isPluginAvailable('Navigation');

/* ---------------------------------------------------------------- gesto indietro */

let swipeOn: boolean | null = null;
export function setSwipeBack(enabled: boolean) {
  if (!nativeNav() || swipeOn === enabled) return;
  swipeOn = enabled;
  Navigation.setSwipeBack({ enabled }).catch(() => {
    swipeOn = null;
  });
}

/** il gesto dal bordo è in corso o è appena finito: la pagina è già stata animata dal sistema */
let swipingUntil = 0;
let edgeTouchAt = 0;
export function markSwipe(ms: number) {
  swipingUntil = Math.max(swipingUntil, Date.now() + ms);
}
const swiping = () => Date.now() < swipingUntil;

/* ---------------------------------------------------------------- transizioni */

/** profondità della schermata nello "stack": 0 = sezione, 1 = scheda o modulo, 2 = conto o modifica */
export function depthOf(path: string): number {
  const p = path.split('?')[0].replace(/\/+$/, '') || '/';
  if (['/', '/schede', '/mensile', '/impostazioni'].includes(p)) return 0;
  if (/^\/job\/[^/]+\/(conto|modifica)$/.test(p)) return 2;
  return 1;
}

/**
 * Schermate presentate "a foglio" (come i modali a tutto schermo di iOS): il modulo di una nuova accettazione
 * e la modifica dei dati. Salgono dal basso, si chiudono con la X e scendono; niente gesto dal bordo.
 */
export function isModal(path: string): boolean {
  const p = path.split('?')[0].replace(/\/+$/, '');
  return p === '/nuova' || /^\/job\/[^/]+\/modifica$/.test(p);
}

export type NavDirection = 'push' | 'pop' | 'none' | 'fade' | 'cover' | 'uncover';

/** che movimento serve fra due schermate */
export function direction(from: string, to: string, idxFrom: number | null, idxTo: number | null): NavDirection {
  if (from === to) return 'none';
  const mf = isModal(from);
  const mt = isModal(to);
  if (mt && !mf) return 'cover';
  if (mf && !mt) return 'uncover';
  const a = depthOf(from);
  const b = depthOf(to);
  if (a === 0 && b === 0) return 'none'; // da sezione a sezione: all'istante
  if (b > a) return 'push';
  if (b < a) return 'pop';
  // stessa profondità (da una scheda all'altra): conta il verso della cronologia
  if (idxFrom !== null && idxTo !== null && idxTo !== idxFrom) return idxTo > idxFrom ? 'push' : 'pop';
  return 'fade';
}

const currentPath = () => (location.hash.replace(/^#/, '') || '/').split('?')[0];
const historyIdx = (): number | null => {
  const i = (history.state as { idx?: number } | null)?.idx;
  return typeof i === 'number' ? i : null;
};

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const wide = () => matchMedia('(min-width: 1024px)').matches;

export const viewTransitionsOn = () => typeof document !== 'undefined' && 'startViewTransition' in document && !wide();

/** chi tiene da parte la testata nativa per la transizione in corso */
let releaseTop: (() => void) | null = null;

type Router = { navigate: (to: unknown, opts?: Record<string, unknown>) => Promise<void>; subscribe: (fn: (s: { location: { pathname: string } }) => void) => () => void };
type VT = { skipTransition(): void; finished: Promise<void> };
type Start = (cb: () => unknown) => VT;

/**
 * Collega le transizioni al router: ogni navigazione chiede una View Transition (anche i link e i navigate()
 * sparsi nell'app, senza toccarli uno per uno), e il verso del movimento si decide qui, guardando da dove
 * a dove si va.
 */
export function installNavTransitions(router: Router) {
  if (typeof document === 'undefined' || !('startViewTransition' in document)) return;
  const nav = router.navigate.bind(router);
  // i link passano viewTransition: undefined in modo esplicito: lo si sostituisce, non lo si sovrascrive
  router.navigate = (to, opts) => {
    const o = viewTransitionsOn() ? { ...(opts || {}), viewTransition: opts?.viewTransition ?? true } : opts;
    // una schermata a foglio sale o scende con la sua testata: quella nativa (ferma, fuori dalla pagina) si fa da
    // parte e la pagina disegna la sua copia web prima della fotografia di uscita; torna a transizione finita
    const target = typeof to === 'string' ? to : typeof to === 'object' && to && 'pathname' in to ? String((to as { pathname?: string }).pathname ?? '') : '';
    const sheet = isModal(currentPath()) || (target !== '' && isModal(target));
    if (!o?.viewTransition || !sheet || !topIsNative()) return nav(to, o);
    releaseTop?.();
    const release = holdTop();
    releaseTop = release;
    setTimeout(release, 2000); // in ogni caso, mai una testata sparita
    return new Promise<void>((res) => requestAnimationFrame(() => requestAnimationFrame(() => nav(to, o).then(res, res))));
  };

  const doc = document as unknown as { startViewTransition: Start };
  const start = doc.startViewTransition.bind(document);
  // quando parte la transizione l'indirizzo è già quello nuovo: si tiene traccia delle ultime due schermate
  let prev = { path: currentPath(), idx: historyIdx() };
  let cur = { ...prev };
  router.subscribe((st) => {
    const p = st.location.pathname;
    if (p !== cur.path) {
      prev = cur;
      cur = { path: p, idx: historyIdx() };
    }
  });

  doc.startViewTransition = (cb) => {
    let t: VT | null = null;
    // gesto dal bordo appena fatto, schermo largo: nessuna animazione della pagina (l'ha già fatta il sistema)
    const skip = swiping() || wide();
    t = start(async () => {
      await cb();
      const dir = reduced() ? 'fade' : direction(prev.path, cur.path, prev.idx, cur.idx);
      document.documentElement.dataset.nav = dir;
      if (skip || dir === 'none') t?.skipTransition();
    });
    // una transizione saltata rifiuta queste promesse: non è un errore
    (t as VT & { ready?: Promise<void>; updateCallbackDone?: Promise<void> }).ready?.catch(() => {});
    t.finished
      .catch(() => {})
      .finally(() => {
        delete document.documentElement.dataset.nav;
        releaseTop?.();
        releaseTop = null;
      });
    return t;
  };

  // il gesto nativo avvisa quando inizia e finisce; in più un tocco dal bordo seguito da "indietro" vale come gesto
  if (nativeNav()) {
    Navigation.addListener('swipe', (d) => markSwipe(d.active ? 4000 : 900)).catch(() => {});
    // un trascinamento dal bordo (o un tocco dal bordo "rubato" dal sistema) seguito da "indietro" vale come gesto;
    // un semplice tocco sul pulsante indietro no
    let edgeX: number | null = null;
    addEventListener(
      'touchstart',
      (e) => {
        const x = e.touches[0]?.clientX ?? 99;
        edgeX = x <= 20 ? x : null;
      },
      { passive: true, capture: true },
    );
    addEventListener(
      'touchmove',
      (e) => {
        if (edgeX !== null && (e.touches[0]?.clientX ?? 0) - edgeX > 24) edgeTouchAt = Date.now();
      },
      { passive: true, capture: true },
    );
    addEventListener(
      'touchcancel',
      () => {
        if (edgeX !== null) edgeTouchAt = Date.now();
      },
      { passive: true, capture: true },
    );
    addEventListener(
      'popstate',
      () => {
        if (Date.now() - edgeTouchAt < 1500) markSwipe(700);
      },
      { capture: true },
    );
  }
}
