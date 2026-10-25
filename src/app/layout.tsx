import type { ReactNode } from 'react';
import { Outlet, useMatch, useNavigate } from 'react-router';
import { ChevronLeft, MousePointerClick } from 'lucide-react';
import { motion } from 'motion/react';
import { useWide } from './hooks';
import { ListPage } from '@/features/list/ListPage';

/** Archivio + dettaglio: su telefono una schermata alla volta, su schermi larghi affiancati. */
export function Workspace() {
  const wide = useWide();
  const child = useMatch('/') === null;
  if (!wide) return child ? <Outlet /> : <ListPage />;
  return (
    <div className="flex min-h-dvh">
      <div className="h-dvh w-[400px] shrink-0 overflow-y-auto border-r border-line xl:w-[440px]">
        <ListPage />
      </div>
      <div className="h-dvh min-w-0 flex-1 overflow-y-auto" id="pane">
        <Outlet />
      </div>
    </div>
  );
}

export function PanePlaceholder() {
  return (
    <div className="grid h-full place-items-center p-10 text-center">
      <div>
        <span className="mx-auto grid size-14 place-items-center rounded-full bg-surface text-ink-3 shadow-[var(--shadow-1)]">
          <MousePointerClick size={24} />
        </span>
        <p className="w-wide mt-4 text-[18px] font-semibold text-ink">Scegli una scheda</p>
        <p className="mt-1 text-[15px] text-ink-2">Il dettaglio si apre qui, accanto all'archivio.</p>
      </div>
    </div>
  );
}

/** Barra in alto delle schermate secondarie. */
export function TopBar({ back, backLabel = 'Indietro', title, right, hideBackOnWide }: { back?: string | number; backLabel?: string; title?: ReactNode; right?: ReactNode; hideBackOnWide?: boolean }) {
  const nav = useNavigate();
  const wide = useWide();
  const showBack = back !== undefined && !(wide && hideBackOnWide);
  return (
    <div className="sticky top-[env(safe-area-inset-top,0px)] z-30 bg-[color-mix(in_srgb,var(--bg)_86%,transparent)] backdrop-blur-xl backdrop-saturate-150 lg:top-0">
      <div className="mx-auto flex h-14 max-w-[760px] items-center gap-2 px-2 sm:px-4">
        {showBack ? (
          <button
            type="button"
            onClick={() => (typeof back === 'number' ? nav(back) : nav(back as string))}
            className="press -ml-1 flex h-11 items-center gap-0.5 rounded-full pr-3 pl-1.5 text-[16px] font-medium text-accent-ink hover:bg-surface-2"
          >
            <ChevronLeft size={26} strokeWidth={2.2} />
            {backLabel}
          </button>
        ) : (
          <span className="w-2" />
        )}
        <div className="min-w-0 flex-1 truncate text-center text-[16px] font-semibold text-ink">{title}</div>
        <div className="flex min-w-[64px] items-center justify-end gap-1">{right}</div>
      </div>
    </div>
  );
}

/** Ingresso morbido delle schermate: una sola transizione, breve. */
export function Page({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }} className={className}>
      {children}
    </motion.div>
  );
}

/** Barra azioni fissata in basso, sopra l'area sicura. */
export function ActionBar({ children }: { children: ReactNode }) {
  return (
    <div className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-line bg-[color-mix(in_srgb,var(--surface)_90%,transparent)] backdrop-blur-xl backdrop-saturate-150 lg:sticky lg:bottom-0">
      <div className="mx-auto flex max-w-[760px] items-center gap-2.5 px-4 py-3">{children}</div>
    </div>
  );
}
