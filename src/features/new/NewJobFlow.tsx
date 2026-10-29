import { useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { AnimatePresence, motion } from 'motion/react';
import { Building2, ChevronLeft, ChevronRight, History, Mic, Phone, Plus, Search, User, UserPlus } from 'lucide-react';
import { useJobs } from '@/app/hooks';
import { customers, matchCustomer, type Customer, type KnownVehicle } from '@/domain/customers';
import { fmtDate, fmtPlate, norm } from '@/domain/format';
import { companies, type CompanyGroup } from '@/domain/monthly';
import type { ClientType, Job } from '@/domain/types';
import { haptic } from '@/platform/native';
import { Plate } from '@/ui/Plate';
import { Sheet } from '@/ui/Sheet';
import { SPRING } from '@/ui/motion';
import { useCanListen } from '@/features/voice/useCanListen';

type Step = { k: 'tipo' } | { k: 'chi'; cl: ClientType } | { k: 'privati' } | { k: 'ditte' };

/**
 * Il + apre tre passi brevi: chi porta il veicolo (privato o azienda), poi se è un cliente nuovo o uno che torna,
 * poi chi è. Un cliente che torna non riscrive niente: si sceglie e il modulo parte già compilato.
 * Per una ditta che c'è già si va al suo conto lavori, dove si segna il lavoro con la targa del mezzo.
 */
export function NewJobFlow({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const nav = useNavigate();
  const jobs = useJobs();
  const [stack, setStack] = useState<Step[]>([{ k: 'tipo' }]);
  const [dir, setDir] = useState(1);
  const [q, setQ] = useState('');
  const step = stack[stack.length - 1];
  const canListen = useCanListen();

  const reset = () => {
    setStack([{ k: 'tipo' }]);
    setQ('');
  };
  const change = (o: boolean) => {
    onOpenChange(o);
    if (!o) setTimeout(reset, 250);
  };
  const push = (s: Step) => {
    setDir(1);
    setQ('');
    setStack((x) => [...x, s]);
  };
  const back = () => {
    setDir(-1);
    setStack((x) => (x.length > 1 ? x.slice(0, -1) : x));
  };
  const go = (path: string, state?: unknown) => {
    haptic('medium');
    change(false);
    nav(path, state ? { state } : undefined);
  };
  /** A voce: la schermata a voce sale sopra il foglio e lo copre; sotto si cambia pagina senza animazioni,
   *  e il foglio si chiude solo quando non si vede più. Un movimento solo, dal basso verso l'alto. */
  const goVoice = () => {
    haptic('medium');
    nav('/nuova?voce=1', { viewTransition: false });
    setTimeout(() => change(false), 650);
  };

  const people = useMemo(() => customers(jobs || []), [jobs]);
  const firms = useMemo(() => companies(jobs || []), [jobs]);

  const titles: Record<Step['k'], [string, string]> = {
    tipo: ['Nuova accettazione', 'Chi porta il veicolo?'],
    chi: ['Nuova accettazione', step.k === 'chi' && step.cl === 'azienda' ? 'È una ditta nuova o già cliente?' : 'È un cliente nuovo o uno che torna?'],
    privati: ['Cliente che torna', 'Cerca per nome, telefono o targa'],
    ditte: ['Ditta già cliente', 'Il lavoro va nel suo conto del mese'],
  };

  return (
    <Sheet open={open} onOpenChange={change} title={titles[step.k][0]} description={titles[step.k][1]} tall={step.k === 'privati' || step.k === 'ditte'}>
      <div className="relative overflow-hidden">
        <AnimatePresence initial={false} mode="popLayout" custom={dir}>
          <motion.div
            key={stack.length + step.k}
            custom={dir}
            variants={{
              in: (d: number) => ({ x: d > 0 ? '40%' : '-40%', opacity: 0 }),
              on: { x: 0, opacity: 1 },
              out: (d: number) => ({ x: d > 0 ? '-40%' : '40%', opacity: 0 }),
            }}
            initial="in"
            animate="on"
            exit="out"
            transition={SPRING}
            className="flex flex-col gap-2.5"
          >
            {stack.length > 1 && (
              <button type="button" onClick={back} className="press -mt-1 mb-0.5 flex h-9 items-center gap-0.5 self-start rounded-full pr-3 text-[0.9375rem] font-medium text-accent-ink">
                <ChevronLeft size={20} /> Indietro
              </button>
            )}

            {step.k === 'tipo' && (
              <>
                {canListen && (
                  <>
                    <button
                      type="button"
                      onClick={goVoice}
                      className="press flex w-full items-center gap-4 rounded-[20px] bg-accent p-4 text-left text-on-accent shadow-[var(--shadow-accent)] hover:brightness-[1.04]"
                    >
                      <span className="grid size-12 shrink-0 place-items-center rounded-full bg-on-accent/12">
                        <Mic size={26} strokeWidth={2.2} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="w-wide block text-[1.125rem] font-semibold">A voce</span>
                        <span className="block text-[0.9062rem] opacity-80">Parla come al banco: compilo io la scheda</span>
                      </span>
                      <ChevronRight size={20} className="shrink-0 opacity-70" />
                    </button>
                    <p className="mt-1.5 px-1 text-[0.8438rem] font-medium text-ink-3">Oppure scrivi tu: chi porta il veicolo?</p>
                  </>
                )}
                <Choice icon={<User size={24} strokeWidth={2} />} title="Privato" text="Conto lavori, nessuna fattura" onClick={() => push({ k: 'chi', cl: 'privato' })} />
                <Choice icon={<Building2 size={24} strokeWidth={2} />} title="Azienda" text="Dati per la fattura, IVA, conto di fine mese" onClick={() => push({ k: 'chi', cl: 'azienda' })} />
              </>
            )}

            {step.k === 'chi' && step.cl === 'privato' && (
              <>
                <Choice icon={<UserPlus size={24} strokeWidth={2} />} title="Cliente nuovo" text="Prima volta in officina" onClick={() => go('/nuova?cl=privato')} />
                <Choice
                  icon={<History size={24} strokeWidth={2} />}
                  title="Cliente che torna"
                  text={people.length ? `${people.length} ${people.length === 1 ? 'cliente' : 'clienti'} in archivio` : 'Nessun cliente in archivio, per ora'}
                  disabled={!people.length}
                  onClick={() => push({ k: 'privati' })}
                />
              </>
            )}

            {step.k === 'chi' && step.cl === 'azienda' && (
              <>
                <Choice icon={<Plus size={24} strokeWidth={2.2} />} title="Ditta nuova" text="Ragione sociale, partita IVA e veicolo" onClick={() => go('/nuova?cl=azienda')} />
                <Choice
                  icon={<Building2 size={24} strokeWidth={2} />}
                  title="Ditta già cliente"
                  text={firms.length ? 'Segna il lavoro o l’acquisto con la targa del mezzo' : 'Nessuna ditta in archivio, per ora'}
                  disabled={!firms.length}
                  onClick={() => push({ k: 'ditte' })}
                />
              </>
            )}

            {step.k === 'privati' && (
              <>
                <Finder value={q} onChange={setQ} placeholder="Nome, telefono o targa" />
                <ul className="flex flex-col gap-2">
                  {people
                    .filter((c) => matchCustomer(c, q))
                    .slice(0, 30)
                    .map((c) => (
                      <CustomerRow key={c.key} c={c} onPick={(v) => go('/nuova?cl=privato', { prefill: prefillPerson(c, v) })} />
                    ))}
                </ul>
              </>
            )}

            {step.k === 'ditte' && (
              <>
                {firms.length > 5 && <Finder value={q} onChange={setQ} placeholder="Ragione sociale o partita IVA" />}
                <ul className="flex flex-col gap-1">
                  {firms
                    .filter((c) => !q || norm(c.name + ' ' + c.company.vat).includes(norm(q)))
                    .map((c) => (
                      <li key={c.key}>
                        <FirmRow c={c} onPick={() => go(`/ditta/${encodeURIComponent(c.key)}`)} />
                      </li>
                    ))}
                </ul>
              </>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </Sheet>
  );
}

function prefillPerson(c: Customer, v?: KnownVehicle): Partial<Job> {
  const base: Partial<Job> = { client: 'privato', owner: c.name, phone: c.phone, wa: c.wa };
  return v ? { ...base, plate: v.plate, plateCountry: v.plateCountry, vin: v.vin, make: v.make, model: v.model } : base;
}

function Choice({ icon, title, text, onClick, disabled }: { icon: ReactNode; title: string; text: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" disabled={disabled} onClick={onClick} className="press flex w-full items-center gap-4 rounded-[18px] bg-surface-2 p-4 text-left hover:bg-surface-3 disabled:opacity-45">
      <span className="grid size-12 shrink-0 place-items-center rounded-[14px] bg-accent text-on-accent">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="w-wide block text-[1.0625rem] font-semibold text-ink">{title}</span>
        <span className="block text-[0.9062rem] text-ink-2">{text}</span>
      </span>
      <ChevronRight size={20} className="shrink-0 text-ink-3" />
    </button>
  );
}

function Finder({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <label className="relative block">
      <span className="sr-only">Cerca</span>
      <Search size={18} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-ink-3" />
      <input className="ctl pl-10" autoComplete="off" spellCheck={false} placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

function CustomerRow({ c, onPick }: { c: Customer; onPick: (v?: KnownVehicle) => void }) {
  return (
    <li className="rounded-[18px] bg-surface-2 p-3">
      <div className="flex items-center justify-between gap-3 px-1">
        <span className="min-w-0">
          <span className="w-semi block truncate text-[1rem] font-semibold text-ink">{c.name || 'Cliente senza nome'}</span>
          <span className="flex items-center gap-1.5 text-[0.8438rem] text-ink-3">
            {c.phone && (
              <>
                <Phone size={13} /> <span className="tnum">{c.phone}</span>
                <span aria-hidden="true">·</span>
              </>
            )}
            ultima visita {fmtDate(c.lastAt)}
          </span>
        </span>
      </div>
      <div className="mt-2.5 flex flex-col gap-1.5">
        {c.vehicles.map((v) => (
          <button
            key={v.plateCountry + v.plate + v.vin}
            type="button"
            onClick={() => onPick(v)}
            className="press flex items-center gap-3 rounded-[14px] bg-surface p-2.5 text-left ring-1 ring-line hover:ring-line-strong"
          >
            <Plate plate={v.plate} country={v.plateCountry} size="sm" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[0.9375rem] font-medium text-ink">{[v.make, v.model].filter(Boolean).join(' ') || fmtPlate(v.plate, v.plateCountry) || 'Veicolo'}</span>
              <span className="block text-[0.8125rem] text-ink-3">
                {v.visits} {v.visits === 1 ? 'visita' : 'visite'}
              </span>
            </span>
            <ChevronRight size={18} className="shrink-0 text-ink-3" />
          </button>
        ))}
        <button type="button" onClick={() => onPick()} className="press flex h-11 items-center gap-2 rounded-[12px] px-2.5 text-[0.9375rem] font-medium text-accent-ink hover:bg-surface-3">
          <Plus size={18} strokeWidth={2.4} /> Un altro veicolo
        </button>
      </div>
    </li>
  );
}

function FirmRow({ c, onPick }: { c: CompanyGroup; onPick: () => void }) {
  return (
    <button type="button" onClick={onPick} className="press flex w-full items-center gap-3 rounded-[16px] p-3 text-left hover:bg-surface-2">
      <span className="grid size-11 shrink-0 place-items-center rounded-[12px] bg-accent-soft text-accent-ink">
        <Building2 size={21} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[1rem] font-semibold text-ink">{c.name}</span>
        <span className="tnum block truncate text-[0.875rem] text-ink-3">{c.company.vat || c.company.cf || 'Ditta'}</span>
      </span>
      <ChevronRight size={20} className="shrink-0 text-ink-3" />
    </button>
  );
}
