type RGB = [number, number, number];

export const okHex = (h: unknown): h is string => /^#[0-9a-fA-F]{6}$/.test(String(h || ''));

export function hexToRgb(h: string): RGB {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function lum(c: RGB): number {
  const a = c.map((v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
}

export function contrast(a: RGB, b: RGB): number {
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}

/** Bianco o asfalto: quello che si legge meglio sopra il colore dato. */
export function inkOn(c: RGB): string {
  return contrast(c, [255, 255, 255]) >= contrast(c, [28, 27, 25]) ? '#FFFFFF' : '#1C1B19';
}

/** Colore della barra del browser/sistema in base al tema. L'accento dell'interfaccia è fisso: arancio Ponte. */
export function applyThemeMeta(dark: boolean) {
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', dark ? '#121110' : '#EDEDEB');
}
