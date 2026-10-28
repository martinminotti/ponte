import { describe, expect, it } from 'vitest';
import { normalizeJob } from '@/data/repo';
import { customers, companyVehicles, matchCustomer } from './customers';
import { inFilter, isArchived, itemText, withPayment } from './logic';
import { paidMsg } from './messages';
import type { Job } from './types';

const sp = (t: string) => t.replace(/[\u00a0\u202f]/g, ' ');
const job = (p: Partial<Job> = {}): Job => normalizeJob({ id: Math.random().toString(36), number: 1, createdAt: 1_700_000_000_000, ...p });

describe('incasso e consegna', () => {
  it('incassando un veicolo pronto la scheda passa a consegnato', () => {
    const j = withPayment(job({ status: 'pronto', items: [{ id: 'a', desc: 'x', amount: 10000 }] }), 'Contanti', 5);
    expect(j.paid).toBe(true);
    expect(j.paidAmount).toBe(10000);
    expect(j.status).toBe('consegnato');
    expect(j.deliveredAt).toBe(5);
    expect(isArchived(j)).toBe(true);
    expect(inFilter(j, 'attive')).toBe(false);
    expect(inFilter(j, 'chiusi')).toBe(true);
  });
  it('un acconto incassato a lavori in corso non consegna', () => {
    const j = withPayment(job({ status: 'lavorazione', items: [{ id: 'a', desc: 'x', amount: 10000 }] }), 'Carta / POS');
    expect(j.status).toBe('lavorazione');
    expect(inFilter(j, 'attive')).toBe(true);
  });
  it('una ditta consegnata ma da fatturare resta fra le attive', () => {
    const j = job({ status: 'consegnato', client: 'azienda', company: { name: 'Ditta', vat: '12345678901', cf: '', addr: '', sdi: '' }, items: [{ id: 'a', desc: 'x', amount: 1 }] });
    expect(isArchived(j)).toBe(false);
    expect(inFilter(j, 'fatturare')).toBe(true);
  });
});

describe('voci', () => {
  it('manodopera con operatore, ore e tariffa', () => {
    expect(sp(itemText({ desc: 'Manodopera', kind: 'labor', worker: 'Luca', qty: 1.5, unit: 4500 }))).toBe('Manodopera – Luca (1,5 h × 45,00 €/h)');
  });
  it('quantità', () => {
    expect(sp(itemText({ desc: 'Batteria 70Ah', qty: 5, unit: 9000 }))).toBe('Batteria 70Ah (5 × 90,00 €)');
    expect(itemText({ desc: 'Tagliando' })).toBe('Tagliando');
  });
});

describe('clienti che tornano', () => {
  const a = job({ owner: 'Marco Bianchi', phone: '335 812 4471', plate: 'GK482TR', make: 'VW', model: 'Golf', createdAt: 1 });
  const b = job({ owner: 'Marco Bianchi', phone: '+39 335 8124471', plate: 'FA111AA', createdAt: 2 });
  const c = job({ owner: 'Giulia', phone: '', plate: 'GK482TR', createdAt: 3 });
  it('stesso telefono = stessa persona, con i suoi veicoli', () => {
    const list = customers([a, b, c]);
    const marco = list.find((x) => x.name === 'Marco Bianchi')!;
    expect(marco.vehicles.map((v) => v.plate).sort()).toEqual(['FA111AA', 'GK482TR']);
    expect(list).toHaveLength(2);
  });
  it('si trova per nome, telefono o targa', () => {
    const [marco] = customers([a, b]);
    expect(matchCustomer(marco, 'bianchi')).toBe(true);
    expect(matchCustomer(marco, '8124471')).toBe(true);
    expect(matchCustomer(marco, 'gk 482')).toBe(true);
    expect(matchCustomer(marco, 'rossi')).toBe(false);
  });
  it('mezzi di una ditta', () => {
    const co = { name: 'Trasporti', vat: '12345678901', cf: '', addr: '', sdi: '' };
    const v = companyVehicles([job({ client: 'azienda', company: co, plate: 'EZ215KB' }), job({ client: 'azienda', company: co, plate: 'EZ215KB' })], '12345678901');
    expect(v).toHaveLength(1);
    expect(v[0].visits).toBe(2);
  });
});

it('messaggio di cortesia dopo il saldo', () => {
  const j = withPayment(job({ status: 'pronto', owner: 'Marco', make: 'VW', model: 'Golf', plate: 'GK482TR', warrantyMonths: 12, items: [{ id: 'a', desc: 'x', amount: 35550 }] }), 'Carta / POS');
  const m = sp(paidMsg(j, { shop: 'Autofficina Guidi', shopPhone: '0549 123456' }));
  expect(m).toContain('Buongiorno Marco, grazie per aver scelto Autofficina Guidi.');
  expect(m).toContain('totale 355,50 €, saldato con carta / pos');
  expect(m).toContain('garanzia per 12 mesi');
  expect(m).toContain('0549 123456');
});
