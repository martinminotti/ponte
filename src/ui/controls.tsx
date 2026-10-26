import { forwardRef, useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react';
import { motion } from 'motion/react';
import { Check } from 'lucide-react';
import { haptic } from '@/platform/native';

/* ---------------- bottoni ---------------- */

type Variant = 'primary' | 'secondary' | 'ghost' | 'wa' | 'danger' | 'outline';
type Size = 'sm' | 'md' | 'lg';

const VARIANT: Record<Variant, string> = {
  primary: 'bg-accent text-on-accent shadow-[var(--shadow-accent)] hover:brightness-[1.06]',
  secondary: 'bg-surface-2 text-ink hover:bg-surface-3',
  outline: 'bg-surface text-ink ring-1 ring-inset ring-line hover:ring-line-strong',
  ghost: 'bg-transparent text-ink hover:bg-surface-2',
  wa: 'bg-wa text-on-wa shadow-[0_1px_0_rgba(255,255,255,.18)_inset] hover:brightness-[1.06]',
  danger: 'bg-danger-soft text-danger hover:brightness-[0.98]',
};
const SIZE: Record<Size, string> = {
  sm: 'h-10 px-3.5 text-[15px] gap-1.5 rounded-[12px]',
  md: 'h-12 px-4 text-[16px] gap-2 rounded-[14px]',
  lg: 'h-14 px-5 text-[17px] gap-2.5 rounded-[16px]',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
  block?: boolean;
  haptics?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', icon, block, className = '', children, onClick, haptics = true, type = 'button', ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      onClick={(e) => {
        if (haptics) haptic('light');
        onClick?.(e);
      }}
      className={`press inline-flex items-center justify-center font-semibold whitespace-nowrap disabled:pointer-events-none disabled:opacity-40 ${VARIANT[variant]} ${SIZE[size]} ${
        block ? 'w-full min-w-0 overflow-hidden' : 'shrink-0'
      } ${className}`}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
});

/* ---------------- segmented ---------------- */

export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  label,
  size = 'md',
}: {
  options: { v: T; l: ReactNode }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  size?: 'sm' | 'md';
}) {
  const id = useId();
  return (
    <div role="radiogroup" aria-label={label} className="flex w-full rounded-[14px] bg-surface-2 p-1">
      {options.map((o) => {
        const on = o.v === value;
        return (
          <button
            key={String(o.v)}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => {
              if (!on) {
                haptic('light');
                onChange(o.v);
              }
            }}
            className={`relative flex-1 rounded-[10px] px-2 font-semibold transition-colors ${size === 'sm' ? 'h-9 text-[14px]' : 'h-11 text-[15px]'} ${on ? 'text-ink' : 'text-ink-2 hover:text-ink'}`}
          >
            {on && (
              <motion.span
                layoutId={`seg-${id}`}
                className="absolute inset-0 rounded-[10px] bg-surface shadow-[0_1px_2px_rgba(0,0,0,.12),0_0_0_1px_var(--line)]"
                transition={{ type: 'spring', stiffness: 520, damping: 40 }}
              />
            )}
            <span className="relative whitespace-nowrap">{o.l}</span>
          </button>
        );
      })}
    </div>
  );
}

/* ---------------- chip a scelta ---------------- */

export function Chip({ on, children, onClick, className = '', count, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { on: boolean; count?: number }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={(e) => {
        haptic('light');
        onClick?.(e);
      }}
      className={`press inline-flex h-10 shrink-0 items-center gap-2 rounded-full px-4 text-[15px] font-medium ${
        on ? 'bg-ink text-bg' : 'bg-surface text-ink ring-1 ring-inset ring-line hover:ring-line-strong'
      } ${className}`}
      {...rest}
    >
      {children}
      {count != null && <span className={`tnum text-[14px] font-semibold ${on ? 'opacity-70' : 'text-ink-3'}`}>{count}</span>}
    </button>
  );
}

export function ToggleChip({ on, children, onClick }: { on: boolean; children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={() => {
        haptic('light');
        onClick();
      }}
      className={`press inline-flex h-11 items-center gap-1.5 rounded-[12px] px-3.5 text-[15px] font-medium ${
        on ? 'bg-accent-soft text-accent-ink ring-1 ring-inset ring-accent/40' : 'bg-surface-2 text-ink hover:bg-surface-3'
      }`}
    >
      {on && <Check size={16} strokeWidth={2.6} />}
      {children}
    </button>
  );
}

/* ---------------- campi ---------------- */

export function Field({ label, hint, htmlFor, children, error }: { label: ReactNode; hint?: ReactNode; htmlFor?: string; children: ReactNode; error?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-[14px] font-medium text-ink-2">
        {label}
      </label>
      {children}
      {error ? <p className="text-[14px] font-medium text-danger">{error}</p> : hint ? <p className="text-[13.5px] leading-snug text-ink-3">{hint}</p> : null}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className = '', ...p }, ref) {
  return <input ref={ref} className={`ctl ${className}`} {...p} />;
});

export const TextArea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function TextArea({ className = '', ...p }, ref) {
  return <textarea ref={ref} className={`ctl ${className}`} {...p} />;
});

/**
 * Campo che salva da solo: tiene il testo in locale mentre scrivi e lo consegna
 * dopo una breve pausa o quando esci dal campo. Non viene sovrascritto mentre è attivo.
 */
export function AutoInput({
  value,
  onCommit,
  delay = 450,
  multiline,
  ...rest
}: { value: string; onCommit: (v: string) => void; delay?: number; multiline?: boolean } & Omit<
  InputHTMLAttributes<HTMLInputElement> & TextareaHTMLAttributes<HTMLTextAreaElement>,
  'value' | 'onChange'
>) {
  const [v, setV] = useState(value);
  const focused = useRef(false);
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef({ v, value, onCommit });
  latest.current = { v, value, onCommit };

  useEffect(() => {
    if (!focused.current) setV(value);
  }, [value]);

  useEffect(
    () => () => {
      if (t.current) {
        clearTimeout(t.current);
        const l = latest.current;
        if (l.v !== l.value) l.onCommit(l.v);
      }
    },
    []
  );

  const change = (nv: string) => {
    setV(nv);
    if (t.current) clearTimeout(t.current);
    t.current = setTimeout(() => {
      t.current = null;
      onCommit(nv);
    }, delay);
  };
  const common = {
    value: v,
    onFocus: () => (focused.current = true),
    onBlur: () => {
      focused.current = false;
      if (t.current) {
        clearTimeout(t.current);
        t.current = null;
      }
      if (v !== value) onCommit(v);
    },
  };
  if (multiline) return <TextArea {...(rest as TextareaHTMLAttributes<HTMLTextAreaElement>)} {...common} onChange={(e) => change(e.target.value)} />;
  return <Input {...(rest as InputHTMLAttributes<HTMLInputElement>)} {...common} onChange={(e) => change(e.target.value)} />;
}

export function Switch({ checked, onChange, label, description }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; description?: ReactNode }) {
  const id = useId();
  return (
    <label htmlFor={id} className="flex cursor-pointer items-center justify-between gap-4 py-1">
      <span className="min-w-0">
        <span className="block text-[16px] font-medium text-ink">{label}</span>
        {description && <span className="block text-[14px] leading-snug text-ink-3">{description}</span>}
      </span>
      <span className="relative inline-flex shrink-0">
        <input
          id={id}
          type="checkbox"
          role="switch"
          className="peer sr-only"
          checked={checked}
          onChange={(e) => {
            haptic('light');
            onChange(e.target.checked);
          }}
        />
        <span className="h-[31px] w-[51px] rounded-full bg-surface-3 transition-colors peer-checked:bg-ok peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent" />
        <span className="absolute top-[2px] left-[2px] size-[27px] rounded-full bg-white shadow-[0_2px_6px_rgba(0,0,0,.25)] transition-transform duration-200 ease-[var(--ease-out-soft)] peer-checked:translate-x-[20px]" />
      </span>
    </label>
  );
}

/* ---------------- contenitori ---------------- */

export function Section({ title, action, children, className = '', id, tone }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; id?: string; tone?: 'accent' }) {
  return (
    <section id={id} className={`card p-4 sm:p-5 ${tone === 'accent' ? 'ring-2 ring-accent/50' : ''} ${className}`}>
      {(title || action) && (
        <header className="mb-3.5 flex min-h-8 items-center justify-between gap-3">
          {title && <h3 className="w-semi text-[17px] font-semibold tracking-[-0.005em] text-ink">{title}</h3>}
          {action}
        </header>
      )}
      <div className="flex flex-col gap-4">{children}</div>
    </section>
  );
}

export function Note({ children, tone = 'neutral', icon }: { children: ReactNode; tone?: 'neutral' | 'warn' | 'ok' | 'danger'; icon?: ReactNode }) {
  const c = {
    neutral: 'bg-surface-2 text-ink-2',
    warn: 'bg-warn-soft text-warn',
    ok: 'bg-ok-soft text-ok',
    danger: 'bg-danger-soft text-danger',
  }[tone];
  return (
    <div className={`flex items-start gap-2.5 rounded-[14px] px-3.5 py-3 text-[14.5px] leading-snug font-medium ${c}`}>
      {icon && <span className="mt-px shrink-0">{icon}</span>}
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function EmptyState({ title, children, action, art }: { title: string; children?: ReactNode; action?: ReactNode; art?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      {art}
      <h3 className="w-wide mt-5 text-[19px] font-semibold text-ink">{title}</h3>
      {children && <p className="mt-2 max-w-[34ch] text-[15px] leading-relaxed text-ink-2">{children}</p>}
      {action && <div className="mt-6 flex flex-wrap justify-center gap-2.5">{action}</div>}
    </div>
  );
}
