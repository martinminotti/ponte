import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { Building2, CarFront, Gauge, Plus, ReceiptText, Settings2, Store, User } from 'lucide-react';
import { motion } from 'motion/react';
import { PonteIcon, PonteWordmark } from '@/ui/Brand';
import { Toaster } from 'sonner';
import { useGlass, useScrolledDown, useScrolledPast, useSettings, useThemeSync, useWide } from './hooks';
import { Sheet } from '@/ui/Sheet';
import { bindAndroidBack, haptic, initNative } from '@/platform/native';

const NAV = [
  { to: '/', label: 'Oggi', icon: Gauge, end: true },
  { to: '/schede', label: 'Schede', icon: CarFront, end: false },
  { to: '/mensile', label: 'Fatture', icon: ReceiptText, end: false },
  { to: '/impostazioni', label: 'Officina', icon: Settings2, end: false },
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
        <span className="block truncate text-[14.5px] leading-tight font-semibold text-ink">{s.shop || 'La tua officina'}</span>
        <span className="block truncate text-[12.5px] leading-tight text-ink-3">{s.shop ? 'Officina' : 'Imposta nome e logo'}</span>
      </span>
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

export function NewJobSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const nav = useNavigate();
  const go = (cl: 'privato' | 'azienda') => {
    onOpenChange(false);
    haptic('medium');
    nav(`/nuova?cl=${cl}`);
  };
  const opt = (cl: 'privato' | 'azienda', Icon: typeof User, t: string, d: string) => (
    <button type="button" onClick={() => go(cl)} className="press flex w-full items-center gap-4 rounded-[18px] bg-surface-2 p-4 text-left hover:bg-surface-3">
      <span className="grid size-12 shrink-0 place-items-center rounded-[14px] bg-accent text-on-accent">
        <Icon size={24} strokeWidth={2} />
      </span>
      <span className="min-w-0">
        <span className="w-wide block text-[17px] font-semibold text-ink">{t}</span>
        <span className="block text-[14.5px] text-ink-2">{d}</span>
      </span>
    </button>
  );
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Nuova accettazione" description="Chi porta il veicolo?">
      <div className="flex flex-col gap-2.5">
        {opt('privato', User, 'Privato', 'Conto lavori, nessuna fattura')}
        {opt('azienda', Building2, 'Azienda', 'Dati per la fattura, IVA, fattura mensile')}
      </div>
    </Sheet>
  );
}

/** Contenitore dell'app: tema, barra di navigazione (in basso su telefono, laterale su schermi larghi), notifiche. */
export function Shell() {
  const s = useSettings();
  const dark = useThemeSync(s);
  const wide = useWide();
  const loc = useLocation();
  const nav = useNavigate();
  const [newOpen, setNewOpen] = useState(false);

  const glass = useGlass();
  const compact = useScrolledDown();
  const scrolled = useScrolledPast();

  // la barra in basso compare solo sulle schermate principali
  const top = ['/', '/schede', '/mensile', '/impostazioni'].includes(loc.pathname);

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

  useEffect(() => {
    const open = () => setNewOpen(true);
    window.addEventListener('ro:new-job', open);
    return () => window.removeEventListener('ro:new-job', open);
  }, []);

  const openNew = () => {
    haptic('medium');
    setNewOpen(true);
  };

  return (
    <div className="min-h-dvh lg:flex">
      {/* copre l'area della barra di stato del telefono mentre si scorre */}
      {!glass && <div aria-hidden="true" className="pointer-events-none fixed inset-x-0 top-0 z-[45] h-[env(safe-area-inset-top,0px)] bg-bg" />}
      {glass && !wide && <div aria-hidden="true" className="edge-top transition-opacity duration-300" style={{ opacity: scrolled ? 1 : 0 }} />}
      {wide && (
        <aside className="safe-top sticky top-0 flex h-dvh w-[248px] shrink-0 flex-col border-r border-line bg-surface px-4 pb-5">
          <div className="flex items-center gap-2.5 pt-6 pb-7 pl-1 text-ink">
            <PonteIcon size={34} />
            <PonteWordmark height={22} />
          </div>
          <button
            type="button"
            onClick={() => setNewOpen(true)}
            className="press mb-5 flex h-12 items-center justify-center gap-2 rounded-[14px] bg-accent font-semibold text-on-accent shadow-[var(--shadow-accent)]"
          >
            <Plus size={20} strokeWidth={2.6} /> Nuova accettazione
          </button>
          <nav className="flex flex-col gap-1" aria-label="Sezioni">
            {NAV.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  `press flex h-11 items-center gap-3 rounded-[12px] px-3 text-[15.5px] font-medium ${isActive ? 'bg-surface-2 text-ink' : 'text-ink-2 hover:bg-surface-2 hover:text-ink'}`
                }
              >
                <Icon size={20} strokeWidth={2} /> {label}
              </NavLink>
            ))}
          </nav>
          <div className="mt-auto border-t border-line pt-4">
            <ShopBadge align="left" />
          </div>
        </aside>
      )}

      <div className="min-w-0 flex-1">
        <Outlet />
      </div>

      {!wide && top && glass && (
        <>
          <div aria-hidden="true" className="edge-bottom" />
          <nav aria-label="Sezioni" className="pointer-events-none fixed inset-x-0 bottom-0 z-40">
            <div className="mx-auto flex max-w-[560px] items-end gap-2.5 px-3.5 pb-[calc(env(safe-area-inset-bottom,0px)+8px)]">
              <motion.div
                layout
                transition={{ type: 'spring', stiffness: 420, damping: 36 }}
                className={`glass pointer-events-auto flex flex-1 items-stretch rounded-full p-1 ${compact ? 'h-[52px]' : 'h-[62px]'}`}
              >
                {NAV.map((n) => (
                  <GlassTab key={n.to} {...n} compact={compact} />
                ))}
              </motion.div>
              <motion.button
                layout
                transition={{ type: 'spring', stiffness: 420, damping: 36 }}
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

      {!wide && top && !glass && (
        <nav aria-label="Sezioni" className="glass safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-line">
          <div className="mx-auto grid h-[68px] max-w-[560px] grid-cols-5 items-center px-1">
            {NAV.map((n) => (
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

      <NewJobSheet open={newOpen} onOpenChange={setNewOpen} />
      <Toaster
        position={wide ? 'top-right' : 'top-center'}
        offset={wide ? 24 : 'calc(env(safe-area-inset-top, 0px) + 12px)'}
        mobileOffset={{ top: 'calc(env(safe-area-inset-top, 0px) + 10px)', left: 12, right: 12 }}
        theme={dark ? 'dark' : 'light'}
        toastOptions={{
          classNames: {
            toast: `!font-sans !text-[15px] !gap-2.5 !text-ink ${glass ? '!rounded-[22px] !border-white/30 !bg-[var(--glass-fill-thick)] backdrop-blur-2xl backdrop-saturate-150 !shadow-[var(--glass-shadow)]' : '!rounded-[16px] !border-line !bg-surface !shadow-[var(--shadow-2)]'}`,
            description: '!text-ink-2',
            actionButton: '!bg-accent !text-on-accent !rounded-[10px] !h-8 !px-3 !font-semibold !text-[14px]',
          },
        }}
      />
    </div>
  );
}

/** Scheda della barra in vetro: la "lente" più chiara scorre sotto la voce attiva. */
function GlassTab({ to, label, icon: Icon, end, compact }: (typeof NAV)[number] & { compact: boolean }) {
  return (
    <NavLink to={to} end={end} className="press relative flex flex-1 flex-col items-center justify-center gap-0.5 rounded-full" onClick={() => haptic('light')}>
      {({ isActive }) => (
        <>
          {isActive && (
            <motion.span
              layoutId="glass-tab-lens"
              className="absolute inset-0 rounded-full bg-[var(--glass-lens)] shadow-[inset_0_0.5px_0_rgba(255,255,255,.7),0_1px_3px_rgba(0,0,0,.08)]"
              transition={{ type: 'spring', stiffness: 480, damping: 38 }}
            />
          )}
          <Icon size={compact ? 21 : 22} strokeWidth={isActive ? 2.3 : 1.9} className={`relative ${isActive ? 'text-accent-ink' : 'text-ink'}`} />
          {!compact && <span className={`relative text-[10.5px] leading-none ${isActive ? 'font-semibold text-accent-ink' : 'font-medium text-ink'}`}>{label}</span>}
        </>
      )}
    </NavLink>
  );
}

function TabLink({ to, label, icon: Icon, end }: (typeof NAV)[number]) {
  return (
    <NavLink to={to} end={end} className="press flex flex-col items-center justify-center gap-1" onClick={() => haptic('light')}>
      {({ isActive }) => (
        <>
          <span className={`grid h-8 w-14 place-items-center rounded-full transition-colors ${isActive ? 'bg-accent-soft text-accent-ink' : 'text-ink-2'}`}>
            <Icon size={22} strokeWidth={isActive ? 2.3 : 1.9} />
          </span>
          <span className={`text-[11.5px] leading-none ${isActive ? 'font-semibold text-ink' : 'font-medium text-ink-2'}`}>{label}</span>
        </>
      )}
    </NavLink>
  );
}
