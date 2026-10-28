import type { StatusKey } from './types';

export const STATI: { k: StatusKey; l: string; short: string }[] = [
  { k: 'accettato', l: 'Accettato', short: 'Accettato' },
  { k: 'diagnosi', l: 'In diagnosi', short: 'Diagnosi' },
  { k: 'ricambi', l: 'Attesa ricambi', short: 'Ricambi' },
  { k: 'lavorazione', l: 'In lavorazione', short: 'Lavori' },
  { k: 'pronto', l: 'Pronto', short: 'Pronto' },
  { k: 'consegnato', l: 'Consegnato', short: 'Consegnato' },
];

export const SERVIZI = ['Meccanica', 'Elettrauto', 'Gomme', 'Carrozzeria', 'Altro'] as const;
export const PAGAMENTI = ['Contanti', 'Carta / POS', 'Bonifico', 'Assegno', 'Altro'] as const;
export const GARANZIE = [
  { m: 0, l: 'Nessuna' },
  { m: 3, l: '3 mesi' },
  { m: 6, l: '6 mesi' },
  { m: 12, l: '12 mesi' },
  { m: 24, l: '24 mesi' },
] as const;
export const VATS = [22, 17, 10, 4, 0] as const;

export const VOCI_SUGGERITE = [
  'Tagliando completo',
  'Cambio olio e filtri',
  'Pastiglie freni anteriori',
  'Dischi e pastiglie freni',
  'Kit distribuzione',
  'Frizione',
  'Diagnosi elettronica',
  'Batteria',
  'Alternatore',
  'Motorino avviamento',
  'Cambio gomme (4)',
  'Equilibratura',
  'Convergenza',
  'Riparazione foratura',
  'Ricarica climatizzatore',
  "Mano d'opera",
  'Ricambi',
];

export type FilterKey = 'attive' | 'officina' | 'pronti' | 'saldo' | 'fatturare' | 'chiusi' | 'tutti';
/** "Attive" è la vista di partenza: tutto tranne le schede consegnate e saldate, che vanno in "Consegnate" */
export const FILTRI: { k: FilterKey; l: string }[] = [
  { k: 'attive', l: 'Attive' },
  { k: 'officina', l: 'In officina' },
  { k: 'pronti', l: 'Pronte' },
  { k: 'saldo', l: 'Da incassare' },
  { k: 'fatturare', l: 'Da fatturare' },
  { k: 'chiusi', l: 'Consegnate' },
  { k: 'tutti', l: 'Tutte' },
];

export const PRESETS = [
  { n: 'Blu targa', c: '#1F3F99' },
  { n: 'Rosso corsa', c: '#B0201B' },
  { n: 'Verde inglese', c: '#1D5C3F' },
  { n: 'Arancio', c: '#C25A00' },
  { n: 'Petrolio', c: '#0E6A73' },
  { n: 'Viola', c: '#5B3A99' },
  { n: 'Grafite', c: '#3A4350' },
];

export function statoLabel(k: string): string {
  return STATI.find((s) => s.k === k)?.l ?? k;
}
export function statoIndex(k: string): number {
  const i = STATI.findIndex((s) => s.k === k);
  return i < 0 ? 0 : i;
}
