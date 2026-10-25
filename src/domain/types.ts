/** Modello dati. Tutti gli importi sono in centesimi di euro (interi). */

export type StatusKey = 'accettato' | 'diagnosi' | 'ricambi' | 'lavorazione' | 'pronto' | 'consegnato';
export type ClientType = 'privato' | 'azienda';
export type PlateCountry = 'I' | 'RSM';
export type Billing = 'mensile' | 'singola';
export type ThemePref = 'system' | 'light' | 'dark';

export interface Company {
  name: string;
  vat: string;
  cf: string;
  addr: string;
  sdi: string;
}

export interface LineItem {
  id: string;
  desc: string;
  /** centesimi */
  amount: number;
}

export interface StatusEvent {
  s: StatusKey;
  t: number;
}

export interface Job {
  id: string;
  /** numero progressivo della scheda, unico per officina */
  number: number;
  createdAt: number;
  updatedAt: number;
  status: StatusKey;
  history: StatusEvent[];

  plate: string;
  plateCountry: PlateCountry;
  vin: string;
  make: string;
  model: string;
  km: string;
  /** yyyy-mm-dd oppure '' */
  dueDate: string;

  client: ClientType;
  company: Company;
  owner: string;
  phone: string;
  /** consenso ai messaggi WhatsApp */
  wa: boolean;

  services: string[];
  tyres: string;
  request: string;
  notes: string;
  workers: string[];
  photoIds: string[];

  items: LineItem[];
  /** centesimi */
  deposit: number;

  vatRate: number;
  vatIncl: boolean;
  billing: Billing;
  invoiced: boolean;
  invoicedAt?: number;
  invoiceNo: string;

  paid: boolean;
  paidAt?: number;
  /** centesimi */
  paidAmount?: number;
  payMethod: string;

  warrantyMonths: number;
  warrantyNote: string;

  closedAt?: number;
  deliveredAt?: number;

  demo?: boolean;
}

export interface Settings {
  shop: string;
  shopAddr: string;
  shopVat: string;
  shopPhone: string;
  prefix: string;
  warranty: number;
  vat: number;
  accent: string;
  /** data URL */
  logo: string;
  workers: string[];
  theme: ThemePref;
  nextNumber: number;
  lastBackupAt?: number;
  migratedV1?: boolean;
}

export interface Photo {
  id: string;
  jobId: string;
  blob: Blob;
  w: number;
  h: number;
  createdAt: number;
}

export const DEFAULT_ACCENT = '#1F3F99';

export const DEFAULT_SETTINGS: Settings = {
  shop: '',
  shopAddr: '',
  shopVat: '',
  shopPhone: '',
  prefix: '39',
  warranty: 12,
  vat: 22,
  accent: DEFAULT_ACCENT,
  logo: '',
  workers: [],
  theme: 'system',
  nextNumber: 1,
};

export const EMPTY_COMPANY: Company = { name: '', vat: '', cf: '', addr: '', sdi: '' };
