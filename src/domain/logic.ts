import type { Job, Settings, StatusKey } from './types';
import type { FilterKey } from './constants';
import { norm } from './format';

export const isAz = (j: Pick<Job, 'client'> | null | undefined): boolean => j?.client === 'azienda';

export function custName(j: Job): string {
  return isAz(j) ? j.company?.name || j.owner || '' : j.owner || '';
}

export function veic(j: Pick<Job, 'make' | 'model'>): string {
  return [j.make, j.model].filter(Boolean).join(' ') || 'Veicolo';
}

export function itemsSum(j: Pick<Job, 'items'>): number {
  return (j.items || []).reduce((t, i) => t + (Math.round(Number(i.amount)) || 0), 0);
}

export interface Totals {
  net: number;
  vat: number;
  gross: number;
  rate: number;
}

/** Importi del lavoro in centesimi. I privati non hanno IVA esposta. */
export function calc(j: Pick<Job, 'items' | 'client' | 'vatRate' | 'vatIncl'>): Totals {
  const s = itemsSum(j);
  if (!isAz(j)) return { net: s, vat: 0, gross: s, rate: 0 };
  const rate = Number(j.vatRate) || 0;
  const r = rate / 100;
  if (j.vatIncl === false) {
    const vat = Math.round(s * r);
    return { net: s, vat, gross: s + vat, rate };
  }
  const net = Math.round(s / (1 + r));
  return { net, vat: s - net, gross: s, rate };
}

export const totale = (j: Job): number => calc(j).gross;

export function daSaldare(j: Job): number {
  if (j.paid) return 0;
  return Math.max(0, totale(j) - (Number(j.deposit) || 0));
}

export const billingOf = (j: Job) => j.billing || 'mensile';
export const monthlyPending = (j: Job): boolean => isAz(j) && billingOf(j) === 'mensile' && !j.invoiced;
export const isClosedStatus = (s: StatusKey): boolean => s === 'pronto' || s === 'consegnato';

export function isDue(j: Job): boolean {
  return !j.paid && !monthlyPending(j) && isClosedStatus(j.status) && daSaldare(j) > 0;
}

export function toInvoice(j: Job): boolean {
  return isAz(j) && isClosedStatus(j.status) && !j.invoiced;
}

export function inFilter(j: Job, f: FilterKey): boolean {
  switch (f) {
    case 'officina':
      return !isClosedStatus(j.status);
    case 'pronti':
      return j.status === 'pronto';
    case 'saldo':
      return isDue(j);
    case 'fatturare':
      return toInvoice(j);
    case 'chiusi':
      return j.status === 'consegnato' && !isDue(j);
    default:
      return true;
  }
}

export function searchHay(j: Job): string {
  return [
    j.plate,
    j.vin,
    j.owner,
    j.phone,
    j.make,
    j.model,
    String(j.number || ''),
    (j.workers || []).join(' '),
    j.company ? [j.company.name, j.company.vat, j.company.cf].join(' ') : '',
  ]
    .map(norm)
    .join(' ');
}

export function matchJob(j: Job, q: string): boolean {
  const toks = q.trim().split(/\s+/).filter(Boolean);
  if (!toks.length) return true;
  const hay = searchHay(j);
  return toks.every((t) => {
    const n = norm(t);
    return !n || hay.includes(n);
  });
}

/** Scadenza garanzia: dalla consegna (o chiusura), altrimenti da adesso. */
export function scadenza(j: Job, now = Date.now()): number {
  const b = new Date(j.deliveredAt || j.closedAt || now);
  b.setMonth(b.getMonth() + (j.warrantyMonths || 0));
  return b.getTime();
}

/** Numero per wa.me: cifre con prefisso internazionale, senza "+". */
export function waNumber(p: string, prefix = '39'): string {
  const raw = String(p || '').trim();
  if (!raw) return '';
  let d = raw.replace(/[^\d+]/g, '');
  if (d.charAt(0) === '+') return d.slice(1).replace(/\D/g, '');
  d = d.replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('00')) return d.slice(2);
  const pre = prefix || '39';
  if (d.startsWith(pre) && d.length >= 11) return d;
  return pre + d;
}

export function waLink(phone: string, text: string, prefix: string): string | null {
  const n = waNumber(phone, prefix);
  return n ? `https://wa.me/${n}?text=${encodeURIComponent(text)}` : null;
}

/** Applica un cambio di stato con cronologia e date di chiusura/consegna. */
export function withStatus(j: Job, k: StatusKey, now = Date.now()): Job {
  if (j.status === k) return j;
  const next: Job = { ...j, status: k, history: [...(j.history || []), { s: k, t: now }], updatedAt: now };
  if (k === 'pronto' && !next.closedAt) next.closedAt = now;
  if (k === 'consegnato') {
    next.deliveredAt = now;
    if (!next.closedAt) next.closedAt = now;
  } else {
    delete next.deliveredAt;
  }
  return next;
}

export function plateKey(j: Pick<Job, 'plate' | 'plateCountry'>): string {
  const p = norm(j.plate);
  return p ? `${j.plateCountry || 'I'}:${p}` : '';
}

/** Altre schede dello stesso veicolo (stessa targa e paese, oppure stesso telaio). */
export function sameVehicle(a: Job, b: Pick<Job, 'id' | 'plate' | 'plateCountry' | 'vin'>): boolean {
  if (a.id === b.id) return false;
  const pk = plateKey(b);
  const v = norm(b.vin);
  return (!!pk && plateKey(a) === pk) || (v.length >= 10 && norm(a.vin) === v);
}

export function defaultsFromSettings(s: Settings) {
  return {
    vatRate: s.vat ?? 22,
    warrantyMonths: s.warranty ?? 12,
  };
}
