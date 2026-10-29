/**
 * Clienti, ditte e veicoli già passati in officina.
 * La ricerca avviene sul telefono: l'archivio non viene mai mandato al modello AI.
 */
import { customers, type Customer } from '@/domain/customers';
import type { Draft } from '@/domain/draft';
import { norm } from '@/domain/format';
import { veic } from '@/domain/logic';
import { companies, type CompanyGroup } from '@/domain/monthly';
import { EMPTY_COMPANY, type Job } from '@/domain/types';
import { diff, type Change } from './fields';

/** ultima scheda dello stesso veicolo (targa dello stesso paese, oppure telaio) */
export function knownVehicle(d: Draft, jobs: Job[]): Job | null {
  const p = norm(d.plate);
  const v = norm(d.vin);
  let best: Job | null = null;
  for (const j of jobs) {
    if (j.quick) continue;
    const same = (p.length >= 4 && (j.plateCountry || 'I') === d.plateCountry && norm(j.plate) === p) || (v.length >= 10 && norm(j.vin) === v);
    if (same && (!best || j.createdAt > best.createdAt)) best = j;
  }
  return best;
}

/** frase per proporre i dati del veicolo conosciuto */
export function knownVehicleQuestion(j: Job): string {
  const who = (j.client === 'azienda' ? j.company?.name : j.owner)?.replace(/\.+$/, '');
  return `La conosco: ${veic(j)}${who ? `, di ${who}` : ''}. Uso i suoi dati?`;
}

/** dati del veicolo e del cliente dall'ultima scheda; quello già detto a voce resta */
export function withKnownVehicle(d: Draft, j: Job): { draft: Draft; changes: Change[] } {
  const next: Draft = {
    ...d,
    plateCountry: j.plateCountry || 'I',
    plate: d.plate || j.plate,
    vin: d.vin || j.vin,
    make: d.make || j.make,
    model: d.model || j.model,
    owner: d.owner || j.owner,
    phone: d.phone || j.phone,
    wa: j.wa !== false,
    client: j.client,
    company: j.client === 'azienda' ? { ...EMPTY_COMPANY, ...(j.company || {}) } : d.company,
  };
  return { draft: next, changes: diff(d, next) };
}

/** ditta in archivio con lo stesso nome (o quasi: senza forma giuridica e punteggiatura) */
export function knownCompany(name: string, jobs: Job[]): CompanyGroup | null {
  const k = norm(name).replace(/(srls|srl|spa|snc|sas)$/, '');
  if (k.length < 3) return null;
  const list = companies(jobs);
  return list.find((c) => norm(c.company.name).replace(/(srls|srl|spa|snc|sas)$/, '') === k) || null;
}

export function withKnownCompany(d: Draft, c: CompanyGroup): { draft: Draft; changes: Change[] } {
  const next: Draft = {
    ...d,
    client: 'azienda',
    company: {
      name: c.company.name || d.company.name,
      vat: d.company.vat || c.company.vat,
      cf: d.company.cf || c.company.cf,
      addr: d.company.addr || c.company.addr,
      sdi: d.company.sdi || c.company.sdi,
    },
    owner: d.owner || c.owner,
    phone: d.phone || c.phone,
  };
  return { draft: next, changes: diff(d, next) };
}

/** cliente privato con lo stesso nome e un telefono, se è uno solo */
export function knownPerson(name: string, jobs: Job[]): Customer | null {
  const k = norm(name);
  if (k.length < 5 || !name.includes(' ')) return null;
  const hits = customers(jobs).filter((c) => norm(c.name) === k && c.phone);
  return hits.length === 1 ? hits[0] : null;
}
