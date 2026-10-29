import { useEffect, useState, type ReactNode, type RefObject } from 'react';
import { Outlet, useLocation, useMatch, useNavigate } from 'react-router';
import { CarFront, ChevronLeft, Search, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { searchShortcut, useGlass, useJobs, useNativeBarOn, useWide } from './hooks';
import { useNativeActions, useNativeTop, useTopNative, type NativeAction, type TopItem, type TopSpec } from '@/platform/nativeBar';
import { viewTransitionsOn } from '@/platform/navigation';
import { ActionMenu, type MenuEntry } from '@/ui/Menu';
import { useIsUnderlay, useUnderlayScroll } from './underlay';
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
        <h2 className="w-wide mt-5 text-[1.25rem] font-semibold text-ink">Scegli una scheda</h2>
        <p className="mt-1.5 text-[0.9375rem] leading-relaxed text-ink-2">Il dettaglio del veicolo, i lavori e il conto si aprono qui, accanto all'elenco.</p>
        <dl className="mt-6 grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2.5 text-left text-[0.875rem] text-ink-2">
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
export function useBack(fallback: string) {
  const nav = useNavigate();
  return () => {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) nav(-1);
    else nav(fallback, { replace: true });
  };
}

/** Voce di un menu della testata: come le voci di ActionMenu, con il simbolo SF per il menu nativo di iOS. */
export type TopMenuEntry = MenuEntry & { id: string; symbol: string };
/** Pulsante tondo della testata (a destra): un'azione, oppure un menu (•••). */
export type TopAction = {
  id: string;
  label: string;
  icon: ReactNode;
  /** SF Symbol per la testata nativa di iOS */
  symbol: string;
  onPress?: () => void;
  disabled?: boolean;
  menu?: { title: string; items: TopMenuEntry[] };
};

/** altezza della barra di stato (env(safe-area-inset-top)), misurata una volta con un elemento sonda */
let probe: HTMLDivElement | null = null;
function safeTop(): number {
  if (typeof document === 'undefined') return 0;
  if (!probe) {
    probe = document.createElement('div');
    probe.style.cssText = 'position:fixed;top:0;left:0;width:0;visibility:hidden;pointer-events:none;height:env(safe-area-inset-top,0px)';
    document.body.appendChild(probe);
  }
  return probe.offsetHeight;
}

const scrollTop = () => window.scrollTo({ top: 0, behavior: 'smooth' });

/** La stessa testata, detta alla barra nativa di iOS: titolo, pulsante a sinistra, pulsanti e menu a destra. */
function topSpec(o: { title: string; visible: boolean; leading: TopItem | null; actions: TopAction[]; onLeading?: () => void }): TopSpec {
  return {
    title: o.title,
    visible: o.visible,
    leading: o.leading,
    trailing: o.actions.map((a) => {
      let group = 0;
      return {
        id: a.id,
        label: a.label,
        symbol: a.symbol,
        disabled: a.disabled,
        menu: a.menu?.items.map((it) => ({ id: it.id, label: it.label, symbol: it.symbol, destructive: it.danger, group: it.separator ? ++group : group })),
      };
    }),
    onSelect: (id) => {
      if (id === 'leading') return o.onLeading?.();
      if (id === 'title') return scrollTop();
      for (const a of o.actions) {
        if (a.id === id) return a.onPress?.();
        const it = a.menu?.items.find((x) => x.id === id);
        if (it) return it.onSelect();
      }
    },
  };
}

/**
 * Lente nella notch delle sezioni con la ricerca (Oggi, Schede): apre il campo della pagina.
 * Su iPhone il campo apre la ricerca nativa in alto; altrove si torna in cima e il campo prende il fuoco.
 */
export const SEARCH_ACTION: TopAction = {
  id: 'search',
  label: 'Cerca',
  icon: <Search size={21} strokeWidth={2.2} />,
  symbol: 'magnifyingglass',
  onPress: () => {
    const el = document.getElementById('search-jobs') as HTMLInputElement | null;
    if (!el) return;
    if (el.readOnly) return el.click();
    window.scrollTo({ top: 0 });
    el.focus({ preventScroll: true });
  },
};

/** Capsula di vetro tonda della testata. */
function NotchButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="glass notch-pill press pointer-events-auto grid size-11 shrink-0 place-items-center rounded-full text-ink disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function NotchActions({ actions }: { actions: TopAction[] }) {
  return (
    <>
      {actions.map((a) =>
        a.menu ? (
          <ActionMenu
            key={a.id}
            title={a.menu.title}
            items={a.menu.items}
            trigger={(open) => (
              <NotchButton label={a.label} onClick={open} disabled={a.disabled}>
                {a.icon}
              </NotchButton>
            )}
          />
        ) : (
          <NotchButton key={a.id} label={a.label} onClick={() => a.onPress?.()} disabled={a.disabled}>
            {a.icon}
          </NotchButton>
        ),
      )}
    </>
  );
}

/** Titolo nella capsula centrale: toccandolo si torna in cima, come la barra di stato di iOS. */
function NotchTitle({ title }: { title: string }) {
  return (
    <button
      type="button"
      onClick={scrollTop}
      className="glass notch-pill pointer-events-auto absolute top-1/2 left-1/2 flex h-11 max-w-[calc(100%-136px)] -translate-x-1/2 -translate-y-1/2 items-center rounded-full px-[18px]"
    >
      <span className="w-wide truncate text-[1rem] font-semibold tracking-[-0.005em] text-ink">{title}</span>
    </button>
  );
}

/**
 * Testata delle schermate secondarie, su telefono: tre capsule di vetro che galleggiano sul contenuto
 * (indietro o X a sinistra, il titolo al centro, le azioni e ••• a destra). Niente fascia né sfumatura.
 * Su iPhone la disegna la barra nativa in Liquid Glass (UIGlassEffect, menu UIMenu): qui resta solo lo spazio;
 * la copia web compare quando la nativa si fa da parte (gesto indietro, fogli aperti, schermate a foglio in movimento).
 * Su schermi larghi resta la barra classica del pannello.
 */
export function TopBar({
  back,
  backLabel = 'Indietro',
  close,
  onBack,
  title,
  actions = [],
  hideBackOnWide,
  maxW = 760,
}: {
  back?: string;
  backLabel?: string;
  /** schermata a foglio: X invece della freccia */
  close?: boolean;
  onBack?: () => void;
  title: string;
  actions?: TopAction[];
  hideBackOnWide?: boolean;
  maxW?: number;
}) {
  const wide = useWide();
  const under = useIsUnderlay();
  const underY = useUnderlayScroll();
  const nativeShown = useTopNative();
  const goBack = useBack(back || '/');
  const leave = onBack ?? goBack;
  const showBack = back !== undefined || !!onBack;
  const leading: TopItem | null = showBack ? { id: 'leading', label: backLabel, symbol: close ? 'xmark' : 'chevron.left' } : null;
  useNativeTop(!wide && !under ? topSpec({ title, visible: true, leading, actions, onLeading: leave }) : null);

  if (!wide) {
    const h = 'h-[calc(env(safe-area-inset-top,0px)+56px)]';
    // la barra nativa è in vista: la pagina tiene solo il suo spazio
    if (nativeShown && !under) return <div aria-hidden="true" className={h} />;
    return (
      <div className={`pointer-events-none sticky top-0 z-30 ${h} pt-[env(safe-area-inset-top,0px)]`} style={under ? { position: 'relative', top: underY } : undefined}>
        <div className="relative mx-auto flex h-14 max-w-[760px] items-center gap-2 px-3">
          {showBack ? (
            <NotchButton label={backLabel} onClick={leave}>
              {close ? <X size={22} strokeWidth={2.3} /> : <ChevronLeft size={24} strokeWidth={2.3} className="-translate-x-px" />}
            </NotchButton>
          ) : (
            <span className="size-11" />
          )}
          <span className="flex-1" />
          <div className="flex items-center gap-2">
            <NotchActions actions={actions} />
          </div>
          <NotchTitle title={title} />
        </div>
      </div>
    );
  }

  const showWideBack = showBack && !hideBackOnWide;
  return (
    <div className="glass sticky top-0 z-30 pt-[env(safe-area-inset-top,0px)]">
      <div className="mx-auto flex h-14 items-center gap-2 px-2 sm:px-4" style={{ maxWidth: maxW }}>
        {showWideBack ? (
          <button type="button" onClick={leave} className="press -ml-1 flex h-11 items-center gap-0.5 rounded-full pr-3 pl-1.5 text-[1rem] font-medium text-accent-ink hover:bg-surface-2">
            {close ? <X size={22} strokeWidth={2.2} className="mx-0.5" /> : <ChevronLeft size={26} strokeWidth={2.2} />}
            {backLabel}
          </button>
        ) : (
          <span className="w-2" />
        )}
        <div className="min-w-0 flex-1 truncate text-center text-[1rem] font-semibold text-ink">{title}</div>
        <div className="flex min-w-[64px] items-center justify-end gap-1">
          {actions.map((a) =>
            a.menu ? (
              <ActionMenu
                key={a.id}
                title={a.menu.title}
                items={a.menu.items}
                trigger={(open) => (
                  <BarButton label={a.label} onClick={open}>
                    {a.icon}
                  </BarButton>
                )}
              />
            ) : (
              <BarButton key={a.id} label={a.label} onClick={() => a.onPress?.()}>
                {a.icon}
              </BarButton>
            ),
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Notch delle sezioni (Oggi, Schede, Fatture, Impostazioni): il titolo grande sta nella pagina; quando passa
 * sotto la barra di stato, al suo posto compare la capsula di vetro con il nome della sezione, che si materializza
 * allargandosi dal centro. `anchor` è il titolo grande.
 */
export function SectionNotch({ title, anchor, actions = [] }: { title: string; anchor: RefObject<HTMLElement | null>; actions?: TopAction[] }) {
  const wide = useWide();
  const under = useIsUnderlay();
  const underY = useUnderlayScroll();
  const nativeShown = useTopNative();
  const [past, setPast] = useState(false);
  useEffect(() => {
    let raf = 0;
    const on = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const el = anchor.current;
        const safe = safeTop();
        setPast(el ? el.getBoundingClientRect().bottom < safe + 50 : window.scrollY > 80);
      });
    };
    on();
    addEventListener('scroll', on, { passive: true });
    addEventListener('resize', on);
    return () => {
      cancelAnimationFrame(raf);
      removeEventListener('scroll', on);
      removeEventListener('resize', on);
    };
  }, [anchor]);
  const visible = under ? underY > 80 : past;
  useNativeTop(!wide && !under ? topSpec({ title, visible, leading: null, actions }) : null);
  if (wide || (nativeShown && !under)) return null;
  const reduce = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  return (
    <div className="pointer-events-none sticky top-0 z-30 h-0" style={under ? { position: 'relative', top: underY } : undefined}>
      <AnimatePresence initial={false}>
        {visible && (
          <motion.div
            key="notch"
            // niente filter sul contenitore: spegnerebbe la sfocatura del vetro (backdrop-filter) delle capsule
            initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.86 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.9 }}
            transition={{ type: 'spring', bounce: 0, duration: 0.38 }}
            className="pt-[env(safe-area-inset-top,0px)]"
          >
            <div className="relative mx-auto flex h-14 max-w-[760px] items-center justify-end gap-2 px-3">
              <NotchActions actions={actions} />
              <NotchTitle title={title} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Pulsante tondo per la barra in alto su schermi larghi. */
export function BarButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} className="press grid size-11 shrink-0 place-items-center rounded-full text-ink hover:bg-surface-2">
      {children}
    </button>
  );
}

/**
 * Ingresso morbido delle schermate su telefono: una sola transizione, breve.
 * Su schermi larghi il pannello cambia all'istante: scorrendo le schede con ↑ ↓ ogni attesa si sentirebbe.
 */
export function Page({ children, className = '' }: { children: ReactNode; className?: string }) {
  const wide = useWide();
  const { pathname } = useLocation();
  // fra le sezioni (Oggi, Schede, Fatture, Impostazioni) si passa all'istante, come con la barra di iOS
  const section = ['/', '/schede', '/mensile', '/impostazioni'].includes(pathname);
  // con le View Transitions il movimento lo fa la transizione (avanti da destra, indietro verso destra): niente doppioni
  if (wide || section || viewTransitionsOn()) return <div className={className}>{children}</div>;
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }} className={className}>
      {children}
    </motion.div>
  );
}

/** Barra azioni in basso: fascia traslucida, oppure capsula di vetro flottante su iOS. */
export function ActionBar({ children, maxW = 760, native }: { children: ReactNode; maxW?: number; native?: NativeAction[] }) {
  const glass = useGlass();
  const wide = useWide();
  const nativeOn = useNativeBarOn();
  // su iPhone le azioni passano alla barra nativa; qui resta solo la sfumatura sotto il contenuto
  // la schermata disegnata sotto il gesto indietro non comanda la barra nativa
  const under = useIsUnderlay();
  useNativeActions(nativeOn && native && !under ? native : null);
  if (nativeOn && native) return <div aria-hidden="true" className="edge-bottom" />;
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
