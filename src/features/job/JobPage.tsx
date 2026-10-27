import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { Building2, ChevronDown, Copy, FileText, MessageCircle, MoreHorizontal, Pencil, Phone, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { AnimatePresence, motion } from 'motion/react';
import { ActionBar, BarButton, Page, TopBar } from '@/app/layout';
import { useJob, useJobs, useSettings, useWidth } from '@/app/hooks';
import { STATI, statoIndex, statoLabel } from '@/domain/constants';
import { fmtDateTime, fmtIsoDay, jobNumber } from '@/domain/format';
import { custName, isAz, veic, waLink, withStatus } from '@/domain/logic';
import { buildMsg } from '@/domain/messages';
import type { Job, StatusKey } from '@/domain/types';
import { deleteJob, mutateJob, restoreJob } from '@/data/repo';
import { copyText, haptic, openExternal } from '@/platform/native';
import { Button, Section, SkeletonBlocks } from '@/ui/controls';
import { Plate } from '@/ui/Plate';
import { ActionMenu } from '@/ui/Menu';
import { StatusRail, stColor } from '@/ui/status';
import { HistoryList, InvoiceSection, ItemsSection, PaymentSection, PhotosSection, VehicleHistory, WarrantySection, WorkersSection, updater } from './sections';
import { WhatsAppSheet } from './WhatsAppSheet';

export function JobPage() {
  const { id } = useParams();
  const job = useJob(id);
  if (job === undefined) return <SkeletonBlocks className="mx-auto max-w-[760px] px-4 pt-[calc(env(safe-area-inset-top,0px)+72px)]" rows={['330px', '150px', '220px']} />;
  if (job === null)
    return (
      <div className="p-10 text-center">
        <p className="w-wide text-[1.125rem] font-semibold text-ink">Scheda non trovata</p>
        <p className="mt-1 text-ink-2">Potrebbe essere stata eliminata.</p>
        <Link to="/" className="mt-5 inline-block font-semibold text-accent-ink underline underline-offset-2">
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

function JobView({ job }: { job: Job }) {
  const settings = useSettings();
  const jobs = useJobs() || [];
  const nav = useNavigate();
  const loc = useLocation();
  const up = updater(job.id);
  const [wa, setWa] = useState<{ open: boolean; kind: StatusKey }>({
    open: false,
    kind: job.status,
  });
  const [showHist, setShowHist] = useState(false);
  const [fresh, setFresh] = useState(() => !!(loc.state as { justCreated?: boolean } | null)?.justCreated);

  useEffect(() => {
    if (fresh) {
      // il banner resta finché non si interagisce; la history non lo ripropone
      nav(loc.pathname, { replace: true, state: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const az = isAz(job);
  const idx = statoIndex(job.status);
  const next = STATI[idx + 1];
  const canWa = job.wa !== false && !!waLink(job.phone, 'x', settings.prefix);

  const setStatus = (k: StatusKey) => {
    mutateJob(job.id, (j) => withStatus(j, k));
    setFresh(false);
    haptic('medium');
    toast(`Stato: ${statoLabel(k)}`, {
      description: canWa ? 'Vuoi avvisare il cliente?' : undefined,
      action: canWa ? { label: 'Avvisa', onClick: () => setWa({ open: true, kind: k }) } : undefined,
      duration: 6000,
    });
  };

  const remove = async () => {
    const snap = await deleteJob(job.id);
    nav('/', { replace: true });
    if (snap)
      toast(`Scheda N. ${jobNumber(job.number)} eliminata`, {
        action: {
          label: 'Annulla',
          onClick: () => restoreJob(snap).then(() => toast.success('Scheda ripristinata')),
        },
        duration: 8000,
      });
  };

  const [wref, pw] = useWidth<HTMLDivElement>();
  const two = pw >= 1000;

  const phoneHref = job.phone ? `tel:${job.phone.replace(/[^\d+]/g, '')}` : undefined;

  // identità del veicolo
  const identity = (
    <section className="card overflow-hidden">
      <div className="relative px-4 pt-6 pb-5 sm:px-6">
        <div aria-hidden="true" className="absolute inset-x-0 top-0 h-1" style={{ background: stColor(job.status) }} />
        <Plate plate={job.plate} country={job.plateCountry} size="lg" />
        <h1 className="w-wide mt-4 text-[1.625rem] leading-[1.1] font-semibold tracking-[-0.015em] text-ink sm:text-[1.875rem]">{veic(job)}</h1>
        <div className="mt-2 flex items-center justify-between gap-3">
          <p className="flex min-w-0 items-center gap-1.5 text-[1rem] text-ink-2">
            {az && <Building2 size={17} className="shrink-0" />}
            <span className="truncate">{custName(job) || 'Cliente non indicato'}</span>
          </p>
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
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3.5 border-t border-line bg-surface-2/50 px-4 py-4 sm:grid-cols-3 sm:px-6">
        <Fact k="Telefono" v={job.phone} />
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
        <div className="flex flex-col gap-3 border-t border-line px-4 py-4 sm:px-6">
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
      <div className="border-t border-line px-2 py-1.5 sm:px-4">
        <Link to={`/job/${job.id}/modifica`} className="press inline-flex h-11 items-center gap-2 rounded-[12px] px-3 text-[0.9375rem] font-semibold text-accent-ink hover:bg-surface-2">
          <Pencil size={17} /> Modifica dati
        </Link>
      </div>
    </section>
  );
  const banner = (
    <AnimatePresence>
      {fresh && canWa && (
        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
          <div className="flex items-center justify-between gap-3 rounded-[20px] bg-[color-mix(in_srgb,var(--wa)_12%,var(--surface))] p-4">
            <p className="text-[0.9375rem] leading-snug text-ink">
              <span className="font-semibold">Accettazione registrata.</span> Avvisa il cliente che hai preso in carico il veicolo.
            </p>
            <Button
              variant="wa"
              size="sm"
              onClick={() => {
                setFresh(false);
                setWa({ open: true, kind: 'accettato' });
              }}
            >
              Avvisa
            </Button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
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

  return (
    <Page className="pb-28">
      <TopBar
        maxW={two ? 1240 : 760}
        back="/"
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
              {identity}
              {banner}
              {status}
              <WorkersSection job={job} up={up} settings={settings} />
              <PhotosSection job={job} />
              <VehicleHistory job={job} jobs={jobs} />
            </div>
            <div className="flex flex-col gap-3">
              <ItemsSection job={job} up={up} />
              <InvoiceSection job={job} up={up} />
              <PaymentSection job={job} up={up} />
              {conto}
              <WarrantySection job={job} up={up} />
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {identity}
            {banner}
            {status}
            <ItemsSection job={job} up={up} />
            <InvoiceSection job={job} up={up} />
            <PaymentSection job={job} up={up} />
            {conto}
            <WorkersSection job={job} up={up} settings={settings} />
            <PhotosSection job={job} />
            <WarrantySection job={job} up={up} />
            <VehicleHistory job={job} jobs={jobs} />
          </div>
        )}
      </div>

      <ActionBar maxW={two ? 1240 : 760}>
        <Button variant="wa" size="lg" icon={<MessageCircle size={20} strokeWidth={2.2} />} onClick={() => setWa({ open: true, kind: job.status })} aria-label="Avvisa il cliente su WhatsApp">
          <span className="hidden min-[380px]:inline">Avvisa</span>
        </Button>
        {next ? (
          <Button variant="primary" size="lg" block onClick={() => setStatus(next.k)}>
            Segna: {next.l}
          </Button>
        ) : (
          <Button variant="primary" size="lg" block icon={<FileText size={20} />} onClick={() => nav(`/job/${job.id}/conto`)}>
            Apri il conto
          </Button>
        )}
      </ActionBar>

      <WhatsAppSheet open={wa.open} kind={wa.kind} onOpenChange={(o) => setWa((x) => ({ ...x, open: o }))} job={job} settings={settings} />
    </Page>
  );
}
