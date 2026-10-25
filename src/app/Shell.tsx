import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { Building2, CarFront, Plus, ReceiptText, Settings2, User } from 'lucide-react';
import { Toaster } from 'sonner';
import { useSettings, useThemeSync, useWide } from './hooks';
import { Sheet } from '@/ui/Sheet';
import { bindAndroidBack, haptic, initNative } from '@/platform/native';

const NAV = [
  { to: '/', label: 'Schede', icon: CarFront, end: true },
  { to: '/mensile', label: 'Fatture ditte', icon: ReceiptText, end: false },
  { to: '/impostazioni', label: 'Officina', icon: Settings2, end: false },
];

export function BrandMark({ compact }: { compact?: boolean }) {
  const s = useSettings();
  return (
    <div className="flex min-w-0 items-center gap-3">
      {s.logo ? (
        <span className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-[12px] bg-white p-1 ring-1 ring-line">
          <img src={s.logo} alt="" className="max-h-full max-w-full object-contain" />
        </span>
      ) : (
        <span className="grid size-11 shrink-0 place-items-center rounded-[12px] bg-accent text-on-accent">
          <CarFront size={22} strokeWidth={2.2} />
        </span>
      )}
      {!compact && (
        <div className="min-w-0">
          <p className="w-wide truncate text-[17px] leading-tight font-semibold text-ink">{s.shop || 'Registro Officina'}</p>
          <p className="truncate text-[13px] text-ink-3">{s.shop ? 'Registro Officina' : 'Imposta il nome in Officina'}</p>
        </div>
      )}
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

  // la barra in basso compare solo sulle schermate principali
  const top = loc.pathname === '/' || loc.pathname === '/mensile' || loc.pathname === '/impostazioni';

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

  return (
    <div className="min-h-dvh lg:flex">
      {/* copre l'area della barra di stato del telefono mentre si scorre */}
      <div aria-hidden="true" className="pointer-events-none fixed inset-x-0 top-0 z-[45] h-[env(safe-area-inset-top,0px)] bg-bg" />
      {wide && (
        <aside className="safe-top sticky top-0 flex h-dvh w-[248px] shrink-0 flex-col border-r border-line bg-surface px-4 pb-5">
          <div className="pt-5 pb-6">
            <BrandMark />
          </div>
          <button
            type="button"
            onClick={() => setNewOpen(true)}
            className="press mb-5 flex h-12 items-center justify-center gap-2 rounded-[14px] bg-accent font-semibold text-on-accent shadow-[0_6px_16px_-8px_var(--accent)]"
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
        </aside>
      )}

      <div className="min-w-0 flex-1">
        <Outlet />
      </div>

      {!wide && top && (
        <nav
          aria-label="Sezioni"
          className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-line bg-[color-mix(in_srgb,var(--surface)_88%,transparent)] backdrop-blur-xl backdrop-saturate-150"
        >
          <div className="mx-auto grid h-[68px] max-w-[560px] grid-cols-4 items-center px-2">
            {NAV.slice(0, 2).map((n) => (
              <TabLink key={n.to} {...n} />
            ))}
            <TabLink {...NAV[2]} />
            <div className="flex justify-center">
              <button
                type="button"
                aria-label="Nuova accettazione"
                onClick={() => {
                  haptic('medium');
                  setNewOpen(true);
                }}
                className="press flex h-12 items-center gap-1.5 rounded-full bg-accent pr-4 pl-3.5 font-semibold text-on-accent shadow-[0_8px_20px_-8px_var(--accent)]"
              >
                <Plus size={22} strokeWidth={2.6} />
                <span className="text-[15px]">Nuova</span>
              </button>
            </div>
          </div>
        </nav>
      )}

      <NewJobSheet open={newOpen} onOpenChange={setNewOpen} />
      <Toaster
        position={wide ? 'top-right' : 'top-center'}
        offset={wide ? 24 : 'calc(env(safe-area-inset-top, 0px) + 12px)'}
        mobileOffset={{ top: 'calc(env(safe-area-inset-top, 0px) + 10px)' }}
        theme={dark ? 'dark' : 'light'}
        toastOptions={{
          classNames: {
            toast: '!rounded-[16px] !border-line !bg-surface !text-ink !shadow-[var(--shadow-2)] !font-sans !text-[15px] !gap-2.5',
            description: '!text-ink-2',
            actionButton: '!bg-accent !text-on-accent !rounded-[10px] !h-8 !px-3 !font-semibold !text-[14px]',
          },
        }}
      />
    </div>
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
