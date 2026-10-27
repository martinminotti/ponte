import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router';
import { History } from 'lucide-react';
import { toast } from 'sonner';
import { ActionBar, Page, TopBar } from '@/app/layout';
import { useJob, useJobs, useSettings } from '@/app/hooks';
import { SERVIZI } from '@/domain/constants';
import { fmtDate, normPlateText, norm } from '@/domain/format';
import { veic } from '@/domain/logic';
import { companies } from '@/domain/monthly';
import { EMPTY_COMPANY, type ClientType, type Company, type Job, type PlateCountry } from '@/domain/types';
import { createJob, patchJob } from '@/data/repo';
import { haptic } from '@/platform/native';
import { Button, Field, Input, Note, Segmented, Switch, TextArea, ToggleChip } from '@/ui/controls';
import { PlateInput } from './PlateInput';

const MARCHE = [
  'Alfa Romeo',
  'Audi',
  'BMW',
  'Citroën',
  'Dacia',
  'DS',
  'Fiat',
  'Ford',
  'Honda',
  'Hyundai',
  'Iveco',
  'Jeep',
  'Kia',
  'Lancia',
  'Land Rover',
  'Mazda',
  'Mercedes-Benz',
  'Mini',
  'Mitsubishi',
  'Nissan',
  'Opel',
  'Peugeot',
  'Porsche',
  'Renault',
  'Seat',
  'Skoda',
  'Smart',
  'Suzuki',
  'Tesla',
  'Toyota',
  'Volkswagen',
  'Volvo',
];

interface Draft {
  client: ClientType;
  plateCountry: PlateCountry;
  plate: string;
  vin: string;
  make: string;
  model: string;
  km: string;
  dueDate: string;
  company: Company;
  owner: string;
  phone: string;
  wa: boolean;
  services: string[];
  tyres: string;
  request: string;
  notes: string;
}

const fromJob = (j: Partial<Job>): Draft => ({
  client: j.client || 'privato',
  plateCountry: j.plateCountry || 'I',
  plate: j.plate || '',
  vin: j.vin || '',
  make: j.make || '',
  model: j.model || '',
  km: j.km || '',
  dueDate: j.dueDate || '',
  company: { ...EMPTY_COMPANY, ...(j.company || {}) },
  owner: j.owner || '',
  phone: j.phone || '',
  wa: j.wa !== false,
  services: [...(j.services || [])],
  tyres: j.tyres || '',
  request: j.request || '',
  notes: j.notes || '',
});

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="card flex min-w-0 flex-col gap-4 p-4 sm:p-5">
      <legend className="sr-only">{title}</legend>
      <h3 aria-hidden="true" className="w-semi -mb-0.5 text-[1.0625rem] font-semibold text-ink">
        {title}
      </h3>
      {children}
    </fieldset>
  );
}

export function FormPage() {
  const { id } = useParams();
  const editing = !!id;
  const existing = useJob(id);
  if (editing && existing === undefined) return null;
  if (editing && existing === null) return <p className="p-8 text-center text-ink-2">Scheda non trovata.</p>;
  return <FormInner key={id || 'new'} job={existing || undefined} />;
}

/** Regole del modulo, campo per campo. Il primo errore è quello che riceve il fuoco al salvataggio. */
function validate(d: Draft): Record<string, string> {
  const e: Record<string, string> = {};
  const plate = normPlateText(d.plate, d.plateCountry);
  const vin = d.vin.toUpperCase().replace(/\s+/g, '');
  if (!plate && !vin) e.plate = 'Inserisci la targa o il telaio.';
  if (d.client === 'azienda') {
    const vat = d.company.vat.replace(/\s+/g, '');
    if (!d.company.name.trim()) e.cname = 'Inserisci la ragione sociale.';
    if (!vat && !d.company.cf.trim()) e.cvat = 'Inserisci la partita IVA (o il COE) oppure il codice fiscale.';
    else if (/^\d+$/.test(vat) && vat.length !== 11) e.cvat = `La partita IVA italiana ha 11 cifre (qui ${vat.length}).`;
  } else if (!d.owner.trim()) e.owner = 'Inserisci il nome del proprietario.';
  return e;
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

  useEffect(() => {
    if (!editing && !d.plate) plateRef.current?.focus({ preventScroll: true });
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
    const plate = normPlateText(d.plate, d.plateCountry);
    const vin = d.vin.toUpperCase().replace(/\s+/g, '');
    const company = az ? { ...d.company, vat: d.company.vat.replace(/\s+/g, ''), cf: d.company.cf.toUpperCase().replace(/\s+/g, ''), name: d.company.name.trim() } : { ...EMPTY_COMPANY };
    const all = validate(d);
    const first = Object.keys(all)[0];
    if (first) {
      haptic('warning');
      setTouched(new Set(Object.keys(all)));
      setErrs(all);
      document.getElementById(`f-${first}`)?.focus();
      return;
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
        haptic('success');
        nav(`/job/${created.id}`, { replace: true, state: { justCreated: true } });
      }
    } catch {
      toast.error('Non sono riuscito a salvare. Riprova.');
      setBusy(false);
    }
  };

  const errFor = (f: string) => errs[f] || (err?.field === f ? err.msg : undefined);

  return (
    <Page className="pb-28">
      <TopBar back={job ? `/job/${job.id}` : '/'} backLabel={editing ? 'Scheda' : 'Annulla'} title={editing ? 'Modifica dati' : 'Nuova accettazione'} />
      <form id="job-form" onSubmit={submit} noValidate className="mx-auto flex max-w-[760px] flex-col gap-3 px-4 pt-1">
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
            <Input
              id="f-vin"
              className="tnum tracking-[0.06em] uppercase"
              maxLength={17}
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              value={d.vin}
              onChange={(e) => set('vin', e.target.value.toUpperCase())}
            />
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

        {err && !['plate', 'cname', 'cvat', 'owner'].includes(err.field) && <Note tone="danger">{err.msg}</Note>}
      </form>

      <ActionBar>
        <Button type="submit" form="job-form" variant="primary" size="lg" block disabled={busy}>
          {editing ? 'Salva modifiche' : 'Registra accettazione'}
        </Button>
      </ActionBar>
    </Page>
  );
}
