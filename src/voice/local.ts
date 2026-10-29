/**
 * Interprete di base, sul telefono e senza rete.
 * Capisce le frasi tipiche del banco (targa, marca e modello, nome, telefono, chilometri, consegna, gomme,
 * lavori e note) con regole e parole chiave. Entra in gioco quando l'AI non è collegata, non risponde
 * o la chiave non è valida: l'accettazione a voce non si ferma mai.
 */
import type { Draft, FieldKey } from '@/domain/draft';
import { servicesIn, type VoicePatch } from './fields';
import {
  STOP,
  clean,
  countryFrom,
  digitsOf,
  findBrand,
  parseDate,
  parseKm,
  parsePhone,
  parsePlate,
  parseTyre,
  parseVin,
  plateQuality,
  readPhone,
  readPlate,
  stripCountryWords,
  tokens,
} from './spoken';

const COLORS = /^(grigi[aoe]|bianc[aoe]|ner[aoe]|ross[aoe]|blu|azzurr[aoe]|verd[ei]|giall[aoe]|argento|argentat[aoe]|marrone|beige|arancione|viola|metallizzat[aoe]|scur[aoe]|chiar[aoe])$/;

const NOTE_RE =
  /\b(graff\w*|rigat\w*|ammacc\w*|botta|bozz\w*|crep\w*|scheggi\w*|segn[oi] sul|serbatoio|benzina|gasolio|carburante|riserva|pieno|mezzo|oggetti|seggiolino|in macchina c'?e|lascia (le chiavi|il|la)|all'?arrivo|gia (rott|ammacc|graff)|specchietto rotto|vetro rotto|cerchio rovinato|portafoglio|occhiali)/;
const REQ_RE =
  /\b(deve|devo|dobbiamo|da fare|c'?e da|bisogna|vuole|chiede|richiede|fa(re)? (un )?rumore|rumor\w*|non parte|non va|non funziona|non si accende|si spegne|perde|perdita|problem\w*|spia|cambi\w*|controll\w*|sostitu\w*|ripar\w*|tagliando|revisione|fren\w*|frizione|distribuzione|olio|batteria|gomme|pneumatic\w*|clima|aria condizionata|vibra\w*|tira a|sbanda|fischia|cigola|surriscald\w*|fuma|diagnosi|preventivo|monta\w*|equilibratura|convergenza|foratura|bucat\w*|carrozzeria|vernic\w*|lucidatura)\b/;

/** parole che segnano l'inizio di un altro dato: chiudono il nome, il modello, la targa */
const BOUNDARY = new Set([
  'targa',
  'telefono',
  'cellulare',
  'numero',
  'tel',
  'cell',
  'km',
  'chilometri',
  'telaio',
  'partita',
  'per',
  'entro',
  'fa',
  'ha',
  'deve',
  'vuole',
  'e',
  ',',
  '.',
  ';',
  'con',
  'che',
  'il',
  'la',
]);

function nameAfter(toks: string[], i: number, max = 3): string {
  const out: string[] = [];
  for (let j = i; j < toks.length && out.length < max; j++) {
    const t = toks[j];
    if (BOUNDARY.has(t) || (STOP.has(t) && out.length) || /\d/.test(t) || !/^[a-z']+$/.test(t)) break;
    if (STOP.has(t)) continue;
    out.push(t);
  }
  return out.join(' ');
}

/** frasi della persona divise in pezzi: un pezzo, un'informazione */
/**
 * Pezzi della frase originale (con maiuscole e accenti, perché finiscono scritti nella scheda),
 * divisi alla punteggiatura e alle congiunzioni che aprono un'informazione nuova
 * ("fa rumore ai freni e c'è un graffio" → due pezzi).
 */
function clauses(text: string): string[] {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .split(/[.;!?]+|,\s+(?=\S)|\s+(?:poi|inoltre|e poi)\s+|\s+e\s+(?=(?:c['’][eè]|ci sono|ha|deve|vuole|bisogna|anche|la spia|una?|il|lo|la)\s)/i)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function localInterpret(text: string, d: Draft, ctx: { expect?: FieldKey | null; now?: Date } = {}): VoicePatch {
  const p: VoicePatch = {};
  const expect = ctx.expect || null;
  const now = ctx.now || new Date();
  const t = clean(text);
  const toks = tokens(stripCountryWords(text));
  const used = new Set<string>(); // pezzi di frase già usati come dato (non diventano lavori o note)

  // paese della targa
  const cc = countryFrom(text);
  if (cc) p.plateCountry = cc;
  const country = cc || d.plateCountry;

  // azienda
  const firm = t.match(/\b(?:ditta|azienda|societa|impresa)\s+([a-z0-9' .&-]+?)(?=\s*(?:,|\.|$|\bpartita\b|\bp\s?iva\b|\btarga\b|\bcon\b|\bche\b|\bdi\b|\bil\b|\bla\b))/);
  const legal = t.match(/\b((?:[a-z0-9'&-]+\s){0,3}(?:s\.?r\.?l\.?s?|s\.?p\.?a\.?|s\.?n\.?c\.?|s\.?a\.?s\.?))(?=\s|,|\.|$)/);
  if (firm || legal) {
    p.client = 'azienda';
    const name = (legal?.[1] || firm?.[1] || '').replace(/^(la|il|della|del|di|e|ed|per)\s+/g, '').trim();
    if (name && name.length > 1) p.companyName = name;
  }
  const vat = t.match(/\b(?:partita iva|p\.?\s?iva|piva|coe)\s*(?:e|è|:)?\s*((?:it|sm)?\s?[\d\s]{5,16}|(?:[a-z]+\s?){5,14})/);
  if (vat) {
    const v = /\d/.test(vat[1]) ? vat[1].replace(/\s/g, '') : parsePhone(vat[1]);
    if (v) {
      p.companyVat = v;
      p.client = 'azienda';
    }
  }

  // risposta secca alla domanda sulla partita IVA o sul codice fiscale: le cifre sono quelle
  if (expect === 'cvat' && !p.companyVat) {
    const dg = (parsePhone(text) || text).replace(/[^0-9]/g, '');
    if (dg.length >= 5) {
      p.companyVat = /\bsm\b|san marino/.test(t) ? `SM${dg}` : dg;
      p.client = 'azienda';
      return p;
    }
  }

  // targa
  const ti = toks.indexOf('targa');
  if (ti >= 0) {
    let k = ti + 1;
    while (['e', 'è', ':', 'la', 'sua', 'numero'].includes(toks[k])) k++;
    const r = readPlate(toks, k, country);
    if (r && r.plate.length >= 2) {
      p.plate = r.plate;
      used.add(toks.slice(ti, k + r.used).join(' '));
    }
  } else if (expect === 'plate') {
    // risposta secca alla domanda sulla targa: solo se somiglia davvero a una targa
    const pl = parsePlate(text, country);
    if (pl && plateQuality(pl, country) !== 'bad') p.plate = pl;
  } else {
    // una targa scritta tutta attaccata in mezzo alla frase ("gk482tr")
    const hit = toks.find((x) => /^[a-z]{2}\d{3}[a-z]{2}$/.test(x));
    if (hit) p.plate = hit.toUpperCase();
  }

  // telaio
  const vi = toks.findIndex((x) => x === 'telaio' || x === 'vin');
  if (vi >= 0) {
    const v = parseVin(toks.slice(vi + 1, vi + 30).join(' '));
    if (v.length >= 8) p.vin = v;
  } else if (expect === 'vin') {
    const v = parseVin(text);
    if (v.length >= 8) p.vin = v;
  }

  // telefono
  const pi = toks.findIndex((x) => /^(telefono|cellulare|cell|tel|numero|cel)$/.test(x));
  if (pi >= 0) {
    let k = pi + 1;
    while (['di', 'e', 'è', ':', 'il', 'suo', 'telefono', 'cellulare', 'whatsapp'].includes(toks[k])) k++;
    const r = readPhone(toks, k);
    if (r && r.phone.replace(/\D/g, '').length >= 6) p.phone = r.phone;
  } else if (expect === 'phone') {
    const ph = parsePhone(text);
    if (ph) p.phone = ph;
  } else if (!['cvat', 'ccf', 'km', 'vin', 'plate'].includes(expect || '')) {
    for (let i = 0; i < toks.length; i++) {
      const r = readPhone(toks, i);
      const dg = r?.phone.replace(/\D/g, '') || '';
      if (r && dg.length >= 9 && dg.length <= 13 && /^(\+|3|0)/.test(r.phone)) {
        p.phone = r.phone;
        break;
      }
    }
  }
  if (/\b(niente|no|senza) whatsapp\b|\bnon (vuole|usa|ha|vuole ricevere)( i messaggi( su)?)? whatsapp\b/.test(t)) p.wa = false;
  else if (/\b(si|anche) (su )?whatsapp\b|\bscrivergli su whatsapp\b/.test(t)) p.wa = true;

  // chilometri
  if (/\b(km|chilometri|chilometraggio|kilometri)\b/.test(t) || expect === 'km') {
    const k = parseKm(text);
    if (k !== null && !(p.phone && String(k) === p.phone.replace(/\D/g, ''))) p.km = String(k);
  }

  // consegna
  if (/\b(per|entro|consegna|consegnare|pronta|pronto|ritira|ritiro|ritirarla|ritirarlo|serve|la vuole|lo vuole|riconsegna|passa a prenderla|passa a prenderlo)\b/.test(t) || expect === 'dueDate') {
    const dd = parseDate(text, now);
    if (dd) p.dueDate = dd;
  }

  // gomme
  const ty = parseTyre(text);
  if (ty) p.tyres = ty;

  // marca e modello
  const b = findBrand(toks);
  if (b && !(b.brand.length <= 2 && !/^(bmw|mg|ds)$/i.test(b.brand))) {
    p.make = b.brand;
    const after = toks.slice(b.at + b.used);
    const model: string[] = [];
    for (const w of after) {
      if (BOUNDARY.has(w) || COLORS.test(w) || (STOP.has(w) && !/^\d/.test(w)) || model.length >= 3) break;
      if (w === 'di' || w === 'del' || w === 'della') break;
      model.push(w);
    }
    if (model.length) p.model = model.join(' ');
  } else if (expect === 'make') {
    const words = toks.filter((x) => !STOP.has(x));
    if (words.length && words.length <= 4) p.model = words.join(' ');
  }

  // proprietario (privato) o referente
  const ownerRe =
    /\b(?:proprietari[oa]|cliente|intestat[oa] a|si chiama|il nome e|nome|e del signor|e della signora|del signor|della signora|signor|signora|e di propriet[aà] di|appartiene a|e di)\s+(?:e\s+)?(?:il\s+|la\s+|lo\s+)?(?:signor\s+|signora\s+)?([a-z' ]+)/;
  const om = t.replace(/[,.]/g, ' , ').match(ownerRe);
  if (om) {
    const n = nameAfter(tokens(om[1]), 0, 3);
    if (n && n.split(' ').length >= 1 && !p.companyName?.includes(n)) p.owner = n;
  } else if (expect === 'owner') {
    const n = nameAfter(tokens(t.replace(/^(e|è|si chiama|allora|il proprietario e|il cliente e)\s+/, '')), 0, 4);
    if (n) p.owner = n;
  } else if (expect === 'cname' && !p.companyName) {
    p.companyName = text.trim();
    p.client = 'azienda';
  }

  // lavori richiesti e note all'arrivo, pezzo per pezzo
  const req: string[] = [];
  const notes: string[] = [];
  for (const raw of clauses(text)) {
    const c = clean(raw);
    if ([...used].some((u) => c.includes(u)) && c.split(' ').length <= 6) continue;
    // "la vuole venerdì", "per domani": è la consegna, non un lavoro
    if (c.split(' ').length <= 6 && parseDate(c, now) && !/\b(tagliando|fren|olio|gomm|cambi|controll|ripar|sostitu)/.test(c)) continue;
    const isNote = NOTE_RE.test(c);
    const isReq = REQ_RE.test(c);
    const piece = raw.replace(/^(e|poi|inoltre|allora|ok|ecco)\s+/i, '');
    if (isNote && !/\b(cambi|sostitu|ripar|controll|vernic)\w*/.test(c)) notes.push(piece);
    else if (isReq) req.push(piece);
  }
  if (!req.length && !notes.length && expect === 'request' && !p.plate && !p.phone && !p.owner) req.push(text.trim());
  if (!req.length && !notes.length && expect === 'notes' && !p.plate && !p.phone && !p.owner) notes.push(text.trim());
  if (req.length) p.request = req.join(', ');
  if (notes.length) p.notes = notes.join(', ');

  const sv = servicesIn([p.request, p.tyres ? 'gomme' : ''].filter(Boolean).join(' '));
  if (sv.length) p.servicesAdd = sv;

  // un numero solo, in risposta a una domanda precisa
  if (expect === 'km' && !p.km) {
    const dg = digitsOf(toks.join(''));
    if (dg) p.km = dg;
  }
  return p;
}

export function isEmptyPatch(p: VoicePatch): boolean {
  return !Object.entries(p).some(([k, v]) => k !== 'intent' && k !== 'question' && v !== undefined && !(Array.isArray(v) && !v.length));
}
