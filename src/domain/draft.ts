import { normPlateText } from './format';
import { EMPTY_COMPANY, type ClientType, type Company, type Job, type PlateCountry } from './types';

/**
 * Bozza dell'accettazione: lo stato del modulo mentre si compila.
 * La condividono il modulo e l'assistente vocale, che scrive negli stessi campi.
 */
export interface Draft {
  client: ClientType;
  plateCountry: PlateCountry;
  plate: string;
  vin: string;
  make: string;
  model: string;
  km: string;
  dueDate: string;
  company: Company;
  owner: string;
  phone: string;
  wa: boolean;
  services: string[];
  tyres: string;
  request: string;
  notes: string;
}

export const MARCHE = [
  'Alfa Romeo',
  'Audi',
  'BMW',
  'Citroën',
  'Cupra',
  'Dacia',
  'DS',
  'Fiat',
  'Ford',
  'Honda',
  'Hyundai',
  'Iveco',
  'Jaguar',
  'Jeep',
  'Kia',
  'Lancia',
  'Land Rover',
  'Lexus',
  'Maserati',
  'Mazda',
  'Mercedes-Benz',
  'MG',
  'Mini',
  'Mitsubishi',
  'Nissan',
  'Opel',
  'Peugeot',
  'Piaggio',
  'Porsche',
  'Renault',
  'Seat',
  'Skoda',
  'Smart',
  'Subaru',
  'Suzuki',
  'Tesla',
  'Toyota',
  'Volkswagen',
  'Volvo',
];

export const fromJob = (j: Partial<Job>): Draft => ({
  client: j.client || 'privato',
  plateCountry: j.plateCountry || 'I',
  plate: j.plate || '',
  vin: j.vin || '',
  make: j.make || '',
  model: j.model || '',
  km: j.km || '',
  dueDate: j.dueDate || '',
  company: { ...EMPTY_COMPANY, ...(j.company || {}) },
  owner: j.owner || '',
  phone: j.phone || '',
  wa: j.wa !== false,
  services: [...(j.services || [])],
  tyres: j.tyres || '',
  request: j.request || '',
  notes: j.notes || '',
});

export const emptyDraft = (client: ClientType = 'privato'): Draft => fromJob({ client });

/** Campi del modulo con cui si ragiona a voce e negli errori (id html = f-<campo>). */
export type FieldKey =
  | 'client'
  | 'plate'
  | 'plateCountry'
  | 'vin'
  | 'make'
  | 'model'
  | 'km'
  | 'dueDate'
  | 'owner'
  | 'phone'
  | 'wa'
  | 'cname'
  | 'cvat'
  | 'ccf'
  | 'caddr'
  | 'csdi'
  | 'services'
  | 'tyres'
  | 'request'
  | 'notes';

export const FIELD_LABEL: Record<FieldKey, string> = {
  client: 'tipo di cliente',
  plate: 'targa',
  plateCountry: 'paese della targa',
  vin: 'telaio',
  make: 'marca',
  model: 'modello',
  km: 'chilometri',
  dueDate: 'consegna prevista',
  owner: 'proprietario',
  phone: 'telefono',
  wa: 'WhatsApp',
  cname: 'ragione sociale',
  cvat: 'partita IVA',
  ccf: 'codice fiscale',
  caddr: 'indirizzo',
  csdi: 'codice SDI o PEC',
  services: 'tipo di lavoro',
  tyres: 'misura gomme',
  request: 'lavori richiesti',
  notes: "note all'arrivo",
};

/** Regole del modulo, campo per campo. Il primo errore è quello che riceve il fuoco al salvataggio. */
export function validate(d: Draft): Partial<Record<FieldKey, string>> {
  const e: Partial<Record<FieldKey, string>> = {};
  const plate = normPlateText(d.plate, d.plateCountry);
  const vin = d.vin.toUpperCase().replace(/\s+/g, '');
  if (!plate && !vin) e.plate = 'Inserisci la targa o il telaio.';
  if (d.client === 'azienda') {
    const vat = d.company.vat.replace(/\s+/g, '');
    if (!d.company.name.trim()) e.cname = 'Inserisci la ragione sociale.';
    if (!vat && !d.company.cf.trim()) e.cvat = 'Inserisci la partita IVA (o il COE) oppure il codice fiscale.';
    else if (/^\d+$/.test(vat) && vat.length !== 11 && vat.length > 5) e.cvat = `La partita IVA italiana ha 11 cifre (qui ${vat.length}).`;
  } else if (!d.owner.trim()) e.owner = 'Inserisci il nome del proprietario.';
  return e;
}

/** Bozza vuota o quasi: niente da salvare né da riprendere. */
export function isBlank(d: Draft): boolean {
  return !(d.plate || d.vin || d.owner || d.phone || d.make || d.model || d.request || d.notes || d.company.name || d.services.length);
}
