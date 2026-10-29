import { fromJob, isBlank, type Draft } from '@/domain/draft';
import { fmtPlate } from '@/domain/format';

/**
 * Copia di sicurezza dell'accettazione in corso, sul dispositivo.
 * Se l'app si chiude, arriva una chiamata o si esce per sbaglio, la bozza si riprende al rientro.
 * Le foto non si salvano qui: restano solo finché il modulo è aperto.
 */
const KEY = 'ponte:bozza-accettazione';
const MAX_AGE = 12 * 3600_000;

export interface SavedDraft {
  at: number;
  d: Draft;
}

export function loadSavedDraft(now = Date.now()): SavedDraft | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as SavedDraft;
    if (!o?.d || typeof o.at !== 'number' || now - o.at > MAX_AGE) return null;
    const d = { ...fromJob({}), ...o.d, company: { ...fromJob({}).company, ...(o.d.company || {}) } };
    return isBlank(d) ? null : { at: o.at, d };
  } catch {
    return null;
  }
}

export function storeDraft(d: Draft) {
  try {
    if (isBlank(d)) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, JSON.stringify({ at: Date.now(), d }));
  } catch {
    /* spazio pieno o navigazione privata: niente copia */
  }
}

export function clearSavedDraft() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* niente da togliere */
  }
}

export function savedLabel(s: SavedDraft, now = Date.now()): string {
  const what = [s.d.plate ? fmtPlate(s.d.plate, s.d.plateCountry) : '', [s.d.make, s.d.model].filter(Boolean).join(' '), s.d.client === 'azienda' ? s.d.company.name : s.d.owner]
    .filter(Boolean)
    .join(' · ');
  const min = Math.max(1, Math.round((now - s.at) / 60_000));
  const ago = min < 60 ? `${min} min fa` : `${Math.round(min / 60)} ${Math.round(min / 60) === 1 ? 'ora' : 'ore'} fa`;
  return `${what || 'Senza targa'}, ${ago}.`;
}
