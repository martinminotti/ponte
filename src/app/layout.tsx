import type { ReactNode } from 'react';
import { Outlet, useMatch, useNavigate } from 'react-router';
import { ChevronLeft } from 'lucide-react';
import { motion } from 'motion/react';
import { useGlass, useWide } from './hooks';
import { ListPage } from '@/features/list/ListPage';
import { DashboardPage } from '@/features/dashboard/DashboardPage';

/**
 * Oggi + archivio + dettaglio.
 * Telefono: una schermata alla volta (Oggi su "/", archivio su "/schede").
 * Schermi larghi: archivio a sinistra, a destra Oggi oppure la scheda aperta.
 */
export function Workspace() {
  const wide = useWide();
  const onList = useMatch('/schede') !== null;
  if (!wide) return onList ? <ListPage /> : <Outlet />;
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

/** Su schermi larghi "/schede" mostra Oggi accanto all'archivio. */
export function PanePlaceholder() {
  return <DashboardPage />;
}

/** Torna indietro nella cronologia, oppure alla schermata indicata se si è entrati da un link diretto. */
function useBack(fallback: string) {
  const nav = useNavigate();
  return () => {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) nav(-1);
    else nav(fallback, { replace: true });
  };
}

/** Barra in alto delle schermate secondarie. Con il vetro liquido i comandi diventano capsule flottanti. */
export function TopBar({ back, backLabel = 'Indietro', title, right, hideBackOnWide }: { back?: string; backLabel?: string; title?: ReactNode; right?: ReactNode; hideBackOnWide?: boolean }) {
  const wide = useWide();
  const glass = useGlass();
  const goBack = useBack(back || '/');
  const showBack = back !== undefined && !(wide && hideBackOnWide);

  if (glass && !wide) {
    return (
      <div className="sticky top-[env(safe-area-inset-top,0px)] z-30">
        <div className="mx-auto flex h-[60px] max-w-[760px] items-center gap-2 px-3">
          {showBack ? (
            <button type="button" onClick={goBack} aria-label={backLabel} className="glass press grid size-11 shrink-0 place-items-center rounded-full text-ink">
              <ChevronLeft size={24} strokeWidth={2.3} className="-translate-x-px" />
            </button>
          ) : (
            <span className="size-11" />
          )}
          <div className="min-w-0 flex-1 truncate text-center text-[16px] font-semibold text-ink">{title}</div>
          <div className="flex min-w-11 items-center justify-end gap-1">{right}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="glass sticky top-[env(safe-area-inset-top,0px)] z-30 lg:top-0">
      <div className="mx-auto flex h-14 max-w-[760px] items-center gap-2 px-2 sm:px-4">
        {showBack ? (
          <button type="button" onClick={goBack} className="press -ml-1 flex h-11 items-center gap-0.5 rounded-full pr-3 pl-1.5 text-[16px] font-medium text-accent-ink hover:bg-surface-2">
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

/** Pulsante tondo per la barra in alto: capsula di vetro su iOS, icona semplice altrove. */
export function BarButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  const glass = useGlass();
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} className={`press grid size-11 shrink-0 place-items-center rounded-full text-ink ${glass ? 'glass' : 'hover:bg-surface-2'}`}>
      {children}
    </button>
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

/** Barra azioni in basso: fascia traslucida, oppure capsula di vetro flottante su iOS. */
export function ActionBar({ children }: { children: ReactNode }) {
  const glass = useGlass();
  const wide = useWide();
  if (glass && !wide) {
    return (
      <>
        <div aria-hidden="true" className="edge-bottom" />
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-3 pb-[calc(env(safe-area-inset-bottom,0px)+8px)]">
          <div className="glass pointer-events-auto mx-auto flex max-w-[760px] items-center gap-2 rounded-[30px] p-1.5">{children}</div>
        </div>
      </>
    );
  }
  return (
    <div className="glass safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-line lg:sticky lg:bottom-0">
      <div className="mx-auto flex max-w-[760px] items-center gap-2.5 px-4 py-3">{children}</div>
    </div>
  );
}
