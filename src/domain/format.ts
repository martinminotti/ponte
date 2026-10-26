import type { PlateCountry } from './types';

// raggruppamento sempre attivo: 1.255,00 € (di default l'italiano non separa le migliaia a 4 cifre)
const grouping = { useGrouping: 'always' } as unknown as Intl.NumberFormatOptions;
const eurFmt = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', ...grouping });
const numFmt = new Intl.NumberFormat('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2, ...grouping });

/** centesimi → "€ 1.234,50" (formato it-IT) */
export function eur(cents: number): string {
  return eurFmt.format((Number(cents) || 0) / 100);
}
/** centesimi → "1.234,50" senza simbolo */
export function amount(cents: number): string {
  return numFmt.format((Number(cents) || 0) / 100);
}

/**
 * Testo inserito dall'utente → centesimi.
 * Accetta "12", "12,5", "1.234,50", "1234.50", "€ 30", "1.200".
 */
export function parseAmount(v: unknown): number {
  let s = String(v ?? '')
    .trim()
    .replace(/[€\s]/g, '');
  if (!s) return 0;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  const n = parseFloat(s);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0;
}

/** centesimi → testo per un campo modificabile ("12,50"; "" per zero) */
export function amountInput(cents: number): string {
  if (!cents) return '';
  return (cents / 100).toFixed(2).replace('.', ',');
}

export function normPlateText(p: string, cc: PlateCountry): string {
  const s = String(p || '').toUpperCase();
  return cc === 'RSM' ? s.trim().replace(/\s+/g, ' ') : s.replace(/[^A-Z0-9]/g, '');
}

export function fmtPlate(p: string, cc: PlateCountry = 'I'): string {
  if (cc === 'RSM')
    return String(p || '')
      .toUpperCase()
      .trim()
      .replace(/\s+/g, ' ');
  const s = String(p || '')
    .toUpperCase()
    .replace(/\s+/g, '');
  const m = s.match(/^([A-Z]{2})(\d{3})([A-Z]{2})$/);
  return m ? `${m[1]} ${m[2]} ${m[3]}` : s;
}

/** chiave di ricerca: minuscole, senza accenti né simboli */
export function norm(s: unknown): string {
  return String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

export function fmtDate(ts: number | undefined): string {
  return ts ? new Date(ts).toLocaleDateString('it-IT') : '';
}
export function fmtDay(ts: number): string {
  return new Date(ts).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' });
}
export function fmtDateTime(ts: number | undefined): string {
  if (!ts) return '';
  return new Date(ts).toLocaleString('it-IT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
export function fmtIsoDay(s: string): string {
  const p = String(s || '').split('-');
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : '';
}

/** "oggi", "ieri", "3 giorni fa", altrimenti data breve */
export function relDay(ts: number, now = Date.now()): string {
  const a = new Date(ts);
  const b = new Date(now);
  a.setHours(0, 0, 0, 0);
  b.setHours(0, 0, 0, 0);
  const d = Math.round((b.getTime() - a.getTime()) / 86_400_000);
  if (d === 0) return 'oggi';
  if (d === 1) return 'ieri';
  if (d > 1 && d < 7) return `${d} giorni fa`;
  return fmtDay(ts);
}

export function ymOf(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
export function monthLabel(ym: string): string {
  const [y, m] = String(ym).split('-').map(Number);
  const t = new Date(y, (m || 1) - 1, 1).toLocaleDateString('it-IT', { month: 'long', year: 'numeric' });
  return t.charAt(0).toUpperCase() + t.slice(1);
}
export function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return ymOf(d.getTime());
}

export function jobNumber(n: number): string {
  return String(n || 0).padStart(4, '0');
}

export function uid(prefix = ''): string {
  const r = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID().replace(/-/g, '').slice(0, 16) : Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  return prefix + r;
}
