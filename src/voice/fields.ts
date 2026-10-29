/**
 * Il punto unico in cui l'assistente scrive nel modulo.
 * Qualunque cosa arrivi (dal modello AI o dall'interprete di base) passa da qui: viene normalizzata,
 * controllata e trasformata in una modifica della bozza, con quello che c'è da confermare o da richiedere.
 * Il modello non scrive mai direttamente nella scheda.
 */
import { SERVIZI } from '@/domain/constants';
import { FIELD_LABEL, type Draft, type FieldKey } from '@/domain/draft';
import { fmtPlate, normPlateText } from '@/domain/format';
import type { ClientType, PlateCountry } from '@/domain/types';
import {
  capitalize,
  clean,
  fixVin,
  fmtPhone,
  isoDay,
  matchBrand,
  parseDate,
  parseKm,
  parsePhone,
  parsePlate,
  parseTyre,
  parseVin,
  phoneDigits,
  plateQuality,
  properName,
  readQuantity,
  speakDate,
  spell,
  spellPhone,
  tokens,
  vatChecksumOk,
} from './spoken';

export type Intent = 'none' | 'save' | 'undo' | 'pause' | 'yes' | 'no' | 'help' | 'close';
export type TextMode = 'append' | 'replace';

/** Quello che l'assistente ha capito da una frase. Ogni campo è facoltativo: c'è solo ciò che è stato detto. */
export interface VoicePatch {
  intent?: Intent;
  client?: ClientType;
  plateCountry?: PlateCountry;
  plate?: string;
  vin?: string;
  make?: string;
  model?: string;
  km?: string;
  dueDate?: string;
  owner?: string;
  phone?: string;
  wa?: boolean;
  companyName?: string;
  companyVat?: string;
  companyCf?: string;
  companyAddr?: string;
  companySdi?: string;
  servicesAdd?: string[];
  servicesRemove?: string[];
  tyres?: string;
  request?: string;
  requestMode?: TextMode;
  notes?: string;
  notesMode?: TextMode;
  clear?: FieldKey[];
  /** domanda di chiarimento, quando la frase era ambigua */
  question?: string;
}

export interface Change {
  field: FieldKey;
  /** come si legge sulla scheda */
  show: string;
  /** come lo dice l'assistente (breve; '' = non serve dirlo) */
  say: string;
}

export interface Issue {
  field: FieldKey;
  code: 'plate_unusual' | 'plate_bad' | 'vin_len' | 'phone_short' | 'km_range' | 'date_past' | 'date_bad' | 'vat_len' | 'vat_checksum' | 'cf_bad';
  /** domanda o avviso per la persona */
  say: string;
}

export interface Applied {
  draft: Draft;
  changes: Change[];
  issues: Issue[];
}

/* ------------------------------------------------------------------ servizi */

const SERVICE_WORDS: [RegExp, (typeof SERVIZI)[number]][] = [
  [/gomm|pneumatic|foratur|equilibratur|convergenz|assetto ruote|cerchi|cambio stagional|termiche|invernali|estive/, 'Gomme'],
  [
    /elettr|batteri|alternator|motorino|avviament|centralin|diagnosi|spia|fari|fanal|luci|lampadin|clima|aria condizionata|sensor|cablagg|tergicristall|alzacristall|chiusura central|autoradio|navigatore/,
    'Elettrauto',
  ],
  [/carrozz|ammacc|graffi|verniciat|paraurt|parabrezz|cristall|botta|grandine|lamiera|specchiett|portier|cofano|lucidatur/, 'Carrozzeria'],
  [
    /meccan|tagliand|olio|filtr|fren|pastigli|dischi|frizion|distribuz|cinghi|ammortizz|sospension|marmitt|scarico|candel|iniettor|turbo|cambio|sterzo|motore|revisione|pompa|radiator|liquido|cuscinett|semiasse|giunt|testat|guarnizion|rumor|vibra|perde|perdita/,
    'Meccanica',
  ],
];

/** "freni", "Meccanica", "cambio gomme" → voce dell'elenco dei servizi */
export function mapService(s: string): (typeof SERVIZI)[number] | null {
  const t = clean(s);
  const exact = SERVIZI.find((x) => clean(x) === t);
  if (exact) return exact;
  for (const [re, v] of SERVICE_WORDS) if (re.test(t)) return v;
  return null;
}

/** servizi che si capiscono da una frase qualsiasi */
export function servicesIn(text: string): (typeof SERVIZI)[number][] {
  const t = clean(text);
  const out: (typeof SERVIZI)[number][] = [];
  for (const [re, v] of SERVICE_WORDS) if (re.test(t) && !out.includes(v)) out.push(v);
  return out;
}

/* ------------------------------------------------------------------ normalizzazioni */

const LEGAL: [RegExp, string][] = [
  [/\bs\.?\s?r\.?\s?l\.?\s?s\.?(?=\s|$)/gi, 'Srls'],
  [/\bs\.?\s?r\.?\s?l\.?(?=\s|$)/gi, 'Srl'],
  [/\bs\.?\s?p\.?\s?a\.?(?=\s|$)/gi, 'SpA'],
  [/\bs\.?\s?n\.?\s?c\.?(?=\s|$)/gi, 'Snc'],
  [/\bs\.?\s?a\.?\s?s\.?(?=\s|$)/gi, 'Sas'],
];
export function companyName(s: string): string {
  let n = properName(s.replace(/^(la |l')?(ditta|azienda|societa|società|impresa)\s+/i, ''));
  for (const [re, v] of LEGAL) n = n.replace(re, v);
  return n.replace(/\s+/g, ' ').trim();
}

/** "golf 2.0 tdi" → "Golf 2.0 TDI", "a3" → "A3", "serie 3" → "Serie 3" */
export function modelName(s: string): string {
  return s
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ')
    .map((w) => (/\d/.test(w) || (w.length <= 3 && /^[a-z]+$/i.test(w) && !/^(di|da|e|del|la|il)$/i.test(w)) ? w.toUpperCase() : capitalize(w.toLowerCase())))
    .join(' ');
}

/** prima lettera maiuscola, spazi puliti, senza il punto finale */
export function sentence(s: string): string {
  return capitalize(
    s
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/[.\s]+$/, ''),
  );
}

function appendText(cur: string, add: string): string {
  const a = sentence(add);
  if (!a) return cur;
  const c = cur.trim();
  if (!c) return a;
  if (
    clean(c)
      .replace(/[^a-z0-9]/g, '')
      .includes(clean(a).replace(/[^a-z0-9]/g, ''))
  )
    return cur;
  return `${c.replace(/[.\s]+$/, '')}. ${a}`;
}

const looksSpoken = (s: string) => /[a-z]{3,}/i.test(s.replace(/\b(targa|telaio)\b/gi, ''));

function normKm(raw: string): number | null {
  const s = raw.trim();
  if (/^\d{1,3}([.\s]\d{3})+$|^\d+$/.test(s)) return Number(s.replace(/\D/g, ''));
  const k = parseKm(s);
  if (k !== null) return k;
  const q = readQuantity(tokens(s), 0);
  return q ? q.value : null;
}

/* ------------------------------------------------------------------ applicazione */

const FIELDS_CLEARABLE: FieldKey[] = ['plate', 'vin', 'make', 'model', 'km', 'dueDate', 'owner', 'phone', 'cname', 'cvat', 'ccf', 'caddr', 'csdi', 'services', 'tyres', 'request', 'notes'];

/**
 * Applica la patch alla bozza. Restituisce la nuova bozza, cosa è cambiato e cosa va confermato o richiesto.
 * Non lancia mai: un valore che non torna diventa una domanda, non un errore.
 */
export function applyPatch(d0: Draft, p: VoicePatch, now = new Date()): Applied {
  const d: Draft = { ...d0, company: { ...d0.company }, services: [...d0.services] };
  const issues: Issue[] = [];

  for (const f of p.clear || []) {
    if (!FIELDS_CLEARABLE.includes(f)) continue;
    if (f === 'services') d.services = [];
    else if (f === 'cname') d.company.name = '';
    else if (f === 'cvat') d.company.vat = '';
    else if (f === 'ccf') d.company.cf = '';
    else if (f === 'caddr') d.company.addr = '';
    else if (f === 'csdi') d.company.sdi = '';
    else (d as unknown as Record<string, string>)[f] = '';
  }

  if (p.client === 'privato' || p.client === 'azienda') d.client = p.client;
  if (p.plateCountry === 'I' || p.plateCountry === 'RSM') d.plateCountry = p.plateCountry;

  if (typeof p.plate === 'string' && p.plate.trim()) {
    const raw = p.plate.trim();
    const cand = looksSpoken(raw) ? parsePlate(raw, d.plateCountry) : raw.toUpperCase().replace(/[^A-Z0-9 ]/g, '');
    const plate = normPlateText(cand, d.plateCountry);
    const q = plateQuality(plate, d.plateCountry);
    if (q === 'bad') issues.push({ field: 'plate', code: 'plate_bad', say: 'Non ho capito bene la targa. Me la ripeti lettera per lettera?' });
    else {
      d.plate = plate;
      if (q === 'unusual')
        issues.push({
          field: 'plate',
          code: 'plate_unusual',
          say: d.plateCountry === 'RSM' ? `Ho scritto la targa ${spell(plate)}. È giusta?` : `La targa ${spell(plate)} non ha il formato solito. È giusta?`,
        });
    }
  }

  if (typeof p.vin === 'string' && p.vin.trim()) {
    const v = looksSpoken(p.vin) ? parseVin(p.vin) : fixVin(p.vin);
    if (v.length >= 8) d.vin = v;
    if (v.length !== 17) issues.push({ field: 'vin', code: 'vin_len', say: `Il telaio ha 17 caratteri, ne ho sentiti ${v.length}. Lo controlli sul libretto?` });
  }

  if (typeof p.make === 'string' && p.make.trim()) d.make = matchBrand(p.make) || properName(p.make).slice(0, 30);
  if (typeof p.model === 'string' && p.model.trim()) d.model = modelName(p.model).slice(0, 40);

  if (typeof p.km === 'string' && p.km.trim()) {
    const n = normKm(p.km);
    if (n !== null && n >= 0 && n < 2_000_000) d.km = n.toLocaleString('it-IT', { useGrouping: 'always' } as Intl.NumberFormatOptions);
    else issues.push({ field: 'km', code: 'km_range', say: 'Non ho capito i chilometri. Quanti sono?' });
  }

  if (typeof p.dueDate === 'string' && p.dueDate.trim()) {
    const raw = p.dueDate.trim();
    const iso = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : parseDate(raw, now);
    if (!iso || Number.isNaN(new Date(iso).getTime())) issues.push({ field: 'dueDate', code: 'date_bad', say: 'Per quando la vuole?' });
    else if (iso < isoDay(now)) issues.push({ field: 'dueDate', code: 'date_past', say: `La consegna risulterebbe nel passato (${iso.split('-').reverse().join('/')}). Per quando la vuole?` });
    else d.dueDate = iso;
  }

  if (typeof p.owner === 'string' && p.owner.trim()) d.owner = properName(p.owner.replace(/\d+/g, ' ')).slice(0, 60);

  if (typeof p.phone === 'string' && p.phone.trim()) {
    const raw = p.phone.trim();
    const ph = /[a-z]{3,}/i.test(raw) ? parsePhone(raw) : raw;
    const n = phoneDigits(ph);
    if (n >= 6 && n <= 15) d.phone = fmtPhone(ph);
    else issues.push({ field: 'phone', code: 'phone_short', say: n ? `Del telefono ho sentito solo ${n} cifre. Me lo ripeti?` : 'Non ho capito il numero di telefono. Me lo ripeti?' });
  }
  if (typeof p.wa === 'boolean') d.wa = p.wa;

  if (typeof p.companyName === 'string' && p.companyName.trim()) {
    d.company.name = companyName(p.companyName).slice(0, 80);
    if (p.client === undefined) d.client = 'azienda';
  }
  if (typeof p.companyVat === 'string' && p.companyVat.trim()) {
    const raw = p.companyVat.toUpperCase().replace(/\s+/g, '');
    const sm = /^SM/.test(raw);
    const digits = raw.replace(/^IT/, '').replace(/[^0-9]/g, '');
    const fromWords = digits || (parsePhone(p.companyVat) || '').replace(/\D/g, '');
    const vat = sm ? `SM${fromWords}` : fromWords;
    if (vat) {
      d.company.vat = vat;
      if (!sm && vat.length > 5 && vat.length !== 11) issues.push({ field: 'cvat', code: 'vat_len', say: `La partita IVA italiana ha 11 cifre, ne ho sentite ${vat.length}. Me la ripeti?` });
      else if (!sm && vat.length === 11 && !vatChecksumOk(vat))
        issues.push({ field: 'cvat', code: 'vat_checksum', say: `La partita IVA ${spell(vat)} non torna con la cifra di controllo. Me la ripeti?` });
    }
    if (p.client === undefined) d.client = 'azienda';
  }
  if (typeof p.companyCf === 'string' && p.companyCf.trim()) {
    const cf = p.companyCf.toUpperCase().replace(/[^A-Z0-9]/g, '');
    d.company.cf = cf;
    if (cf.length !== 16 && cf.length !== 11) issues.push({ field: 'ccf', code: 'cf_bad', say: `Il codice fiscale ha 16 caratteri, ne ho sentiti ${cf.length}. Lo controlli?` });
  }
  if (typeof p.companyAddr === 'string' && p.companyAddr.trim()) d.company.addr = sentence(p.companyAddr).slice(0, 120);
  if (typeof p.companySdi === 'string' && p.companySdi.trim()) {
    const s = p.companySdi.trim();
    d.company.sdi = s.includes('@') ? s.toLowerCase().replace(/\s+/g, '') : s.toUpperCase().replace(/\s+/g, '');
  }

  for (const s of p.servicesAdd || []) {
    const m = mapService(s);
    if (m && !d.services.includes(m)) d.services.push(m);
  }
  for (const s of p.servicesRemove || []) {
    const m = mapService(s);
    if (m) d.services = d.services.filter((x) => x !== m);
  }

  if (typeof p.tyres === 'string' && p.tyres.trim()) {
    d.tyres = parseTyre(p.tyres) || p.tyres.trim().toUpperCase().slice(0, 30);
    if (!d.services.includes('Gomme')) d.services.push('Gomme');
  }

  if (typeof p.request === 'string' && p.request.trim()) d.request = p.requestMode === 'replace' ? sentence(p.request) : appendText(d.request, p.request);
  if (typeof p.notes === 'string' && p.notes.trim()) d.notes = p.notesMode === 'replace' ? sentence(p.notes) : appendText(d.notes, p.notes);

  return { draft: d, changes: diff(d0, d, now), issues };
}

/* ------------------------------------------------------------------ cosa è cambiato */

export function diff(a: Draft, b: Draft, now = new Date()): Change[] {
  const out: Change[] = [];
  const add = (field: FieldKey, show: string, say: string) => out.push({ field, show, say });
  if (a.client !== b.client) add('client', b.client === 'azienda' ? 'Azienda' : 'Privato', b.client === 'azienda' ? 'cliente azienda' : 'cliente privato');
  if (a.plateCountry !== b.plateCountry) add('plateCountry', b.plateCountry === 'RSM' ? 'Targa San Marino' : 'Targa italiana', b.plateCountry === 'RSM' ? 'targa di San Marino' : 'targa italiana');
  if (a.plate !== b.plate) add('plate', b.plate ? fmtPlate(b.plate, b.plateCountry) : '', b.plate ? `targa ${spell(b.plate)}` : 'targa tolta');
  if (a.vin !== b.vin) add('vin', b.vin, b.vin ? 'telaio segnato' : 'telaio tolto');
  if (a.make !== b.make || a.model !== b.model) {
    const v = [b.make, b.model].filter(Boolean).join(' ');
    if (a.make !== b.make) add('make', b.make, v);
    if (a.model !== b.model) add('model', b.model, a.make !== b.make ? '' : v);
  }
  if (a.km !== b.km) add('km', b.km ? `${b.km} km` : '', b.km ? `${b.km} chilometri` : '');
  if (a.dueDate !== b.dueDate) add('dueDate', b.dueDate ? b.dueDate.split('-').reverse().join('/') : '', b.dueDate ? `consegna ${speakDate(b.dueDate, now)}` : 'consegna tolta');
  if (a.owner !== b.owner) add('owner', b.owner, b.owner);
  if (a.phone !== b.phone) add('phone', b.phone, b.phone ? `telefono ${spellPhone(b.phone)}` : 'telefono tolto');
  if (a.wa !== b.wa) add('wa', b.wa ? 'WhatsApp sì' : 'Niente WhatsApp', b.wa ? 'messaggi WhatsApp sì' : 'niente messaggi WhatsApp');
  if (a.company.name !== b.company.name) add('cname', b.company.name, b.company.name);
  if (a.company.vat !== b.company.vat) add('cvat', b.company.vat, b.company.vat ? `partita IVA ${spell(b.company.vat)}` : '');
  if (a.company.cf !== b.company.cf) add('ccf', b.company.cf, b.company.cf ? 'codice fiscale segnato' : '');
  if (a.company.addr !== b.company.addr) add('caddr', b.company.addr, b.company.addr ? 'indirizzo segnato' : '');
  if (a.company.sdi !== b.company.sdi) add('csdi', b.company.sdi, b.company.sdi ? 'codice SDI segnato' : '');
  if (a.services.join() !== b.services.join()) {
    const added = b.services.filter((s) => !a.services.includes(s));
    add('services', b.services.join(', '), added.length ? added.map((s) => s.toLowerCase()).join(' e ') : '');
  }
  if (a.tyres !== b.tyres) add('tyres', b.tyres, b.tyres ? `gomme ${b.tyres.replace('/', ' ').replace(/\bR(\d)/, 'erre $1')}` : '');
  if (a.request !== b.request) add('request', b.request, b.request ? 'lavori segnati' : 'lavori tolti');
  if (a.notes !== b.notes) add('notes', b.notes, b.notes ? 'note segnate' : 'note tolte');
  return out;
}

export const label = (f: FieldKey) => FIELD_LABEL[f];
