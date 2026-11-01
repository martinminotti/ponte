import { useEffect, useRef } from 'react';
import { motion } from 'motion/react';

/**
 * Codice di 6 cifre: un solo campo vero (incolla, completamento automatico dalla Mail di iOS) disegnato come 6 caselle.
 * Alla sesta cifra parte da solo.
 */
export function OtpInput({ value, onChange, onComplete, disabled, invalid }: { value: string; onChange: (v: string) => void; onComplete: (v: string) => void; disabled?: boolean; invalid?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    // qui il fuoco serve: si è appena chiesto il codice e c'è solo questo da fare
    ref.current?.focus();
  }, []);
  const digits = value.padEnd(6, ' ').slice(0, 6).split('');
  return (
    <motion.label animate={invalid ? { x: [0, -10, 8, -5, 3, 0] } : { x: 0 }} transition={{ duration: 0.4 }} className="relative mx-auto block w-full max-w-[340px]">
      <span className="sr-only">Codice di 6 cifre</span>
      <input
        ref={ref}
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]*"
        maxLength={6}
        disabled={disabled}
        value={value}
        onChange={(e) => {
          const v = e.target.value.replace(/\D/g, '').slice(0, 6);
          onChange(v);
          if (v.length === 6) onComplete(v);
        }}
        className="absolute inset-0 z-[1] h-full w-full opacity-0"
        aria-label="Codice di 6 cifre"
      />
      <span className="grid grid-cols-6 gap-2" aria-hidden="true">
        {digits.map((d, i) => {
          const at = i === Math.min(value.length, 5) && !disabled;
          return (
            <span
              key={i}
              className={`tnum grid h-[60px] place-items-center rounded-[14px] bg-surface text-[1.75rem] font-semibold text-ink shadow-[var(--shadow-1)] ring-1 transition-[box-shadow] ${
                invalid ? 'ring-danger' : at ? 'ring-2 ring-accent' : 'ring-line'
              }`}
            >
              {d.trim()}
            </span>
          );
        })}
      </span>
    </motion.label>
  );
}
