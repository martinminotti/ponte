import type { ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Building2, CalendarClock, ChevronRight, Gauge, History, MessageCircleOff, NotebookPen, Phone, User, Wrench } from 'lucide-react';
import type { Draft, FieldKey } from '@/domain/draft';
import { fmtIsoDay } from '@/domain/format';
import { veic } from '@/domain/logic';
import type { Job } from '@/domain/types';
import { Plate } from '@/ui/Plate';
import { Button } from '@/ui/controls';
import { SPRING_FAST } from '@/ui/motion';
import { speakDate } from '@/voice/spoken';
import { PendingPhotos, type Shot } from '@/features/form/parts';

/**
 * La scheda che si compone mentre si parla. Ogni riga compare quando il dato arriva e si illumina
 * per un attimo quando cambia, così si vede a colpo d'occhio cosa ha scritto l'assistente.
 * Toccando una riga si corregge a mano nel modulo.
 */
export function LiveCard({
  d,
  recent,
  recentAt,
  known,
  onUseKnown,
  onDismissKnown,
  onEdit,
  shots,
  onShots,
}: {
  d: Draft;
  recent: FieldKey[];
  recentAt: number;
  known: Job | null;
  onUseKnown: () => void;
  onDismissKnown: () => void;
  onEdit: (f: FieldKey) => void;
  shots?: Shot[];
  onShots?: (l: Shot[]) => void;
}) {
  const az = d.client === 'azienda';
  const hot = (...f: FieldKey[]) => (f.some((x) => recent.includes(x)) ? recentAt : 0);
  const vehicle = [d.make, d.model].filter(Boolean).join(' ');

  return (
    <div className="flex flex-col gap-3">
      <AnimatePresence initial={false}>
        {known && (
          <motion.div
            key="known"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={SPRING_FAST}
            className="flex flex-col gap-3 rounded-[18px] bg-accent-soft p-4"
            role="status"
          >
            <div className="flex items-start gap-3">
              <History size={20} className="mt-0.5 shrink-0 text-accent-ink" />
              <p className="min-w-0 text-[0.9688rem] leading-snug text-ink">
                <span className="font-semibold">Già visto in officina.</span> {knownText(known)}
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="primary" size="sm" onClick={onUseKnown} className="flex-1">
                Usa i suoi dati
              </Button>
              <Button variant="outline" size="sm" onClick={onDismissKnown}>
                È un altro
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <section className="card overflow-hidden" aria-label="Veicolo">
        <button
          type="button"
          data-vf="plate plateCountry make model km vin"
          onClick={() => onEdit('plate')}
          className="press relative isolate flex w-full flex-col items-center gap-2.5 px-4 pt-5 pb-4 text-center hover:bg-surface-2"
        >
          <Flash at={hot('plate', 'plateCountry')} />
          {d.plate ? (
            <Plate plate={d.plate} country={d.plateCountry} size="xl" />
          ) : (
            <span className="grid h-[72px] w-full max-w-[300px] place-items-center rounded-[12px] border-2 border-dashed border-line-strong text-[1.0625rem] font-medium text-ink-3">Targa</span>
          )}
          {vehicle || d.km ? (
            <span className="relative isolate text-[1.0625rem] font-semibold text-ink">
              <Flash at={hot('make', 'model', 'km')} />
              {vehicle || 'Veicolo'}
              {d.km && <span className="tnum font-normal text-ink-2"> · {d.km} km</span>}
            </span>
          ) : (
            <span className="text-[0.9375rem] text-ink-3">Marca e modello</span>
          )}
          {d.vin && <span className="tnum text-[0.8125rem] tracking-[0.06em] text-ink-3">Telaio {d.vin}</span>}
        </button>
      </section>

      <section className="card flex flex-col divide-y divide-line overflow-hidden" aria-label="Cliente e lavoro">
        {az ? (
          <Row icon={<Building2 size={20} />} f="cname cvat client" label="Ditta" hot={hot('cname', 'cvat', 'client')} onClick={() => onEdit('cname')} placeholder="Nome della ditta" required>
            {d.company.name && (
              <>
                {d.company.name}
                {(d.company.vat || d.company.cf) && <span className="tnum block text-[0.875rem] font-normal text-ink-2">P. IVA {d.company.vat || d.company.cf}</span>}
              </>
            )}
          </Row>
        ) : null}
        <Row
          f="owner"
          icon={<User size={20} />}
          label={az ? 'Referente' : 'Proprietario'}
          hot={hot('owner', 'client')}
          onClick={() => onEdit('owner')}
          placeholder={az ? 'Chi porta il veicolo' : 'Nome e cognome'}
          required={!az}
        >
          {d.owner}
        </Row>
        <Row
          f="phone wa"
          icon={d.wa ? <Phone size={20} /> : <MessageCircleOff size={20} />}
          label={d.wa ? 'Telefono · WhatsApp' : 'Telefono · niente WhatsApp'}
          hot={hot('phone', 'wa')}
          onClick={() => onEdit('phone')}
          placeholder="Numero del cliente"
        >
          {d.phone && <span className="tnum">{d.phone}</span>}
        </Row>
        <Row
          icon={<Wrench size={20} />}
          f="request services tyres"
          label="Cosa c’è da fare"
          hot={hot('request', 'services', 'tyres')}
          onClick={() => onEdit('request')}
          placeholder="Lavori richiesti o problema"
        >
          {(d.request || d.services.length > 0 || d.tyres) && (
            <>
              {d.request && <span className="block whitespace-pre-line">{d.request}</span>}
              {(d.services.length > 0 || d.tyres) && (
                <span className="mt-1.5 flex flex-wrap gap-1.5">
                  {d.services.map((s) => (
                    <span key={s} className="rounded-full bg-surface-2 px-2.5 py-0.5 text-[0.8125rem] font-medium text-ink-2">
                      {s}
                    </span>
                  ))}
                  {d.tyres && <span className="tnum rounded-full bg-surface-2 px-2.5 py-0.5 text-[0.8125rem] font-medium text-ink-2">{d.tyres}</span>}
                </span>
              )}
            </>
          )}
        </Row>
        {d.notes && (
          <Row icon={<NotebookPen size={20} />} f="notes" label="Note all’arrivo" hot={hot('notes')} onClick={() => onEdit('notes')}>
            <span className="whitespace-pre-line">{d.notes}</span>
          </Row>
        )}
        {d.dueDate && (
          <Row icon={<CalendarClock size={20} />} f="dueDate" label="Consegna prevista" hot={hot('dueDate')} onClick={() => onEdit('dueDate')}>
            <span className="capitalize">{speakDate(d.dueDate)}</span>
            <span className="tnum font-normal text-ink-3"> · {fmtIsoDay(d.dueDate)}</span>
          </Row>
        )}
        {!d.km && !d.dueDate && !d.notes && (
          <p className="flex items-center gap-2 px-4 py-3 text-[0.8438rem] text-ink-3">
            <Gauge size={16} className="shrink-0" /> Puoi dire anche chilometri, consegna, misura gomme e com’è il veicolo all’arrivo.
          </p>
        )}
      </section>

      {shots && onShots && <PendingPhotos list={shots} onChange={onShots} />}
    </div>
  );
}

function knownText(j: Job): string {
  const who = (j.client === 'azienda' ? j.company?.name : j.owner)?.replace(/\.+$/, '');
  return `${veic(j)}${who ? `, di ${who}` : ''}.`;
}

/** lampo dell'evidenziazione: parte ogni volta che il campo cambia */
function Flash({ at }: { at: number }) {
  if (!at) return null;
  return (
    <motion.span
      key={at}
      aria-hidden="true"
      className="pointer-events-none absolute -inset-x-2 -inset-y-1 rounded-[12px] bg-accent-soft"
      initial={{ opacity: 1 }}
      animate={{ opacity: 0 }}
      transition={{ duration: 1.8, ease: [0.22, 1, 0.36, 1] }}
      style={{ zIndex: -1 }}
    />
  );
}

function Row({
  icon,
  label,
  children,
  hot,
  onClick,
  placeholder,
  required,
  f,
}: {
  /** campi mostrati dalla riga (per scorrere fino a lei quando cambiano) */
  f: string;
  icon: ReactNode;
  label: string;
  children: ReactNode;
  hot: number;
  onClick: () => void;
  placeholder?: string;
  required?: boolean;
}) {
  const empty = children === '' || children === false || children === null || children === undefined;
  if (empty && !placeholder) return null;
  return (
    <button type="button" data-vf={f} onClick={onClick} className="press relative isolate flex w-full items-start gap-3.5 px-4 py-3.5 text-left hover:bg-surface-2">
      {hot > 0 && (
        <motion.span
          key={hot}
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10 bg-accent-soft"
          initial={{ opacity: 1 }}
          animate={{ opacity: 0 }}
          transition={{ duration: 1.8, ease: [0.22, 1, 0.36, 1] }}
        />
      )}
      <span className={`mt-0.5 shrink-0 ${empty ? 'text-ink-3' : 'text-accent-ink'}`}>{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[0.8125rem] font-medium text-ink-3">
          {label}
          {required && empty && <span className="text-accent-ink"> · serve per registrare</span>}
        </span>
        {empty ? <span className="block text-[1rem] text-ink-3">{placeholder}</span> : <span className="block text-[1.0625rem] leading-snug font-semibold break-words text-ink">{children}</span>}
      </span>
      <ChevronRight size={18} className="mt-3 shrink-0 text-ink-3" />
    </button>
  );
}
