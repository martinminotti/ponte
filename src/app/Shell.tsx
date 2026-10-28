import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { CarFront, Gauge, Plus, ReceiptText, Settings2, Store } from 'lucide-react';
import { motion } from 'motion/react';
import { PonteIcon, PonteWordmark } from '@/ui/Brand';
import { SPRING, SPRING_FAST } from '@/ui/motion';
import { Toaster } from 'sonner';
import { overlayOpen, typing, useDesk, useGlass, useJobs, useNativeBarOn, useOverlayOpen, useScrolledDown, useScrolledPast, useSettings, useThemeSync, useWide } from './hooks';
import { configureBar, endNativeSearch, nativeBarAvailable, onBarSearch, onBarSelect, setBarCompact, useNativeSearch, usePageActions } from '@/platform/nativeBar';
import { inFilter, toInvoice } from '@/domain/logic';
import { bindAndroidBack, haptic, initNative } from '@/platform/native';
import { NewJobFlow } from '@/features/new/NewJobFlow';

// symbol: SF Symbol usato dalla barra nativa di iOS
const NAV = [
  { to: '/', label: 'Oggi', icon: Gauge, end: true, symbol: 'gauge.with.dots.needle.67percent' },
  { to: '/schede', label: 'Schede', icon: CarFront, end: false, symbol: 'car.fill' },
  { to: '/mensile', label: 'Fatture', icon: ReceiptText, end: false, symbol: 'doc.text.fill' },
  { to: '/impostazioni', label: 'Impostazioni', icon: Settings2, end: false, symbol: 'gearshape.fill' },
];

/** L'officina che usa l'app: logo e nome, oppure l'invito a impostarli. */
export function ShopBadge({ align = 'right' }: { align?: 'left' | 'right' }) {
  const s = useSettings();
  return (
    <Link to="/impostazioni" className={`press flex min-w-0 items-center gap-2.5 rounded-full py-1 ${align === 'right' ? 'flex-row-reverse pr-1 pl-3 text-right' : 'pr-3 pl-1'} hover:bg-surface-2`}>
      {s.logo ? (
        <span className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-full bg-white p-1 ring-1 ring-line">
          <img src={s.logo} alt="" className="max-h-full max-w-full object-contain" />
        </span>
      ) : (
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-surface-2 text-ink-2 ring-1 ring-line">
          <Store size={17} />
        </span>
      )}
      <span className="min-w-0">
        <span className="block truncate text-[0.9062rem] leading-tight font-semibold text-ink">{s.shop || 'La tua officina'}</span>
        <span className="block truncate text-[0.7812rem] leading-tight text-ink-3">
          {s.role === 'staff' && s.staffName ? `${s.staffName}, dipendente` : s.shop ? 'Titolare' : 'Imposta nome e logo'}
        </span>
      </span>
    </Link>
  );
}

/** Solo il logo dell'officina, per la barra laterale stretta. */
function ShopDot() {
  const s = useSettings();
  return (
    <Link
      to="/impostazioni"
      title={s.shop || 'La tua officina'}
      aria-label={s.shop || 'La tua officina'}
      className="press mx-auto grid size-11 place-items-center overflow-hidden rounded-full bg-surface-2 text-ink-2 ring-1 ring-line hover:bg-surface-3"
    >
      {s.logo ? <img src={s.logo} alt="" className="size-full bg-white object-contain p-1" /> : <Store size={18} />}
    </Link>
  );
}

/** Intestazione delle schermate principali su telefono: marchio Ponte a sinistra, officina a destra. */
export function BrandMark() {
  return (
    <div className="flex min-h-11 items-center justify-between gap-3">
      <span className="flex items-center gap-2.5 text-ink">
        <PonteIcon size={32} />
        <PonteWordmark height={21} />
      </span>
      <ShopBadge />
    </div>
  );
}

/** Contenitore dell'app: tema, barra di navigazione (in basso su telefono, laterale su schermi larghi), notifiche. */
export function Shell() {
  const s = useSettings();
  const dark = useThemeSync(s);
  const wide = useWide();
  const loc = useLocation();
  const nav = useNavigate();

  const desk = useDesk();
  // il dipendente non ha la giornata (Oggi): solo schede, fatture e impostazioni
  const staff = s.role === 'staff';
  const sections = useMemo(() => NAV.filter((n) => !(staff && n.to === '/')), [staff]);
  const jobs = useJobs();
  const counts = useMemo(() => {
    const all = jobs || [];
    return {
      shop: all.filter((j) => inFilter(j, 'officina')).length,
      invoice: all.filter(toInvoice).length,
    };
  }, [jobs]);

  const glass = useGlass();
  const compact = useScrolledDown();
  const scrolled = useScrolledPast();

  // la barra in basso compare solo sulle schermate principali
  const top = ['/', '/schede', '/mensile', '/impostazioni'].includes(loc.pathname);

  // barra nativa di iOS: sezioni sulle schermate principali, azioni della schermata altrove, nascosta sotto i fogli
  const nativeOn = useNativeBarOn();
  const overlay = useOverlayOpen(nativeOn);
  const page = usePageActions();
  const search = useNativeSearch();
  const pageRef = useRef(page);
  pageRef.current = page;
  useEffect(() => {
    if (!nativeBarAvailable()) return;
    if (!nativeOn || overlay) return configureBar({ mode: 'hidden' }, dark);
    if (top && search.active) return configureBar({ mode: 'search', text: search.text, placeholder: search.placeholder }, dark);
    if (top)
      return configureBar(
        {
          mode: 'tabs',
          tabs: sections.map((n) => ({ id: n.to, label: n.label, symbol: n.symbol })),
          selected: loc.pathname,
          accessory: { id: 'new', label: 'Nuova accettazione', symbol: 'plus' },
        },
        dark,
      );
    if (page) return configureBar({ mode: 'actions', actions: page.map(({ onPress: _p, ...item }) => item) }, dark);
    configureBar({ mode: 'hidden' }, dark);
    // il testo non entra nelle dipendenze: riconfigurare a ogni lettera azzererebbe il campo nativo
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nativeOn, overlay, top, page, loc.pathname, dark, search.active, search.placeholder, sections]);
  // uscendo dalle sezioni (si apre una scheda dai risultati) la ricerca si chiude; il testo resta all'elenco
  useEffect(() => {
    if (!top) endNativeSearch();
  }, [top]);
  useEffect(() => (nativeBarAvailable() ? onBarSearch() : undefined), []);
  useEffect(() => {
    if (nativeOn && top) setBarCompact(compact);
  }, [nativeOn, top, compact]);

  useEffect(() => {
    initNative(dark);
  }, [dark]);

  useEffect(() => {
    let off: (() => void) | undefined;
    bindAndroidBack(() => {
      if (window.location.hash && window.location.hash !== '#/') {
        nav(-1);
        return true;
      }
      return false;
    }).then((f) => (off = f));
    return () => off?.();
  }, [nav]);

  // "+": privato o azienda, poi cliente nuovo o che torna (NewJobFlow)
  const [newOpen, setNewOpen] = useState(false);
  const openNew = useCallback(() => {
    haptic('light');
    setNewOpen(true);
  }, []);
  useEffect(() => {
    if (!nativeBarAvailable()) return;
    return onBarSelect((id) => {
      if (id === 'new') openNew();
      else if (id.startsWith('/')) {
        // toccare la sezione in cui sei riporta in cima, come nelle app di sistema
        const cur = (window.location.hash.replace(/^#/, '') || '/').split('?')[0];
        if (id === cur) window.scrollTo({ top: 0, behavior: 'smooth' });
        else nav(id);
      } else pageRef.current?.find((a) => a.id === id)?.onPress();
    });
  }, [nav, openNew]);

  useEffect(() => {
    window.addEventListener('ro:new-job', openNew);
    return () => window.removeEventListener('ro:new-job', openNew);
  }, [openNew]);

  // scorciatoie da tastiera: ⌘K o / cerca, N nuova accettazione, Esc chiude la scheda aperta
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (overlayOpen()) return;
        focusSearch();
        return;
      }
      if (mod || typing() || overlayOpen()) return;
      if (e.key === '/') {
        e.preventDefault();
        focusSearch();
      } else if (e.key.toLowerCase() === 'n' && !e.shiftKey) {
        e.preventDefault();
        if (loc.pathname !== '/nuova') openNew();
      } else if (e.key === 'Escape' && /^\/job\/[^/]+$/.test(loc.pathname)) {
        nav('/schede');
      }
    };
    const focusSearch = () => {
      const el = document.getElementById('search-jobs') as HTMLInputElement | null;
      if (el && el.offsetParent) {
        el.focus();
        el.select();
      } else nav('/schede?cerca=1');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [loc.pathname, nav, openNew]);

  return (
    <div className="min-h-dvh lg:flex">
      {/* copre l'area della barra di stato del telefono mentre si scorre */}
      {!glass && <div aria-hidden="true" className="pointer-events-none fixed inset-x-0 top-0 z-[45] h-[env(safe-area-inset-top,0px)] bg-bg" />}
      {glass && !wide && <div aria-hidden="true" className="edge-top transition-opacity duration-300" style={{ opacity: scrolled ? 1 : 0 }} />}
      {wide && (
        <aside className="safe-top sticky top-0 z-40 flex h-dvh w-[76px] shrink-0 flex-col items-center border-r border-line bg-surface px-3 pb-4 xl:w-[248px] xl:items-stretch xl:px-4 xl:pb-5">
          <Link to={staff ? '/schede' : '/'} aria-label="Ponte" className="flex items-center gap-2.5 pt-5 pb-6 text-ink xl:pt-6 xl:pb-7 xl:pl-1">
            <PonteIcon size={desk ? 34 : 38} />
            {desk && <PonteWordmark height={22} />}
          </Link>
          <button
            type="button"
            onClick={openNew}
            title="Nuova accettazione (N)"
            aria-label="Nuova accettazione"
            className="press group mb-5 flex size-12 items-center justify-center gap-2 rounded-[14px] bg-accent font-semibold text-on-accent shadow-[var(--shadow-accent)] hover:brightness-[1.06] xl:h-12 xl:w-auto"
          >
            <Plus size={20} strokeWidth={2.6} />
            {desk && (
              <>
                Nuova accettazione
                <span className="ml-1 grid h-[22px] min-w-[22px] place-items-center rounded-[6px] bg-black/10 px-1.5 text-[0.75rem] font-bold">N</span>
              </>
            )}
          </button>
          <nav className="flex w-full flex-col gap-1" aria-label="Sezioni">
            {sections.map(({ to, label, icon: Icon, end }) => {
              const n = to === '/schede' ? counts.shop : to === '/mensile' ? counts.invoice : 0;
              return (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  title={desk ? undefined : label}
                  aria-label={desk ? undefined : n ? `${label}, ${n}` : label}
                  className={({ isActive }) =>
                    `press relative flex h-11 items-center gap-3 rounded-[12px] text-[0.9688rem] font-medium max-xl:justify-center xl:px-3 ${
                      isActive ? 'bg-surface-2 text-ink' : 'text-ink-2 hover:bg-surface-2 hover:text-ink'
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      {isActive && <span aria-hidden="true" className="absolute top-2.5 bottom-2.5 -left-3 w-[3px] rounded-r-full bg-accent xl:-left-4" />}
                      <Icon size={desk ? 20 : 22} strokeWidth={isActive ? 2.3 : 2} className={isActive ? 'text-accent-ink' : ''} />
                      {desk && <span className="flex-1">{label}</span>}
                      {n > 0 &&
                        (desk ? (
                          <span className="tnum rounded-full bg-surface-3 px-2 py-0.5 text-[0.7812rem] font-semibold text-ink-2">{n}</span>
                        ) : (
                          <span className="tnum absolute top-0.5 right-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-accent px-1 text-[0.6875rem] font-bold text-on-accent">
                            {n}
                          </span>
                        ))}
                    </>
                  )}
                </NavLink>
              );
            })}
          </nav>
          <div className="mt-auto w-full border-t border-line pt-4">{desk ? <ShopBadge align="left" /> : <ShopDot />}</div>
        </aside>
      )}

      <div className="min-w-0 flex-1">
        <Outlet />
      </div>

      {!wide && top && nativeOn && <div aria-hidden="true" className="edge-bottom" />}

      {!wide && top && glass && !nativeOn && (
        <>
          <div aria-hidden="true" className="edge-bottom" />
          <nav aria-label="Sezioni" className="pointer-events-none fixed inset-x-0 bottom-0 z-40">
            <div className="mx-auto flex max-w-[560px] items-end gap-2.5 px-3.5 pb-[calc(env(safe-area-inset-bottom,0px)+8px)]">
              <motion.div layout transition={SPRING} className={`glass pointer-events-auto flex flex-1 items-stretch rounded-full p-1 ${compact ? 'h-[52px]' : 'h-[62px]'}`}>
                {sections.map((n) => (
                  <GlassTab key={n.to} {...n} compact={compact} />
                ))}
              </motion.div>
              <motion.button
                layout
                transition={SPRING}
                type="button"
                aria-label="Nuova accettazione"
                onClick={openNew}
                className={`glass glass-tint press pointer-events-auto grid shrink-0 place-items-center rounded-full ${compact ? 'size-[52px]' : 'size-[62px]'}`}
              >
                <Plus size={compact ? 24 : 27} strokeWidth={2.5} />
              </motion.button>
            </div>
          </nav>
        </>
      )}

      {!wide && top && !glass && !nativeOn && (
        <nav aria-label="Sezioni" className="glass safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-line">
          <div className="mx-auto grid h-[68px] max-w-[560px] items-center px-1" style={{ gridTemplateColumns: `repeat(${sections.length + 1}, minmax(0, 1fr))` }}>
            {sections.map((n) => (
              <TabLink key={n.to} {...n} />
            ))}
            <div className="flex justify-center">
              <button
                type="button"
                aria-label="Nuova accettazione"
                onClick={openNew}
                className="press grid size-12 place-items-center rounded-full bg-accent text-on-accent shadow-[var(--shadow-accent)]"
              >
                <Plus size={24} strokeWidth={2.6} />
              </button>
            </div>
          </div>
        </nav>
      )}

      <NewJobFlow open={newOpen} onOpenChange={setNewOpen} />
      <Toaster
        position={wide ? 'top-right' : 'top-center'}
        offset={wide ? 24 : 'calc(env(safe-area-inset-top, 0px) + 12px)'}
        mobileOffset={{
          top: 'calc(env(safe-area-inset-top, 0px) + 10px)',
          left: 12,
          right: 12,
        }}
        theme={dark ? 'dark' : 'light'}
        toastOptions={{
          classNames: {
            toast: `!font-sans !text-[0.9375rem] !gap-2.5 !text-ink ${
              glass
                ? '!rounded-[22px] !border-white/30 !bg-[var(--glass-fill-thick)] backdrop-blur-2xl backdrop-saturate-150 !shadow-[var(--glass-shadow)]'
                : '!rounded-[16px] !border-line !bg-surface !shadow-[var(--shadow-2)]'
            }`,
            description: '!text-ink-2',
            actionButton: '!bg-accent !text-on-accent !rounded-[10px] !h-8 !px-3 !font-semibold !text-[0.875rem]',
          },
        }}
      />
    </div>
  );
}

/** Scheda della barra in vetro: la "lente" più chiara scorre sotto la voce attiva. */
function GlassTab({ to, label, icon: Icon, end, compact }: (typeof NAV)[number] & { compact: boolean }) {
  return (
    <NavLink to={to} end={end} className="press relative flex flex-1 flex-col items-center justify-center gap-0.5 rounded-full">
      {({ isActive }) => (
        <>
          {isActive && (
            <motion.span
              layoutId="glass-tab-lens"
              className="absolute inset-0 rounded-full bg-[var(--glass-lens)] shadow-[inset_0_0.5px_0_rgba(255,255,255,.7),0_1px_3px_rgba(0,0,0,.08)]"
              transition={SPRING_FAST}
            />
          )}
          <Icon size={compact ? 21 : 22} strokeWidth={isActive ? 2.3 : 1.9} className={`relative ${isActive ? 'text-accent-ink' : 'text-ink'}`} />
          {!compact && <span className={`relative text-[0.6562rem] leading-none ${isActive ? 'font-semibold text-accent-ink' : 'font-medium text-ink'}`}>{label}</span>}
        </>
      )}
    </NavLink>
  );
}

function TabLink({ to, label, icon: Icon, end }: (typeof NAV)[number]) {
  return (
    <NavLink to={to} end={end} className="press flex flex-col items-center justify-center gap-1">
      {({ isActive }) => (
        <>
          <span className={`grid h-8 w-14 place-items-center rounded-full transition-colors ${isActive ? 'bg-accent-soft text-accent-ink' : 'text-ink-2'}`}>
            <Icon size={22} strokeWidth={isActive ? 2.3 : 1.9} />
          </span>
          <span className={`text-[0.7188rem] leading-none ${isActive ? 'font-semibold text-ink' : 'font-medium text-ink-2'}`}>{label}</span>
        </>
      )}
    </NavLink>
  );
}
