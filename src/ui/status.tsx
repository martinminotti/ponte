import { motion } from 'motion/react';
import { STATI, statoIndex, statoLabel } from '@/domain/constants';
import type { StatusKey } from '@/domain/types';
import { haptic } from '@/platform/native';

export const stColor = (k: StatusKey) => `var(--st-${k})`;

export function StatusPill({ s, size = 'md' }: { s: StatusKey; size?: 'sm' | 'md' }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full font-semibold whitespace-nowrap ${size === 'sm' ? 'h-6 px-2 text-[13px]' : 'h-7 px-2.5 text-[14px]'}`}
      style={{ color: stColor(s), background: `color-mix(in srgb, ${stColor(s)} 13%, transparent)` }}
    >
      <span className="size-1.5 rounded-full" style={{ background: stColor(s) }} />
      {statoLabel(s)}
    </span>
  );
}

/** Barra di avanzamento compatta: sei tacche, piene fino allo stato attuale. */
export function StatusTicks({ s }: { s: StatusKey }) {
  const idx = statoIndex(s);
  return (
    <span className="flex gap-[3px]" aria-hidden="true">
      {STATI.map((x, i) => (
        <span
          key={x.k}
          className="h-[4px] flex-1 rounded-full"
          style={{ background: i <= idx ? stColor(s) : 'var(--surface-3)', opacity: i <= idx ? (i === idx ? 1 : 0.55) : 1 }}
        />
      ))}
    </span>
  );
}

/**
 * Binario degli stati: si tocca una tappa per spostare la scheda.
 * Lo stato attuale è segnato da un indicatore che scorre lungo il binario.
 */
export function StatusRail({ value, onChange }: { value: StatusKey; onChange: (k: StatusKey) => void }) {
  const idx = statoIndex(value);
  const col = stColor(value);
  return (
    <div role="radiogroup" aria-label="Stato lavorazione" className="relative">
      <div className="absolute top-[19px] right-[calc(100%/12)] left-[calc(100%/12)] h-[3px] rounded-full bg-surface-3" aria-hidden="true">
        <motion.div
          className="h-full rounded-full"
          style={{ background: col }}
          initial={false}
          animate={{ width: `${(idx / (STATI.length - 1)) * 100}%` }}
          transition={{ type: 'spring', stiffness: 260, damping: 32 }}
        />
      </div>
      <div className="relative grid grid-cols-6">
        {STATI.map((st, i) => {
          const on = i === idx;
          const done = i < idx;
          return (
            <button
              key={st.k}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={st.l}
              onClick={() => {
                if (!on) {
                  haptic('medium');
                  onChange(st.k);
                }
              }}
              className="group flex flex-col items-center gap-2 pb-1 outline-none"
            >
              <span className="relative grid size-10 place-items-center">
                {on && (
                  <motion.span
                    layoutId="rail-dot"
                    className="absolute inset-0 rounded-full"
                    style={{ background: col, boxShadow: `0 0 0 5px color-mix(in srgb, ${col} 20%, transparent)` }}
                    transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                  />
                )}
                <span
                  className={`relative rounded-full transition-all ${on ? 'size-2.5 bg-white' : done ? 'size-3 group-hover:scale-125' : 'size-3 bg-surface ring-2 ring-inset ring-line-strong group-hover:ring-ink-3'}`}
                  style={done ? { background: col } : undefined}
                />
              </span>
              <span className={`w-semi text-center text-[12.5px] leading-tight sm:text-[13.5px] ${on ? 'font-bold text-ink' : 'font-medium text-ink-2'}`}>{st.short}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
