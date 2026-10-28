import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Building2, ChevronLeft, ChevronRight, Clock, Minus, Package, Plus, ReceiptText } from 'lucide-react';
import { toast } from 'sonner';
import { Page, TopBar } from '@/app/layout';
import { useJobs, useSettings } from '@/app/hooks';
import { VOCI_SUGGERITE } from '@/domain/constants';
import { companyVehicles } from '@/domain/customers';
import { amountInput, eur, fmtDay, fmtPlate, monthLabel, normPlateText, parseAmount, shiftMonth, uid, ymOf } from '@/domain/format';
import { itemText, totale, veic } from '@/domain/logic';
import { companies, monthJobs } from '@/domain/monthly';
import type { LineItem, PlateCountry } from '@/domain/types';
import { createJob } from '@/data/repo';
import { haptic } from '@/platform/native';
import { Button, EmptyState, Field, Input, Section, Segmented } from '@/ui/controls';
import { Plate } from '@/ui/Plate';
import { PlateInput } from '@/features/form/PlateInput';
import { presetMonth } from '@/features/month/MonthPage';

/**
 * Conto lavori di una ditta già cliente: come un registro, si segna volta per volta il lavoro o l'acquisto
 * (es. 5 batterie) con la targa del mezzo, esistente o nuovo. A fine mese da qui si prepara il conto.
 * Ogni voce è una scheda chiusa, così entra da sola nelle Fatture ditte del mese.
 */
export function DittaPage() {
  const { key = '' } = useParams();
  const coKey = decodeURIComponent(key);
  const jobs = useJobs();
  const s = useSettings();
  const nav = useNavigate();
  const co = useMemo(() => companies(jobs || []).find((c) => c.key === coKey), [jobs, coKey]);
  const fleet = useMemo(() => companyVehicles(jobs || [], coKey), [jobs, coKey]);
  const [ym, setYm] = useState(() => ymOf(Date.now()));
  const entries = useMemo(() => monthJobs(jobs || [], coKey, ym), [jobs, coKey, ym]);
  const monthTot = entries.reduce((t, j) => t + totale(j), 0);

  // voce in preparazione
  const [pick, setPick] = useState<string>(''); // chiave del mezzo scelto, '' = nessuno, 'new' = targa nuova
  const [plate, setPlate] = useState('');
  const [country, setCountry] = useState<PlateCountry>('I');
  const [kind, setKind] = useState<'part' | 'labor'>('part');
  const [desc, setDesc] = useState('');
  const [qty, setQty] = useState(1);
  const [unit, setUnit] = useState('');
  const [worker, setWorker] = useState(s.role === 'staff' ? s.staffName || '' : '');
  const [busy, setBusy] = useState(false);

  if (jobs === undefined) return null;
  if (!co)
    return (
      <Page>
        <TopBar back="/mensile" backLabel="Indietro" title="Conto lavori" />
        <EmptyState title="Ditta non trovata">Torna a Fatture ditte e scegli la ditta.</EmptyState>
      </Page>
    );

  const vKey = (v: { plate: string; plateCountry: PlateCountry }) => `${v.plateCountry}:${v.plate}`;
  const chosen = fleet.find((v) => vKey(v) === pick);
  const unitCents = kind === 'labor' && !unit ? s.laborRate || 0 : parseAmount(unit);
  const amount = Math.round(qty * unitCents);
  const plateOk = pick === 'new' ? !!normPlateText(plate, country) : !!chosen;
  const can = plateOk && (kind === 'labor' || desc.trim()) && amount > 0 && !busy;
  const crew = [...new Set([...(s.workers || []), s.staffName || ''].filter(Boolean))];

  const add = async () => {
    if (!can) return;
    setBusy(true);
    const now = Date.now();
    const item: LineItem =
      kind === 'labor' ? { id: uid('i'), desc: desc.trim() || 'Manodopera', kind: 'labor', worker, qty, unit: unitCents, amount } : { id: uid('i'), desc: desc.trim(), qty, unit: unitCents, amount };
    const p = pick === 'new' ? normPlateText(plate, country) : chosen!.plate;
    const pc = pick === 'new' ? country : chosen!.plateCountry;
    try {
      await createJob({
        plate: p,
        plateCountry: pc,
        vin: chosen?.vin || '',
        make: chosen?.make || '',
        model: chosen?.model || '',
        km: '',
        dueDate: '',
        client: 'azienda',
        company: { ...co.company },
        owner: co.owner,
        phone: co.phone,
        wa: co.wa,
        services: [],
        tyres: '',
        request: '',
        notes: '',
        workers: kind === 'labor' && worker ? [worker] : [],
        photoIds: [],
        items: [item],
        deposit: 0,
        vatRate: s.vat ?? 22,
        vatIncl: true,
        billing: 'mensile',
        invoiced: false,
        invoiceNo: '',
        paid: false,
        payMethod: '',
        warrantyMonths: 0,
        warrantyNote: '',
        status: 'consegnato',
        closedAt: now,
        deliveredAt: now,
        quick: true,
      });
      haptic('success');
      toast.success(`Segnato nel conto di ${monthLabel(ymOf(now)).toLowerCase()}`, { description: `${fmtPlate(p, pc)} · ${itemText(item)} · ${eur(amount)}` });
      setYm(ymOf(now));
      setDesc('');
      setQty(1);
      setUnit('');
      if (pick === 'new') {
        setPick(`${pc}:${p}`);
        setPlate('');
      }
    } catch {
      toast.error('Non sono riuscito a salvare. Riprova.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page className="pb-safe-bar lg:pb-10">
      <TopBar back="/mensile" backLabel="Indietro" title="Conto lavori" />
      <div className="mx-auto flex max-w-[760px] flex-col gap-3 px-4">
        <header className="flex items-center gap-3 px-1 pt-1">
          <span className="grid size-12 shrink-0 place-items-center rounded-[14px] bg-accent-soft text-accent-ink">
            <Building2 size={24} />
          </span>
          <span className="min-w-0">
            <h1 className="w-wide truncate text-[1.375rem] leading-tight font-semibold text-ink">{co.name}</h1>
            <span className="tnum block truncate text-[0.875rem] text-ink-3">{co.company.vat || co.company.cf}</span>
          </span>
        </header>

        <Section title="Segna un lavoro o un acquisto">
          <Field label="Mezzo">
            <div className="flex flex-wrap gap-2">
              {fleet.map((v) => (
                <button
                  key={vKey(v)}
                  type="button"
                  aria-pressed={pick === vKey(v)}
                  onClick={() => setPick(vKey(v))}
                  className={`press rounded-[12px] p-1 ${pick === vKey(v) ? 'bg-accent-soft ring-2 ring-accent' : 'ring-1 ring-line hover:ring-line-strong'}`}
                  title={veic(v)}
                >
                  <Plate plate={v.plate} country={v.plateCountry} size="sm" />
                </button>
              ))}
              <button
                type="button"
                aria-pressed={pick === 'new'}
                onClick={() => setPick('new')}
                className={`press flex h-[44px] items-center gap-1.5 rounded-[12px] px-3.5 text-[0.9375rem] font-medium ${pick === 'new' ? 'bg-accent-soft text-accent-ink ring-2 ring-accent' : 'bg-surface-2 text-ink'}`}
              >
                <Plus size={17} strokeWidth={2.4} /> Altra targa
              </button>
            </div>
          </Field>
          {pick === 'new' && (
            <div className="flex flex-col items-center gap-3">
              <PlateInput value={plate} onChange={setPlate} country={country} id="d-plate" />
              <div className="w-full max-w-[420px]">
                <Segmented
                  size="sm"
                  label="Paese della targa"
                  value={country}
                  onChange={setCountry}
                  options={[
                    { v: 'I', l: 'Targa italiana' },
                    { v: 'RSM', l: 'Targa San Marino' },
                  ]}
                />
              </div>
            </div>
          )}
          {chosen && (chosen.make || chosen.model) && <p className="-mt-2 text-[0.875rem] text-ink-3">{veic(chosen)}</p>}

          <Segmented
            label="Tipo di voce"
            value={kind}
            onChange={(k) => {
              setKind(k);
              setUnit('');
            }}
            options={[
              {
                v: 'part',
                l: (
                  <span className="inline-flex items-center gap-1.5">
                    <Package size={16} /> Lavoro o acquisto
                  </span>
                ),
              },
              {
                v: 'labor',
                l: (
                  <span className="inline-flex items-center gap-1.5">
                    <Clock size={16} /> Manodopera
                  </span>
                ),
              },
            ]}
          />

          {kind === 'part' ? (
            <Field label="Descrizione" htmlFor="d-desc">
              <Input id="d-desc" list="d-voci" autoComplete="off" placeholder="Es. Batteria 70Ah" value={desc} onChange={(e) => setDesc(e.target.value)} />
              <datalist id="d-voci">
                {VOCI_SUGGERITE.map((v) => (
                  <option key={v} value={v} />
                ))}
              </datalist>
            </Field>
          ) : (
            <Field label="Chi l'ha fatta" htmlFor="d-worker">
              <select id="d-worker" className="ctl" value={worker} onChange={(e) => setWorker(e.target.value)}>
                <option value="">Non indicato</option>
                {crew.map((w) => (
                  <option key={w} value={w}>
                    {w}
                  </option>
                ))}
              </select>
            </Field>
          )}

          <div className="grid grid-cols-[auto_minmax(0,1fr)] items-end gap-3">
            <Field label={kind === 'labor' ? 'Ore' : 'Quantità'}>
              <div className="flex h-[52px] items-center rounded-[14px] bg-surface-2" role="group" aria-label={kind === 'labor' ? 'Ore' : 'Quantità'}>
                <button
                  type="button"
                  aria-label="Meno"
                  onClick={() => setQty((q) => Math.max(kind === 'labor' ? 0.5 : 1, q - (kind === 'labor' ? 0.5 : 1)))}
                  className="press hit grid size-12 place-items-center text-ink-2"
                >
                  <Minus size={18} strokeWidth={2.4} />
                </button>
                <span className="tnum w-12 text-center text-[1.0625rem] font-semibold text-ink">{qty.toLocaleString('it-IT')}</span>
                <button type="button" aria-label="Più" onClick={() => setQty((q) => q + (kind === 'labor' ? 0.5 : 1))} className="press hit grid size-12 place-items-center text-ink-2">
                  <Plus size={18} strokeWidth={2.4} />
                </button>
              </div>
            </Field>
            <Field label={kind === 'labor' ? 'Tariffa oraria' : qty > 1 ? 'Prezzo cadauno' : 'Prezzo'} htmlFor="d-unit">
              <div className="relative">
                <Input
                  id="d-unit"
                  inputMode="decimal"
                  placeholder={kind === 'labor' && s.laborRate ? amountInput(s.laborRate) : '0,00'}
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  className="tnum !pl-8"
                />
                <span className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-ink-3">€</span>
              </div>
            </Field>
          </div>

          <Button variant="primary" size="lg" block disabled={!can} onClick={add}>
            {busy ? 'Salvo…' : amount > 0 ? `Aggiungi al conto · ${eur(amount)}` : 'Aggiungi al conto'}
          </Button>
          {!plateOk && <p className="-mt-2 text-[0.8438rem] text-ink-3">Scegli il mezzo o scrivi la targa.</p>}
        </Section>

        <Section
          title={
            <span className="flex items-center gap-1">
              <button
                type="button"
                aria-label="Mese precedente"
                onClick={() => setYm(shiftMonth(ym, -1))}
                className="press hit grid size-8 place-items-center rounded-full text-ink-2 hover:bg-surface-2"
              >
                <ChevronLeft size={19} />
              </button>
              <span className="tnum">{monthLabel(ym)}</span>
              <button
                type="button"
                aria-label="Mese successivo"
                onClick={() => setYm(shiftMonth(ym, 1))}
                className="press hit grid size-8 place-items-center rounded-full text-ink-2 hover:bg-surface-2"
              >
                <ChevronRight size={19} />
              </button>
            </span>
          }
          action={<span className="w-cond tnum text-[1.25rem] font-bold text-ink">{eur(monthTot)}</span>}
        >
          {entries.length === 0 ? (
            <p className="text-[0.9375rem] text-ink-2">Ancora niente in questo mese.</p>
          ) : (
            <ul className="-my-1 flex flex-col">
              {entries.map((j, i) => (
                <li key={j.id} className={i ? 'border-t border-line' : ''}>
                  <Link to={`/job/${j.id}`} className="press -mx-2 flex items-center gap-3 rounded-[12px] px-2 py-3 hover:bg-surface-2">
                    <span className="tnum w-12 shrink-0 text-[0.8438rem] text-ink-3">{fmtDay(j.deliveredAt || j.createdAt)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="tnum block truncate text-[0.9688rem] font-semibold text-ink">{fmtPlate(j.plate, j.plateCountry) || veic(j)}</span>
                      <span className="block truncate text-[0.875rem] text-ink-2">{j.items.map(itemText).join(', ') || j.request || 'Intervento'}</span>
                    </span>
                    <span className="w-cond tnum shrink-0 text-[1.0625rem] font-bold text-ink">{eur(totale(j))}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <Button
            variant="outline"
            block
            icon={<ReceiptText size={19} />}
            disabled={!entries.length}
            onClick={() => {
              presetMonth(coKey, ym);
              nav('/mensile');
            }}
          >
            Prepara il conto di {monthLabel(ym).toLowerCase()}
          </Button>
        </Section>
      </div>
    </Page>
  );
}
