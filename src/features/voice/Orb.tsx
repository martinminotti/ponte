import { motion } from 'motion/react';
import { Check, Mic, MicOff } from 'lucide-react';
import type { Phase } from '@/voice/session';

const LABEL: Record<Phase, string> = {
  idle: 'Tocca e parla',
  starting: 'Un attimo…',
  listening: 'Ti ascolto',
  thinking: 'Scrivo…',
  speaking: 'Tocca per interrompere',
  paused: 'In pausa · tocca per riprendere',
  error: 'Non ti sento',
  saving: 'Registro…',
};

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

export const orbLabel = (p: Phase) => LABEL[p];

/**
 * Il pulsante del microfono. Un solo gesto per tutto: tocca per parlare, tocca per fermarti,
 * tocca per zittire l'assistente. L'alone segue la voce: si vede subito che il telefono sente.
 */
export function Orb({ phase, level, onPress, invite }: { phase: Phase; level: number; onPress: () => void; invite?: boolean }) {
  const hearing = phase === 'listening' || phase === 'thinking';
  const off = phase === 'error';
  const halo = hearing ? 1 + Math.min(1, level) * 0.42 : phase === 'speaking' ? 1.12 : 0.9;
  return (
    <div className="relative grid size-[112px] place-items-center">
      {invite && (phase === 'idle' || phase === 'paused') && <span aria-hidden="true" className="orb-invite absolute inset-[18px] rounded-full bg-accent" />}
      <motion.span
        aria-hidden="true"
        className="absolute inset-[18px] rounded-full bg-accent/25 dark:bg-accent/30"
        animate={{ scale: halo, opacity: hearing || phase === 'speaking' ? 1 : 0 }}
        transition={{ type: 'spring', bounce: 0, duration: 0.22 }}
      />
      <motion.span
        aria-hidden="true"
        className="absolute inset-[18px] rounded-full bg-accent/15"
        animate={{ scale: hearing ? 1 + Math.min(1, level) * 0.8 : 1, opacity: hearing && level > 0.08 ? 1 : 0 }}
        transition={{ type: 'spring', bounce: 0, duration: 0.35 }}
      />
      {phase === 'thinking' && <span aria-hidden="true" className="orb-think absolute inset-[12px] rounded-full" />}
      <button
        type="button"
        onClick={onPress}
        disabled={phase === 'saving' || phase === 'starting'}
        aria-label={ARIA[phase]}
        // vetro colorato come il + della barra; fuori da iOS un pieno arancio
        className={`glass press relative grid size-[76px] place-items-center rounded-full active:scale-[0.95] disabled:opacity-80 ${
          off ? 'text-ink-2' : 'glass-tint text-on-accent noglass:bg-accent noglass:shadow-[var(--shadow-accent),0_10px_30px_-10px_rgba(214,78,0,.55)]'
        }`}
      >
        {phase === 'speaking' ? (
          <span className="orb-eq flex h-8 items-center gap-[5px]" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
        ) : phase === 'saving' ? (
          <Check size={32} strokeWidth={2.6} />
        ) : off ? (
          <MicOff size={30} strokeWidth={2.2} />
        ) : (
          <Mic size={32} strokeWidth={2.2} />
        )}
      </button>
    </div>
  );
}
