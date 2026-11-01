import type { ReactNode } from 'react';
import { ChevronLeft, ChevronRight, Lock } from 'lucide-react';

/** Scelta grande a tutta larghezza (benvenuto, accesso). */
export function Tile({ icon, title, text, onClick, lock, accent }: { icon: ReactNode; title: string; text: string; onClick: () => void; lock?: boolean; accent?: boolean }) {
  return (
    <button type="button" onClick={onClick} className="press card flex w-full items-center gap-4 p-4 text-left hover:shadow-[var(--shadow-2)]">
      <span className={`grid size-12 shrink-0 place-items-center rounded-[14px] ${accent ? 'bg-accent text-on-accent' : 'bg-surface-2 text-ink'}`}>{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="w-wide flex items-center gap-1.5 text-[1.0625rem] font-semibold text-ink">
          {title} {lock && <Lock size={15} className="text-ink-3" aria-label="Con PIN" />}
        </span>
        <span className="block text-[0.9062rem] text-ink-2">{text}</span>
      </span>
      <ChevronRight size={20} className="shrink-0 text-ink-3" />
    </button>
  );
}

export function Back({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="press -ml-1 flex h-10 items-center gap-0.5 self-start rounded-full pr-3 text-[0.9375rem] font-medium text-accent-ink">
      <ChevronLeft size={20} /> Indietro
    </button>
  );
}
