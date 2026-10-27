import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/data/db';
import { getSettings } from '@/data/repo';
import { DEFAULT_SETTINGS, type Job, type Settings } from '@/domain/types';
import { applyThemeMeta } from '@/platform/brand';
import { isAppleMobile } from '@/platform/native';
import { nativeBarAvailable } from '@/platform/nativeBar';

/*
 * Ultimo valore letto dall'archivio, tenuto in memoria. Ogni schermata che si monta parte da qui invece che dal vuoto:
 * senza, a ogni cambio di sezione l'intestazione mostrava per un fotogramma "La tua officina" e la pagina vuota (il lampeggio).
 */
let lastSettings: Settings = DEFAULT_SETTINGS;
let lastJobs: Job[] | undefined;

export function useSettings(): Settings {
  const s = useLiveQuery(getSettings, [], lastSettings);
  lastSettings = s;
  return s;
}

/** Tutte le schede, dalla più recente. undefined solo la prima volta, mentre l'archivio si apre. */
export function useJobs(): Job[] | undefined {
  const j = useLiveQuery(() => db.jobs.orderBy('createdAt').reverse().toArray(), [], lastJobs);
  if (j) lastJobs = j;
  return j;
}

/** Una scheda. undefined mentre carica, null se non esiste. */
export function useJob(id: string | undefined): Job | null | undefined {
  // parte dalla scheda già in memoria (aperta dall'elenco): niente fotogramma vuoto prima del contenuto
  return useLiveQuery(async () => (id ? ((await db.jobs.get(id)) ?? null) : null), [id], id ? lastJobs?.find((j) => j.id === id) : undefined);
}

export function useMedia(q: string): boolean {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(q);
      m.addEventListener('change', cb);
      return () => m.removeEventListener('change', cb);
    },
    () => window.matchMedia(q).matches,
    () => false,
  );
}

export const useWide = () => useMedia('(min-width: 1024px)');
/** Schermi da scrivania: barra laterale completa. */
export const useDesk = () => useMedia('(min-width: 1280px)');

/** Larghezza di un elemento, aggiornata al ridimensionamento. */
export function useWidth<T extends HTMLElement>(): [(el: T | null) => void, number] {
  const [w, setW] = useState(0);
  const [el, setEl] = useState<T | null>(null);
  useEffect(() => {
    if (!el) return;
    setW(el.getBoundingClientRect().width);
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  return [useCallback((n: T | null) => setEl(n), []), w];
}

/** Il fuoco è in un campo di testo: le scorciatoie da tastiera non devono scattare. */
export const typing = () => {
  const a = document.activeElement as HTMLElement | null;
  return !!a && (a.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName));
};
/** C'è un foglio o una finestra aperta sopra la pagina. */
export const overlayOpen = () => !!document.querySelector('[role="dialog"]');

/** Applica tema (chiaro/scuro/sistema) e colore dell'officina all'intero documento. */
export function useThemeSync(s: Settings): boolean {
  const sysDark = useMedia('(prefers-color-scheme: dark)');
  const dark = s.theme === 'dark' || (s.theme === 'system' && sysDark);
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    try {
      localStorage.setItem('ro:theme', dark ? 'dark' : 'light');
    } catch {
      /* non disponibile */
    }
    applyThemeMeta(dark);
  }, [dark]);
  return dark;
}

/** Vetro liquido attivo? Automatico = solo su iPhone e iPad. */
export function useGlass(): boolean {
  const s = useSettings();
  const reduced = useMedia('(prefers-reduced-transparency: reduce)');
  const on = !reduced && (s.glass === 'on' || (s.glass !== 'off' && isAppleMobile()));
  useEffect(() => {
    document.documentElement.dataset.glass = on ? 'on' : 'off';
  }, [on]);
  return on;
}

/** true quando l'utente scorre verso il basso oltre la soglia (per compattare le barre). */
export function useScrolledDown(threshold = 48): boolean {
  const [down, setDown] = useState(false);
  useEffect(() => {
    let last = window.scrollY;
    let raf = 0;
    const on = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        // il rimbalzo elastico di iOS (oltre l'inizio o la fine) non conta come scorrimento
        const max = document.documentElement.scrollHeight - window.innerHeight;
        const y = Math.min(Math.max(window.scrollY, 0), Math.max(0, max));
        if (y === last) return;
        if (y < threshold) setDown(false);
        else if (y > last + 6) setDown(true);
        else if (y < last - 6) setDown(false);
        last = y;
      });
    };
    window.addEventListener('scroll', on, { passive: true });
    return () => {
      window.removeEventListener('scroll', on);
      cancelAnimationFrame(raf);
    };
  }, [threshold]);
  return down;
}

/** true quando la pagina non è più in cima (per mostrare il bordo sfumato sotto le barre). */
export function useScrolledPast(y = 8): boolean {
  const [past, setPast] = useState(false);
  useEffect(() => {
    const on = () => setPast(Math.max(0, window.scrollY) > y);
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, [y]);
  return past;
}

export function useObjectUrl(blob: Blob | undefined): string | undefined {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (!blob) return setUrl(undefined);
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  return url;
}

/** Etichetta della scorciatoia di ricerca per il sistema in uso. */
export const searchShortcut = () => (/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? '⌘K' : 'Ctrl K');

/** Barra nativa di iOS attiva: iPhone (o iPad stretto) nell'app, con il vetro liquido non disattivato. */
export function useNativeBarOn(): boolean {
  const wide = useWide();
  const s = useSettings();
  return !wide && s.glass !== 'off' && nativeBarAvailable();
}

/** C'è un foglio, una finestra o il visore foto aperto: la barra nativa (che sta sopra la pagina) si fa da parte. */
export function useOverlayOpen(enabled: boolean): boolean {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    let raf = 0;
    const check = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setOpen(!!document.querySelector('[role="dialog"]')));
    };
    const mo = new MutationObserver(check);
    mo.observe(document.body, { childList: true, subtree: true });
    check();
    return () => {
      mo.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [enabled]);
  return enabled && open;
}
