import { useRef } from 'react';
import { motion, useAnimationFrame, useMotionValue, useReducedMotion, useTransform, type MotionValue } from 'motion/react';
import { Check, Mic, MicOff } from 'lucide-react';
import type { Phase } from '@/voice/session';

const ARIA: Record<Phase, string> = {
  idle: 'Inizia a dettare',
  starting: 'Avvio dell’ascolto',
  listening: 'Metti in pausa l’ascolto',
  thinking: 'Metti in pausa l’ascolto',
  speaking: 'Interrompi la voce dell’assistente',
  paused: 'Riprendi a dettare',
  error: 'Riprova ad ascoltare',
  saving: 'Registrazione in corso',
};

/** ogni barretta ha il suo peso e la sua fase: la forma è quella di una voce, più alta al centro */
const SHAPE = [0.55, 0.82, 1, 0.82, 0.55];
const PHASE = [0.0, 1.7, 3.1, 4.6, 5.9];

/**
 * Il microfono. Un solo gesto per tutto: tocca per parlare, per fermarti, per zittire l'assistente.
 *
 * Mentre ascolta risponde alla voce, fotogramma per fotogramma:
 *  - dentro, cinque barrette seguono il volume (sale subito, scende piano, come un VU meter);
 *    in silenzio restano puntini che respirano: si vede che ascolta ma non sente niente;
 *  - fuori, un alone di luce si gonfia e si accende con la voce.
 * Pensa: le barrette diventano un'onda lenta e l'anello gira. Parla: le barrette ondeggiano da sole.
 * Con "riduci movimento" niente rotazioni né ondeggiamenti, solo l'altezza che segue la voce.
 */
export function Orb({ phase, level, onPress, invite, hearing }: { phase: Phase; level: number; onPress: () => void; invite?: boolean; hearing?: boolean }) {
  const reduce = !!useReducedMotion();
  const listening = phase === 'listening' || phase === 'thinking';
  const active = listening || phase === 'speaking';
  const off = phase === 'error';

  // volume livellato: attacco rapido, rilascio lento. Se arrivano parole ma il dispositivo non dà il volume, si accende comunque
  const target = useRef(0);
  target.current = listening ? Math.max(level, hearing ? 0.4 : 0) : 0;
  const lv = useMotionValue(0);
  const t = useMotionValue(0);
  useAnimationFrame((time, delta) => {
    const cur = lv.get();
    const tg = target.current;
    const k = tg > cur ? 0.45 : 0.08;
    const next = cur + (tg - cur) * Math.min(1, k * (delta / 16.7));
    if (Math.abs(next - cur) > 0.0005) lv.set(next);
    if (active) t.set(time / 1000);
  });

  const glowScale = useTransform(lv, (v) => 1 + v * 0.55);
  const glowOpacity = useTransform(lv, (v) => (listening ? 0.25 + v * 0.65 : phase === 'speaking' ? 0.5 : 0));

  return (
    <div className="relative grid size-[112px] place-items-center">
      {invite && (phase === 'idle' || phase === 'paused') && <span aria-hidden="true" className="orb-invite absolute inset-[18px] rounded-full bg-accent" />}

      {/* alone di luce che respira con la voce */}
      <motion.span aria-hidden="true" className="pointer-events-none absolute inset-[10px] rounded-full" style={{ scale: glowScale, opacity: glowOpacity }}>
        <span className={`orb-glow absolute inset-0 rounded-full ${reduce ? '' : phase === 'thinking' ? 'orb-glow-fast' : 'orb-glow-spin'}`} />
      </motion.span>

      {phase === 'thinking' && <span aria-hidden="true" className="orb-think absolute inset-[12px] rounded-full" />}

      <motion.button
        type="button"
        onClick={onPress}
        disabled={phase === 'saving' || phase === 'starting'}
        aria-label={ARIA[phase]}
        whileTap={{ scale: 0.9 }}
        transition={{ type: 'spring', bounce: 0, duration: 0.25 }}
        // vetro colorato come il + della barra; fuori da iOS un pieno arancio
        className={`glass relative grid size-[76px] place-items-center rounded-full disabled:opacity-80 ${
          off ? 'text-ink-2' : 'glass-tint text-on-accent noglass:bg-accent noglass:shadow-[var(--shadow-accent),0_10px_30px_-10px_rgba(214,78,0,.55)]'
        }`}
      >
        {active ? (
          <span className="flex h-9 items-center gap-[4px]" aria-hidden="true">
            {SHAPE.map((w, i) => (
              <Bar key={i} i={i} w={w} lv={lv} t={t} phase={phase} still={reduce} />
            ))}
          </span>
        ) : phase === 'saving' ? (
          <Check size={32} strokeWidth={2.6} />
        ) : off ? (
          <MicOff size={30} strokeWidth={2.2} />
        ) : (
          <Mic size={32} strokeWidth={2.2} />
        )}
      </motion.button>
    </div>
  );
}

function Bar({ i, w, lv, t, phase, still }: { i: number; w: number; lv: MotionValue<number>; t: MotionValue<number>; phase: Phase; still: boolean }) {
  // altezza in px: 5 = puntino, 34 = voce piena
  const h = useTransform([lv, t], ([v, time]: number[]) => {
    const p = PHASE[i];
    if (phase === 'thinking') return still ? 8 : 7 + 6 * (0.5 + 0.5 * Math.sin(time * 5 - i * 0.9));
    if (phase === 'speaking') return still ? 16 : 8 + 20 * w * (0.5 + 0.5 * Math.sin(time * 7.5 + p));
    // ascolto: il volume decide, un tremolio leggero rende viva la forma
    const wobble = still ? 1 : 0.72 + 0.28 * Math.sin(time * 11 + p);
    const breathe = still ? 0 : 1.5 * (0.5 + 0.5 * Math.sin(time * 2.2 + i * 0.6));
    return 5 + breathe + Math.min(1, v) * 29 * w * wobble;
  });
  return <motion.span className="block w-[5px] rounded-full bg-current" style={{ height: h }} />;
}
