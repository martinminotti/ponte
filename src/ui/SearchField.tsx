import { forwardRef, type KeyboardEvent } from 'react';
import { Search, X } from 'lucide-react';
import { useGlass } from '@/app/hooks';

/** Campo di ricerca: capsula di vetro su iOS, campo pieno altrove. */
export const SearchField = forwardRef<
  HTMLInputElement,
  {
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
    onFocus?: () => void;
    readOnlyTap?: boolean;
    autoFocus?: boolean;
    id?: string;
    shortcut?: string;
    onKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void;
  }
>(function SearchField({ value, onChange, placeholder = 'Targa, telaio, cliente, ditta, telefono', onFocus, readOnlyTap, autoFocus, id, shortcut, onKeyDown }, ref) {
  const glass = useGlass();
  return (
    <label className={`relative block ${glass ? 'glass rounded-full' : ''}`}>
      <span className="sr-only">Cerca</span>
      <Search size={19} className="pointer-events-none absolute top-1/2 left-4 z-[1] -translate-y-1/2 text-ink-3" />
      <input
        ref={ref}
        id={id}
        onKeyDown={onKeyDown}
        type="search"
        inputMode="search"
        autoComplete="off"
        spellCheck={false}
        enterKeyHint="search"
        autoFocus={autoFocus}
        readOnly={readOnlyTap}
        placeholder={placeholder}
        value={value}
        onFocus={onFocus}
        onChange={(e) => onChange(e.target.value)}
        className={`ctl relative h-[50px] pl-11 ${shortcut ? 'pr-[72px]' : 'pr-11'} [&::-webkit-search-cancel-button]:hidden ${
          glass ? '!rounded-full !border-transparent !bg-transparent !shadow-none focus:!bg-transparent' : '!rounded-[16px] !bg-surface shadow-[var(--shadow-1)]'
        }`}
      />
      {!value && shortcut && (
        <span aria-hidden="true" className="kbd pointer-events-none absolute top-1/2 right-3.5 z-[1] -translate-y-1/2">
          {shortcut}
        </span>
      )}
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="Cancella ricerca"
          className="press absolute top-1/2 right-2 z-[1] grid size-9 -translate-y-1/2 place-items-center rounded-full text-ink-3 hover:bg-surface-2"
        >
          <X size={18} />
        </button>
      )}
    </label>
  );
});
