import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router';
import { scan, useScanner } from '@/platform/scanner';
import { History, Mic, RotateCcw, ScanLine, ScanText } from 'lucide-react';
import { PhotosSection } from '@/features/job/sections';
import { toast } from 'sonner';
import { ActionBar, BarButton, Page, TopBar } from '@/app/layout';
import { useJob, useJobs, useSettings } from '@/app/hooks';
import { SERVIZI } from '@/domain/constants';
import { fmtDate, fmtPlate, jobNumber, normPlateText, norm } from '@/domain/format';
import { veic } from '@/domain/logic';
import { companies } from '@/domain/monthly';
import { EMPTY_COMPANY, type ClientType, type Company, type Job } from '@/domain/types';
import { MARCHE, fromJob, isBlank, validate, type Draft, type FieldKey } from '@/domain/draft';
import type { VoiceHost } from '@/voice/session';
import { VoiceAcceptance } from '@/features/voice/VoiceAcceptance';
import { useCanListen } from '@/features/voice/useVoice';
import { clearSavedDraft, loadSavedDraft, savedLabel, storeDraft, type SavedDraft } from './draftStore';
import { addPhoto, createJob, patchJob } from '@/data/repo';
import { haptic } from '@/platform/native';
import { Button, Field, Input, Note, Segmented, Switch, TextArea, ToggleChip } from '@/ui/controls';
import { PlateInput } from './PlateInput';
import { Group, PendingPhotos, type Shot } from './parts';

export function FormPage() {
  const { id } = useParams();
  const editing = !!id;
  const existing = useJob(id);
  if (editing && existing === undefined) return null;
  if (editing && existing === null) return <p className="p-8 text-center text-ink-2">Scheda non trovata.</p>;
  return <FormInner key={id || 'new'} job={existing || undefined} />;
}

function FormInner({ job }: { job?: Job }) {
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const loc = useLocation();
  const settings = useSettings();
  const all = useJobs();
  const jobs = useMemo(() => all || [], [all]);
  const editing = !!job;

  const [d, setD] = useState<Draft>(() => {
    if (job) return fromJob(job);
    const pre = (loc.state as { prefill?: Partial<Job> } | null)?.prefill || {};
    return fromJob({ client: (sp.get('cl') as ClientType) || 'privato', plate: sp.get('plate') || '', ...pre });
  });
  // errori per campo: si mostrano quando esci dal campo (o al salvataggio) e spariscono appena correggi
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Set<string>>(() => new Set());
  const [err, setErr] = useState<{ field: string; msg: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [usedLookup, setUsedLookup] = useState(false);
  const plateRef = useRef<HTMLInputElement>(null);
  const az = d.client === 'azienda';
  const [shots, setShots] = useState<Shot[]>([]);
  const prefilled = !!(loc.state as { prefill?: unknown } | null)?.prefill;

  /* ---- accettazione a voce: stessa bozza del modulo ---- */
  const canListen = useCanListen();
  const [voice, setVoice] = useState(() => sp.get('voce') === '1');
  const voiceRef = useRef(voice);
  voiceRef.current = voice;
  const dRef = useRef(d);
  dRef.current = d;
  const jobsRef = useRef(jobs);
  jobsRef.current = jobs;
  const saveRef = useRef<() => Promise<boolean>>(async () => false);
  const [host] = useState<VoiceHost>(() => ({
    getDraft: () => dRef.current,
    setDraft: (next) => {
      dRef.current = next;
      setD(next);
      // gli avvisi dei campi si riferivano alla bozza di prima: si ricontrollano al prossimo salvataggio o uscita dal campo
      setErr(null);
      setErrs({});
    },
    save: () => saveRef.current(),
    close: () => setVoice(false),
    jobs: () => jobsRef.current,
    editing,
    prefilled,
  }));
  const voiceWords = useMemo(
    () => [
      ...(settings.workers || []),
      ...companies(jobs)
        .slice(0, 30)
        .map((c) => c.name),
    ],
    [settings.workers, jobs],
  );
  const editField = (f: FieldKey) => {
    setVoice(false);
    const ids: Partial<Record<FieldKey, string>> = { plateCountry: 'f-plate', dueDate: 'f-due', request: 'f-req', tyres: 'f-tyre', services: 'f-req', wa: 'f-phone', client: 'f-plate' };
    const id = ids[f] || `f-${f}`;
    // dopo la chiusura della schermata a voce: il campo va al centro e prende il fuoco
    window.setTimeout(() => {
      const el = document.getElementById(id);
      el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      el?.focus({ preventScroll: true });
    }, 320);
  };

  /* ---- copia di sicurezza della nuova accettazione ---- */
  const [saved, setSaved] = useState<SavedDraft | null>(() => (job || prefilled || sp.get('plate') ? null : loadSavedDraft()));
  useEffect(() => {
    if (editing) return;
    if (saved && isBlank(d)) return; // c'è una bozza da riprendere: non la si cancella finché non si inizia
    const t = window.setTimeout(() => storeDraft(d), 400);
    return () => window.clearTimeout(t);
  }, [d, editing, saved]);
  // uscendo dal modulo l'ultima modifica si salva subito (salvo che l'accettazione sia stata registrata)
  const doneRef = useRef(false);
  useEffect(
    () => () => {
      if (!editing && !doneRef.current && !isBlank(dRef.current)) storeDraft(dRef.current);
    },
    [editing],
  );
  const restoreOffer =
    saved && isBlank(d)
      ? {
          label: savedLabel(saved),
          onRestore: () => {
            host.setDraft(saved.d);
            setSaved(null);
            haptic('success');
          },
          onDiscard: () => {
            clearSavedDraft();
            setSaved(null);
          },
        }
      : null;

  // targa e telaio con la fotocamera (iPhone, VisionKit)
  const canScan = useScanner();
  const readWithCamera = async (kind: 'plate' | 'vin') => {
    try {
      const v = await scan(kind, d.plateCountry);
      if (!v) return;
      if (kind === 'plate') set('plate', v);
      else set('vin', v);
      toast.success(kind === 'plate' ? `Targa letta: ${fmtPlate(v, d.plateCountry)}` : `Telaio letto: ${v}`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  useEffect(() => {
    // con la voce si parla: la tastiera non deve comparire da sola
    if (!editing && !d.plate && !voiceRef.current) plateRef.current?.focus({ preventScroll: true });
    // solo all'apertura
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => {
    setD((x) => ({ ...x, [k]: v }));
    if (err) setErr(null);
    revalidate({ ...d, [k]: v } as Draft);
  };
  const setCo = (k: keyof Company, v: string) => {
    setD((x) => ({ ...x, company: { ...x.company, [k]: v } }));
    revalidate({ ...d, company: { ...d.company, [k]: v } });
  };
  const revalidate = (next: Draft, also?: string) => {
    const all = validate(next);
    const seen = also ? new Set(touched).add(also) : touched;
    if (also) setTouched(seen);
    setErrs(Object.fromEntries(Object.entries(all).filter(([f]) => seen.has(f))));
  };
  const blurCheck = (f: string) => () => revalidate(d, f);

  /* veicolo già visto: targa (stesso paese) o telaio */
  const hits = useMemo(() => {
    if (editing || usedLookup) return [];
    const p = norm(d.plate);
    const v = norm(d.vin);
    return jobs.filter((j) => (p.length >= 4 && (j.plateCountry || 'I') === d.plateCountry && norm(j.plate) === p) || (v.length >= 10 && norm(j.vin) === v));
  }, [jobs, d.plate, d.vin, d.plateCountry, editing, usedLookup]);

  const applyFound = () => {
    const f = hits[0];
    haptic('success');
    setD((x) => ({
      ...x,
      plateCountry: f.plateCountry || 'I',
      plate: x.plate || f.plate,
      vin: x.vin || f.vin,
      make: f.make,
      model: f.model,
      owner: f.owner,
      phone: f.phone,
      wa: f.wa !== false,
      client: f.client,
      company: { ...EMPTY_COMPANY, ...(f.company || {}) },
    }));
    setUsedLookup(true);
  };

  const cos = useMemo(() => companies(jobs), [jobs]);
  const pickCompany = (name: string) => {
    setCo('name', name);
    const c = cos.find((x) => x.name.toLowerCase() === name.trim().toLowerCase());
    if (c) {
      setD((x) => ({ ...x, company: { ...c.company }, owner: x.owner || c.owner, phone: x.phone || c.phone }));
    }
  };

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    await trySave(true);
  };

  /** salva la scheda; false se mancano dati (dal modulo si va al primo campo, dalla voce lo dice l'assistente) */
  const trySave = async (focus: boolean): Promise<boolean> => {
    const d = dRef.current;
    const plate = normPlateText(d.plate, d.plateCountry);
    const vin = d.vin.toUpperCase().replace(/\s+/g, '');
    const company = az ? { ...d.company, vat: d.company.vat.replace(/\s+/g, ''), cf: d.company.cf.toUpperCase().replace(/\s+/g, ''), name: d.company.name.trim() } : { ...EMPTY_COMPANY };
    const all = validate(d);
    const first = Object.keys(all)[0];
    if (first) {
      haptic('warning');
      setTouched(new Set(Object.keys(all)));
      setErrs(all as Record<string, string>);
      if (focus) document.getElementById(`f-${first}`)?.focus();
      return false;
    }

    const fields = {
      ...d,
      plate,
      vin,
      company,
      owner: d.owner.trim(),
      phone: d.phone.trim(),
      make: d.make.trim(),
      model: d.model.trim(),
      tyres: d.services.includes('Gomme') ? d.tyres.trim() : '',
    };
    setBusy(true);
    try {
      if (job) {
        await patchJob(job.id, fields);
        haptic('success');
        toast.success('Modifiche salvate');
        nav(`/job/${job.id}`, { replace: true });
        return true;
      } else {
        const created = await createJob({
          ...fields,
          workers: [],
          photoIds: [],
          items: [],
          deposit: 0,
          paid: false,
          payMethod: '',
          vatRate: settings.vat ?? 22,
          vatIncl: true,
          billing: 'mensile',
          invoiced: false,
          invoiceNo: '',
          warrantyMonths: settings.warranty ?? 12,
          warrantyNote: '',
        });
        for (const p of shots) await addPhoto(created.id, p.blob, p.w, p.h).catch(() => {});
        shots.forEach((p) => URL.revokeObjectURL(p.url));
        doneRef.current = true;
        clearSavedDraft();
        haptic('success');
        // l'accettazione è finita: si torna all'elenco, la scheda è in cima
        nav('/schede', { replace: true });
        toast.success(`Accettazione registrata${created.plate ? ` · ${fmtPlate(created.plate, created.plateCountry)}` : ''}`, {
          description: `Scheda N. ${jobNumber(created.number)}`,
          action: { label: 'Apri', onClick: () => nav(`/job/${created.id}`) },
          duration: 6000,
        });
        return true;
      }
    } catch {
      toast.error('Non sono riuscito a salvare. Riprova.');
      setBusy(false);
      return false;
    }
  };
  saveRef.current = () => trySave(false);

  const errFor = (f: string) => errs[f] || (err?.field === f ? err.msg : undefined);

  return (
    <Page className="pb-28">
      <TopBar
        back={job ? `/job/${job.id}` : '/'}
        backLabel={editing ? 'Scheda' : 'Annulla'}
        title={editing ? 'Modifica dati' : 'Nuova accettazione'}
        right={
          canListen ? (
            <BarButton label="Detta a voce" onClick={() => setVoice(true)}>
              <Mic size={22} />
            </BarButton>
          ) : undefined
        }
      />
      <form id="job-form" onSubmit={submit} noValidate className="mx-auto flex max-w-[760px] flex-col gap-3 px-4 pt-1">
        {restoreOffer && !voice && (
          <div className="flex items-center justify-between gap-3 rounded-[16px] bg-surface p-3.5 pl-4 ring-1 ring-line">
            <p className="min-w-0 text-[0.9062rem] leading-snug text-ink-2">
              <span className="font-semibold text-ink">Accettazione non finita</span> · {restoreOffer.label}
            </p>
            <div className="flex shrink-0 gap-1.5">
              <Button size="sm" variant="ghost" onClick={restoreOffer.onDiscard}>
                No
              </Button>
              <Button size="sm" variant="primary" icon={<RotateCcw size={16} />} onClick={restoreOffer.onRestore}>
                Riprendi
              </Button>
            </div>
          </div>
        )}
        {canListen && !voice && !editing && isBlank(d) && !restoreOffer && (
          <button type="button" onClick={() => setVoice(true)} className="press flex items-center gap-3.5 rounded-[18px] bg-accent-soft p-3.5 pl-4 text-left">
            <span className="grid size-11 shrink-0 place-items-center rounded-full bg-accent text-on-accent">
              <Mic size={22} />
            </span>
            <span className="min-w-0">
              <span className="block text-[1rem] font-semibold text-ink">Dettala a voce</span>
              <span className="block text-[0.875rem] text-ink-2">Parla come al banco: compilo io il modulo.</span>
            </span>
          </button>
        )}
        <Segmented
          label="Tipo di cliente"
          value={d.client}
          onChange={(v) => set('client', v)}
          options={[
            { v: 'privato', l: 'Privato' },
            { v: 'azienda', l: 'Azienda' },
          ]}
        />

        <Group title="Veicolo">
          <div className="flex flex-col items-center gap-3">
            <PlateInput ref={plateRef} id="f-plate" value={d.plate} onChange={(v) => set('plate', v)} country={d.plateCountry} invalid={!!errFor('plate')} onBlur={blurCheck('plate')} />
            <div className="w-full max-w-[420px]">
              <Segmented
                size="sm"
                label="Paese della targa"
                value={d.plateCountry}
                onChange={(v) => set('plateCountry', v)}
                options={[
                  { v: 'I', l: 'Targa italiana' },
                  { v: 'RSM', l: 'Targa San Marino' },
                ]}
              />
            </div>
            {errFor('plate') && <p className="text-[0.875rem] font-medium text-danger">{errFor('plate')}</p>}
            {canScan && (
              <Button variant="outline" size="sm" icon={<ScanLine size={18} />} onClick={() => readWithCamera('plate')}>
                Leggi la targa con la fotocamera
              </Button>
            )}
          </div>

          {hits.length > 0 && (
            <div className="flex items-center justify-between gap-3 rounded-[16px] bg-accent-soft p-3.5 pl-4">
              <div className="flex min-w-0 items-start gap-3">
                <History size={20} className="mt-0.5 shrink-0 text-accent-ink" />
                <div className="min-w-0 text-[0.9062rem] leading-snug">
                  <p className="font-semibold text-ink">Già visto in officina</p>
                  <p className="truncate text-ink-2">
                    {veic(hits[0])}, {hits[0].owner || hits[0].company?.name} · {hits.length === 1 ? `1 intervento, ${fmtDate(hits[0].createdAt)}` : `${hits.length} interventi`}
                  </p>
                </div>
              </div>
              <Button size="sm" variant="primary" onClick={applyFound}>
                Usa i dati
              </Button>
            </div>
          )}

          <Field label="Telaio (VIN)" htmlFor="f-vin">
            <div className="relative">
              <Input
                id="f-vin"
                className={`tnum tracking-[0.06em] uppercase ${canScan ? '!pr-14' : ''}`}
                maxLength={17}
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                value={d.vin}
                onChange={(e) => set('vin', e.target.value.toUpperCase())}
              />
              {canScan && (
                <button
                  type="button"
                  aria-label="Leggi il telaio con la fotocamera"
                  onClick={() => readWithCamera('vin')}
                  className="press absolute top-1/2 right-1.5 grid size-11 -translate-y-1/2 place-items-center rounded-[12px] text-accent-ink hover:bg-surface-3"
                >
                  <ScanText size={21} />
                </button>
              )}
            </div>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Marca" htmlFor="f-make">
              <Input id="f-make" list="marche" autoComplete="off" value={d.make} onChange={(e) => set('make', e.target.value)} />
            </Field>
            <Field label="Modello" htmlFor="f-model">
              <Input id="f-model" autoComplete="off" value={d.model} onChange={(e) => set('model', e.target.value)} />
            </Field>
            <Field label="Chilometri" htmlFor="f-km">
              <Input
                id="f-km"
                inputMode="numeric"
                autoComplete="off"
                value={d.km}
                onChange={(e) => set('km', e.target.value)}
                onBlur={(e) => {
                  const n = e.target.value.replace(/\D/g, '');
                  if (n) set('km', Number(n).toLocaleString('it-IT'));
                }}
              />
            </Field>
            <Field label="Consegna prevista" htmlFor="f-due">
              <Input id="f-due" type="date" value={d.dueDate} onChange={(e) => set('dueDate', e.target.value)} />
            </Field>
          </div>
          <datalist id="marche">
            {MARCHE.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
        </Group>

        {az && (
          <Group title="Dati per la fattura">
            <Field label="Ragione sociale" htmlFor="f-cname" error={errFor('cname')}>
              <Input id="f-cname" list="ditte" autoComplete="off" onBlur={blurCheck('cname')} value={d.company.name} onChange={(e) => pickCompany(e.target.value)} />
            </Field>
            <datalist id="ditte">
              {cos.map((c) => (
                <option key={c.key} value={c.name} />
              ))}
            </datalist>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Partita IVA o COE" htmlFor="f-cvat" error={errFor('cvat')}>
                <Input id="f-cvat" className="tnum" autoComplete="off" onBlur={blurCheck('cvat')} value={d.company.vat} onChange={(e) => setCo('vat', e.target.value)} />
              </Field>
              <Field label="Codice fiscale" htmlFor="f-ccf">
                <Input id="f-ccf" className="tnum uppercase" autoCapitalize="characters" autoComplete="off" value={d.company.cf} onChange={(e) => setCo('cf', e.target.value)} />
              </Field>
            </div>
            <Field label="Indirizzo, CAP e città" htmlFor="f-caddr">
              <Input id="f-caddr" autoComplete="off" value={d.company.addr} onChange={(e) => setCo('addr', e.target.value)} />
            </Field>
            <Field label="Codice SDI o PEC" htmlFor="f-csdi" hint="Per la fattura elettronica italiana. Per le aziende di San Marino puoi lasciarlo vuoto.">
              <Input id="f-csdi" autoComplete="off" value={d.company.sdi} onChange={(e) => setCo('sdi', e.target.value)} />
            </Field>
          </Group>
        )}

        <Group title={az ? 'Referente' : 'Proprietario'}>
          <Field label={az ? 'Chi porta il veicolo (facoltativo)' : 'Nome e cognome'} htmlFor="f-owner" error={errFor('owner')}>
            <Input id="f-owner" autoComplete="off" autoCapitalize="words" onBlur={blurCheck('owner')} value={d.owner} onChange={(e) => set('owner', e.target.value)} />
          </Field>
          <Field label="Telefono WhatsApp" htmlFor="f-phone" hint={`Senza prefisso si usa +${settings.prefix || '39'}. Per un altro paese scrivi il numero con il + davanti.`}>
            <Input id="f-phone" type="tel" inputMode="tel" autoComplete="off" placeholder="333 123 4567" value={d.phone} onChange={(e) => set('phone', e.target.value)} />
          </Field>
          <Switch checked={d.wa} onChange={(v) => set('wa', v)} label="Aggiornamenti su WhatsApp" description="Il cliente accetta di ricevere i messaggi sullo stato dei lavori." />
        </Group>

        <Group title="Intervento">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Tipo di lavoro">
            {SERVIZI.map((s) => (
              <ToggleChip key={s} on={d.services.includes(s)} onClick={() => set('services', d.services.includes(s) ? d.services.filter((x) => x !== s) : [...d.services, s])}>
                {s}
              </ToggleChip>
            ))}
          </div>
          {d.services.includes('Gomme') && (
            <Field label="Misura pneumatici" htmlFor="f-tyre">
              <Input id="f-tyre" autoComplete="off" placeholder="205/55 R16 91V" value={d.tyres} onChange={(e) => set('tyres', e.target.value)} />
            </Field>
          )}
          <Field label="Lavori richiesti dal cliente" htmlFor="f-req">
            <TextArea id="f-req" rows={3} value={d.request} onChange={(e) => set('request', e.target.value)} />
          </Field>
          <Field label="Note all'arrivo" htmlFor="f-notes" hint="Graffi, spie accese, oggetti a bordo, livello carburante.">
            <TextArea id="f-notes" rows={3} value={d.notes} onChange={(e) => set('notes', e.target.value)} />
          </Field>
        </Group>

        {/* le foto si fanno al banco, mentre il cliente è lì: fanno parte dell'accettazione */}
        {job ? <PhotosSection job={job} /> : <PendingPhotos list={shots} onChange={setShots} />}

        {err && !['plate', 'cname', 'cvat', 'owner'].includes(err.field) && <Note tone="danger">{err.msg}</Note>}
      </form>

      <VoiceAcceptance
        open={voice}
        draft={d}
        host={host}
        editing={editing}
        onClose={() => setVoice(false)}
        onExit={() => {
          setVoice(false);
          if (job) nav(`/job/${job.id}`, { replace: true });
          else {
            const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
            if (idx > 0) nav(-1);
            else nav('/schede', { replace: true });
          }
        }}
        onEdit={editField}
        shots={job ? undefined : shots}
        onShots={job ? undefined : setShots}
        words={voiceWords}
        restore={restoreOffer}
      />

      <ActionBar native={[{ id: 'save', label: editing ? 'Salva modifiche' : 'Registra accettazione', symbol: '', style: 'primary', disabled: busy, onPress: () => submit() }]}>
        <Button type="submit" form="job-form" variant="primary" size="lg" block disabled={busy}>
          {editing ? 'Salva modifiche' : 'Registra accettazione'}
        </Button>
      </ActionBar>
    </Page>
  );
}
