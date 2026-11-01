import { DEFAULT_SETTINGS, type Settings } from './types';

/**
 * Impostazioni dell'officina, uguali su tutti i dispositivi (nome, indirizzo, P.IVA, aliquote, logo, operai…).
 * Tutto il resto (tema, vetro, voce, profilo del dispositivo) resta sul singolo dispositivo.
 * Deve restare uguale a ponte_private.settings_keys() in supabase/migrations (lo controlla un test).
 */
export const WORKSHOP_KEYS = ['shop', 'shopAddr', 'shopVat', 'shopPhone', 'prefix', 'warranty', 'vat', 'accent', 'logo', 'workers', 'laborRate'] as const satisfies readonly (keyof Settings)[];
export type WorkshopKey = (typeof WORKSHOP_KEYS)[number];
export type WorkshopSettings = Pick<Settings, WorkshopKey>;

export function pickWorkshop(s: Partial<Settings>): Partial<WorkshopSettings> {
  const out: Partial<Record<WorkshopKey, unknown>> = {};
  for (const k of WORKSHOP_KEYS) if (k in s && s[k] !== undefined) out[k] = s[k];
  return out as Partial<WorkshopSettings>;
}

export function normalizeSettings(row: (Partial<Settings> & { key?: string }) | undefined | null): Settings {
  const { key: _k, ...rest } = (row || {}) as Partial<Settings> & { key?: string };
  return { ...DEFAULT_SETTINGS, ...rest, workers: [...(rest.workers || [])] };
}
