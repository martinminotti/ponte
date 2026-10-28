import { useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Building2, CheckCircle2, ChevronDown, Copy, FileText, MessageCircle, MoreHorizontal, Pencil, Phone, Send, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { AnimatePresence, motion } from 'motion/react';
import { ActionBar, BarButton, Page, TopBar } from '@/app/layout';
import { useJob, useJobs, useSettings, useWidth } from '@/app/hooks';
import { PAGAMENTI, STATI, statoIndex, statoLabel } from '@/domain/constants';
import { eur, fmtDate, fmtDateTime, fmtIsoDay, jobNumber } from '@/domain/format';
import { custName, daSaldare, isAz, monthlyPending, totale, veic, waLink, withPayment, withStatus } from '@/domain/logic';
import { buildMsg } from '@/domain/messages';
import type { Job, StatusKey } from '@/domain/types';
import { deleteJob, mutateJob, restoreJob } from '@/data/repo';
import { copyText, haptic, openExternal } from '@/platform/native';
import { Button, Section, SkeletonBlocks, ToggleChip } from '@/ui/controls';
import { SPRING } from '@/ui/motion';
import { Plate } from '@/ui/Plate';
import { ActionMenu } from '@/ui/Menu';
import { StatusPill, StatusRail, stColor } from '@/ui/status';
import { sendBill } from '@/features/doc/sendBill';
import { HistoryList, InvoiceSection, ItemsSection, PaymentSection, PhotosSection, VehicleHistory, WarrantySection, WorkersSection, updater } from './sections';
import { WhatsAppSheet } from './WhatsAppSheet';

export function JobPage() {
  const { id } = useParams();
  const job = useJob(id);
  if (job === undefined) return <SkeletonBlocks className="mx-auto max-w-[760px] px-4 pt-[calc(env(safe-area-inset-top,0px)+72px)]" rows={['180px', '220px', '220px']} />;
  if (job === null)
    return (
      <div className="p-10 text-center">
        <p className="w-wide text-[1.125rem] font-semibold text-ink">Scheda non trovata</p>
        <p className="mt-1 text-ink-2">Potrebbe essere stata eliminata.</p>
        <Link to="/schede" className="mt-5 inline-block font-semibold text-accent-ink underline underline-offset-2">
          Torna alle schede
        </Link>
      </div>
    );
  return <JobView key={job.id} job={job} />;
}

function Fact({ k, v, mono }: { k: string; v?: string; mono?: boolean }) {
  if (!v) return null;
  return (
    <div className="min-w-0">
      <dt className="text-[0.8125rem] text-ink-3">{k}</dt>
      <dd className={`mt-0.5 text-[0.9688rem] break-words text-ink ${mono ? 'tnum tracking-[0.04em]' : ''}`}>{v}</dd>
    </div>
  );
}

/** Contenuto che si apre e si chiude con una molla in altezza (senza rimbalzo). */
function Collapse({ open, children }: { open: boolean; children: ReactNode }) {
  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div key="c" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={SPRING} className="overflow-hidden">
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/**
 * Fase della scheda, che decide cosa si vede per primo:
 * - lavori: stato, voci, operai (tutto aperto)
 * - ritiro: pronto e da incassare → il pagamento con il conto in cima, il resto chiuso
 * - mensile: pronto, ditta con conto di fine mese → consegna, il resto chiuso
 * - chiusa: consegnata → riepilogo e invio del conto, il resto chiuso
 */
type Phase = 'lavori' | 'ritiro' | 'mensile' | 'chiusa';
function phaseOf(j: Job): Phase {
  if (j.status === 'consegnato') return 'chiusa';
  // pronto e già saldato (o nel conto mensile della ditta): resta solo da consegnare
  if (j.status === 'pronto') return monthlyPending(j) || j.paid ? 'mensile' : 'ritiro';
  return 'lavori';
}

function JobView({ job }: { job: Job }) {
  const settings = useSettings();
  const jobs = useJobs() || [];
  const nav = useNavigate();
  const up = updater(job.id);
  const [wa, setWa] = useState<{ open: boolean; kind: StatusKey }>({ open: false, kind: job.status });
  const [showHist, setShowHist] = useState(false);
  const [details, setDetails] = useState(false);
  const [rest, setRest] = useState(false);
  const [sending, setSending] = useState(false);

  const az = isAz(job);
  const phase = phaseOf(job);
  const idx = statoIndex(job.status);
  const next = STATI[idx + 1];
  const due = daSaldare(job);
  const canWa = job.wa !== false && !!waLink(job.phone, 'x', settings.prefix);

  const setStatus = (k: StatusKey) => {
    mutateJob(job.id, (j) => withStatus(j, k));
    haptic('medium');
    toast(`Stato: ${statoLabel(k)}`, {
      description: canWa ? 'Vuoi avvisare il cliente?' : undefined,
      action: canWa ? { label: 'Avvisa', onClick: () => setWa({ open: true, kind: k }) } : undefined,
      duration: 6000,
    });
  };

  const pay = () => {
    if (!job.payMethod) {
      document.getElementById('pagamento')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      toast('Come paga il cliente?', { description: 'Scegli il metodo di pagamento, poi incassa.' });
      return;
    }
    haptic('success');
    mutateJob(job.id, (j) => withPayment(j, j.payMethod));
    toast.success(`Incassati ${eur(due)}`, { description: 'Scheda consegnata e archiviata. Puoi mandare il conto al cliente.' });
  };

  const send = async () => {
    setSending(true);
    await sendBill(job, settings);
    setSending(false);
  };

  const remove = async () => {
    const snap = await deleteJob(job.id);
    nav('/schede', { replace: true });
    if (snap)
      toast(`Scheda N. ${jobNumber(job.number)} eliminata`, {
        action: { label: 'Annulla', onClick: () => restoreJob(snap).then(() => toast.success('Scheda ripristinata')) },
        duration: 8000,
      });
  };

  const [wref, pw] = useWidth<HTMLDivElement>();
  const two = pw >= 1000 && phase === 'lavori';
  const phoneHref = job.phone ? `tel:${job.phone.replace(/[^\d+]/g, '')}` : undefined;

  /* ---- riepilogo targa: parte chiuso, con il cliente e le chiamate rapide ---- */
  const summary = (
    <section className="card overflow-hidden">
      <div className="relative px-4 pt-5 pb-4 sm:px-5">
        <div aria-hidden="true" className="absolute inset-x-0 top-0 h-1" style={{ background: stColor(job.status) }} />
        <div className="flex items-center justify-between gap-3">
          <Plate plate={job.plate} country={job.plateCountry} size="md" />
          <StatusPill s={job.status} size="sm" />
        </div>
        <h1 className="w-wide mt-3 text-[1.375rem] leading-[1.15] font-semibold tracking-[-0.012em] text-ink">{veic(job)}</h1>
        <div className="mt-1.5 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="flex min-w-0 items-center gap-1.5 text-[0.9688rem] font-medium text-ink">
              {az && <Building2 size={16} className="shrink-0 text-ink-2" />}
              <span className="truncate">{custName(job) || 'Cliente non indicato'}</span>
            </p>
            {job.phone && <p className="tnum truncate text-[0.875rem] text-ink-3">{job.phone}</p>}
          </div>
          <div className="flex shrink-0 gap-2">
            {phoneHref && (
              <a href={phoneHref} aria-label="Chiama il cliente" className="press grid size-11 place-items-center rounded-full bg-surface-2 text-ink hover:bg-surface-3">
                <Phone size={19} />
              </a>
            )}
            {canWa && (
              <button
                type="button"
                aria-label="Scrivi su WhatsApp"
                onClick={() => setWa({ open: true, kind: job.status })}
                className="press grid size-11 place-items-center rounded-full bg-wa text-on-wa"
              >
                <MessageCircle size={20} strokeWidth={2.2} />
              </button>
            )}
          </div>
        </div>
      </div>
      <button
        type="button"
        aria-expanded={details}
        onClick={() => setDetails((v) => !v)}
        className="press flex h-12 w-full items-center justify-between border-t border-line px-4 text-[0.9375rem] font-medium text-ink-2 hover:bg-surface-2 sm:px-5"
      >
        <span>{details ? 'Meno dettagli' : 'Dettagli, richieste e foto'}</span>
        <ChevronDown size={19} className={`transition-transform duration-300 ${details ? 'rotate-180' : ''}`} />
      </button>
      <Collapse open={details}>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3.5 border-t border-line bg-surface-2/50 px-4 py-4 sm:grid-cols-3 sm:px-5">
          <Fact k="Chilometri" v={job.km} />
          <Fact k="Entrata" v={fmtDateTime(job.createdAt)} />
          <Fact k="Consegna prevista" v={fmtIsoDay(job.dueDate)} />
          <Fact k="Telaio" v={job.vin} mono />
          <Fact k="Pneumatici" v={job.tyres} />
          {az && (
            <>
              <Fact k="P.IVA / COE" v={job.company.vat} mono />
              <Fact k="Codice fiscale" v={job.company.cf} mono />
              <Fact k="SDI / PEC" v={job.company.sdi} />
              <Fact k="Referente" v={job.owner} />
              <Fact k="Indirizzo" v={job.company.addr} />
            </>
          )}
          {job.services.length > 0 && (
            <div className="col-span-2 sm:col-span-3">
              <dt className="sr-only">Tipo di lavoro</dt>
              <dd className="flex flex-wrap gap-1.5">
                {job.services.map((s) => (
                  <span key={s} className="rounded-[8px] bg-surface px-2.5 py-1 text-[0.8438rem] font-medium text-ink-2 ring-1 ring-line">
                    {s}
                  </span>
                ))}
              </dd>
            </div>
          )}
        </dl>
        {(job.request || job.notes) && (
          <div className="flex flex-col gap-3 border-t border-line px-4 py-4 sm:px-5">
            {job.request && (
              <div>
                <p className="text-[0.8125rem] text-ink-3">Lavori richiesti</p>
                <p className="mt-0.5 text-[0.9688rem] whitespace-pre-wrap text-ink">{job.request}</p>
              </div>
            )}
            {job.notes && (
              <div>
                <p className="text-[0.8125rem] text-ink-3">Note all'arrivo</p>
                <p className="mt-0.5 text-[0.9688rem] whitespace-pre-wrap text-ink">{job.notes}</p>
              </div>
            )}
          </div>
        )}
        <div className="border-t border-line px-4 py-4 sm:px-5">
          <p className="mb-2 text-[0.8125rem] text-ink-3">Foto all'arrivo</p>
          <PhotosSection job={job} bare />
        </div>
        <div className="border-t border-line px-2 py-1.5 sm:px-3">
          <Link to={`/job/${job.id}/modifica`} className="press inline-flex h-11 items-center gap-2 rounded-[12px] px-3 text-[0.9375rem] font-semibold text-accent-ink hover:bg-surface-2">
            <Pencil size={17} /> Modifica dati
          </Link>
        </div>
      </Collapse>
    </section>
  );

  const status = (
    <Section title="Stato lavorazione">
      <StatusRail value={job.status} onChange={setStatus} />
      <button type="button" onClick={() => setShowHist((v) => !v)} aria-expanded={showHist} className="press -mb-1 flex items-center gap-1 self-start text-[0.9062rem] font-medium text-ink-2">
        Cronologia <ChevronDown size={17} className={`transition-transform ${showHist ? 'rotate-180' : ''}`} />
      </button>
      {showHist && <HistoryList job={job} />}
    </Section>
  );

  const conto = (
    <Section title="Conto per il cliente">
      <p className="-mt-1 text-[0.9375rem] text-ink-2">Il documento A4 con lavori, totale, pagamento e garanzia. Da salvare in PDF, stampare o mandare su WhatsApp.</p>
      <Button variant="outline" size="lg" block icon={<FileText size={20} />} onClick={() => nav(`/job/${job.id}/conto`)}>
        Apri il conto
      </Button>
    </Section>
  );

  const work = (
    <>
      {status}
      <ItemsSection job={job} up={up} settings={settings} />
      <InvoiceSection job={job} up={up} />
      {phase === 'lavori' && <PaymentSection job={job} up={up} />}
      {phase === 'lavori' && conto}
      <WorkersSection job={job} up={up} settings={settings} />
      <WarrantySection job={job} up={up} />
      <VehicleHistory job={job} jobs={jobs} />
    </>
  );

  /* ---- in primo piano a seconda della fase ---- */
  const focus =
    phase === 'ritiro' ? (
      <ReadyCard job={job} up={up} onOpenDoc={() => nav(`/job/${job.id}/conto`)} onNotify={() => setWa({ open: true, kind: 'pronto' })} canWa={canWa} />
    ) : phase === 'mensile' ? (
      <Section title="Pronto da ritirare" tone="accent">
        <p className="-mt-1 text-[0.9375rem] text-ink-2">
          {job.paid ? (
            <>Già saldato{job.payMethod ? ` con ${job.payMethod.toLowerCase()}` : ''}: alla consegna non si incassa nulla.</>
          ) : (
            <>
              Il lavoro va nel conto di fine mese di <span className="font-semibold text-ink">{custName(job)}</span>: alla consegna non si incassa nulla.
            </>
          )}
        </p>
        <p className="w-cond tnum text-[2rem] leading-none font-bold text-ink">{eur(totale(job))}</p>
        <Button variant="primary" size="lg" block onClick={() => setStatus('consegnato')}>
          Consegna il veicolo
        </Button>
      </Section>
    ) : phase === 'chiusa' ? (
      <DoneCard job={job} sending={sending} onSend={send} onOpenDoc={() => nav(`/job/${job.id}/conto`)} />
    ) : null;

  const restToggle = (
    <button
      type="button"
      aria-expanded={rest}
      onClick={() => setRest((v) => !v)}
      className="press flex h-12 items-center justify-between rounded-[16px] bg-surface px-4 text-[0.9375rem] font-medium text-ink-2 shadow-[var(--shadow-1)] hover:text-ink"
    >
      <span>{rest ? 'Nascondi lavori e stato' : `Lavori, stato e operai${job.items.length ? ` · ${job.items.length} ${job.items.length === 1 ? 'voce' : 'voci'}` : ''}`}</span>
      <ChevronDown size={19} className={`transition-transform duration-300 ${rest ? 'rotate-180' : ''}`} />
    </button>
  );

  /* ---- barra in basso ---- */
  const primary =
    phase === 'ritiro'
      ? { id: 'pay', label: due > 0 ? `Incassa ${eur(due)}` : 'Segna saldato', onPress: pay }
      : phase === 'mensile'
        ? { id: 'deliver', label: 'Consegna', onPress: () => setStatus('consegnato') }
        : phase === 'chiusa'
          ? { id: 'send', label: 'Invia il conto', onPress: send }
          : next
            ? { id: 'next', label: `Segna: ${next.l}`, onPress: () => setStatus(next.k) }
            : { id: 'doc', label: 'Apri il conto', onPress: () => nav(`/job/${job.id}/conto`) };

  return (
    <Page className="pb-28">
      <TopBar
        maxW={two ? 1240 : 760}
        back="/schede"
        backLabel="Schede"
        hideBackOnWide
        title={<span className="tnum text-ink-2">Scheda N. {jobNumber(job.number)}</span>}
        right={
          <ActionMenu
            title={`Scheda N. ${jobNumber(job.number)}`}
            trigger={(open) => (
              <BarButton label="Altre azioni" onClick={open}>
                <MoreHorizontal size={22} />
              </BarButton>
            )}
            items={[
              { icon: <Pencil size={19} />, label: 'Modifica dati', onSelect: () => nav(`/job/${job.id}/modifica`) },
              { icon: <FileText size={19} />, label: 'Apri il conto', onSelect: () => nav(`/job/${job.id}/conto`) },
              { icon: <Send size={19} />, label: 'Invia il conto in PDF', onSelect: send },
              {
                icon: <Copy size={19} />,
                label: 'Copia riepilogo',
                onSelect: async () => {
                  const ok = await copyText(buildMsg(job, job.status === 'consegnato' ? 'consegnato' : 'pronto', settings));
                  toast[ok ? 'success' : 'error'](ok ? 'Riepilogo copiato' : 'Non riesco a copiare');
                },
              },
              ...(canWa ? [{ icon: <MessageCircle size={19} />, label: 'Apri la chat WhatsApp', onSelect: () => openExternal(waLink(job.phone, '', settings.prefix)!) }] : []),
              { icon: <Trash2 size={19} />, label: 'Elimina scheda', danger: true, separator: true, onSelect: remove },
            ]}
          />
        }
      />

      <div ref={wref} aria-hidden="true" className="h-0 w-full" />
      <div className="mx-auto px-4" style={{ maxWidth: two ? 1240 : 760 }}>
        {two ? (
          <div className="grid grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] items-start gap-4">
            <div className="flex flex-col gap-3">
              {summary}
              {status}
              <WorkersSection job={job} up={up} settings={settings} />
              <VehicleHistory job={job} jobs={jobs} />
            </div>
            <div className="flex flex-col gap-3">
              <ItemsSection job={job} up={up} settings={settings} />
              <InvoiceSection job={job} up={up} />
              <PaymentSection job={job} up={up} />
              {conto}
              <WarrantySection job={job} up={up} />
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {summary}
            {focus}
            {focus ? (
              <>
                {restToggle}
                <Collapse open={rest}>
                  <div className="flex flex-col gap-3">{work}</div>
                </Collapse>
              </>
            ) : (
              work
            )}
          </div>
        )}
      </div>

      <ActionBar
        maxW={two ? 1240 : 760}
        native={[
          { id: 'wa', label: 'Avvisa', symbol: 'message.fill', style: 'wa', onPress: () => setWa({ open: true, kind: job.status }) },
          { ...primary, symbol: primary.id === 'send' ? 'paperplane.fill' : '', style: 'primary', disabled: primary.id === 'send' && sending },
        ]}
      >
        <Button variant="wa" size="lg" icon={<MessageCircle size={20} strokeWidth={2.2} />} onClick={() => setWa({ open: true, kind: job.status })} aria-label="Avvisa il cliente su WhatsApp">
          <span className="hidden min-[380px]:inline">Avvisa</span>
        </Button>
        <Button variant="primary" size="lg" block icon={primary.id === 'send' ? <Send size={19} /> : undefined} disabled={primary.id === 'send' && sending} onClick={primary.onPress}>
          {primary.id === 'send' && sending ? 'Preparo il PDF…' : primary.label}
        </Button>
      </ActionBar>

      <WhatsAppSheet open={wa.open} kind={wa.kind} onOpenChange={(o) => setWa((x) => ({ ...x, open: o }))} job={job} settings={settings} />
    </Page>
  );
}

/** Pronto: il conto e l'incasso in cima. Pagato → la scheda passa da sola a Consegnato (withPayment). */
function ReadyCard({ job, up, onOpenDoc, onNotify, canWa }: { job: Job; up: (fn: (j: Job) => Job) => Promise<void>; onOpenDoc: () => void; onNotify: () => void; canWa: boolean }) {
  const due = daSaldare(job);
  const tot = totale(job);
  return (
    <section id="pagamento" className="card flex flex-col gap-4 p-4 ring-2 ring-[color-mix(in_srgb,var(--st-pronto)_55%,transparent)] sm:p-5">
      <header className="flex items-center justify-between gap-3">
        <h2 className="w-semi text-[1.0625rem] font-semibold text-ink">Pronto da ritirare</h2>
        {canWa && (
          <button
            type="button"
            onClick={onNotify}
            className="press flex h-9 items-center gap-1.5 rounded-full bg-[color-mix(in_srgb,var(--wa)_14%,transparent)] px-3 text-[0.875rem] font-semibold text-wa"
          >
            <MessageCircle size={16} strokeWidth={2.3} /> Avvisa che è pronto
          </button>
        )}
      </header>
      <div className="flex items-end justify-between gap-3 rounded-[16px] bg-surface-2 p-4">
        <div>
          <p className="text-[0.875rem] text-ink-2">Da incassare</p>
          {job.deposit > 0 && (
            <p className="tnum text-[0.8125rem] text-ink-3">
              Totale {eur(tot)}, acconto {eur(job.deposit)}
            </p>
          )}
        </div>
        <p className="w-cond tnum text-[2.5rem] leading-none font-bold text-ink">{eur(due)}</p>
      </div>
      {tot <= 0 ? (
        <p className="text-[0.9375rem] text-ink-2">Il conto è vuoto: apri «Lavori, stato e operai» qui sotto e aggiungi le voci.</p>
      ) : (
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Metodo di pagamento">
          {PAGAMENTI.map((p) => (
            <ToggleChip key={p} on={job.payMethod === p} onClick={() => up((j) => ({ ...j, payMethod: j.payMethod === p ? '' : p }))}>
              {p}
            </ToggleChip>
          ))}
        </div>
      )}
      <Button variant="outline" block icon={<FileText size={19} />} onClick={onOpenDoc}>
        Vedi il conto
      </Button>
    </section>
  );
}

/** Consegnata: com'è finita, e l'invio del conto in PDF con il messaggio di cortesia. */
function DoneCard({ job, sending, onSend, onOpenDoc }: { job: Job; sending: boolean; onSend: () => void; onOpenDoc: () => void }) {
  const monthly = monthlyPending(job);
  return (
    <section className="card flex flex-col gap-4 p-4 sm:p-5">
      <div className="flex items-start gap-3 rounded-[16px] bg-ok-soft p-4 text-ok">
        <CheckCircle2 size={24} className="mt-0.5 shrink-0" />
        <div className="min-w-0">
          <p className="text-[1rem] font-semibold">Consegnato{job.deliveredAt ? ` il ${fmtDate(job.deliveredAt)}` : ''}</p>
          <p className="text-[0.9062rem] opacity-90">
            {job.paid
              ? `Saldati ${eur(job.paidAmount ?? totale(job))}${job.payMethod ? `, ${job.payMethod}` : ''}`
              : monthly
                ? 'Nel conto di fine mese della ditta'
                : `Da incassare ${eur(daSaldare(job))}`}
          </p>
        </div>
      </div>
      <Button variant="primary" size="lg" block icon={<Send size={19} />} disabled={sending} onClick={onSend}>
        {sending ? 'Preparo il PDF…' : 'Invia il conto al cliente'}
      </Button>
      <p className="-mt-2 text-[0.8438rem] leading-snug text-ink-3">Il PDF del conto con un messaggio di ringraziamento: scegli WhatsApp e arriva già allegato.</p>
      <Button variant="ghost" block icon={<FileText size={19} />} onClick={onOpenDoc}>
        Vedi il conto
      </Button>
    </section>
  );
}
