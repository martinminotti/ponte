import { useEffect, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronLeft, ChevronRight, Delete, Gauge, Lock, Wrench } from 'lucide-react';
import type { Settings } from '@/domain/types';
import { saveSettings } from '@/data/repo';
import { haptic } from '@/platform/native';
import { configureBar, nativeBarAvailable } from '@/platform/nativeBar';
import { PonteIcon, PonteWordmark } from '@/ui/Brand';
import { Button } from '@/ui/controls';
import { SPRING } from '@/ui/motion';

/**
 * Benvenuto all'apertura dell'app: chi la sta usando?
 * Titolare: vede tutto, compresa la giornata (Oggi). Se ha impostato un PIN, lo chiede.
 * Dipendente: sceglie il suo nome e va dritto alle schede; la manodopera che segna porta il suo nome.
 */
export function Welcome({ s, onDone }: { s: Settings; onDone: (role: 'admin' | 'staff') => void }) {
  const [step, setStep] = useState<'who' | 'staff' | 'pin'>('who');
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [wrong, setWrong] = useState(false);

  // la barra nativa di iOS (che sta sopra la pagina) non deve comparire sul benvenuto
  useEffect(() => {
    if (nativeBarAvailable()) configureBar({ mode: 'hidden' }, document.documentElement.dataset.theme === 'dark');
  }, []);

  const enterAdmin = async () => {
    await saveSettings({ role: 'admin' });
    haptic('success');
    onDone('admin');
  };
  const enterStaff = async (n: string) => {
    const nm = n.trim().replace(/\s+/g, ' ');
    if (!nm) return;
    const known = (s.workers || []).find((w) => w.toLowerCase() === nm.toLowerCase());
    await saveSettings({ role: 'staff', staffName: known || nm, ...(known ? {} : { workers: [...(s.workers || []), nm] }) });
    haptic('success');
    onDone('staff');
  };
  const press = (d: string) => {
    if (pin.length >= 4) return;
    const p = pin + d;
    setPin(p);
    setWrong(false);
    if (p.length === 4) {
      if (p === s.adminPin) setTimeout(enterAdmin, 120);
      else {
        haptic('warning');
        setWrong(true);
        setTimeout(() => setPin(''), 450);
      }
    }
  };

  const last = s.role === 'staff' && s.staffName ? s.staffName : null;

  return (
    <div className="flex min-h-dvh flex-col bg-bg px-5 pt-[calc(env(safe-area-inset-top,0px)+40px)] pb-[calc(env(safe-area-inset-bottom,0px)+24px)]">
      <div className="mx-auto flex w-full max-w-[440px] flex-1 flex-col">
        <div className="flex flex-col items-center text-center">
          <PonteIcon size={72} />
          <PonteWordmark height={30} className="mt-4 text-ink" />
          <p className="mt-3 text-[1rem] text-ink-2">{s.shop ? `Benvenuto in ${s.shop}` : "Il registro dell'officina"}</p>
        </div>

        <div className="relative mt-10 flex-1">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.div
              key={step}
              initial={{ opacity: 0, x: step === 'who' ? -40 : 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: step === 'who' ? -40 : 40 }}
              transition={SPRING}
              className="flex flex-col gap-3"
            >
              {step === 'who' && (
                <>
                  <h1 className="w-wide mb-1 text-center text-[1.5rem] font-semibold text-ink">Chi usa Ponte?</h1>
                  {last && <Tile icon={<Wrench size={24} />} title={`Continua come ${last}`} text="Schede, lavori e accettazioni" onClick={() => enterStaff(last)} accent />}
                  <Tile
                    icon={<Gauge size={24} />}
                    title="Titolare"
                    text="La giornata, gli incassi, le fatture e le impostazioni"
                    onClick={() => (s.adminPin ? setStep('pin') : enterAdmin())}
                    lock={!!s.adminPin}
                    accent={!last}
                  />
                  <Tile icon={<Wrench size={24} />} title={last ? 'Un altro dipendente' : 'Dipendente'} text="Schede, lavori e accettazioni" onClick={() => setStep('staff')} />
                </>
              )}

              {step === 'staff' && (
                <>
                  <Back onClick={() => setStep('who')} />
                  <h1 className="w-wide mb-1 text-[1.5rem] font-semibold text-ink">Chi sei?</h1>
                  {(s.workers || []).length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {s.workers.map((w) => (
                        <button
                          key={w}
                          type="button"
                          onClick={() => enterStaff(w)}
                          className="press h-12 rounded-full bg-surface px-5 text-[1rem] font-semibold text-ink shadow-[var(--shadow-1)] ring-1 ring-line hover:ring-line-strong"
                        >
                          {w}
                        </button>
                      ))}
                    </div>
                  )}
                  <form
                    className="mt-2 flex gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      enterStaff(name);
                    }}
                  >
                    <input
                      className="ctl flex-1"
                      placeholder={(s.workers || []).length ? 'Oppure scrivi il tuo nome' : 'Il tuo nome'}
                      autoComplete="given-name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                    <Button type="submit" variant="primary" disabled={!name.trim()}>
                      Entra
                    </Button>
                  </form>
                </>
              )}

              {step === 'pin' && (
                <>
                  <Back
                    onClick={() => {
                      setStep('who');
                      setPin('');
                    }}
                  />
                  <h1 className="w-wide text-center text-[1.5rem] font-semibold text-ink">PIN del titolare</h1>
                  <motion.div
                    animate={wrong ? { x: [0, -12, 10, -6, 4, 0] } : { x: 0 }}
                    transition={{ duration: 0.4 }}
                    className="my-3 flex justify-center gap-4"
                    aria-live="polite"
                    aria-label={`${pin.length} cifre su 4`}
                  >
                    {[0, 1, 2, 3].map((i) => (
                      <span key={i} className={`size-3.5 rounded-full transition-colors ${i < pin.length ? (wrong ? 'bg-danger' : 'bg-ink') : 'bg-surface-3'}`} />
                    ))}
                  </motion.div>
                  <div className="mx-auto grid w-full max-w-[300px] grid-cols-3 gap-3">
                    {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
                      <Key key={d} onClick={() => press(d)}>
                        {d}
                      </Key>
                    ))}
                    <span />
                    <Key onClick={() => press('0')}>0</Key>
                    <Key onClick={() => setPin((p) => p.slice(0, -1))} label="Cancella">
                      <Delete size={22} />
                    </Key>
                  </div>
                  {wrong && <p className="text-center text-[0.9375rem] font-medium text-danger">PIN sbagliato</p>}
                </>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

function Tile({ icon, title, text, onClick, lock, accent }: { icon: ReactNode; title: string; text: string; onClick: () => void; lock?: boolean; accent?: boolean }) {
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

function Back({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="press -ml-1 flex h-10 items-center gap-0.5 self-start rounded-full pr-3 text-[0.9375rem] font-medium text-accent-ink">
      <ChevronLeft size={20} /> Indietro
    </button>
  );
}

function Key({ children, onClick, label }: { children: ReactNode; onClick: () => void; label?: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="press grid h-16 place-items-center rounded-full bg-surface text-[1.625rem] font-medium text-ink shadow-[var(--shadow-1)] ring-1 ring-line"
    >
      {children}
    </button>
  );
}
