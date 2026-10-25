import type { Job, Settings, StatusKey } from './types';
import { eur, fmtDate, fmtDay, fmtPlate, monthLabel } from './format';
import { calc, daSaldare, isAz, monthlyPending, scadenza, totale, veic } from './logic';
import type { CompanyGroup, MonthTotals } from './monthly';
import { jobDate, monthTotals, rateKeys } from './monthly';

export function riepilogo(j: Job): string {
  let t = '';
  const items = (j.items || []).filter((i) => i.desc || i.amount);
  if (items.length) {
    t += '\n\nLavori eseguiti:\n' + items.map((i) => `• ${i.desc || 'Voce'} – ${eur(i.amount)}`).join('\n');
  }
  const tot = totale(j);
  if (tot > 0) {
    if (isAz(j)) {
      const c = calc(j);
      t += `\n\nImponibile: ${eur(c.net)}\nIVA ${c.rate}%: ${eur(c.vat)}`;
    }
    t += (isAz(j) ? '\n' : '\n\n') + `Totale: ${eur(tot)}`;
    if (j.deposit > 0) t += `\nAcconto versato: ${eur(j.deposit)}`;
    t += j.paid
      ? `\nPagato${j.payMethod ? ` (${j.payMethod})` : ''}.`
      : monthlyPending(j)
        ? '\nSarà incluso nella fattura di fine mese.'
        : `\nDa saldare: ${eur(daSaldare(j))}`;
  }
  if (j.warrantyMonths > 0) {
    t += `\n\nGaranzia sui lavori: ${j.warrantyMonths} mesi, fino al ${fmtDate(scadenza(j))}.`;
    if (j.warrantyNote) t += ` ${j.warrantyNote}.`;
  }
  return t;
}

export function buildMsg(j: Job, kind: StatusKey, s: Pick<Settings, 'shop'>): string {
  const sh = s.shop || '';
  const v = veic(j) + (j.plate ? ` (${fmtPlate(j.plate, j.plateCountry)})` : '');
  const name = j.owner || (isAz(j) ? j.company?.name : '') || '';
  const hi = `Buongiorno${name ? ' ' + name : ''},`;
  const T: Record<StatusKey, string> = {
    accettato: `${hi} abbiamo preso in carico ${v} il ${fmtDate(j.createdAt)}. Ti aggiorniamo noi sullo stato dei lavori.`,
    diagnosi: `${hi} ${v} è in diagnosi: stiamo controllando e ti diciamo presto cosa serve.`,
    ricambi: `${hi} per ${v} siamo in attesa dei ricambi. Appena arrivano riprendiamo i lavori.`,
    lavorazione: `${hi} sono iniziati i lavori su ${v}.`,
    pronto: `${hi} ${v} e il conto sono pronti. Puoi passare a ritirare.` + riepilogo(j),
    consegnato:
      `${hi}${sh ? ` grazie per aver scelto ${sh}` : ' grazie per averci scelto'}. Ecco il riepilogo dei lavori su ${v}.` +
      riepilogo(j),
  };
  return (T[kind] || T.accettato) + (sh ? `\n\n${sh}` : '');
}

export function monthMsg(co: CompanyGroup, list: Job[], ym: string, no: string, s: Pick<Settings, 'shop'>): string {
  const T: MonthTotals = monthTotals(list);
  const hi = `Buongiorno ${co.owner || co.name},`;
  const t =
    `${hi} ecco il riepilogo dei lavori di ${monthLabel(ym).toLowerCase()} per ${co.name}:\n\n` +
    list.map((j) => `• ${fmtDay(jobDate(j))} ${fmtPlate(j.plate, j.plateCountry) || veic(j)} – ${eur(totale(j))}`).join('\n') +
    `\n\nImponibile: ${eur(T.net)}` +
    rateKeys(T)
      .map((r) => `\nIVA ${r}%: ${eur(T.by[r].vat)}`)
      .join('') +
    `\nTotale: ${eur(T.gross)}` +
    (no ? `\nFattura n. ${no}` : '') +
    '\n\nTi mandiamo anche il PDF con il dettaglio completo.';
  return t + (s.shop ? `\n\n${s.shop}` : '');
}
