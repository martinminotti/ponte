import { isAppleMobile } from './native';

/**
 * Dimensioni testo di iOS (Dynamic Type) dentro la web app.
 * Tutta la tipografia è in rem: qui si porta la radice da 16 px alla proporzione scelta
 * dall'utente in Impostazioni → Schermo e luminosità → Dimensioni testo
 * ("Grande", il predefinito, corrisponde a 17 pt = 16 px nell'app).
 * Il limite evita che le schermate si rompano agli estremi; anche la spaziatura in rem segue.
 */
const MIN = 0.88;
const MAX = 1.35;

function measure(): number | null {
  if (!isAppleMobile() || typeof CSS === 'undefined' || !CSS.supports('font', '-apple-system-body')) return null;
  const probe = document.createElement('span');
  probe.style.font = '-apple-system-body';
  probe.style.position = 'absolute';
  probe.style.visibility = 'hidden';
  document.body.appendChild(probe);
  const px = parseFloat(getComputedStyle(probe).fontSize);
  probe.remove();
  return Number.isFinite(px) && px > 0 ? px : null;
}

export function applyTextSize() {
  const px = measure();
  if (px == null) return;
  const scale = Math.min(MAX, Math.max(MIN, px / 17));
  document.documentElement.style.fontSize = `${(16 * scale).toFixed(2)}px`;
}

/** Applica subito e di nuovo quando si torna nell'app (l'utente può aver cambiato la dimensione). */
export function watchTextSize() {
  applyTextSize();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') applyTextSize();
  });
}
