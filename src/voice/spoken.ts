/**
 * L'italiano detto a voce, trasformato in valori da modulo.
 * Funzioni pure e senza rete: servono al modello AI come rete di sicurezza (normalizzano e controllano
 * quello che restituisce) e all'interprete di base quando l'AI non c'è o non risponde.
 */
import { MARCHE } from '@/domain/draft';
import type { PlateCountry } from '@/domain/types';

/* ------------------------------------------------------------------ testo */

/** minuscole, senza accenti, punteggiatura staccata dalle parole */
export function clean(text: string): string {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[’`´]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

export function tokens(text: string): string[] {
  return clean(text)
    .replace(/([,;:!?()«»"“”])/g, ' $1 ')
    .replace(/\.(?=\s|$)/g, ' . ')
    .split(' ')
    .filter(Boolean);
}

export const capitalize = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/* ------------------------------------------------------------------ numeri */

type Morph = { w: string; v: number; k: 'z' | 'u' | 'teen' | 'ten' | 'cento' | 'mila' | 'mille' | 'mln' };
const M: Morph[] = [
  ['zero', 0, 'z'],
  ['uno', 1, 'u'],
  ['un', 1, 'u'],
  ['una', 1, 'u'],
  ['due', 2, 'u'],
  ['tre', 3, 'u'],
  ['quattro', 4, 'u'],
  ['cinque', 5, 'u'],
  ['sei', 6, 'u'],
  ['sette', 7, 'u'],
  ['otto', 8, 'u'],
  ['nove', 9, 'u'],
  ['dieci', 10, 'teen'],
  ['undici', 11, 'teen'],
  ['dodici', 12, 'teen'],
  ['tredici', 13, 'teen'],
  ['quattordici', 14, 'teen'],
  ['quindici', 15, 'teen'],
  ['sedici', 16, 'teen'],
  ['diciassette', 17, 'teen'],
  ['diciotto', 18, 'teen'],
  ['diciannove', 19, 'teen'],
  ['venti', 20, 'ten'],
  ['vent', 20, 'ten'],
  ['trenta', 30, 'ten'],
  ['trent', 30, 'ten'],
  ['quaranta', 40, 'ten'],
  ['quarant', 40, 'ten'],
  ['cinquanta', 50, 'ten'],
  ['cinquant', 50, 'ten'],
  ['sessanta', 60, 'ten'],
  ['sessant', 60, 'ten'],
  ['settanta', 70, 'ten'],
  ['settant', 70, 'ten'],
  ['ottanta', 80, 'ten'],
  ['ottant', 80, 'ten'],
  ['novanta', 90, 'ten'],
  ['novant', 90, 'ten'],
  ['cento', 100, 'cento'],
  ['cent', 100, 'cento'],
  ['mila', 1000, 'mila'],
  ['mille', 1000, 'mille'],
  ['milioni', 1e6, 'mln'],
  ['milione', 1e6, 'mln'],
].map(([w, v, k]) => ({ w, v, k }) as Morph);

function evalMorphs(ms: Morph[]): number {
  let total = 0;
  let g = 0;
  let st = 0; // 0 inizio gruppo · 1 dopo una cifra iniziale · 2 dopo cento · 3 dopo le decine · 4 gruppo chiuso
  for (const m of ms) {
    if (m.k === 'z') {
      if (ms.length !== 1) return NaN;
      return 0;
    }
    if (m.k === 'u') {
      if (st === 0) {
        g += m.v;
        st = 1;
      } else if (st === 2 || st === 3) {
        g += m.v;
        st = 4;
      } else return NaN;
    } else if (m.k === 'teen') {
      if (st !== 0 && st !== 2) return NaN;
      g += m.v;
      st = 4;
    } else if (m.k === 'ten') {
      if (st !== 0 && st !== 2) return NaN;
      g += m.v;
      st = 3;
    } else if (m.k === 'cento') {
      if (st === 0) g = 100;
      else if (st === 1 && g >= 2) g *= 100;
      else return NaN;
      st = 2;
    } else if (m.k === 'mila') {
      if (g < 2) return NaN;
      total += g * 1000;
      g = 0;
      st = 0;
    } else if (m.k === 'mille') {
      if (g || total) return NaN;
      total = 1000;
      st = 0;
    } else if (m.k === 'mln') {
      total += (g || 1) * 1e6;
      g = 0;
      st = 0;
    }
  }
  return total + g;
}

const memo = new Map<string, number | null>();
/** "centoventitremila" → 123000, "ventotto" → 28, "tre" → 3; null se non è un numero */
export function numberWord(word: string): number | null {
  const w = clean(word).replace(/[^a-z]/g, '');
  if (!w) return null;
  if (memo.has(w)) return memo.get(w)!;
  let found: number | null = null;
  const walk = (i: number, acc: Morph[]): boolean => {
    if (i === w.length) {
      const v = evalMorphs(acc);
      if (!Number.isNaN(v)) found = v;
      return !Number.isNaN(v);
    }
    for (const m of M) if (w.startsWith(m.w, i) && walk(i + m.w.length, [...acc, m])) return true;
    return false;
  };
  walk(0, []);
  memo.set(w, found);
  return found;
}

/** cifre o parola-numero → stringa di cifre ("335", "trentatre" → "33"); null se no */
export function digitsOf(tok: string): string | null {
  const t = tok.replace(/[.\-/]/g, '');
  if (/^\d+$/.test(t)) return t;
  const n = numberWord(tok);
  return n === null ? null : String(n);
}

/**
 * Quantità detta in un pezzo solo ("centoventimila", "120.000", "120 mila", "centoventimila trecento").
 * Restituisce il valore e quanti token ha consumato.
 */
export function readQuantity(toks: string[], from = 0): { value: number; used: number } | null {
  let i = from;
  let value: number | null = null;
  const t0 = toks[i];
  if (t0 && /^\d{1,3}([.\s]\d{3})+$|^\d+([,]\d+)?$/.test(t0)) {
    value = Number(t0.replace(/\./g, '').replace(',', '.'));
    i++;
    if (toks[i] === 'mila' || toks[i] === 'mille') {
      value *= 1000;
      i++;
    }
  } else {
    // parole-numero consecutive, lette come un solo numero
    let word = '';
    let j = i;
    let last: number | null = null;
    while (j < toks.length && toks[j] !== 'un' && toks[j] !== 'una') {
      const cand = numberWord(word + toks[j]);
      if (cand === null) break;
      word += toks[j];
      last = cand;
      j++;
    }
    if (last !== null) {
      value = last;
      i = j;
    }
  }
  return value === null ? null : { value, used: i - from };
}

/* ------------------------------------------------------------------ lettere (targhe, telaio) */

const LETTER: Record<string, string> = {
  a: 'A',
  bi: 'B',
  ci: 'C',
  di: 'D',
  e: 'E',
  effe: 'F',
  gi: 'G',
  ge: 'G',
  acca: 'H',
  i: 'I',
  jei: 'J',
  gei: 'J',
  jay: 'J',
  kappa: 'K',
  cappa: 'K',
  ka: 'K',
  elle: 'L',
  emme: 'M',
  enne: 'N',
  o: 'O',
  pi: 'P',
  cu: 'Q',
  qu: 'Q',
  erre: 'R',
  esse: 'S',
  ti: 'T',
  u: 'U',
  vu: 'V',
  vi: 'V',
  ics: 'X',
  ix: 'X',
  ipsilon: 'Y',
  ypsilon: 'Y',
  zeta: 'Z',
  zed: 'Z',
};
/** alfabeto telefonico italiano (e qualche variante che si sente in officina) */
const PHONETIC: Record<string, string> = {
  ancona: 'A',
  andrea: 'A',
  bari: 'B',
  bologna: 'B',
  brescia: 'B',
  como: 'C',
  catania: 'C',
  domodossola: 'D',
  empoli: 'E',
  firenze: 'F',
  genova: 'G',
  hotel: 'H',
  imola: 'I',
  jolly: 'J',
  juventus: 'J',
  kursaal: 'K',
  livorno: 'L',
  milano: 'M',
  napoli: 'N',
  otranto: 'O',
  palermo: 'P',
  padova: 'P',
  quarto: 'Q',
  quadro: 'Q',
  roma: 'R',
  savona: 'S',
  sassari: 'S',
  torino: 'T',
  udine: 'U',
  venezia: 'V',
  washington: 'W',
  xeres: 'X',
  xilofono: 'X',
  yacht: 'Y',
  york: 'Y',
  yogurt: 'Y',
  zara: 'Z',
  zurigo: 'Z',
};

/** parole-numero consecutive che formano un solo numero ("cinquecento ottanta" → 580, "venti tre" → 23) */
function joinedNumber(toks: string[], i: number): { s: string; used: number } | null {
  if (!toks[i] || /\d/.test(toks[i]) || numberWord(toks[i]) === null) return null;
  let word = toks[i];
  let used = 1;
  while (toks[i + used] && !/\d/.test(toks[i + used]) && numberWord(word + toks[i + used]) !== null) {
    word += toks[i + used];
    used++;
  }
  return { s: String(numberWord(word)), used };
}

/** Un pezzo di targa letto da un token, con i token consumati. */
function plateChunk(toks: string[], i: number): { s: string; used: number } | null {
  const t = toks[i];
  if (!t) return null;
  const n1 = toks[i + 1];
  const n2 = toks[i + 2];
  // "doppia vu", "doppio v"
  if ((t === 'doppia' || t === 'doppio') && n1 && /^(vu|v|vi)$/.test(n1)) return { s: 'W', used: 2 };
  // "i lunga", "i greca"
  if (t === 'i' && n1 === 'lunga') return { s: 'J', used: 2 };
  if (t === 'i' && n1 === 'greca') return { s: 'Y', used: 2 };
  // "doppio zero", "doppio tre": cifra ripetuta
  if ((t === 'doppio' || t === 'doppia') && n1) {
    const d = digitsOf(n1);
    if (d && d.length === 1) return { s: d + d, used: 2 };
  }
  let s: string | null = null;
  if (LETTER[t]) s = LETTER[t];
  else if (PHONETIC[t]) s = PHONETIC[t];
  else if (/^[a-z0-9]+$/.test(t) && /\d/.test(t))
    s = t.toUpperCase(); // "gk482tr", "482"
  else if (/^[a-z]{1,2}$/.test(t))
    s = t.toUpperCase(); // "gk", "tr"
  else {
    const j = joinedNumber(toks, i);
    if (j && !['un', 'una'].includes(t)) return j;
  }
  if (s === null) return null;
  // "G come Genova": la parola dopo "come" ripete la lettera
  if (n1 === 'come' && n2 && (PHONETIC[n2] || /^[a-z]+$/.test(n2)) && s.length === 1 && /[A-Z]/.test(s)) return { s, used: 3 };
  return { s, used: 1 };
}

export const IT_PLATE = /^[A-HJ-NPR-TV-Z]{2}\d{3}[A-HJ-NPR-TV-Z]{2}$/;
export const RSM_PLATE = /^[A-Z]\d{1,4}$/;
/** targhe italiane vecchie (fino al 1994) e targhe prova: le accettiamo ma le facciamo confermare */
const OLD_IT_PLATE = /^[A-Z]{2}[0-9A-Z]{4,6}$/;

export type PlateQuality = 'ok' | 'unusual' | 'bad';
export function plateQuality(p: string, cc: PlateCountry): PlateQuality {
  const n = p.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!n) return 'bad';
  if (cc === 'RSM') return RSM_PLATE.test(n) ? 'ok' : n.length >= 2 && n.length <= 7 ? 'unusual' : 'bad';
  if (IT_PLATE.test(n)) return 'ok';
  return OLD_IT_PLATE.test(n) || (n.length >= 4 && n.length <= 9) ? 'unusual' : 'bad';
}

/**
 * Legge una targa detta a voce a partire dal token i.
 * "gi kappa quattro otto due ti erre", "G come Genova K 482 TR", "GK 482 TR", "a 4721" (San Marino).
 * Si ferma quando la targa è completa nel formato atteso o quando arriva una parola che non è una lettera o una cifra.
 */
export function readPlate(toks: string[], from: number, cc: PlateCountry): { plate: string; used: number } | null {
  let out = '';
  let i = from;
  const complete = (s: string) => (cc === 'RSM' ? /^[A-Z]\d{4}$/.test(s) : IT_PLATE.test(s));
  while (i < toks.length && out.length < 10) {
    const c = plateChunk(toks, i);
    if (!c) break;
    const next = out + c.s;
    // una parola che renderebbe la targa più lunga del formato già completo è l'inizio della frase successiva
    if (complete(out) && next.length > out.length) break;
    out = next;
    i += c.used;
  }
  if (!out) return null;
  return { plate: out, used: i - from };
}

/** targa da un testo qualsiasi (risposta secca alla domanda sulla targa, o valore restituito dall'AI) */
export function parsePlate(text: string, cc: PlateCountry): string {
  const toks = tokens(stripCountryWords(text)).filter((t) => !['targa', 'e', "e'", 'la', 'il', ':', ',', '.', 'allora', 'dunque', 'ok'].includes(t) || LETTER[t]);
  // si prova da ogni posizione e si tiene la lettura più plausibile
  let best = '';
  let bestScore = -1;
  for (let i = 0; i < toks.length; i++) {
    const r = readPlate(toks, i, cc);
    if (!r) continue;
    const q = plateQuality(r.plate, cc);
    const score = (q === 'ok' ? 100 : q === 'unusual' ? 10 : 0) + r.plate.length;
    if (score > bestScore) {
      best = r.plate;
      bestScore = score;
    }
    if (q === 'ok') break;
  }
  return best;
}

const COUNTRY_WORDS = /\b(di san marino|sammarinese|san marino|rsm|italiana|targa italiana)\b/g;
export function stripCountryWords(text: string): string {
  return clean(text).replace(COUNTRY_WORDS, ' ');
}
export function countryFrom(text: string): PlateCountry | null {
  const t = clean(text);
  if (/\b(san marino|sammarines[ei]|rsm)\b/.test(t) && /targa|macchina|auto|veicolo|furgone|moto/.test(t)) return 'RSM';
  if (/\btarga italiana\b/.test(t)) return 'I';
  return null;
}

/* ------------------------------------------------------------------ telaio */

export function parseVin(text: string): string {
  const toks = tokens(text).filter((t) => !['telaio', 'vin', 'numero', 'di', 'il', 'e', ':'].includes(t));
  let out = '';
  for (let i = 0; i < toks.length && out.length < 17;) {
    const t = toks[i];
    // pezzi di telaio scritti dal riconoscimento ("WVW", "ZZZ1KZ") vanno presi così come sono
    if (/^[a-z0-9]{3,17}$/.test(t) && !LETTER[t] && !PHONETIC[t] && numberWord(t) === null && toks[i + 1] !== 'come') {
      out += t.toUpperCase();
      i++;
      continue;
    }
    const c = plateChunk(toks, i);
    if (!c) {
      i++;
      continue;
    }
    out += c.s;
    i += c.used;
  }
  return fixVin(out);
}

/** nel telaio non esistono I, O e Q: chi detta "o" intende zero */
export function fixVin(v: string): string {
  return v
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .replace(/[OQ]/g, '0')
    .replace(/I/g, '1')
    .slice(0, 17);
}

/* ------------------------------------------------------------------ telefono */

/** Cifre del telefono dette a voce: "tre tre cinque, otto uno due…", "335 812 4471", "più tre nove…", "zero cinque quattro nove". */
export function readPhone(toks: string[], from: number): { phone: string; used: number } | null {
  let i = from;
  let out = '';
  if (toks[i] === '+' || toks[i] === 'piu' || toks[i] === 'più') {
    out = '+';
    i++;
  }
  while (i < toks.length) {
    const t = toks[i];
    if (t === ',' || t === '-' || t === '.') {
      // le pause tra i gruppi di cifre
      if (toks[i + 1] && digitsOf(toks[i + 1].replace(/^\+/, '')) !== null) {
        i++;
        continue;
      }
      break;
    }
    if ((t === 'doppio' || t === 'doppia') && toks[i + 1]) {
      const d = digitsOf(toks[i + 1]);
      if (d && d.length === 1) {
        out += d + d;
        i += 2;
        continue;
      }
    }
    const raw = t.replace(/^\+/, '');
    if (t.startsWith('+') && !out) out = '+';
    if (t === 'un' || t === 'una') break;
    if (/^[\d.\-/]+$/.test(raw)) {
      out += raw.replace(/\D/g, '');
      i++;
      continue;
    }
    const j = joinedNumber(toks, i);
    if (!j) break;
    out += j.s;
    i += j.used;
  }
  const digits = out.replace(/\D/g, '');
  if (digits.length < 3) return null;
  return { phone: out, used: i - from };
}

/** telefono da un testo qualsiasi */
export function parsePhone(text: string): string {
  const toks = tokens(text);
  for (let i = 0; i < toks.length; i++) {
    const r = readPhone(toks, i);
    if (r && r.phone.replace(/\D/g, '').length >= 6) return r.phone;
  }
  return '';
}

/** "3358124471" → "335 812 4471"; mantiene il + internazionale */
export function fmtPhone(p: string): string {
  const plus = p.trim().startsWith('+');
  let d = p.replace(/\D/g, '');
  if (!d) return '';
  let pre = '';
  if (plus) {
    const cc = d.startsWith('378') ? '378' : d.startsWith('39') ? '39' : d.slice(0, 2);
    pre = `+${cc} `;
    d = d.slice(cc.length);
  }
  let body: string;
  if (d.startsWith('3') && d.length === 10) body = `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}`;
  else if (d.startsWith('0549') && d.length >= 8) body = `0549 ${d.slice(4)}`;
  else if (d.startsWith('0') && d.length >= 8) body = `${d.slice(0, d.startsWith('02') || d.startsWith('06') ? 2 : 3)} ${d.slice(d.startsWith('02') || d.startsWith('06') ? 2 : 3)}`;
  else body = d.replace(/(\d{3})(?=\d{3,})/g, '$1 ');
  return pre + body;
}

export function phoneDigits(p: string): number {
  return p.replace(/\D/g, '').length;
}

/* ------------------------------------------------------------------ chilometri */

export function parseKm(text: string): number | null {
  const toks = tokens(text).map((t) => (t === 'k' ? 'km' : t));
  for (let i = 0; i < toks.length; i++) {
    const q = readQuantity(toks, i);
    if (!q) continue;
    const after = toks[i + q.used];
    const before = toks.slice(Math.max(0, i - 3), i);
    const kmWord = (t?: string) => !!t && /^(km|chilometri|chilometro|kilometri|chilometraggio)$/.test(t);
    if (kmWord(after) || before.some(kmWord) || toks.length <= q.used + 1) return q.value;
  }
  return null;
}

/* ------------------------------------------------------------------ date */

const WD = ['domenica', 'lunedi', 'martedi', 'mercoledi', 'giovedi', 'venerdi', 'sabato'];
const MONTHS = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];

export const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addDays = (d: Date, n: number) => {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() + n);
  return x;
};

/**
 * Data detta a voce → yyyy-mm-dd, rispetto a oggi.
 * "oggi", "stasera", "domani", "dopodomani", "venerdì" (il prossimo; se è oggi, quello della settimana dopo),
 * "fra tre giorni", "la settimana prossima", "il 5 novembre", "il 5", "5/11".
 */
export function parseDate(text: string, now = new Date()): string | null {
  const t = clean(text).replace(/'/g, ' ');
  const today = addDays(now, 0);
  if (/\b(oggi|stasera|in giornata|entro sera|stamattina|questa sera|oggi pomeriggio)\b/.test(t)) return isoDay(today);
  if (/\bdopodomani\b/.test(t)) return isoDay(addDays(today, 2));
  if (/\bdomani\b/.test(t)) return isoDay(addDays(today, 1));
  const fra = t.match(/\b(?:fra|tra|entro)\s+(\S+)\s+giorn[oi]\b/);
  if (fra) {
    const n = Number(digitsOf(fra[1]) ?? NaN);
    if (n > 0 && n < 120) return isoDay(addDays(today, n));
  }
  if (/\bfine settimana\b|\bweekend\b/.test(t)) {
    const d = (6 - today.getDay() + 7) % 7 || 7;
    return isoDay(addDays(today, d === 7 && today.getDay() === 6 ? 0 : d));
  }
  // giorno e mese: "5 novembre", "cinque novembre", "5/11", "5-11"
  for (const dm of t.matchAll(/\b(\d{1,2}|[a-z]+)\s*(?:(?:\/|-)\s*(\d{1,2})|\s+(gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre))\b/g)) {
    const day = Number(digitsOf(dm[1]) ?? NaN);
    const mo = dm[2] ? Number(dm[2]) - 1 : MONTHS.indexOf(dm[3]);
    if (day >= 1 && day <= 31 && mo >= 0 && mo <= 11) {
      let d = new Date(today.getFullYear(), mo, day);
      if (d.getMonth() !== mo) return null;
      if (d < today) d = new Date(today.getFullYear() + 1, mo, day);
      return isoDay(d);
    }
  }
  for (let i = 0; i < 7; i++) {
    if (new RegExp(`\\b${WD[i]}\\b`).test(t)) {
      let d = (i - today.getDay() + 7) % 7;
      if (d === 0) d = 7;
      // "venerdì della settimana prossima": quello dopo
      if (/\bsettimana (prossima|dopo)\b/.test(t) && d < 7) d += 7;
      return isoDay(addDays(today, d));
    }
  }
  if (/\b(settimana prossima|prossima settimana)\b/.test(t)) return isoDay(addDays(today, 7));
  const only = t.match(/\b(?:il|entro il|per il)\s+(\d{1,2})\b/);
  if (only) {
    const day = Number(only[1]);
    if (day >= 1 && day <= 31) {
      let d = new Date(today.getFullYear(), today.getMonth(), day);
      if (d < today) d = new Date(today.getFullYear(), today.getMonth() + 1, day);
      return isoDay(d);
    }
  }
  return null;
}

/** "2026-10-31" → "venerdì 31 ottobre" */
export function speakDate(iso: string, now = new Date()): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  const date = new Date(y, m - 1, d);
  const diff = Math.round((date.getTime() - addDays(now, 0).getTime()) / 86_400_000);
  if (diff === 0) return 'oggi';
  if (diff === 1) return 'domani';
  const s = date.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });
  return y !== now.getFullYear() ? `${s} ${y}` : s;
}

/* ------------------------------------------------------------------ gomme */

/** "205 55 16", "205/55 R16 91V", "duecentocinque cinquantacinque erre sedici" → "205/55 R16" (+ indici) */
export function parseTyre(text: string): string {
  const toks = tokens(text).map((t) => {
    if (t === 'erre' || t === 'r') return 'r';
    if (/\d/.test(t)) return t;
    const d = digitsOf(t);
    return d ?? t;
  });
  const s = toks
    .join(' ')
    .replace(/(\d{3})\s*\/\s*(\d{2})/g, '$1 $2')
    .replace(/\br(\d{2})\b/g, 'r $1');
  const m = s.match(/\b(1[2-9]\d|2\d\d|3[0-5]\d)\s+([2-8]\d)\s+(?:r\s+)?(1[2-9]|2[0-4])\b(?:\s+(\d{2,3})\s*([a-z])\b)?/);
  if (!m) return '';
  return `${m[1]}/${m[2]} R${m[3]}${m[4] && m[5] ? ` ${m[4]}${m[5].toUpperCase()}` : ''}`;
}

/* ------------------------------------------------------------------ marche e nomi */

const BRAND_ALIASES: Record<string, string> = {
  vw: 'Volkswagen',
  volks: 'Volkswagen',
  wolkswagen: 'Volkswagen',
  volkswagen: 'Volkswagen',
  folkswagen: 'Volkswagen',
  volkswaghen: 'Volkswagen',
  volksvagen: 'Volkswagen',
  mercedes: 'Mercedes-Benz',
  mercedesbenz: 'Mercedes-Benz',
  merzedes: 'Mercedes-Benz',
  benz: 'Mercedes-Benz',
  alfa: 'Alfa Romeo',
  alfaromeo: 'Alfa Romeo',
  land: 'Land Rover',
  landrover: 'Land Rover',
  rangerover: 'Land Rover',
  range: 'Land Rover',
  bmw: 'BMW',
  biemmevu: 'BMW',
  bievu: 'BMW',
  citroen: 'Citroën',
  ds: 'DS',
  mg: 'MG',
  emmegi: 'MG',
  skoda: 'Skoda',
  seat: 'Seat',
  cupra: 'Cupra',
};

function lev(a: string, b: string): number {
  const dp = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length];
}

const keyOf = (s: string) => clean(s).replace(/[^a-z0-9]/g, '');

/** marca sentita (anche storpiata dal riconoscimento) → marca dell'elenco; '' se non somiglia a nessuna */
export function matchBrand(word: string): string {
  const k = keyOf(word);
  if (k.length < 2) return '';
  if (BRAND_ALIASES[k]) return BRAND_ALIASES[k];
  for (const m of MARCHE) if (keyOf(m) === k) return m;
  if (k.length < 4) return '';
  let best = '';
  let bestD = 99;
  for (const m of MARCHE) {
    const d = lev(k, keyOf(m));
    if (d < bestD) {
      bestD = d;
      best = m;
    }
  }
  const tol = k.length >= 8 ? 2 : 1;
  return bestD <= tol ? best : '';
}

/** modelli che si dicono senza la marca ("una Golf", "la Panda"): solo nomi che non sono parole comuni */
export const MODEL_BRAND: Record<string, string> = {
  golf: 'Volkswagen',
  polo: 'Volkswagen',
  passat: 'Volkswagen',
  tiguan: 'Volkswagen',
  touran: 'Volkswagen',
  touareg: 'Volkswagen',
  transporter: 'Volkswagen',
  panda: 'Fiat',
  ducato: 'Fiat',
  doblo: 'Fiat',
  fiorino: 'Fiat',
  bravo: 'Fiat',
  ypsilon: 'Lancia',
  musa: 'Lancia',
  clio: 'Renault',
  megane: 'Renault',
  captur: 'Renault',
  kangoo: 'Renault',
  twingo: 'Renault',
  scenic: 'Renault',
  corsa: 'Opel',
  astra: 'Opel',
  mokka: 'Opel',
  zafira: 'Opel',
  yaris: 'Toyota',
  aygo: 'Toyota',
  corolla: 'Toyota',
  rav4: 'Toyota',
  fiesta: 'Ford',
  focus: 'Ford',
  kuga: 'Ford',
  transit: 'Ford',
  puma: 'Ford',
  qashqai: 'Nissan',
  juke: 'Nissan',
  micra: 'Nissan',
  tucson: 'Hyundai',
  sportage: 'Kia',
  picanto: 'Kia',
  duster: 'Dacia',
  sandero: 'Dacia',
  fabia: 'Skoda',
  octavia: 'Skoda',
  ibiza: 'Seat',
  leon: 'Seat',
  arona: 'Seat',
  giulietta: 'Alfa Romeo',
  mito: 'Alfa Romeo',
  stelvio: 'Alfa Romeo',
  renegade: 'Jeep',
  compass: 'Jeep',
  daily: 'Iveco',
  swift: 'Suzuki',
  vitara: 'Suzuki',
  jimny: 'Suzuki',
  countryman: 'Mini',
};

/** Marca nel testo: la prima parola (o coppia di parole) che è una marca. */
export function findBrand(toks: string[]): { brand: string; at: number; used: number } | null {
  for (let i = 0; i < toks.length; i++) {
    if (toks[i].length < 2 || /^\d/.test(toks[i])) continue;
    const two = toks[i + 1] ? matchBrand(toks[i] + toks[i + 1]) : '';
    if (two && ['Alfa Romeo', 'Land Rover', 'Mercedes-Benz', 'BMW', 'MG'].includes(two)) return { brand: two, at: i, used: 2 };
    if (STOP.has(toks[i])) continue;
    const one = matchBrand(toks[i]);
    if (one) return { brand: one, at: i, used: 1 };
  }
  // solo il modello: la marca si deduce, il modello resta da leggere a partire dal token stesso
  for (let i = 0; i < toks.length; i++) if (MODEL_BRAND[toks[i]]) return { brand: MODEL_BRAND[toks[i]], at: i, used: 0 };
  return null;
}

/** parole che non sono mai una marca, un modello o un nome */
export const STOP = new Set(
  "a ad al alla allo ai agli alle anche avere c che chi ci come con da dal dalla dei del della delle di e ed era fa fare gli ha hai ho i il in io la le lei li lo lui ma mi mia mio ne nel nella no non o per piu poi qua qui se si sia sono su sua suo sul sulla ti tu un una uno va vuole e' c'e auto macchina vettura veicolo furgone moto targa telefono numero cellulare signor signora sig cliente proprietario ok allora dunque poi bene grazie si sì".split(
    ' ',
  ),
);

const TITLES =
  /^(signor|signore|signora|signorina|sig|sigra|dott|dottor|dottore|dottoressa|ing|ingegner|ingegnere|avv|avvocato|geom|geometra|rag|ragionier|ragioniere|prof|professore|professoressa|don)\.?$/i;

/** "il signor marco bianchi" → "Marco Bianchi"; "d'angelo" → "D'Angelo" */
export function properName(s: string): string {
  const words = String(s || '')
    .replace(/[.,;:!?]+$/g, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  while (words.length && (TITLES.test(words[0]) || /^(il|la|lo|al|alla|del|della)$/i.test(words[0]))) words.shift();
  return words
    .map((w) =>
      w
        .toLowerCase()
        .split(/(['-])/)
        .map((p) => (p === "'" || p === '-' ? p : capitalize(p)))
        .join(''),
    )
    .join(' ');
}

/* ------------------------------------------------------------------ partita IVA */

/** controllo della cifra finale della partita IVA italiana */
export function vatChecksumOk(vat: string): boolean {
  const d = vat.replace(/\D/g, '');
  if (d.length !== 11) return false;
  let s = 0;
  for (let i = 0; i < 10; i++) {
    let n = Number(d[i]);
    if (i % 2 === 1) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    s += n;
  }
  return (10 - (s % 10)) % 10 === Number(d[10]);
}

/* ------------------------------------------------------------------ per la voce che risponde */

/**
 * Codice da leggere ad alta voce come lo dice una persona: a gruppi, con una piccola pausa tra un gruppo e l'altro.
 * "GK482TR" → "G K, 4 8 2, T R"; "01234567897" → "0 1 2, 3 4 5, 6 7 8, 9 7"
 */
export function spell(s: string): string {
  const n = s.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const groups = n.match(/[A-Z]+|\d+/g) || [];
  return groups
    .flatMap((g) => (/\d/.test(g) && g.length > 4 ? g.match(/\d{1,3}/g) || [g] : [g]))
    .map((g) => g.split('').join(' '))
    .join(', ');
}

/** telefono da leggere a gruppi: "335 812 4471" → "3 3 5, 8 1 2, 4 4 7 1" */
export function spellPhone(p: string): string {
  return fmtPhone(p)
    .replace('+', 'più ')
    .split(' ')
    .map((g) => g.split('').join(' '))
    .join(', ');
}

/** quanto si somigliano due frasi (0..1), per riconoscere l'eco della voce dell'assistente */
export function similarity(a: string, b: string): number {
  const A = new Set(tokens(a).filter((t) => t.length > 2));
  const B = new Set(tokens(b).filter((t) => t.length > 2));
  if (!A.size || !B.size) return 0;
  let hit = 0;
  for (const t of A) if (B.has(t)) hit++;
  return hit / Math.min(A.size, B.size);
}
