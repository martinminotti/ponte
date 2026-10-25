import { describe, expect, it } from 'vitest';
import { amountInput, fmtPlate, norm, parseAmount, shiftMonth } from './format';
import { calc, daSaldare, inFilter, isDue, matchJob, monthlyPending, sameVehicle, waNumber, withStatus } from './logic';
import { companies, monthTotals } from './monthly';
import { buildMsg } from './messages';
import { normalizeJob } from '@/data/repo';
import type { Job } from './types';

const job = (p: Partial<Job> = {}): Job => normalizeJob({ id: 'x', number: 1, createdAt: 1_700_000_000_000, ...p });
const items = (...e: number[]) => e.map((a, i) => ({ id: String(i), desc: 'v' + i, amount: a }));

describe('parseAmount', () => {
  it.each([
    ['12', 1200],
    ['12,5', 1250],
    ['1.234,50', 123450],
    ['1234.50', 123450],
    ['€ 30', 3000],
    ['1.200', 120000],
    ['', 0],
    ['-5', 0],
    ['abc', 0],
  ])('%s → %i', (s, c) => expect(parseAmount(s)).toBe(c));
  it('amountInput', () => {
    expect(amountInput(1250)).toBe('12,50');
    expect(amountInput(1200)).toBe('12,00');
    expect(amountInput(0)).toBe('');
  });
});

describe('targhe', () => {
  it('formatta le targhe italiane', () => expect(fmtPlate('gk482tr')).toBe('GK 482 TR'));
  it('lascia le targhe RSM', () => expect(fmtPlate(' a  4721 ', 'RSM')).toBe('A 4721'));
  it('norm', () => expect(norm('Città-Ù 12')).toBe('cittau12'));
});

describe('calcoli', () => {
  it('privato: niente IVA', () => {
    const c = calc(job({ items: items(10000, 2550) }));
    expect(c).toEqual({ net: 12550, vat: 0, gross: 12550, rate: 0 });
  });
  it('azienda IVA inclusa', () => {
    const c = calc(job({ client: 'azienda', vatRate: 22, vatIncl: true, items: items(12200) }));
    expect(c).toEqual({ net: 10000, vat: 2200, gross: 12200, rate: 22 });
  });
  it('azienda IVA esclusa', () => {
    const c = calc(job({ client: 'azienda', vatRate: 17, vatIncl: false, items: items(10000) }));
    expect(c).toEqual({ net: 10000, vat: 1700, gross: 11700, rate: 17 });
  });
  it('esente', () => {
    expect(calc(job({ client: 'azienda', vatRate: 0, items: items(5000) })).vat).toBe(0);
  });
  it('acconto e saldo', () => {
    const j = job({ items: items(20000), deposit: 5000, status: 'pronto' });
    expect(daSaldare(j)).toBe(15000);
    expect(isDue(j)).toBe(true);
    expect(daSaldare({ ...j, paid: true })).toBe(0);
    expect(daSaldare({ ...j, deposit: 99999 })).toBe(0);
  });
  it('lavori aziendali mensili non risultano da incassare', () => {
    const j = job({ client: 'azienda', billing: 'mensile', items: items(1000), status: 'pronto' });
    expect(monthlyPending(j)).toBe(true);
    expect(isDue(j)).toBe(false);
    expect(inFilter(j, 'fatturare')).toBe(true);
  });
});

describe('stati', () => {
  it('registra chiusura e consegna', () => {
    const a = withStatus(job(), 'pronto', 100);
    expect(a.closedAt).toBe(100);
    const b = withStatus(a, 'consegnato', 200);
    expect(b.deliveredAt).toBe(200);
    expect(b.closedAt).toBe(100);
    const c = withStatus(b, 'lavorazione', 300);
    expect(c.deliveredAt).toBeUndefined();
    expect(c.history.map((h) => h.s)).toEqual(['pronto', 'consegnato', 'lavorazione']);
  });
});

describe('WhatsApp', () => {
  it.each([
    ['333 1234567', '39', '393331234567'],
    ['+378 0549 887120', '39', '3780549887120'],
    ['0039 333 1234567', '39', '393331234567'],
    ['393331234567', '39', '393331234567'],
    ['0549 887120', '378', '3780549887120'],
    ['', '39', ''],
  ])('%s', (p, pre, out) => expect(waNumber(p, pre)).toBe(out));
  it('messaggio pronto con riepilogo', () => {
    const m = buildMsg(job({ owner: 'Marco', make: 'Fiat', model: 'Panda', plate: 'AB123CD', items: items(5000) }), 'pronto', { shop: 'Officina Rossi' });
    expect(m).toContain('Buongiorno Marco,');
    expect(m).toContain('Fiat Panda (AB 123 CD)');
    expect(m).toContain('Totale: 50,00');
    expect(m.endsWith('Officina Rossi')).toBe(true);
  });
});

describe('ricerca', () => {
  const j = job({ plate: 'GK482TR', owner: 'Marco Bianchi', vin: 'WVWZZZ1KZAW000001', workers: ['Luca'] });
  it('per targa con spazi', () => expect(matchJob(j, 'gk 482')).toBe(true));
  it('per più parole', () => expect(matchJob(j, 'bianchi luca')).toBe(true));
  it('nessun risultato', () => expect(matchJob(j, 'rossi')).toBe(false));
  it('stesso veicolo', () => {
    expect(sameVehicle(job({ id: 'y', plate: 'GK 482 TR' }), j)).toBe(true);
    expect(sameVehicle(job({ id: 'y', plate: 'GK482TR', plateCountry: 'RSM' }), j)).toBe(false);
  });
});

describe('mensile', () => {
  const co = { name: 'Ditta', vat: 'IT123', cf: '', addr: '', sdi: '' };
  const a = job({ id: 'a', client: 'azienda', company: co, vatRate: 22, vatIncl: false, items: items(10000) });
  const b = job({ id: 'b', client: 'azienda', company: co, vatRate: 10, vatIncl: false, items: items(5000), deposit: 1000 });
  it('raggruppa le ditte per partita IVA', () => expect(companies([a, b])).toHaveLength(1));
  it('totali per aliquota', () => {
    const T = monthTotals([a, b]);
    expect(T.by[22]).toEqual({ net: 10000, vat: 2200 });
    expect(T.by[10]).toEqual({ net: 5000, vat: 500 });
    expect(T.gross).toBe(17700);
    expect(T.due).toBe(16700);
  });
  it('shiftMonth', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
  });
});
