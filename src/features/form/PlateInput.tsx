import { forwardRef } from 'react';
import type { PlateCountry } from '@/domain/types';
import { fmtPlate } from '@/domain/format';

/** Campo targa disegnato come una targa vera: si scrive direttamente sulla placca. */
export const PlateInput = forwardRef<HTMLInputElement, { value: string; onChange: (v: string) => void; country: PlateCountry; id?: string; invalid?: boolean }>(function PlateInput(
  { value, onChange, country, id, invalid },
  ref
) {
  const rsm = country === 'RSM';
  return (
    <div
      className={`relative flex h-[76px] w-full max-w-[420px] items-stretch overflow-hidden rounded-[12px] transition-shadow focus-within:shadow-[0_0_0_5px_color-mix(in_srgb,var(--accent)_22%,transparent)]`}
      style={{
        backgroundImage: 'linear-gradient(180deg,#ffffff 0%,#f2f3f4 100%)',
        boxShadow: `inset 0 0 0 2.5px ${invalid ? '#B3261E' : '#15181C'}, 0 2px 6px rgba(0,0,0,.14)`,
      }}
    >
      {rsm ? (
        <span className="flex w-[64px] shrink-0 flex-col items-center justify-center pl-1" aria-hidden="true">
          <svg width="26" height="30" viewBox="0 0 20 23">
            <path d="M2 2h16v9.5c0 5.2-3.6 8.6-8 10.5C5.6 20.1 2 16.7 2 11.5V2z" fill="none" stroke="#2E62B8" strokeWidth="1.6" />
            <path d="M5 13V9h1v-1h1v1h1v4M8.5 13V6.5h1v-1h1v1h1V13M12 13V9h1V8h1v1h1v4" fill="#2E62B8" />
          </svg>
          <span className="w-cond mt-0.5 text-[14px] leading-none font-bold text-[#2E62B8]">RSM</span>
        </span>
      ) : (
        <span className="m-[2.5px] mr-0 flex w-[42px] shrink-0 flex-col items-center justify-center rounded-l-[9px] bg-gradient-to-b from-[#1f45b5] to-[#14318a]" aria-hidden="true">
          <svg width="30" height="30" viewBox="0 0 24 24">
            {Array.from({ length: 12 }, (_, i) => {
              const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
              return <circle key={i} cx={12 + Math.cos(a) * 8} cy={12 + Math.sin(a) * 8} r={1.25} fill="#FFD400" />;
            })}
          </svg>
          <span className="w-cond text-[18px] leading-none font-semibold text-white">I</span>
        </span>
      )}
      <input
        ref={ref}
        id={id}
        value={rsm ? value : fmtPlate(value, 'I')}
        onChange={(e) => onChange(rsm ? e.target.value.toUpperCase() : e.target.value.toUpperCase().replace(/\s+/g, ''))}
        autoCapitalize="characters"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        maxLength={rsm ? 10 : 10}
        placeholder={rsm ? 'A 1234' : 'AB 123 CD'}
        aria-label="Targa"
        size={1}
        className="w-cond tnum min-w-0 flex-1 bg-transparent px-4 pt-1 text-center leading-none font-bold tracking-[0.08em] uppercase outline-none placeholder:text-[#c3c8ce]"
        style={{ color: rsm ? '#1E4FA0' : '#121417', fontSize: 'clamp(30px, 10.5vw, 44px)' }}
      />
      {!rsm && <span className="m-[2.5px] ml-0 w-[30px] shrink-0 rounded-r-[9px] bg-gradient-to-b from-[#1f45b5] to-[#14318a]" aria-hidden="true" />}
    </div>
  );
});
