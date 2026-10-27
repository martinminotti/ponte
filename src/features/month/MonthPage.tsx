import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { Building2, Check, ChevronDown, ChevronLeft, ChevronRight, Plus, ReceiptText, Search } from 'lucide-react';
import { toast } from 'sonner';
import { Page } from '@/app/layout';
import { useJobs, useSettings, useWide, useWidth } from '@/app/hooks';
import { BrandMark } from '@/app/Shell';
import { PAGAMENTI } from '@/domain/constants';
import { eur, fmtDay, fmtPlate, monthLabel, norm, shiftMonth, ymOf } from '@/domain/format';
import { daSaldare, totale, veic, waLink } from '@/domain/logic';
import { commonNo, companies, compKey, eligible, jobDate, monthJobs, monthTotals, type CompanyGroup } from '@/domain/monthly';
import { monthMsg } from '@/domain/messages';
import type { Job } from '@/domain/types';
import { mutateJob } from '@/data/repo';
import { buildMonthPdf, monthPdfName } from '@/pdf/pdf';
import { haptic } from '@/platform/native';
import { Button, EmptyState, Field, Input, Section, ToggleChip } from '@/ui/controls';
import { Sheet } from '@/ui/Sheet';
import { StatusPill } from '@/ui/status';
import { DocActions } from '@/features/doc/DocActions';
import { MonthPaper } from '@/features/doc/Paper';

let memo = { co: '', ym: ymOf(Date.now()) };

export function MonthPage() {
  const jobs = useJobs();
  const s = useSettings();
  const wide = useWide();
  const [wref, pw] = useWidth<HTMLDivElement>();
  const two = pw >= 1000;
  const nav = useNavigate();
  const cos = useMemo(() => companies(jobs || []), [jobs]);
  const [coKey, setCoKey] = useState(memo.co);
  const [ym, setYm] = useState(memo.ym);
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const [mno, setMno] = useState<string | null>(null);
  const [mpay, setMpay] = useState('');
  const [pick, setPick] = useState(false);
  const [pq, setPq] = useState('');

  const co = cos.find((c) => c.key === coKey) || cos[0];
  memo = { co: co?.key || '', ym };

  const pending = useMemo(() => {
    const m: Record<string, number> = {};
    for (const j of jobs || []) {
      if (j.client !== 'azienda' || j.invoiced || !eligible(j)) continue;
      const k = compKey(j);
      if (k) m[k] = (m[k] || 0) + 1;
    }
    return m;
  }, [jobs]);

  const all = useMemo(() => (co ? monthJobs(jobs || [], co.key, ym) : []), [jobs, co, ym]);
  const isSel = (j: Job) => eligible(j) && (sel[j.id] ?? !j.invoiced);
  const chosen = all.filter(isSel);
  const T = monthTotals(chosen);
  const no = mno ?? commonNo(chosen);
  const allInv = chosen.length > 0 && chosen.every((j) => j.invoiced);
  const allPaid = chosen.length > 0 && chosen.every((j) => j.paid);

  const reset = () => {
    setSel({});
    setMno(null);
  };
  const changeCo = (k: string) => {
    setCoKey(k);
    reset();
    setPick(false);
  };
  const changeYm = (d: number) => {
    setYm((x) => shiftMonth(x, d));
    reset();
  };

  const mark = async (fn: (j: Job, now: number) => Job, msg: string) => {
    const now = Date.now();
    const ids = chosen.map((j) => j.id);
    setSel((x) => ({ ...x, ...Object.fromEntries(ids.map((i) => [i, true])) }));
    try {
      for (const id of ids) await mutateJob(id, (j) => fn(j, now));
      haptic('success');
      toast.success(msg);
    } catch {
      toast.error('Non sono riuscito a salvare tutte le schede. Riprova.');
    }
  };

  if (jobs === undefined) return null;

  const picker = co && (
    <div className="card flex flex-col gap-1 p-2">
      <button type="button" onClick={() => setPick(true)} className="press flex items-center gap-3 rounded-[14px] p-2.5 text-left hover:bg-surface-2">
        <span className="grid size-11 shrink-0 place-items-center rounded-[12px] bg-accent-soft text-accent-ink">
          <Building2 size={22} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="w-semi block truncate text-[1.0625rem] font-semibold text-ink">{co.name}</span>
          <span className="tnum block truncate text-[0.875rem] text-ink-3">{co.company.vat || co.company.cf || 'Ditta'}</span>
        </span>
        <span className="flex items-center gap-1 text-[0.875rem] font-medium text-ink-2">
          {cos.length > 1 && 'Cambia'} <ChevronDown size={18} />
        </span>
      </button>
      <div className="flex items-center justify-between gap-2 border-t border-line px-1 pt-1">
        <button type="button" aria-label="Mese precedente" onClick={() => changeYm(-1)} className="press grid size-11 place-items-center rounded-full text-ink-2 hover:bg-surface-2">
          <ChevronLeft size={22} />
        </button>
        <p className="w-wide tnum text-[1rem] font-semibold text-ink">{monthLabel(ym)}</p>
        <button type="button" aria-label="Mese successivo" onClick={() => changeYm(1)} className="press grid size-11 place-items-center rounded-full text-ink-2 hover:bg-surface-2">
          <ChevronRight size={22} />
        </button>
      </div>
    </div>
  );
  const lavori = co && (
    <>
      {all.length === 0 ? (
        <div className="card">
          <EmptyState title={`Nessun lavoro a ${monthLabel(ym).toLowerCase()}`}>Cambia mese, oppure registra un nuovo lavoro per {co.name}.</EmptyState>
        </div>
      ) : (
        <Section
          title="Lavori del mese"
          action={
            <span className="tnum text-[0.875rem] text-ink-3">
              {chosen.length} di {all.length} nel conto
            </span>
          }
        >
          <ul className="-my-1 flex flex-col">
            {all.map((j, i) => {
              const el = eligible(j);
              const on = isSel(j);
              return (
                <li key={j.id} className={i ? 'border-t border-line' : ''}>
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={on}
                    disabled={!el}
                    onClick={() => {
                      setSel((x) => ({ ...x, [j.id]: !on }));
                      setMno(null);
                    }}
                    className="press -mx-2 flex w-[calc(100%+16px)] items-center gap-3 rounded-[12px] px-2 py-3 text-left hover:bg-surface-2 disabled:opacity-100"
                  >
                    <span
                      className={`grid size-6 shrink-0 place-items-center rounded-[7px] transition-colors ${
                        on ? 'bg-accent text-on-accent' : el ? 'ring-2 ring-inset ring-line-strong' : 'bg-surface-3'
                      }`}
                    >
                      {on && <Check size={16} strokeWidth={3} />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="tnum block truncate text-[0.9688rem] font-semibold text-ink">
                        {fmtDay(jobDate(j))} · {fmtPlate(j.plate, j.plateCountry) || 'senza targa'}
                      </span>
                      <span className="flex items-center gap-2 truncate text-[0.875rem] text-ink-3">
                        <span className="truncate">{veic(j)}</span>
                        {!el ? <StatusPill s={j.status} size="sm" /> : j.invoiced ? <span className="shrink-0 text-ok">fatturato{j.invoiceNo ? ` n. ${j.invoiceNo}` : ''}</span> : null}
                      </span>
                    </span>
                    <span className={`w-cond tnum shrink-0 text-[1.1875rem] font-bold ${on ? 'text-ink' : 'text-ink-3'}`}>{eur(totale(j))}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </Section>
      )}
    </>
  );
  const fattura = (
    <Section title="Fattura e incasso">
      <Field label="Numero fattura" htmlFor="m-no">
        <Input id="m-no" autoComplete="off" placeholder="Es. 2026/118" value={no} onChange={(e) => setMno(e.target.value)} />
      </Field>
      {allInv ? (
        <div className="flex items-center justify-between gap-2 rounded-[16px] bg-ok-soft p-3.5 pl-4 font-semibold text-ok">
          <span className="flex items-center gap-2">
            <Check size={20} strokeWidth={2.6} /> Fattura emessa
          </span>
          <Button size="sm" variant="ghost" className="!text-ok" onClick={() => mark((j) => ({ ...j, invoiced: false, invoicedAt: undefined }), 'Fatture annullate')}>
            Annulla
          </Button>
        </div>
      ) : (
        <Button
          variant="outline"
          block
          icon={<ReceiptText size={19} />}
          onClick={() =>
            mark(
              (j, now) => ({
                ...j,
                invoiced: true,
                invoicedAt: now,
                invoiceNo: no,
              }),
              `${chosen.length} lavori segnati come fatturati`,
            )
          }
        >
          Segna fattura emessa
        </Button>
      )}

      <div className="h-px bg-line" />

      {allPaid ? (
        <div className="flex items-center justify-between gap-2 rounded-[16px] bg-ok-soft p-3.5 pl-4 font-semibold text-ok">
          <span className="flex items-center gap-2">
            <Check size={20} strokeWidth={2.6} /> Incassato
          </span>
          <Button
            size="sm"
            variant="ghost"
            className="!text-ok"
            onClick={() =>
              mark(
                (j) => ({
                  ...j,
                  paid: false,
                  paidAt: undefined,
                  paidAmount: undefined,
                }),
                'Incasso annullato',
              )
            }
          >
            Annulla
          </Button>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Metodo di pagamento">
            {PAGAMENTI.map((p) => (
              <ToggleChip key={p} on={mpay === p} onClick={() => setMpay(mpay === p ? '' : p)}>
                {p}
              </ToggleChip>
            ))}
          </div>
          <Button
            variant="primary"
            size="lg"
            block
            disabled={!mpay}
            onClick={() =>
              mark(
                (j, now) => ({
                  ...j,
                  paid: true,
                  paidAt: now,
                  paidAmount: daSaldare(j),
                  payMethod: mpay,
                }),
                `Incassati ${eur(T.due)}`,
              )
            }
          >
            Segna incassato {T.due > 0 ? eur(T.due) : ''}
          </Button>
        </>
      )}
    </Section>
  );
  const docCard = co && (
    <div className="card p-4 sm:p-5">
      <DocActions
        build={() => buildMonthPdf(co, chosen, ym, no, s)}
        name={monthPdfName(co, ym)}
        waHref={co.wa ? waLink(co.phone, monthMsg(co, chosen, ym, no, s), s.prefix) : null}
        waNote="Il documento raccoglie i lavori selezionati con data, targa e voci. Segna la fattura emessa dopo averla fatta nel gestionale."
      />
    </div>
  );
  const newBtn = co && (
    <Button variant="ghost" block icon={<Plus size={19} strokeWidth={2.4} />} onClick={() => nav('/nuova?cl=azienda', { state: { prefill: prefillFor(co) } })}>
      Nuovo lavoro per {co.name}
    </Button>
  );

  return (
    <Page className="pb-safe-bar lg:pb-10">
      <div ref={wref} aria-hidden="true" className="h-0 w-full" />
      <div className="mx-auto px-4 lg:px-8 lg:pt-4" style={{ maxWidth: two ? 1280 : 760 }}>
        {!wide && (
          <header className="pt-[calc(env(safe-area-inset-top,0px)+16px)]">
            <BrandMark />
          </header>
        )}
        <h1 className="w-wide mt-5 text-[1.625rem] font-semibold tracking-[-0.01em] text-ink lg:text-[2.125rem] lg:tracking-[-0.02em]">Fatture ditte</h1>
        <p className="mt-1 max-w-[52ch] text-[0.9375rem] text-ink-2">I lavori di ogni ditta si raccolgono durante il mese: qui prepari un solo conto con tutte le voci e l'IVA divisa per aliquota.</p>

        {!co ? (
          <div className="card mt-5">
            <EmptyState art={<Building2 size={40} className="text-ink-3" />} title="Nessuna ditta in archivio">
              Registra le accettazioni come Azienda: i loro lavori compariranno qui, pronti per la fattura mensile.
            </EmptyState>
          </div>
        ) : (
          <div className="mt-5">
            {two ? (
              <div className="grid grid-cols-[minmax(0,440px)_minmax(0,1fr)] items-start gap-5">
                <div className="flex flex-col gap-3">
                  {picker}
                  {lavori}
                  {chosen.length > 0 && fattura}
                  {chosen.length > 0 && docCard}
                  {newBtn}
                </div>
                {chosen.length > 0 ? (
                  <MonthPaper co={co} list={chosen} ym={ym} no={no} s={s} />
                ) : (
                  <div className="card grid min-h-[420px] place-items-center p-10 text-center text-[0.9375rem] text-ink-2">Seleziona i lavori del mese: qui compare l'anteprima del conto.</div>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {picker}
                {lavori}
                {chosen.length > 0 && (
                  <>
                    <MonthPaper co={co} list={chosen} ym={ym} no={no} s={s} />
                    {fattura}
                    {docCard}
                  </>
                )}
                {newBtn}
              </div>
            )}
          </div>
        )}
      </div>

      <Sheet open={pick} onOpenChange={setPick} title="Scegli la ditta">
        {cos.length > 6 && (
          <label className="relative mb-3 block">
            <Search size={18} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-ink-3" />
            <input className="ctl pl-10" placeholder="Cerca ditta o partita IVA" value={pq} onChange={(e) => setPq(e.target.value)} />
          </label>
        )}
        <ul className="flex flex-col gap-1">
          {cos
            .filter((c) => !pq || norm(c.name + c.company.vat).includes(norm(pq)))
            .map((c) => (
              <li key={c.key}>
                <button
                  type="button"
                  onClick={() => changeCo(c.key)}
                  className={`press flex w-full items-center gap-3 rounded-[14px] p-3 text-left ${c.key === co?.key ? 'bg-accent-soft' : 'hover:bg-surface-2'}`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[1rem] font-semibold text-ink">{c.name}</span>
                    <span className="tnum block truncate text-[0.875rem] text-ink-3">{c.company.vat || c.company.cf}</span>
                  </span>
                  {pending[c.key] ? <span className="tnum rounded-full bg-warn-soft px-2.5 py-1 text-[0.8125rem] font-semibold text-warn">{pending[c.key]} da fatturare</span> : null}
                  {c.key === co?.key && <Check size={20} className="text-accent-ink" />}
                </button>
              </li>
            ))}
        </ul>
      </Sheet>
    </Page>
  );
}

function prefillFor(co: CompanyGroup): Partial<Job> {
  return {
    client: 'azienda',
    company: { ...co.company },
    owner: co.owner,
    phone: co.phone,
    wa: co.wa,
  };
}
