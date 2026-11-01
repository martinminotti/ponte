import { EMPTY_COMPANY, type Job } from './types';

/** Completa i campi mancanti di una scheda (dati importati, versioni precedenti, righe ricevute dal server). */
export function normalizeJob(j: Partial<Job> & { id: string }): Job {
  return {
    number: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    status: 'accettato',
    history: [],
    plate: '',
    plateCountry: 'I',
    vin: '',
    make: '',
    model: '',
    km: '',
    dueDate: '',
    client: 'privato',
    owner: '',
    phone: '',
    wa: true,
    services: [],
    tyres: '',
    request: '',
    notes: '',
    workers: [],
    photoIds: [],
    items: [],
    deposit: 0,
    vatRate: 22,
    vatIncl: true,
    billing: 'mensile',
    invoiced: false,
    invoiceNo: '',
    paid: false,
    payMethod: '',
    warrantyMonths: 0,
    warrantyNote: '',
    ...j,
    company: { ...EMPTY_COMPANY, ...(j.company || {}) },
  } as Job;
}

/**
 * Campi di una scheda che viaggiano fra i dispositivi. Id, numero e data di modifica li decide il server.
 * Deve restare uguale a ponte_private.job_keys() in supabase/migrations (lo controlla un test).
 */
export const JOB_SYNC_KEYS = [
  'createdAt',
  'status',
  'history',
  'plate',
  'plateCountry',
  'vin',
  'make',
  'model',
  'km',
  'dueDate',
  'client',
  'company',
  'owner',
  'phone',
  'wa',
  'services',
  'tyres',
  'request',
  'notes',
  'workers',
  'photoIds',
  'items',
  'deposit',
  'vatRate',
  'vatIncl',
  'billing',
  'invoiced',
  'invoicedAt',
  'invoiceNo',
  'paid',
  'paidAt',
  'paidAmount',
  'payMethod',
  'warrantyMonths',
  'warrantyNote',
  'closedAt',
  'deliveredAt',
  'demo',
  'quick',
] as const satisfies readonly (keyof Job)[];

export type JobPatch = Partial<Pick<Job, (typeof JOB_SYNC_KEYS)[number]>>;

const same = (a: unknown, b: unknown) => a === b || JSON.stringify(a) === JSON.stringify(b);

/**
 * I campi cambiati fra due versioni della stessa scheda: è quello che si manda al server.
 * Un campo tolto (undefined) viaggia come null, così sparisce anche sugli altri dispositivi.
 */
export function diffJob(before: Job | undefined, after: Job): JobPatch {
  const out: Record<string, unknown> = {};
  for (const k of JOB_SYNC_KEYS) {
    const a = before?.[k];
    const b = after[k];
    if (before && same(a, b)) continue;
    if (!before && b === undefined) continue;
    out[k] = b === undefined ? null : b;
  }
  return out as JobPatch;
}

/** applica una modifica (anche ricevuta dal server) a una scheda: null toglie il campo */
export function applyJobPatch(j: Job, patch: Record<string, unknown>): Job {
  const out: Record<string, unknown> = { ...j };
  for (const [k, v] of Object.entries(patch)) {
    if (v === null) delete out[k];
    else out[k] = v;
  }
  return out as unknown as Job;
}
