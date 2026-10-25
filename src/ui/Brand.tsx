import { MARK_BODY, MARK_HUB, MARK_VIEWBOX, WORDMARK_GLYPHS, WORDMARK_SCALE, WORDMARK_VIEWBOX } from './brandPaths';

export const BRAND = {
  name: 'Ponte',
  tagline: "Il registro dell'officina",
  orange: '#FF6A13',
  asphalt: '#1C1B19',
} as const;

/** Il marchio: una "p" con pneumatico e mozzo. Prende il colore del testo. */
export function PonteMark({ size = 24, className = '', title }: { size?: number; className?: string; title?: string }) {
  const [, , w, h] = MARK_VIEWBOX.split(' ').map(Number);
  return (
    <svg width={(size * w) / h} height={size} viewBox={MARK_VIEWBOX} className={className} role={title ? 'img' : undefined} aria-hidden={title ? undefined : true} aria-label={title}>
      <path fill="currentColor" fillRule="evenodd" d={MARK_BODY} />
      <path fill="currentColor" d={MARK_HUB} />
    </svg>
  );
}

/** L'icona dell'app: marchio asfalto su tessera arancio. */
export function PonteIcon({ size = 44, className = '' }: { size?: number; className?: string }) {
  return (
    <span
      className={`grid shrink-0 place-items-center ${className}`}
      style={{ width: size, height: size, borderRadius: size * 0.235, background: BRAND.orange, color: BRAND.asphalt }}
      aria-hidden="true"
    >
      <PonteMark size={size * 0.58} className="translate-x-[2%]" />
    </span>
  );
}

/** Il logotipo "ponte" in Archivo Extra Bold espanso, convertito in tracciati. */
export function PonteWordmark({ height = 22, className = '', title = 'Ponte' }: { height?: number; className?: string; title?: string }) {
  const [, , w, h] = WORDMARK_VIEWBOX.split(' ').map(Number);
  return (
    <svg width={(height * w) / h} height={height} viewBox={WORDMARK_VIEWBOX} className={className} role="img" aria-label={title}>
      <g fill="currentColor">
        {WORDMARK_GLYPHS.map((g, i) => (
          <path key={i} d={g.d} transform={`translate(${g.x} 0) scale(${WORDMARK_SCALE} ${-WORDMARK_SCALE})`} />
        ))}
      </g>
    </svg>
  );
}
