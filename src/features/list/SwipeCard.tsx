import { useRef, type ReactNode } from 'react';
import { animate, motion, useMotionValue, useTransform } from 'motion/react';
import { ChevronsRight, MessageCircle } from 'lucide-react';
import { haptic } from '@/platform/native';
import { SPRING, SPRING_MOMENTUM } from '@/ui/motion';

/**
 * Scheda con azioni a scorrimento, come in Mail.
 * Verso destra: stato successivo. Verso sinistra: avvisa su WhatsApp.
 *
 * Fisica (Designing Fluid Interfaces, WWDC 2018):
 * - soglia di 10 px prima di decidere la direzione, poi la scheda segue il dito 1:1;
 * - lo scorrimento verticale resta nativo (touch-action: pan-y);
 * - oltre il limite, o se l'azione non c'è, la scheda resiste (rubber band);
 * - al rilascio si proietta il punto d'arrivo dalla velocità e si decide da lì, non dal punto di rilascio;
 * - la molla riparte dalla posizione attuale con la velocità del dito, quindi si può riprendere a metà.
 */

const SLOP = 10;
const DECEL = 0.99;
const project = (v: number) => ((v / 1000) * DECEL) / (1 - DECEL);
const rubber = (over: number, dim: number, c = 0.55) => (over * dim * c) / (dim + c * Math.abs(over));

export type SwipeAction = { label: string; color: string; onCommit: () => void };

export function SwipeCard({ children, right, left }: { children: ReactNode; right?: SwipeAction; left?: SwipeAction }) {
  const x = useMotionValue(0);
  const box = useRef<HTMLDivElement>(null);
  const g = useRef<{ id: number; x0: number; y0: number; base: number; dir: 0 | 1 | -1; hist: { x: number; t: number }[]; armed: boolean; moved: boolean } | null>(null);

  const width = () => box.current?.offsetWidth || 360;
  const threshold = () => Math.min(140, width() * 0.38);

  const follow = (raw: number) => {
    const w = width();
    const act = raw > 0 ? right : left;
    if (!act) return rubber(raw, w, 0.25); // niente azione da quel lato: resiste subito
    const limit = w * 0.62;
    const a = Math.abs(raw);
    return a <= limit ? raw : Math.sign(raw) * (limit + rubber(a - limit, w));
  };

  const onDown = (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse' || (!left && !right)) return;
    x.stop();
    g.current = { id: e.pointerId, x0: e.clientX, y0: e.clientY, base: x.get(), dir: 0, hist: [{ x: e.clientX, t: e.timeStamp }], armed: false, moved: false };
  };

  const onMove = (e: React.PointerEvent) => {
    const s = g.current;
    if (!s || s.id !== e.pointerId) return;
    const dx = e.clientX - s.x0;
    const dy = e.clientY - s.y0;
    if (!s.dir) {
      if (Math.abs(dy) > SLOP && Math.abs(dy) > Math.abs(dx)) {
        g.current = null; // è uno scorrimento verticale: lascia fare al browser
        return;
      }
      if (Math.abs(dx) < SLOP) return;
      s.dir = dx > 0 ? 1 : -1;
      s.x0 += s.dir * SLOP; // nessun salto: si parte da dove la soglia è stata superata
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    }
    s.moved = true;
    const raw = s.base + (e.clientX - s.x0);
    x.set(follow(raw));
    s.hist.push({ x: e.clientX, t: e.timeStamp });
    if (s.hist.length > 6) s.hist.shift();
    const over = Math.abs(raw) >= threshold() && !!(raw > 0 ? right : left);
    if (over !== s.armed) {
      s.armed = over;
      if (over) haptic('light'); // la soglia scatta: un solo tocco, nel momento in cui succede
    }
  };

  const onUp = (e: React.PointerEvent) => {
    const s = g.current;
    g.current = null;
    if (!s || s.id !== e.pointerId || !s.dir) return;
    const h = s.hist;
    const a = h[0];
    const b = h[h.length - 1];
    const v = b.t > a.t ? ((b.x - a.x) / (b.t - a.t)) * 1000 : 0;
    const cur = x.get();
    const end = cur + project(v);
    const act = end > 0 ? right : left;
    const commit = act && Math.abs(end) >= threshold() && Math.sign(end) === Math.sign(cur) && Math.sign(v || cur) === Math.sign(cur);
    if (commit) {
      const out = Math.sign(cur) * width();
      animate(x, out, { ...SPRING, velocity: v, duration: 0.28 }).then(() => {
        act.onCommit();
        animate(x, 0, SPRING);
      });
    } else {
      animate(x, 0, { ...SPRING_MOMENTUM, velocity: v });
    }
    // il clic che segue un trascinamento non deve aprire la scheda
    if (s.moved) {
      const stop = (ev: Event) => {
        ev.preventDefault();
        ev.stopPropagation();
      };
      box.current?.addEventListener('click', stop, { capture: true, once: true });
      setTimeout(() => box.current?.removeEventListener('click', stop, { capture: true }), 50);
    }
  };

  // l'icona cresce verso il dito e si accende alla soglia
  const pr = useTransform(x, (v) => Math.min(1, Math.max(0, v) / threshold()));
  const pl = useTransform(x, (v) => Math.min(1, Math.max(0, -v) / threshold()));
  const sr = useTransform(pr, [0, 1], [0.7, 1]);
  const sl = useTransform(pl, [0, 1], [0.7, 1]);
  const showR = useTransform(x, (v) => (v > 0 ? 1 : 0));
  const showL = useTransform(x, (v) => (v < 0 ? 1 : 0));

  return (
    <div ref={box} className="relative" style={{ touchAction: 'pan-y' }} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
      {right && (
        <motion.div aria-hidden="true" className="absolute inset-0 flex items-center rounded-[var(--radius-card)] pl-6 text-white" style={{ background: right.color, opacity: showR }}>
          <motion.span className="flex items-center gap-2 text-[0.9375rem] font-semibold" style={{ scale: sr, opacity: pr, transformOrigin: 'left center' }}>
            <ChevronsRight size={22} strokeWidth={2.4} /> {right.label}
          </motion.span>
        </motion.div>
      )}
      {left && (
        <motion.div aria-hidden="true" className="absolute inset-0 flex items-center justify-end rounded-[var(--radius-card)] pr-6 text-white" style={{ background: left.color, opacity: showL }}>
          <motion.span className="flex items-center gap-2 text-[0.9375rem] font-semibold" style={{ scale: sl, opacity: pl, transformOrigin: 'right center' }}>
            {left.label} <MessageCircle size={21} strokeWidth={2.3} />
          </motion.span>
        </motion.div>
      )}
      <motion.div style={{ x }} className="relative">
        {children}
      </motion.div>
    </div>
  );
}
