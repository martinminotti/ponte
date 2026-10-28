/** Modello dati. Tutti gli importi sono in centesimi di euro (interi). */

export type StatusKey = 'accettato' | 'diagnosi' | 'ricambi' | 'lavorazione' | 'pronto' | 'consegnato';
export type ClientType = 'privato' | 'azienda';
export type PlateCountry = 'I' | 'RSM';
export type Billing = 'mensile' | 'singola';
export type ThemePref = 'system' | 'light' | 'dark';
export type GlassPref = 'auto' | 'on' | 'off';
export type Role = 'admin' | 'staff';

export interface Company {
  name: string;
  vat: string;
  cf: string;
  addr: string;
  sdi: string;
}

export type ItemKind = 'labor' | 'part';

export interface LineItem {
  id: string;
  desc: string;
  /** centesimi: è sempre il totale della riga */
  amount: number;
  /** quantità (pezzi) o ore di manodopera; facoltativa, 1 se assente */
  qty?: number;
  /** prezzo unitario o tariffa oraria, centesimi */
  unit?: number;
  /** 'labor' = manodopera (ore × tariffa, con l'operatore) */
  kind?: ItemKind;
  /** chi ha fatto la manodopera */
  worker?: string;
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
  /** voce aggiunta dal conto lavori di una ditta (lavoro o acquisto registrato al volo, già chiuso) */
  quick?: boolean;
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
  /** vetro liquido: auto = solo iPhone e iPad */
  glass: GlassPref;
  nextNumber: number;
  /** tariffa oraria della manodopera, centesimi */
  laborRate: number;
  /** profilo di chi usa questo dispositivo: titolare o dipendente (non impostato = schermata di benvenuto) */
  role?: Role;
  /** nome del dipendente che usa il dispositivo */
  staffName?: string;
  /** PIN facoltativo per entrare come titolare */
  adminPin?: string;
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
  glass: 'auto',
  nextNumber: 1,
  laborRate: 0,
};

export const EMPTY_COMPANY: Company = { name: '', vat: '', cf: '', addr: '', sdi: '' };
