import { useEffect, useState, useSyncExternalStore } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/data/db';
import { getSettings } from '@/data/repo';
import { DEFAULT_SETTINGS, type Job, type Settings } from '@/domain/types';
import { applyThemeMeta } from '@/platform/brand';
import { isAppleMobile } from '@/platform/native';

export function useSettings(): Settings {
  return useLiveQuery(getSettings, [], DEFAULT_SETTINGS);
}

/** Tutte le schede, dalla più recente. undefined mentre l'archivio si apre. */
export function useJobs(): Job[] | undefined {
  return useLiveQuery(() => db.jobs.orderBy('createdAt').reverse().toArray(), []);
}

/** Una scheda. undefined mentre carica, null se non esiste. */
export function useJob(id: string | undefined): Job | null | undefined {
  return useLiveQuery(async () => (id ? ((await db.jobs.get(id)) ?? null) : null), [id]);
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
        const y = window.scrollY;
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
    const on = () => setPast(window.scrollY > y);
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
