import type { Job, PlateCountry } from './types';
import { norm } from './format';
import { isAz } from './logic';
import { compKey } from './monthly';

/** Un veicolo già passato in officina, con i dati dell'ultima visita. */
export interface KnownVehicle {
  plate: string;
  plateCountry: PlateCountry;
  vin: string;
  make: string;
  model: string;
  lastAt: number;
  visits: number;
}

/** Un cliente privato che torna: nome, telefono e i suoi veicoli. */
export interface Customer {
  key: string;
  name: string;
  phone: string;
  wa: boolean;
  lastAt: number;
  vehicles: KnownVehicle[];
}

const vehKey = (j: Pick<Job, 'plate' | 'plateCountry' | 'vin'>) => (norm(j.plate) ? `${j.plateCountry || 'I'}:${norm(j.plate)}` : `vin:${norm(j.vin)}`);
const phoneKey = (p: string) => p.replace(/\D/g, '').slice(-9);

function addVehicle(list: KnownVehicle[], j: Job) {
  const k = vehKey(j);
  const v = list.find((x) => vehKey(x) === k);
  if (!v) list.push({ plate: j.plate, plateCountry: j.plateCountry || 'I', vin: j.vin, make: j.make, model: j.model, lastAt: j.createdAt, visits: 1 });
  else {
    v.visits++;
    if (j.createdAt > v.lastAt) Object.assign(v, { make: j.make || v.make, model: j.model || v.model, vin: j.vin || v.vin, lastAt: j.createdAt });
  }
}

/** Clienti privati in archivio, dal più recente. Stesso telefono (o stesso nome senza telefono) = stessa persona. */
export function customers(jobs: Job[]): Customer[] {
  const m = new Map<string, Customer>();
  for (const j of [...jobs].sort((a, b) => b.createdAt - a.createdAt)) {
    if (isAz(j) || !(j.owner || j.phone)) continue;
    const key = phoneKey(j.phone || '') || `n:${norm(j.owner)}`;
    let c = m.get(key);
    if (!c) {
      c = { key, name: j.owner, phone: j.phone, wa: j.wa !== false, lastAt: j.createdAt, vehicles: [] };
      m.set(key, c);
    }
    if (j.plate || j.vin) addVehicle(c.vehicles, j);
  }
  return [...m.values()];
}

/** Targhe già usate da una ditta, dalla più recente: per segnare un lavoro senza riscrivere il mezzo. */
export function companyVehicles(jobs: Job[], key: string): KnownVehicle[] {
  const out: KnownVehicle[] = [];
  for (const j of [...jobs].sort((a, b) => b.createdAt - a.createdAt)) if (isAz(j) && compKey(j) === key && (j.plate || j.vin)) addVehicle(out, j);
  return out;
}

export function matchCustomer(c: Customer, q: string): boolean {
  const t = norm(q);
  if (!t) return true;
  return (
    norm(c.name).includes(t) ||
    c.phone.replace(/\D/g, '').includes(q.replace(/\D/g, '') || '§') ||
    c.vehicles.some((v) => norm(v.plate).includes(t.replace(/\s/g, '')) || norm(`${v.make} ${v.model}`).includes(t))
  );
}
