import type { Job, StatusKey } from './types';
import { ymOf } from './format';
import { daSaldare, isClosedStatus, isDue, toInvoice, totale } from './logic';
import { compKey } from './monthly';

const DAY = 86_400_000;

function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Lunedì 00:00 della settimana di ts. */
export function startOfWeek(ts: number): number {
  const d = new Date(startOfDay(ts));
  const dow = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dow);
  return d.getTime();
}

function isoDayToTs(s: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
  return m ? new Date(+m[1], +m[2] - 1, +m[3]).getTime() : null;
}

export interface Delivery {
  job: Job;
  /** giorni da oggi: negativo = in ritardo, 0 = oggi, 1 = domani */
  days: number;
}

export interface WeekBar {
  start: number;
  amount: number;
}

export interface Dashboard {
  inShop: number;
  byStatus: { s: StatusKey; n: number }[];
  ready: Job[];
  due: { n: number; amount: number };
  invoice: { n: number; companies: number; amount: number };
  month: { amount: number; prev: number; n: number };
  weeks: WeekBar[];
  deliveries: Delivery[];
  recent: Job[];
}

const SHOP_STATES: StatusKey[] = ['accettato', 'diagnosi', 'ricambi', 'lavorazione'];

/** Il riepilogo della giornata in officina, calcolato dalle schede. */
export function dashboard(jobs: Job[], now = Date.now(), weeks = 8): Dashboard {
  const open = jobs.filter((j) => !isClosedStatus(j.status));
  const byStatus = SHOP_STATES.map((s) => ({ s, n: open.filter((j) => j.status === s).length }));

  const ready = jobs.filter((j) => j.status === 'pronto').sort((a, b) => (a.closedAt || a.createdAt) - (b.closedAt || b.createdAt));

  const dueJobs = jobs.filter(isDue);
  const invJobs = jobs.filter(toInvoice);

  const ym = ymOf(now);
  const prevD = new Date(now);
  prevD.setDate(1);
  prevD.setMonth(prevD.getMonth() - 1);
  const prevYm = ymOf(prevD.getTime());
  const paid = jobs.filter((j) => j.paid && j.paidAt);
  const paidAmount = (j: Job) => j.paidAmount ?? totale(j);
  const month = {
    amount: paid.filter((j) => ymOf(j.paidAt!) === ym).reduce((t, j) => t + paidAmount(j), 0),
    prev: paid.filter((j) => ymOf(j.paidAt!) === prevYm).reduce((t, j) => t + paidAmount(j), 0),
    n: paid.filter((j) => ymOf(j.paidAt!) === ym).length,
  };

  // settimane per calendario (non per millisecondi: il cambio dell'ora sposterebbe i confini)
  const bars: WeekBar[] = Array.from({ length: weeks }, (_, i) => {
    const d = new Date(startOfWeek(now));
    d.setDate(d.getDate() - (weeks - 1 - i) * 7);
    return { start: d.getTime(), amount: 0 };
  });
  const byStart = new Map(bars.map((b) => [b.start, b]));
  for (const j of paid) {
    const b = byStart.get(startOfWeek(j.paidAt!));
    if (b) b.amount += paidAmount(j);
  }

  const today = startOfDay(now);
  const deliveries: Delivery[] = [];
  for (const j of jobs) {
    if (j.status === 'consegnato') continue;
    const t = isoDayToTs(j.dueDate);
    if (t == null) continue;
    const days = Math.round((t - today) / DAY);
    if (days <= 1) deliveries.push({ job: j, days });
  }
  deliveries.sort((a, b) => a.days - b.days || a.job.createdAt - b.job.createdAt);

  return {
    inShop: open.length,
    byStatus,
    ready,
    due: { n: dueJobs.length, amount: dueJobs.reduce((t, j) => t + daSaldare(j), 0) },
    invoice: { n: invJobs.length, companies: new Set(invJobs.map(compKey)).size, amount: invJobs.reduce((t, j) => t + totale(j), 0) },
    month,
    weeks: bars,
    deliveries,
    recent: [...jobs].sort((a, b) => b.createdAt - a.createdAt).slice(0, 3),
  };
}

export function greeting(now = Date.now()): string {
  const h = new Date(now).getHours();
  if (h < 5) return 'Buonanotte';
  if (h < 13) return 'Buongiorno';
  if (h < 18) return 'Buon pomeriggio';
  return 'Buonasera';
}
