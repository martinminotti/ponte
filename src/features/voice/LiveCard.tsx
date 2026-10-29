import type { ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Building2, CalendarClock, Check, MessageCircleOff, NotebookPen, Phone, User, Wrench, X } from 'lucide-react';
import type { Draft, FieldKey } from '@/domain/draft';
import { Plate } from '@/ui/Plate';
import { SPRING_FAST } from '@/ui/motion';
import { capitalize, speakDate } from '@/voice/spoken';
import type { Shot } from '@/features/form/parts';

/**
 * La scheda che si compone mentre si parla. Mostra solo quello che è stato detto, senza etichette da leggere:
 * un'icona e il valore. Quello che manca per registrare sta in tre pillole che si spuntano da sole.
 * Ogni riga si illumina per un attimo quando cambia; toccandola si corregge a mano nel modulo.
 */
export function LiveCard({
  d,
  recent,
  recentAt,
  onEdit,
  shots,
  onShots,
}: {
  d: Draft;
  recent: FieldKey[];
  recentAt: number;
  onEdit: (f: FieldKey) => void;
  shots?: Shot[];
  onShots?: (l: Shot[]) => void;
}) {
  const az = d.client === 'azienda';
  const hot = (...f: FieldKey[]) => (f.some((x) => recent.includes(x)) ? recentAt : 0);
  const vehicle = [d.make, d.model].filter(Boolean).join(' ');
  const steps = [
    { k: 'plate', l: 'Targa', ok: !!(d.plate || d.vin) },
    { k: 'who', l: az ? 'Ditta' : 'Cliente', ok: az ? !!d.company.name && !!(d.company.vat || d.company.cf) : !!d.owner },
    { k: 'work', l: 'Lavori', ok: !!(d.request || d.services.length || d.tyres) },
  ];
  const allOk = steps.every((s) => s.ok);

  return (
    <section className="card relative overflow-hidden" aria-label="Scheda in compilazione">
      <button type="button" data-vf="plate plateCountry make model km vin" onClick={() => onEdit('plate')} className="press relative isolate flex w-full flex-col items-center gap-2 px-4 pt-5 pb-4">
        <Flash at={hot('plate', 'plateCountry', 'make', 'model', 'km')} />
        {d.plate ? (
          <Plate plate={d.plate} country={d.plateCountry} size="xl" />
        ) : (
          <span
            aria-label="Targa da dire"
            className="w-cond tnum grid h-[72px] w-full max-w-[320px] place-items-center rounded-[10px] border-2 border-dashed border-line-strong text-[2.75rem] leading-none font-bold tracking-[0.08em] text-line-strong"
          >
            AB 123 CD
          </span>
        )}
        {(vehicle || d.km || d.vin) && (
          <span className="text-[1.0625rem] font-semibold text-ink">
            {vehicle}
            {d.km && (
              <span className="tnum font-normal text-ink-2">
                {vehicle ? ' · ' : ''}
                {d.km} km
              </span>
            )}
          </span>
        )}
      </button>

      <div className="flex flex-col px-2 pb-2">
        <AnimatePresence initial={false}>
          {az && d.company.name && (
            <Row key="cname" f="cname cvat client" icon={<Building2 size={20} />} hot={hot('cname', 'cvat', 'client')} onClick={() => onEdit('cname')}>
              {d.company.name}
              {(d.company.vat || d.company.cf) && <span className="tnum font-normal text-ink-2"> · {d.company.vat || d.company.cf}</span>}
            </Row>
          )}
          {d.owner && (
            <Row key="owner" f="owner" icon={<User size={20} />} hot={hot('owner', 'client')} onClick={() => onEdit('owner')}>
              {d.owner}
            </Row>
          )}
          {d.phone && (
            <Row key="phone" f="phone wa" icon={d.wa ? <Phone size={20} /> : <MessageCircleOff size={20} />} hot={hot('phone', 'wa')} onClick={() => onEdit('phone')}>
              <span className="tnum">{d.phone}</span>
            </Row>
          )}
          {(d.request || d.services.length > 0 || d.tyres) && (
            <Row key="request" f="request services tyres" icon={<Wrench size={20} />} hot={hot('request', 'services', 'tyres')} onClick={() => onEdit('request')}>
              {d.request || [...d.services, d.tyres].filter(Boolean).join(' · ')}
            </Row>
          )}
          {d.notes && (
            <Row key="notes" f="notes" icon={<NotebookPen size={20} />} hot={hot('notes')} onClick={() => onEdit('notes')}>
              {d.notes}
            </Row>
          )}
          {d.dueDate && (
            <Row key="due" f="dueDate" icon={<CalendarClock size={20} />} hot={hot('dueDate')} onClick={() => onEdit('dueDate')}>
              {capitalize(speakDate(d.dueDate))}
            </Row>
          )}
        </AnimatePresence>
      </div>

      {shots && shots.length > 0 && (
        <div className="flex gap-2 overflow-x-auto px-4 pb-4 no-scrollbar">
          {shots.map((p) => (
            <div key={p.id} className="relative size-16 shrink-0 overflow-hidden rounded-[12px] bg-surface-2">
              <img src={p.url} alt="" className="size-full object-cover" />
              <button
                type="button"
                aria-label="Togli la foto"
                onClick={() => {
                  URL.revokeObjectURL(p.url);
                  onShots?.(shots.filter((x) => x.id !== p.id));
                }}
                className="press hit absolute top-1 right-1 grid size-6 place-items-center rounded-full bg-black/55 text-white backdrop-blur"
              >
                <X size={13} strokeWidth={2.8} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* quello che serve: tre pillole che si spuntano da sole */}
      <AnimatePresence initial={false}>
        {!allOk && (
          <motion.div key="steps" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={SPRING_FAST} className="overflow-hidden">
            <div className="flex justify-center gap-2 border-t border-line px-4 py-3">
              {steps.map((s) => (
                <span
                  key={s.k}
                  className={`inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[0.875rem] font-semibold transition-colors ${s.ok ? 'bg-ok-soft text-ok' : 'bg-surface-2 text-ink-3'}`}
                >
                  {s.ok ? <Check size={15} strokeWidth={3} /> : <span className="size-1.5 rounded-full bg-current" />}
                  {s.l}
                </span>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

/** lampo dell'evidenziazione: parte ogni volta che il campo cambia */
function Flash({ at }: { at: number }) {
  if (!at) return null;
  return (
    <motion.span
      key={at}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 -z-10 bg-accent-soft"
      initial={{ opacity: 1 }}
      animate={{ opacity: 0 }}
      transition={{ duration: 1.8, ease: [0.22, 1, 0.36, 1] }}
    />
  );
}

function Row({ icon, children, hot, onClick, f }: { icon: ReactNode; children: ReactNode; hot: number; onClick: () => void; f: string }) {
  return (
    <motion.div layout="position" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={SPRING_FAST}>
      <button type="button" data-vf={f} onClick={onClick} className="press relative isolate flex w-full items-start gap-3 overflow-hidden rounded-[14px] px-3 py-2.5 text-left hover:bg-surface-2">
        <Flash at={hot} />
        <span className="mt-0.5 shrink-0 text-accent-ink">{icon}</span>
        <span className="min-w-0 flex-1 text-[1.0625rem] leading-snug font-semibold break-words text-ink">{children}</span>
      </button>
    </motion.div>
  );
}
