import { DEFAULT_ACCENT } from '@/domain/types';

type RGB = [number, number, number];

export const okHex = (h: unknown): h is string => /^#[0-9a-fA-F]{6}$/.test(String(h || ''));
export function hexToRgb(h: string): RGB {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export const rgbToHex = (c: RGB) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
export function lum(c: RGB): number {
  const a = c.map((v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
}
export const contrast = (a: RGB, b: RGB) => {
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
};
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const WHITE: RGB = [255, 255, 255];
const BLACK: RGB = [0, 0, 0];
const DARK_SURF: RGB = [23, 27, 31];

export function inkOn(c: RGB): string {
  return contrast(c, WHITE) >= contrast(c, [14, 17, 20]) ? '#FFFFFF' : '#0E1114';
}

/** Variabili CSS dell'accento per tema chiaro e scuro, garantendo contrasto leggibile. */
export function brandVars(hex: string, dark: boolean): Record<string, string> {
  const base = hexToRgb(okHex(hex) ? hex : DEFAULT_ACCENT);
  if (!dark) {
    let ink = base;
    for (let t = 0; t <= 1 && contrast(ink, WHITE) < 4.5; t += 0.05) ink = mix(base, BLACK, t);
    return {
      '--accent': rgbToHex(base),
      '--on-accent': inkOn(base),
      '--accent-soft': rgbToHex(mix(base, WHITE, 0.87)),
      '--accent-ink': rgbToHex(ink),
    };
  }
  // riempimento (bottoni): abbastanza chiaro da staccarsi dal fondo scuro, ma ancora pieno di colore
  let a = base;
  for (let t = 0; t <= 1 && contrast(a, DARK_SURF) < 2.6; t += 0.04) a = mix(base, WHITE, t);
  // testo e icone in colore: leggibili (4.5:1)
  let ink = base;
  for (let t = 0; t <= 1 && contrast(ink, DARK_SURF) < 4.5; t += 0.04) ink = mix(base, WHITE, t);
  return {
    '--accent': rgbToHex(a),
    '--on-accent': inkOn(a),
    '--accent-soft': rgbToHex(mix(a, DARK_SURF, 0.78)),
    '--accent-ink': rgbToHex(ink),
  };
}

export function applyBrand(hex: string, dark: boolean) {
  const vars = brandVars(hex, dark);
  const root = document.documentElement;
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', dark ? '#0E1114' : '#ECEEF0');
}
