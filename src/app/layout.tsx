import type { ReactNode } from 'react';
import { Outlet, useMatch, useNavigate } from 'react-router';
import { CarFront, ChevronLeft } from 'lucide-react';
import { motion } from 'motion/react';
import { searchShortcut, useGlass, useJobs, useWide } from './hooks';
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
  const onToday = useMatch({ path: '/', end: true }) !== null;
  if (!wide) return onList ? <ListPage /> : <Outlet />;
  // Oggi occupa tutta la larghezza; archivio e scheda stanno affiancati
  if (onToday) return <Outlet />;
  return (
    <div className="flex min-h-dvh">
      <div className="h-dvh w-[360px] shrink-0 overflow-y-auto border-r border-line bg-bg xl:w-[400px] 2xl:w-[440px]">
        <ListPage />
      </div>
      <div className="@container h-dvh min-w-0 flex-1 overflow-y-auto" id="pane">
        <Outlet />
      </div>
    </div>
  );
}

/** Su schermi larghi "/schede" mostra accanto all'archivio un invito a scegliere una scheda. */
export function PanePlaceholder() {
  const wide = useWide();
  const jobs = useJobs();
  if (!wide) return <DashboardPage />;
  if (jobs && jobs.length === 0) return null;
  return (
    <div className="grid h-full place-items-center p-10">
      <div className="flex max-w-[380px] flex-col items-center text-center">
        <span className="grid size-16 place-items-center rounded-[20px] bg-surface text-ink-3 shadow-[var(--shadow-1)] ring-1 ring-line">
          <CarFront size={30} strokeWidth={1.8} />
        </span>
        <h2 className="w-wide mt-5 text-[20px] font-semibold text-ink">Scegli una scheda</h2>
        <p className="mt-1.5 text-[15px] leading-relaxed text-ink-2">Il dettaglio del veicolo, i lavori e il conto si aprono qui, accanto all'elenco.</p>
        <dl className="mt-6 grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2.5 text-left text-[14px] text-ink-2">
          <dt className="flex justify-end gap-1">
            <span className="kbd">{searchShortcut()}</span>
          </dt>
          <dd>Cerca targa, cliente o ditta</dd>
          <dt className="flex justify-end gap-1">
            <span className="kbd">↑</span>
            <span className="kbd">↓</span>
          </dt>
          <dd>Scorri le schede</dd>
          <dt className="flex justify-end">
            <span className="kbd">N</span>
          </dt>
          <dd>Nuova accettazione</dd>
          <dt className="flex justify-end">
            <span className="kbd">Esc</span>
          </dt>
          <dd>Chiudi la scheda</dd>
        </dl>
      </div>
    </div>
  );
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
export function TopBar({
  back,
  backLabel = 'Indietro',
  title,
  right,
  hideBackOnWide,
  maxW = 760,
}: {
  back?: string;
  backLabel?: string;
  title?: ReactNode;
  right?: ReactNode;
  hideBackOnWide?: boolean;
  maxW?: number;
}) {
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
      <div className="mx-auto flex h-14 items-center gap-2 px-2 sm:px-4" style={{ maxWidth: maxW }}>
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
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`press grid size-11 shrink-0 place-items-center rounded-full text-ink ${glass ? 'glass' : 'hover:bg-surface-2'}`}
    >
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
export function ActionBar({ children, maxW = 760 }: { children: ReactNode; maxW?: number }) {
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
      <div className="mx-auto flex items-center gap-2.5 px-4 py-3" style={{ maxWidth: maxW }}>
        {children}
      </div>
    </div>
  );
}
