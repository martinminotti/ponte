import { describe, expect, it } from 'vitest';
import { dashboard, startOfWeek } from './dashboard';
import { normalizeJob } from '@/data/repo';
import type { Job } from './types';

const NOW = new Date(2026, 9, 26, 10, 0).getTime(); // lunedì 26 ottobre 2026
const D = 86_400_000;
const j = (p: Partial<Job>): Job => normalizeJob({ id: Math.random().toString(36), createdAt: NOW - D, ...p });
const items = (c: number) => [{ id: 'i', desc: 'x', amount: c }];

describe('dashboard', () => {
  const jobs = [
    j({ status: 'lavorazione', dueDate: '2026-10-26' }),
    j({ status: 'ricambi', dueDate: '2026-10-24' }),
    j({ status: 'diagnosi', dueDate: '2026-10-27' }),
    j({ status: 'accettato', dueDate: '2026-10-30' }),
    j({ status: 'pronto', items: items(8000) }),
    j({ status: 'consegnato', items: items(12000), paid: true, paidAt: NOW - 2 * D, paidAmount: 12000 }),
    j({ status: 'consegnato', items: items(5000), paid: true, paidAt: new Date(2026, 8, 20).getTime(), paidAmount: 5000 }),
    j({ status: 'pronto', client: 'azienda', company: { name: 'Ditta', vat: 'SM1', cf: '', addr: '', sdi: '' }, items: items(10000), vatIncl: false, vatRate: 17 }),
  ];
  const d = dashboard(jobs, NOW);
  it('conta i veicoli in officina per stato', () => {
    expect(d.inShop).toBe(4);
    expect(d.byStatus.map((x) => x.n)).toEqual([1, 1, 1, 1]);
  });
  it('pronte, da incassare, da fatturare', () => {
    expect(d.ready).toHaveLength(2);
    expect(d.due).toEqual({ n: 1, amount: 8000 });
    expect(d.invoice).toEqual({ n: 1, companies: 1, amount: 11700 });
  });
  it('incassi del mese e del mese precedente', () => {
    expect(d.month).toEqual({ amount: 12000, prev: 5000, n: 1 });
  });
  it('incassi per settimana, ultima settimana in fondo', () => {
    expect(d.weeks).toHaveLength(8);
    expect(d.weeks[7].start).toBe(startOfWeek(NOW));
    expect(d.weeks[6].amount).toBe(12000);
    expect(d.weeks.reduce((t, w) => t + w.amount, 0)).toBe(17000);
  });
  it('consegne: in ritardo, oggi, domani; non oltre', () => {
    expect(d.deliveries.map((x) => x.days)).toEqual([-2, 0, 1]);
  });
  it('lunedì come inizio settimana', () => {
    expect(new Date(startOfWeek(new Date(2026, 10, 1).getTime())).getDate()).toBe(26);
  });
});
