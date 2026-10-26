import type { Company, Job } from './types';
import { norm, ymOf } from './format';
import { calc, custName, daSaldare, isAz, isClosedStatus } from './logic';

export interface CompanyGroup {
  key: string;
  name: string;
  company: Company;
  owner: string;
  phone: string;
  wa: boolean;
}

export function compKey(j: Job): string {
  const c = j.company || ({} as Company);
  return norm(c.vat) || norm(c.cf) || norm(c.name);
}

/** Ditte presenti in archivio, con i dati della scheda più recente. */
export function companies(jobs: Job[]): CompanyGroup[] {
  const m = new Map<string, CompanyGroup & { at: number }>();
  for (const j of jobs) {
    if (!isAz(j)) continue;
    const k = compKey(j);
    if (!k) continue;
    const prev = m.get(k);
    if (!prev || j.createdAt > prev.at) {
      m.set(k, { key: k, name: custName(j), company: j.company, owner: j.owner || '', phone: j.phone || '', wa: j.wa !== false, at: j.createdAt });
    }
  }
  return [...m.values()].map(({ at: _at, ...c }) => c).sort((a, b) => a.name.localeCompare(b.name, 'it'));
}

export const jobDate = (j: Job): number => j.deliveredAt || j.closedAt || j.createdAt;
export const eligible = (j: Job): boolean => isClosedStatus(j.status);

export function monthJobs(jobs: Job[], co: string, ym: string): Job[] {
  return jobs.filter((j) => isAz(j) && compKey(j) === co && ymOf(jobDate(j)) === ym).sort((a, b) => jobDate(a) - jobDate(b));
}

export interface MonthTotals {
  by: Record<number, { net: number; vat: number }>;
  net: number;
  vat: number;
  gross: number;
  dep: number;
  due: number;
}

export function monthTotals(list: Job[]): MonthTotals {
  const T: MonthTotals = { by: {}, net: 0, vat: 0, gross: 0, dep: 0, due: 0 };
  for (const j of list) {
    const c = calc(j);
    const b = (T.by[c.rate] ||= { net: 0, vat: 0 });
    b.net += c.net;
    b.vat += c.vat;
    T.net += c.net;
    T.vat += c.vat;
    T.gross += c.gross;
    T.dep += j.paid ? 0 : Number(j.deposit) || 0;
    T.due += daSaldare(j);
  }
  return T;
}

export const rateKeys = (T: MonthTotals): number[] =>
  Object.keys(T.by)
    .map(Number)
    .sort((a, b) => b - a);

export function commonNo(list: Job[]): string {
  const n = [...new Set(list.map((j) => j.invoiceNo || ''))];
  return n.length === 1 ? n[0] : '';
}
