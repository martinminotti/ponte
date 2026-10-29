import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigate, useRoutes, type Location } from 'react-router';
import { animate, motion, useMotionValue, useTransform } from 'motion/react';
import { depthOf, markSwipe } from '@/platform/navigation';
import { haptic } from '@/platform/native';
import { overlayOpen } from './hooks';
import { screenRoutes } from './routes';
import { UnderlayContext } from './underlay';

/**
 * Gesto indietro di iOS, fatto a mano perché quello di WebKit non ha la fotografia della schermata precedente
 * (in un'app a pagina singola mostrerebbe un fondo bianco).
 *
 * Dal bordo sinistro la schermata segue il dito 1:1; sotto c'è la schermata precedente, vera e già al punto
 * in cui la si era lasciata, che arriva da sinistra con la parallasse e si schiarisce. Al rilascio decide
 * la velocità proiettata (come iOS): un colpetto basta, un trascinamento lento a metà torna indietro.
 * Interrompibile: si può riprendere la schermata mentre si sta ancora muovendo.
 *
 * Tiene anche il segno di dove si era arrivati con lo scorrimento in ogni schermata: tornando indietro
 * (gesto o pulsante) si ritrova l'elenco dove lo si era lasciato; andando avanti si parte dall'alto.
 */

type Entry = { loc: Location; scrollY: number };
const stack = new Map<number, Entry>();
const idxNow = () => {
  const i = (window.history.state as { idx?: number } | null)?.idx;
  return typeof i === 'number' ? i : 0;
};

/** la schermata a cui riporta "indietro" (dalla cronologia; se si è entrati da un link, il genitore) */
function backTarget(loc: Location): { entry: Entry | null; parent: string } {
  const prev = stack.get(idxNow() - 1) ?? null;
  const parent = /^\/job\/[^/]+\/(conto|modifica)$/.test(loc.pathname) ? loc.pathname.replace(/\/(conto|modifica)$/, '') : '/schede';
  return { entry: prev, parent };
}

function Underlay({ loc, scrollY }: { loc: Location; scrollY: number }) {
  const el = useRoutes(screenRoutes, loc);
  return (
    <UnderlayContext.Provider value={true}>
      <div style={{ transform: `translateY(${-scrollY}px)` }}>{el}</div>
    </UnderlayContext.Provider>
  );
}

const EDGE = 22;
const project = (v: number, d = 0.99) => ((v / 1000) * d) / (1 - d);

export function SwipeBack({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  const loc = useLocation();
  const nav = useNavigate();
  const [under, setUnder] = useState<Entry | null>(null);
  const x = useMotionValue(0);
  const width = useRef(typeof window === 'undefined' ? 390 : window.innerWidth);
  const underX = useTransform(x, (v) => -0.3 * width.current + 0.3 * v);
  const dim = useTransform(x, (v) => 0.12 * (1 - v / width.current));
  const shadow = useTransform(x, (v) => (v > 0.5 ? '-10px 0 30px -8px rgba(0,0,0,0.22)' : 'none'));
  const anim = useRef<ReturnType<typeof animate> | null>(null);
  const depth = depthOf(loc.pathname);
  const active = enabled && depth > 0;
  const pageRef = useRef<HTMLDivElement>(null);

  /* ---- cronologia e posizione di scorrimento ---- */
  const lastY = useRef(0);
  useEffect(() => {
    const onScroll = () => (lastY.current = window.scrollY);
    addEventListener('scroll', onScroll, { passive: true });
    return () => removeEventListener('scroll', onScroll);
  }, []);
  const prevIdx = useRef(idxNow());
  useLayoutEffect(() => {
    const before = stack.get(prevIdx.current);
    if (before) before.scrollY = lastY.current;
    const idx = idxNow();
    const back = idx < prevIdx.current;
    const known = stack.get(idx);
    stack.set(idx, { loc, scrollY: back && known ? known.scrollY : 0 });
    // le schermate più avanti nella cronologia non esistono più quando si va avanti da qui
    if (!back) for (const k of [...stack.keys()]) if (k > idx) stack.delete(k);
    prevIdx.current = idx;
    // indietro: dove si era lasciato; avanti: dall'alto (le sezioni gestiscono il loro scorrimento da sole)
    if (depthOf(loc.pathname) > 0 || back) {
      const y = back && known ? known.scrollY : 0;
      window.scrollTo(0, y);
      // durante il cambio di schermata il browser può ignorare lo scorrimento: si ripete al fotogramma dopo
      requestAnimationFrame(() => window.scrollY !== y && window.scrollTo(0, y));
    }
    lastY.current = window.scrollY;
    // le voci senza stato (indirizzo scritto a mano, primo avvio) hanno tutte la chiave "default": conta anche il percorso
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loc.key, loc.pathname, loc.search]);

  /* ---- gesto ---- */
  // i gestori restano gli stessi per tutta la durata del gesto: leggono indirizzo e stato dai riferimenti
  const locRef = useRef(loc);
  locRef.current = loc;
  const underRef = useRef(under);
  underRef.current = under;
  useEffect(() => {
    if (!active) return;
    let start: { x: number; y: number; t: number } | null = null;
    let engaged = false;
    let samples: { x: number; t: number }[] = [];

    const finish = (v: number) => {
      const w = width.current;
      const cur = x.get();
      const go = cur + project(v) > w * 0.5 && v > -300;
      anim.current = animate(x, go ? w : 0, {
        type: 'spring',
        bounce: 0,
        duration: go ? 0.32 : 0.38,
        velocity: v,
        onComplete: () => {
          anim.current = null;
          if (go) {
            // la pagina precedente è già lì sotto: si cambia indirizzo senza un'altra animazione
            markSwipe(900);
            const { entry, parent } = backTarget(locRef.current);
            if (entry) nav(-1);
            else nav(parent, { replace: true });
            haptic('light');
          } else {
            setUnder(null);
          }
        },
      });
    };

    const onStart = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t || e.touches.length > 1) return;
      // una pagina ancora in movimento si può riprendere al volo
      if (anim.current && underRef.current) {
        anim.current.stop();
        anim.current = null;
        start = { x: t.clientX - x.get(), y: t.clientY, t: performance.now() };
        engaged = true;
        samples = [{ x: x.get(), t: performance.now() }];
        return;
      }
      if (t.clientX > EDGE || overlayOpen()) return;
      width.current = window.innerWidth;
      start = { x: t.clientX, y: t.clientY, t: performance.now() };
      engaged = false;
      samples = [];
      const loc = locRef.current;
      const { entry, parent } = backTarget(loc);
      // si disegna subito la schermata di sotto, così è pronta quando il dito inizia a muoversi
      setUnder(entry ?? { loc: { ...loc, pathname: parent, search: '', hash: '', key: 'parent', state: null }, scrollY: 0 });
    };
    const onMove = (e: TouchEvent) => {
      if (!start) return;
      const t = e.touches[0];
      const dx = t.clientX - start.x;
      const dy = t.clientY - start.y;
      if (!engaged) {
        if (Math.abs(dy) > 10 && Math.abs(dy) > dx) {
          // è uno scorrimento verticale: il gesto non c'entra
          start = null;
          setUnder(null);
          return;
        }
        if (dx < 8) return;
        engaged = true;
      }
      e.preventDefault();
      const v = Math.max(0, dx);
      x.set(v);
      const now = performance.now();
      samples.push({ x: v, t: now });
      while (samples.length > 2 && now - samples[0].t > 90) samples.shift();
    };
    const onEnd = () => {
      if (!start) return;
      const wasEngaged = engaged;
      start = null;
      engaged = false;
      if (!wasEngaged) {
        if (!anim.current) setUnder(null);
        return;
      }
      const a = samples[0];
      const b = samples[samples.length - 1];
      const v = a && b && b.t > a.t ? ((b.x - a.x) / (b.t - a.t)) * 1000 : 0;
      finish(v);
    };
    addEventListener('touchstart', onStart, { passive: true });
    addEventListener('touchmove', onMove, { passive: false });
    addEventListener('touchend', onEnd);
    addEventListener('touchcancel', onEnd);
    return () => {
      removeEventListener('touchstart', onStart);
      removeEventListener('touchmove', onMove);
      removeEventListener('touchend', onEnd);
      removeEventListener('touchcancel', onEnd);
    };
  }, [active, nav, x]);

  // cambiata la schermata (gesto completato o qualunque altra navigazione): si torna a riposo, senza scatti
  useLayoutEffect(() => {
    anim.current?.stop();
    anim.current = null;
    x.set(0);
    setUnder(null);
  }, [loc.key, loc.pathname, x]);

  // a riposo la pagina non crea un contesto di sovrapposizione (le barre fisse dell'app restano sopra);
  // solo durante il gesto sale sopra la schermata disegnata sotto
  return (
    <>
      {under && (
        <motion.div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 overflow-hidden bg-bg" style={{ x: underX }}>
          <Underlay loc={under.loc} scrollY={under.scrollY} />
          <motion.div className="absolute inset-0 bg-black" style={{ opacity: dim }} />
        </motion.div>
      )}
      <motion.div ref={pageRef} className={under ? 'relative z-[1] min-h-dvh bg-bg' : ''} style={{ x, boxShadow: shadow }}>
        {children}
      </motion.div>
    </>
  );
}
