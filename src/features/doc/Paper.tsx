import type { ReactNode } from 'react';
import type { Job, Settings } from '@/domain/types';
import { eur, fmtDate, fmtPlate, jobNumber, monthLabel } from '@/domain/format';
import { calc, custName, daSaldare, isAz, monthlyPending, scadenza, totale, veic } from '@/domain/logic';
import { jobDate, monthTotals, rateKeys, type CompanyGroup } from '@/domain/monthly';
import { okHex } from '@/platform/brand';
import { DEFAULT_ACCENT } from '@/domain/types';
import { Plate } from '@/ui/Plate';

/* Anteprima a schermo del documento: sempre su carta bianca, anche in tema scuro. */

function Shell({ s, title, meta, children }: { s: Settings; title: string; meta: string[]; children: ReactNode }) {
  const pa = okHex(s.accent) ? s.accent : DEFAULT_ACCENT;
  return (
    <article
      className="print-area relative flex flex-col gap-5 overflow-hidden rounded-[6px] bg-white px-5 pt-7 pb-5 text-[13.5px] text-[#1a1f25] shadow-[0_1px_2px_rgba(0,0,0,.08),0_18px_40px_-18px_rgba(0,0,0,.35)] sm:px-8 sm:pt-9 sm:pb-7"
      style={{ ['--pa' as string]: pa, colorScheme: 'light' }}
    >
      <div aria-hidden="true" className="absolute inset-x-0 top-0 h-[5px]" style={{ background: pa }} />
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-[#d6dbe0] pb-4">
        <div className="flex min-w-0 items-center gap-3">
          {s.logo && (
            <span className="grid size-14 shrink-0 place-items-center">
              <img src={s.logo} alt="" className="max-h-full max-w-full object-contain" />
            </span>
          )}
          <div className="min-w-0">
            <p className="w-wide text-[18px] leading-tight font-bold break-words">{s.shop || 'Officina'}</p>
            {s.shopAddr && <p className="text-[12.5px] text-[#68707a]">{s.shopAddr}</p>}
            {(s.shopVat || s.shopPhone) && <p className="text-[12.5px] text-[#68707a]">{[s.shopVat && `P.IVA/COE ${s.shopVat}`, s.shopPhone && `Tel. ${s.shopPhone}`].filter(Boolean).join('   ')}</p>}
          </div>
        </div>
        <div className="text-right">
          <p className="w-cond text-[20px] leading-none font-bold tracking-[0.03em]" style={{ color: pa }}>
            {title}
          </p>
          {meta.map((m) => (
            <p key={m} className="tnum mt-1 text-[12.5px] text-[#68707a]">
              {m}
            </p>
          ))}
        </div>
      </header>
      {children}
    </article>
  );
}

function Lab({ children }: { children: ReactNode }) {
  return (
    <h4 className="mb-1 text-[11px] font-bold tracking-[0.06em] uppercase" style={{ color: 'var(--pa)' }}>
      {children}
    </h4>
  );
}

function Box({ children }: { children: ReactNode }) {
  return <section className="flex min-w-0 flex-col items-start gap-1 rounded-[8px] bg-[#f4f5f7] px-4 py-3.5">{children}</section>;
}

function Totals({ rows, big }: { rows: [string, string][]; big: [string, string] }) {
  return (
    <dl className="ml-auto flex w-full max-w-[320px] flex-col gap-1.5">
      {rows.map(([l, v]) => (
        <div key={l} className="flex items-baseline justify-between gap-3">
          <dt>{l}</dt>
          <dd className="tnum">{v}</dd>
        </div>
      ))}
      <div className="mt-1 flex items-baseline justify-between gap-3 border-t border-[#d6dbe0] pt-2.5">
        <dt className="font-semibold">{big[0]}</dt>
        <dd className="w-cond tnum text-[28px] leading-none font-bold" style={{ color: 'var(--pa)' }}>
          {big[1]}
        </dd>
      </div>
    </dl>
  );
}

function Table({ children }: { children: ReactNode }) {
  return (
    <div className="-mx-1 overflow-x-auto px-1">
      <table className="w-full border-collapse">
        <thead>
          <tr className="text-white" style={{ background: 'var(--pa)' }}>
            <th className="px-3 py-2 text-left font-semibold">Descrizione</th>
            <th className="px-3 py-2 text-right font-semibold">Importo</th>
          </tr>
        </thead>
        <tbody className="[&_td]:border-b [&_td]:border-[#e6e9ed] [&_td]:px-3 [&_td]:py-2 [&_td:last-child]:text-right [&_td:last-child]:whitespace-nowrap [&_td:last-child]:tabular-nums">
          {children}
        </tbody>
      </table>
    </div>
  );
}

export function JobPaper({ j, s }: { j: Job; s: Settings }) {
  const az = isAz(j);
  const items = j.items.filter((i) => i.desc || i.amount);
  const c = calc(j);
  const tot = totale(j);
  const due = daSaldare(j);
  const rows: [string, string][] = [];
  if (az) rows.push(['Imponibile', eur(c.net)], [`IVA ${c.rate}%`, eur(c.vat)]);
  rows.push([az ? 'Totale documento' : 'Totale lavori', eur(tot)]);
  if (j.deposit > 0) rows.push(['Acconto versato', `− ${eur(j.deposit)}`]);
  return (
    <Shell
      s={s}
      title={az ? 'CONTO PER FATTURA' : 'CONTO LAVORI'}
      meta={[`Scheda N. ${jobNumber(j.number)}`, fmtDate(j.deliveredAt || j.closedAt || Date.now()), ...(j.invoiceNo ? [`Fattura n. ${j.invoiceNo}`] : [])]}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Box>
          <Lab>{az ? 'Intestatario fattura' : 'Cliente'}</Lab>
          <p className="w-semi text-[16px] font-semibold">{custName(j) || '—'}</p>
          {az &&
            [j.company.vat && `P.IVA/COE ${j.company.vat}`, j.company.cf && `C.F. ${j.company.cf}`, j.company.addr, j.company.sdi && `SDI/PEC ${j.company.sdi}`, j.owner && `Rif. ${j.owner}`]
              .filter(Boolean)
              .map((x) => (
                <p key={x as string} className="text-[12.5px] text-[#68707a]">
                  {x}
                </p>
              ))}
          {j.phone && <p className="text-[12.5px] text-[#68707a]">Tel. {j.phone}</p>}
        </Box>
        <Box>
          <Lab>Veicolo</Lab>
          <Plate plate={j.plate} country={j.plateCountry} size="sm" />
          <p className="w-semi mt-1 text-[16px] font-semibold">{veic(j)}</p>
          {j.vin && <p className="tnum text-[12.5px] text-[#68707a]">Telaio {j.vin}</p>}
          <p className="text-[12.5px] text-[#68707a]">
            {j.km ? `${j.km} km, ` : ''}entrata {fmtDate(j.createdAt)}
          </p>
        </Box>
      </div>
      {j.workers.length > 0 && (
        <p>
          <b>Lavoro eseguito da</b> {j.workers.join(', ')}
        </p>
      )}
      {j.request && (
        <div>
          <Lab>Lavori richiesti</Lab>
          <p className="whitespace-pre-wrap">{j.request}</p>
        </div>
      )}
      <div>
        {az && <p className="mb-1.5 text-[12.5px] text-[#68707a] italic">Importi delle voci IVA {j.vatIncl === false ? 'esclusa' : 'inclusa'}</p>}
        <Table>
          {items.length ? (
            items.map((i, n) => (
              <tr key={i.id} className={n % 2 ? 'bg-[#f7f8fa]' : ''}>
                <td>{i.desc || 'Voce'}</td>
                <td>{eur(i.amount)}</td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={2} className="!text-left text-[#68707a] italic">
                Nessuna voce inserita
              </td>
            </tr>
          )}
        </Table>
      </div>
      <Totals rows={rows} big={[j.paid ? 'Saldato' : 'Da saldare', eur(j.paid ? (j.paidAmount ?? tot) : due)]} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Box>
          <Lab>Pagamento</Lab>
          <p className="w-semi text-[16px] font-semibold">{j.paid ? 'Saldato' : monthlyPending(j) ? 'Fattura di fine mese' : due > 0 ? 'Da saldare' : 'Nessun importo'}</p>
          <p className="text-[12.5px] text-[#68707a]">
            {j.paid ? `${fmtDate(j.paidAt)}${j.payMethod ? `, ${j.payMethod}` : ''}` : monthlyPending(j) ? 'Incluso nella fattura mensile' : j.payMethod ? `Metodo: ${j.payMethod}` : ''}
          </p>
        </Box>
        <Box>
          <Lab>Garanzia lavori</Lab>
          <p className="w-semi text-[16px] font-semibold">{j.warrantyMonths > 0 ? `${j.warrantyMonths} mesi` : 'Nessuna'}</p>
          {j.warrantyMonths > 0 && (
            <p className="text-[12.5px] text-[#68707a]">
              Fino al {fmtDate(scadenza(j))}
              {j.warrantyNote ? `, ${j.warrantyNote}` : ''}
            </p>
          )}
        </Box>
      </div>
      <p className="border-t border-[#d6dbe0] pt-3 text-center text-[11.5px] text-[#68707a]">
        {az ? 'Riepilogo per la fatturazione, non è una fattura.' : 'Riepilogo lavori, non valido ai fini fiscali.'}
      </p>
    </Shell>
  );
}

export function MonthPaper({ co, list, ym, no, s }: { co: CompanyGroup; list: Job[]; ym: string; no: string; s: Settings }) {
  const T = monthTotals(list);
  const c = co.company;
  const rows: [string, string][] = [
    ['Imponibile', eur(T.net)],
    ...rateKeys(T).map((r) => [`IVA ${r}% su ${eur(T.by[r].net)}`, eur(T.by[r].vat)] as [string, string]),
    ['Totale documento', eur(T.gross)],
  ];
  if (T.dep > 0) rows.push(['Acconti versati', `− ${eur(T.dep)}`]);
  return (
    <Shell s={s} title="CONTO MENSILE" meta={[monthLabel(ym), `${list.length} ${list.length === 1 ? 'lavoro' : 'lavori'}`, ...(no ? [`Fattura n. ${no}`] : [])]}>
      <Box>
        <Lab>Intestatario fattura</Lab>
        <p className="w-semi text-[16px] font-semibold">{co.name}</p>
        {[c.vat && `P.IVA/COE ${c.vat}`, c.cf && `C.F. ${c.cf}`, c.addr, c.sdi && `SDI/PEC ${c.sdi}`].filter(Boolean).map((x) => (
          <p key={x as string} className="text-[12.5px] text-[#68707a]">
            {x}
          </p>
        ))}
      </Box>
      <Table>
        {list.map((j) => (
          <JobRows key={j.id} j={j} />
        ))}
      </Table>
      <Totals rows={rows} big={[T.due > 0 ? 'Da saldare' : 'Saldato', eur(T.due > 0 ? T.due : T.gross)]} />
      <p className="border-t border-[#d6dbe0] pt-3 text-center text-[11.5px] text-[#68707a]">Riepilogo per la fatturazione, non è una fattura.</p>
    </Shell>
  );
}

function JobRows({ j }: { j: Job }) {
  const items = j.items.filter((i) => i.desc || i.amount);
  return (
    <>
      <tr className="bg-[#eaedf1]">
        <td colSpan={2} className="!text-left font-semibold !whitespace-normal">
          {fmtDate(jobDate(j))} · {fmtPlate(j.plate, j.plateCountry) || 'senza targa'} · {veic(j)}
        </td>
      </tr>
      {items.length ? (
        items.map((i) => (
          <tr key={i.id}>
            <td>{i.desc || 'Voce'}</td>
            <td>{eur(i.amount)}</td>
          </tr>
        ))
      ) : (
        <tr>
          <td colSpan={2} className="!text-left text-[#68707a] italic">
            Nessuna voce
          </td>
        </tr>
      )}
      <tr className="text-[12.5px] text-[#68707a] italic">
        <td>
          Totale lavoro con IVA {calc(j).rate}%{j.vatIncl === false ? ' (voci sopra IVA esclusa)' : ''}
        </td>
        <td className="font-semibold text-[#1a1f25] not-italic">{eur(calc(j).gross)}</td>
      </tr>
    </>
  );
}
