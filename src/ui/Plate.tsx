import { fmtPlate } from '@/domain/format';
import type { PlateCountry } from '@/domain/types';

type Size = 'sm' | 'md' | 'lg' | 'xl';

const S: Record<Size, { h: number; band: number; fs: number; px: number; r: number; bw: number }> = {
  sm: { h: 30, band: 15, fs: 19, px: 9, r: 5, bw: 1.5 },
  md: { h: 38, band: 19, fs: 25, px: 11, r: 6, bw: 1.75 },
  lg: { h: 54, band: 26, fs: 36, px: 15, r: 8, bw: 2 },
  xl: { h: 72, band: 34, fs: 50, px: 20, r: 10, bw: 2.5 },
};

/** Cerchio di 12 stelle della banda UE, disegnato in SVG. */
function EuStars({ size }: { size: number }) {
  const stars = Array.from({ length: 12 }, (_, i) => {
    const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
    return { x: 12 + Math.cos(a) * 8, y: 12 + Math.sin(a) * 8 };
  });
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      {stars.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={1.25} fill="#FFD400" />
      ))}
    </svg>
  );
}

/** Stemma stilizzato: tre torri, come sulle targhe di San Marino. */
function RsmCrest({ size }: { size: number }) {
  return (
    <svg width={size} height={size * 1.15} viewBox="0 0 20 23" aria-hidden="true">
      <path d="M2 2h16v9.5c0 5.2-3.6 8.6-8 10.5C5.6 20.1 2 16.7 2 11.5V2z" fill="none" stroke="#2E62B8" strokeWidth="1.6" />
      <path d="M5 13V9h1v-1h1v1h1v4M8.5 13V6.5h1v-1h1v1h1V13M12 13V9h1V8h1v1h1v4" fill="#2E62B8" />
    </svg>
  );
}

export function Plate({ plate, country = 'I', size = 'md', className = '' }: { plate: string; country?: PlateCountry; size?: Size; className?: string }) {
  const s = S[size];
  const t = fmtPlate(plate, country);
  const rsm = country === 'RSM';
  const label = `Targa ${rsm ? 'di San Marino ' : ''}${t || 'non indicata'}`;

  return (
    <span
      role="img"
      aria-label={label}
      className={`relative inline-flex shrink-0 select-none items-stretch overflow-hidden bg-white ${className}`}
      style={{
        height: s.h,
        borderRadius: s.r,
        boxShadow: `inset 0 0 0 ${s.bw}px #15181C, 0 1px 0 rgba(255,255,255,.6) inset, 0 1px 2px rgba(0,0,0,.18)`,
        backgroundImage: 'linear-gradient(180deg,#ffffff 0%,#f4f5f6 100%)',
      }}
    >
      {rsm ? (
        <span className="flex flex-col items-center justify-center" style={{ width: s.band * 1.35, paddingLeft: s.bw + 2 }}>
          <RsmCrest size={s.band * 0.62} />
          <span className="w-cond font-bold leading-none" style={{ fontSize: s.band * 0.36, color: '#2E62B8', marginTop: s.h * 0.04 }}>
            RSM
          </span>
        </span>
      ) : (
        <span
          className="flex flex-col items-center justify-center"
          style={{ width: s.band, background: 'linear-gradient(180deg,#1f45b5,#14318a)', margin: s.bw, marginRight: 0, borderRadius: `${s.r - 2}px 0 0 ${s.r - 2}px` }}
        >
          <EuStars size={s.band * 0.82} />
          <span className="w-cond font-semibold leading-none text-white" style={{ fontSize: s.band * 0.5, marginTop: s.h * 0.02 }}>
            I
          </span>
        </span>
      )}
      <span
        className="w-cond tnum flex items-center whitespace-nowrap font-bold"
        style={{
          fontSize: s.fs,
          letterSpacing: '0.06em',
          paddingInline: s.px,
          color: rsm ? '#1E4FA0' : t ? '#121417' : '#8a929c',
          lineHeight: 1,
          paddingTop: s.h * 0.04,
        }}
      >
        {t || '— — —'}
      </span>
      {!rsm && (
        <span aria-hidden="true" style={{ width: s.band * 0.82, background: 'linear-gradient(180deg,#1f45b5,#14318a)', margin: s.bw, marginLeft: 0, borderRadius: `0 ${s.r - 2}px ${s.r - 2}px 0` }} />
      )}
    </span>
  );
}
